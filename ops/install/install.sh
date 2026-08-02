#!/usr/bin/env bash
# Systemteil des SchulSani-Installers. Bringt einen frischen Debian/Ubuntu-
# Server bis zur Betriebsbereitschaft (Pakete, Datenbank, PM2-Vorlage,
# nginx-Vorlage). Konfiguration, Geheimnisse, Migrationen, Web-Export und
# TLS-Beschaffung uebernimmt der Einrichtungsassistent im Browser, den
# dieses Skript am Ende startet (folgt in einer spaeteren Ausbaustufe).
set -euo pipefail

LOG_FILE="/var/log/schulsani-install.log"
DRY_RUN=0
MIN_FREE_DISK_MB=2048
NODE_MAJOR_VERSION="22"
DB_NAME="schulSani"
DB_ROLE="saniapp"

# --- Ausgabegestaltung -------------------------------------------------

USE_COLOR=0
if [[ -t 1 ]] && [[ "${TERM:-dumb}" != "dumb" ]] && command -v tput >/dev/null 2>&1; then
  if [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
    USE_COLOR=1
  fi
fi

if [[ "$USE_COLOR" -eq 1 ]]; then
  COLOR_GREEN="$(tput setaf 2)"
  COLOR_RED="$(tput setaf 1)"
  COLOR_YELLOW="$(tput setaf 3)"
  COLOR_BOLD="$(tput bold)"
  COLOR_RESET="$(tput sgr0)"
else
  COLOR_GREEN=""
  COLOR_RED=""
  COLOR_YELLOW=""
  COLOR_BOLD=""
  COLOR_RESET=""
fi

log_line() {
  # Schreibt unveraendert ins Protokoll, auch im Trockenlauf.
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '%s [TROCKENLAUF] %s\n' "$ts" "$1" >>"$LOG_FILE" 2>/dev/null || true
  else
    printf '%s %s\n' "$ts" "$1" >>"$LOG_FILE"
  fi
}

step_start() {
  printf '\n%s==>%s %s\n' "$COLOR_BOLD" "$COLOR_RESET" "$1"
  log_line "START: $1"
}

step_ok() {
  printf '  %s✔%s %s\n' "$COLOR_GREEN" "$COLOR_RESET" "$1"
  log_line "OK: $1"
}

step_skip() {
  printf '  %s·%s %s\n' "$COLOR_YELLOW" "$COLOR_RESET" "$1"
  log_line "UEBERSPRUNGEN: $1"
}

step_fail() {
  printf '  %s✘%s %s\n' "$COLOR_RED" "$COLOR_RESET" "$1" >&2
  log_line "FEHLER: $1"
}

fail_with() {
  step_fail "$1"
  if [[ -n "${2:-}" ]]; then
    printf '    %s\n' "$2" >&2
  fi
  printf '\nProtokoll: %s\n' "$LOG_FILE" >&2
  exit 1
}

print_header() {
  printf '%s\n' "${COLOR_BOLD}${COLOR_GREEN}"
  printf '  SchulSani — Installer (Systemteil)\n'
  printf '%s\n' "$COLOR_RESET"
}

# --- Hilfsfunktionen -----------------------------------------------------

run() {
  # Fuehrt einen Befehl aus, ausser im Trockenlauf — dort wird nur geloggt
  # und angezeigt, was passieren wuerde.
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '    [wuerde ausfuehren] %s\n' "$*"
    log_line "TROCKENLAUF-BEFEHL: $*"
    return 0
  fi
  log_line "BEFEHL: $*"
  "$@"
}

usage() {
  cat <<'EOF'
Verwendung: install.sh [--dry-run]

  --dry-run   Fuehrt nichts aus, zeigt nur an, was das Skript taete.
              Installiert keine Pakete, legt keine Datenbank an,
              schreibt keine Dateien ausserhalb des Protokolls.

Muss als root ausgefuehrt werden (sudo install.sh).
EOF
}

# --- Argumente -------------------------------------------------------------

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unbekannte Option: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# --- Rechte, Protokoll, Betriebssystemerkennung --------------------------

step_check_root() {
  step_start "Rechte pruefen"
  if [[ "$(id -u)" -ne 0 ]]; then
    fail_with "Muss als root laufen." "Erneut versuchen mit: sudo $0"
  fi
  step_ok "Als root gestartet."
}

step_prepare_log() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    # Im Trockenlauf keine Datei ausserhalb von /tmp anlegen, falls das
    # Zielverzeichnis noch nicht existiert/beschreibbar ist.
    if [[ ! -w "$(dirname "$LOG_FILE")" ]] && [[ ! -e "$LOG_FILE" ]]; then
      LOG_FILE="$(mktemp /tmp/schulsani-install-dry-run-XXXXXX)"
    fi
  fi
  touch "$LOG_FILE" 2>/dev/null || fail_with "Protokolldatei $LOG_FILE nicht beschreibbar."
  chmod 640 "$LOG_FILE" 2>/dev/null || true
  log_line "=== Installationslauf gestartet (dry_run=$DRY_RUN) ==="
}

OS_ID=""
OS_VERSION_ID=""

step_detect_os() {
  step_start "Betriebssystem erkennen"
  if [[ ! -r /etc/os-release ]]; then
    fail_with "/etc/os-release nicht lesbar." "Dieses Skript unterstuetzt nur Debian/Ubuntu."
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="${ID:-}"
  OS_VERSION_ID="${VERSION_ID:-}"
  case "$OS_ID" in
    debian|ubuntu)
      step_ok "Erkannt: ${PRETTY_NAME:-$OS_ID $OS_VERSION_ID}"
      ;;
    *)
      fail_with "Nicht unterstuetztes Betriebssystem: ${PRETTY_NAME:-$OS_ID}." \
        "Dieses Skript unterstuetzt nur Debian und Ubuntu."
      ;;
  esac
}

# --- Systemvoraussetzungen ------------------------------------------------

step_check_disk_space() {
  step_start "Freien Speicherplatz pruefen"
  local free_mb
  free_mb="$(df -Pm / | awk 'NR==2 {print $4}')"
  if [[ -z "$free_mb" ]]; then
    fail_with "Freier Speicherplatz auf / konnte nicht ermittelt werden."
  fi
  if [[ "$free_mb" -lt "$MIN_FREE_DISK_MB" ]]; then
    fail_with "Nur ${free_mb} MB frei auf /, mindestens ${MIN_FREE_DISK_MB} MB noetig." \
      "Speicherplatz freigeben oder eine groessere Platte einhaengen, dann erneut starten."
  fi
  step_ok "${free_mb} MB frei auf / (mindestens ${MIN_FREE_DISK_MB} MB noetig)."
}

port_is_free() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    if ss -tlnH "( sport = :$port )" 2>/dev/null | grep -q .; then
      return 1
    fi
    return 0
  elif command -v netstat >/dev/null 2>&1; then
    if netstat -tln 2>/dev/null | awk '{print $4}' | grep -qE "[.:]$port\$"; then
      return 1
    fi
    return 0
  else
    # Kein Werkzeug zur Pruefung vorhanden — nicht blockieren, nur warnen.
    return 0
  fi
}

step_check_ports() {
  step_start "Ports 80 und 443 pruefen"
  local port
  local all_free=1
  for port in 80 443; do
    if port_is_free "$port"; then
      step_ok "Port $port ist frei."
    else
      step_fail "Port $port ist bereits belegt."
      all_free=0
    fi
  done
  if [[ "$all_free" -ne 1 ]]; then
    fail_with "Mindestens ein benoetigter Port ist belegt." \
      "Pruefen mit: ss -tlnp | grep -E ':80|:443' — belegenden Dienst stoppen oder Server wechseln."
  fi
}

service_is_active() {
  command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$1" 2>/dev/null
}

step_check_existing_services() {
  step_start "Vorhandene Dienste pruefen"
  if service_is_active nginx; then
    step_skip "nginx laeuft bereits — wird spaeter als vorhanden behandelt."
  else
    step_ok "Kein laufendes nginx gefunden."
  fi
  if service_is_active postgresql; then
    step_skip "PostgreSQL laeuft bereits — wird spaeter als vorhanden behandelt."
  else
    step_ok "Kein laufendes PostgreSQL gefunden."
  fi
}

# --- Paketbeschaffung ------------------------------------------------------

apt_update_once_done=0

apt_update_once() {
  if [[ "$apt_update_once_done" -eq 1 ]]; then
    return 0
  fi
  run apt-get update -qq
  apt_update_once_done=1
}

step_install_node() {
  step_start "Node.js besorgen"
  if command -v node >/dev/null 2>&1; then
    local current_major
    current_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    if [[ "$current_major" -ge "$NODE_MAJOR_VERSION" ]]; then
      step_ok "Node $(node -v) bereits vorhanden (mind. $NODE_MAJOR_VERSION erwartet)."
      return 0
    fi
    step_skip "Node $(node -v) vorhanden, aber aelter als erwartete Version $NODE_MAJOR_VERSION."
  fi
  apt_update_once
  run bash -c "curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR_VERSION}.x | bash -"
  run apt-get install -y nodejs
  step_ok "Node.js ${NODE_MAJOR_VERSION}.x installiert."
}

step_install_pnpm() {
  step_start "pnpm ueber Corepack besorgen"
  if command -v pnpm >/dev/null 2>&1; then
    step_ok "pnpm $(pnpm --version) bereits vorhanden."
    return 0
  fi
  if ! command -v corepack >/dev/null 2>&1; then
    fail_with "corepack fehlt." "Node-Installation unvollstaendig — Schritt 'Node.js besorgen' pruefen."
  fi
  run corepack enable
  run corepack prepare pnpm@latest --activate
  step_ok "pnpm ueber Corepack aktiviert."
}

step_install_postgres() {
  step_start "PostgreSQL besorgen"
  if command -v psql >/dev/null 2>&1 && dpkg -s postgresql >/dev/null 2>&1; then
    step_ok "PostgreSQL bereits installiert ($(psql --version))."
    return 0
  fi
  apt_update_once
  run apt-get install -y postgresql postgresql-contrib
  run systemctl enable --now postgresql
  step_ok "PostgreSQL installiert und gestartet."
}

step_install_nginx() {
  step_start "nginx besorgen"
  if dpkg -s nginx >/dev/null 2>&1; then
    step_ok "nginx bereits installiert."
    return 0
  fi
  apt_update_once
  run apt-get install -y nginx
  run systemctl enable --now nginx
  step_ok "nginx installiert und gestartet."
}

step_install_certbot() {
  step_start "certbot besorgen"
  if command -v certbot >/dev/null 2>&1; then
    step_ok "certbot bereits installiert ($(certbot --version 2>&1))."
    return 0
  fi
  apt_update_once
  run apt-get install -y certbot python3-certbot-nginx
  step_ok "certbot installiert."
}

step_install_pm2() {
  step_start "PM2 besorgen"
  if command -v pm2 >/dev/null 2>&1; then
    step_ok "PM2 bereits installiert ($(pm2 --version 2>/dev/null))."
    return 0
  fi
  run npm install -g pm2
  step_ok "PM2 global installiert."
}

# --- Datenbank-Provisionierung --------------------------------------------

DB_PASSWORD=""

psql_as_postgres() {
  sudo -u postgres psql -tAc "$1"
}

step_provision_database() {
  step_start "Datenbank und Rolle anlegen"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    step_skip "Trockenlauf — Rolle/Datenbank werden nicht angelegt."
    return 0
  fi

  local role_exists
  role_exists="$(psql_as_postgres "SELECT 1 FROM pg_roles WHERE rolname='${DB_ROLE}'" || true)"
  if [[ "$role_exists" == "1" ]]; then
    step_skip "Rolle '${DB_ROLE}' existiert bereits — Passwort bleibt unveraendert."
  else
    DB_PASSWORD="$(openssl rand -hex 24)"
    psql_as_postgres "CREATE ROLE ${DB_ROLE} WITH LOGIN PASSWORD '${DB_PASSWORD}';" >/dev/null
    step_ok "Rolle '${DB_ROLE}' angelegt."
  fi

  local db_exists
  db_exists="$(psql_as_postgres "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" || true)"
  if [[ "$db_exists" == "1" ]]; then
    step_skip "Datenbank '${DB_NAME}' existiert bereits."
  else
    sudo -u postgres createdb --owner="$DB_ROLE" "$DB_NAME"
    step_ok "Datenbank '${DB_NAME}' angelegt, Eigentuemer '${DB_ROLE}'."
  fi

  if [[ -n "$DB_PASSWORD" ]]; then
    printf '\n  %sNeues Datenbank-Passwort erzeugt.%s Wird an den Einrichtungsassistenten\n' "$COLOR_YELLOW" "$COLOR_RESET"
    printf '  uebergeben und in artifacts/api-server/.env eingetragen — hier nicht\n'
    printf '  angezeigt und nicht protokolliert.\n'
    log_line "Datenbank-Passwort fuer Rolle ${DB_ROLE} erzeugt (Wert nicht protokolliert)."
  else
    printf '\n  Bestehende Rolle wird weiterverwendet, kein neues Passwort erzeugt.\n'
  fi
}

# --- PM2-Ecosystem-Datei bereitstellen -------------------------------------

step_install_pm2_ecosystem() {
  step_start "PM2-Ecosystem-Datei bereitstellen"
  local script_dir target_dir target_file
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  target_dir="/etc/schulsani"
  target_file="${target_dir}/ecosystem.config.js"

  if [[ ! -f "${script_dir}/ecosystem.config.js" ]]; then
    fail_with "Vorlage ${script_dir}/ecosystem.config.js fehlt im Repository."
  fi

  if [[ -f "$target_file" ]]; then
    step_skip "Ecosystem-Datei existiert bereits unter ${target_file}."
    return 0
  fi

  run mkdir -p "$target_dir"
  run install -m 644 "${script_dir}/ecosystem.config.js" "$target_file"
  step_ok "Vorlage nach ${target_file} kopiert (Platzhalter noch zu ersetzen)."
}

# --- Ablauf ----------------------------------------------------------------

main() {
  print_header
  step_prepare_log
  step_check_root
  step_detect_os

  step_check_disk_space
  step_check_ports
  step_check_existing_services

  step_install_node
  step_install_pnpm
  step_install_postgres
  step_install_nginx
  step_install_certbot
  step_install_pm2

  step_provision_database

  step_install_pm2_ecosystem

  printf '\n%s✔ PM2-Ecosystem-Datei bereitgestellt.%s\n' "$COLOR_GREEN" "$COLOR_RESET"
  printf 'Protokoll: %s\n' "$LOG_FILE"
  log_line "=== Lauf abgeschlossen ==="
}

main "$@"
