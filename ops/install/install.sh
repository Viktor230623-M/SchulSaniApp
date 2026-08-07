#!/usr/bin/env bash
# Systemteil des SchulSani-Installers. Bringt einen frischen Debian/Ubuntu-
# Server bis zum Einrichtungsassistenten; die Browseroberflaeche schreibt danach
# den gemeinsamen Konfigurationsvertrag fuer Backend, App und Anmeldewege.
set -euo pipefail

LOG_FILE="/var/log/schulsani-install.log"
DRY_RUN=0
MIN_FREE_DISK_MB=2048
NODE_MAJOR_VERSION="24"
POSTGRES_MIN_MAJOR_VERSION="17"
# Datenbank und Rolle der Instanz sowie der PM2-Prozessname. Auf einem
# Server mit mehreren Instanzen (oder bereits vorhandener Datenbank) ueber
# die Umgebung umstellen, damit nichts Bestehendes angefasst wird.
DB_NAME="${SCHULSANI_DB_NAME:-schulSani}"
DB_ROLE="${SCHULSANI_DB_ROLE:-saniapp}"
PM2_NAME="${SCHULSANI_PM2_NAME:-sani-backend}"

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

UPDATE_MODE=0

# Ports der Instanz. Auf einem Server, auf dem 80/443 bereits belegt sind,
# freie Ports waehlen (--http-port/--https-port oder SCHULSANI_HTTP_PORT /
# SCHULSANI_HTTPS_PORT); der Backend-Port ist nur intern relevant.
HTTP_PORT="${SCHULSANI_HTTP_PORT:-80}"
HTTPS_PORT="${SCHULSANI_HTTPS_PORT:-443}"
BACKEND_PORT="${SCHULSANI_BACKEND_PORT:-3002}"

port_valid() {
  [[ "$1" =~ ^[0-9]+$ ]] && (( $1 >= 1 && $1 <= 65535 ))
}

usage() {
  cat <<'EOF'
Verwendung: install.sh [--dry-run] [--update] [--http-port N] [--https-port N] [--backend-port N]

  --dry-run       Fuehrt nichts aus, zeigt nur an, was das Skript taete.
                  Installiert keine Pakete, legt keine Datenbank an,
                  schreibt keine Dateien ausserhalb des Protokolls.
  --update        Ueberspringt Systemteil und Einrichtungsassistenten. Liest die
                  vorhandenen .env-Dateien, fuehrt nur Migrationen, Web-Export
                  und einen Dienst-Neustart aus. Fuer eine bereits eingerichtete
                  Instanz (z. B. nach einem Deploy neuer Migrationen).
  --http-port N   HTTP-Port der Instanz (Standard: 80, sonst SCHULSANI_HTTP_PORT).
                  Auf einem geteilten Server freie Ports waehlen, z. B. 8080.
  --https-port N  HTTPS-Port der Instanz (Standard: 443, sonst SCHULSANI_HTTPS_PORT).
                  Bei einem benutzerdefinierten Port holt install.sh das
                  Zertifikat ueber certbot --standalone mit --http-01-port.
  --backend-port N
                  Interner API-Port (Standard: 3002, sonst SCHULSANI_BACKEND_PORT).

Alle Ports lassen sich auch ueber die Umgebung setzen; die Optionen gewinnen.
Muss als root ausgefuehrt werden (sudo install.sh).
EOF
}

# --- Argumente -------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --update)
      UPDATE_MODE=1
      shift
      ;;
    --http-port)
      HTTP_PORT="${2:?--http-port braucht eine Portnummer}"
      shift 2
      ;;
    --https-port)
      HTTPS_PORT="${2:?--https-port braucht eine Portnummer}"
      shift 2
      ;;
    --backend-port)
      BACKEND_PORT="${2:?--backend-port braucht eine Portnummer}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unbekannte Option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# Ports erst nach der Argument-Auswertung pruefen — --http-port und Co.
# koennen die Werte aus der Umgebung ueberschrieben haben.
for p in "$HTTP_PORT" "$HTTPS_PORT" "$BACKEND_PORT"; do
  if ! port_valid "$p"; then
    echo "Ungueltiger Port: $p (1-65535)." >&2
    exit 1
  fi
done
if [[ "$HTTP_PORT" == "$HTTPS_PORT" ]]; then
  echo "HTTP- und HTTPS-Port duerfen nicht gleich sein." >&2
  exit 1
fi

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
  step_start "Ports ${HTTP_PORT} und ${HTTPS_PORT} pruefen"
  local port
  local all_free=1
  for port in "$HTTP_PORT" "$HTTPS_PORT"; do
    if port_is_free "$port"; then
      step_ok "Port $port ist frei."
    else
      step_fail "Port $port ist bereits belegt."
      all_free=0
    fi
  done
  if [[ "$all_free" -ne 1 ]]; then
    fail_with "Mindestens ein benoetigter Port ist belegt." \
      "Belegenden Dienst stoppen (ss -tlnp) oder freie Ports waehlen: --http-port / --https-port (bzw. SCHULSANI_HTTP_PORT / SCHULSANI_HTTPS_PORT). Bei benutzerdefinierten Ports holt install.sh das TLS-Zertifikat ueber certbot --standalone."
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

step_install_workspace() {
  step_start "Workspace-Abhaengigkeiten installieren"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    step_skip "Trockenlauf — pnpm install wird nicht ausgefuehrt."
    return 0
  fi

  local script_dir app_root
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  app_root="$(cd "${script_dir}/../.." && pwd)"
  ( cd "$app_root" && pnpm install --frozen-lockfile )
  step_ok "Workspace-Abhaengigkeiten installiert."
}

step_verify_workspace() {
  step_start "Workspace-Build-Werkzeuge pruefen"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    step_skip "Trockenlauf — Build-Werkzeuge werden nicht geprueft."
    return 0
  fi

  # tsx baut das Backend, expo den Web-Export, esbuild fuehrt beides aus.
  # Fehlt eines, scheitern die Schritte hinter dem Assistenten erst spaet;
  # die Pruefung zieht den Fehler an den Anfang des Laufs.
  local script_dir app_root bin_dir missing=0
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  app_root="$(cd "${script_dir}/../.." && pwd)"
  bin_dir="${app_root}/node_modules/.bin"

  if [[ ! -x "${bin_dir}/tsx" ]]; then
    step_fail "tsx fehlt in node_modules/.bin."
    missing=1
  fi
  if [[ ! -x "${bin_dir}/expo" ]]; then
    step_fail "expo fehlt in node_modules/.bin."
    missing=1
  fi
  if ! node -e "require('esbuild')" >/dev/null 2>&1; then
    step_fail "esbuild ist nicht installiert oder nicht geladen."
    missing=1
  fi
  if [[ "$missing" -eq 1 ]]; then
    fail_with "Workspace-Abhaengigkeiten unvollstaendig." \
      "pnpm install --frozen-lockfile im Repo-Root erneut ausfuehren und die Ausgabe auf Fehler pruefen."
  fi
  step_ok "tsx, expo und esbuild vorhanden."
}

postgres_major_version() {
  # Ermittelt die Hauptversion des installierten Server-Pakets, nicht der
  # Client-Bibliothek — beide koennen auseinanderlaufen.
  psql --version 2>/dev/null | grep -oE '[0-9]+' | head -1
}

check_postgres_min_version() {
  local installed_major
  installed_major="$(postgres_major_version)"
  if [[ -z "$installed_major" ]]; then
    fail_with "PostgreSQL-Version konnte nicht ermittelt werden."
  fi
  if [[ "$installed_major" -lt "$POSTGRES_MIN_MAJOR_VERSION" ]]; then
    fail_with "PostgreSQL ${installed_major} ist installiert, mindestens ${POSTGRES_MIN_MAJOR_VERSION} wird erwartet (Bestandsserver laeuft mit ${POSTGRES_MIN_MAJOR_VERSION})." \
      "Distributionspaket ist zu alt — PGDG-Apt-Repository einrichten (https://www.postgresql.org/download/linux/debian/) und erneut ausfuehren."
  fi
  echo "$installed_major"
}

step_install_postgres() {
  step_start "PostgreSQL besorgen"
  if command -v psql >/dev/null 2>&1 && dpkg -s postgresql >/dev/null 2>&1; then
    local installed_major
    installed_major="$(check_postgres_min_version)"
    step_ok "PostgreSQL bereits installiert ($(psql --version)), Hauptversion ${installed_major} erfuellt Mindestanforderung ${POSTGRES_MIN_MAJOR_VERSION}."
    return 0
  fi
  apt_update_once
  run apt-get install -y postgresql postgresql-contrib
  run systemctl enable --now postgresql
  if [[ "$DRY_RUN" -eq 1 ]]; then
    step_ok "PostgreSQL installiert und gestartet (Trockenlauf — Versionspruefung uebersprungen)."
    return 0
  fi
  local installed_major
  installed_major="$(check_postgres_min_version)"
  step_ok "PostgreSQL installiert und gestartet, Hauptversion ${installed_major}."
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
# Nur root lesbar. Haelt das erzeugte Passwort fest, damit ein erneuter Lauf
# (Wiederaufnahmefall) dieselbe DATABASE_URL zusammenbauen kann, ohne das
# Passwort zu kennen, das Postgres selbst nicht im Klartext herausgibt.
DB_PASSWORD_FILE="/root/.schulsani-db-password"

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
    if [[ -r "$DB_PASSWORD_FILE" ]]; then
      DB_PASSWORD="$(cat "$DB_PASSWORD_FILE")"
      step_skip "Rolle '${DB_ROLE}' existiert bereits — hinterlegtes Passwort wiederverwendet."
    else
      fail_with "Rolle '${DB_ROLE}' existiert bereits, aber ${DB_PASSWORD_FILE} fehlt." \
        "Passwort ist unbekannt und kann nicht wiederhergestellt werden. Entweder von Hand setzen mit: sudo -u postgres psql -c \"ALTER ROLE ${DB_ROLE} WITH PASSWORD '...';\" und den Wert nach ${DB_PASSWORD_FILE} schreiben (chmod 600), oder Rolle loeschen und diesen Lauf wiederholen."
    fi
  else
    DB_PASSWORD="$(openssl rand -hex 24)"
    psql_as_postgres "CREATE ROLE ${DB_ROLE} WITH LOGIN PASSWORD '${DB_PASSWORD}';" >/dev/null
    printf '%s' "$DB_PASSWORD" >"$DB_PASSWORD_FILE"
    chmod 600 "$DB_PASSWORD_FILE"
    step_ok "Rolle '${DB_ROLE}' angelegt, Passwort in ${DB_PASSWORD_FILE} hinterlegt (chmod 600)."
  fi

  local db_exists
  db_exists="$(psql_as_postgres "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" || true)"
  if [[ "$db_exists" == "1" ]]; then
    step_skip "Datenbank '${DB_NAME}' existiert bereits."
  else
    sudo -u postgres createdb --owner="$DB_ROLE" "$DB_NAME"
    step_ok "Datenbank '${DB_NAME}' angelegt, Eigentuemer '${DB_ROLE}'."
  fi

  printf '\n  Datenbank-Passwort liegt in %s (chmod 600) — hier nicht angezeigt\n' "$DB_PASSWORD_FILE"
  printf '  und nicht protokolliert. Wird an den Einrichtungsassistenten uebergeben.\n'
  log_line "Datenbank-Passwort fuer Rolle ${DB_ROLE} bereitgestellt (Wert nicht protokolliert)."
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

# --- nginx-Vorlage einrichten -----------------------------------------

step_install_nginx_template() {
  step_start "nginx-Vorlagen bereitstellen"
  local script_dir target_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  target_dir="/etc/nginx/schulsani"

  if [[ ! -f "${script_dir}/nginx.conf.template" ]] || [[ ! -f "${script_dir}/nginx-locations.conf" ]]; then
    fail_with "nginx-Vorlagen fehlen im Repository (${script_dir}/nginx.conf.template, nginx-locations.conf)."
  fi

  # Beide Vorlagen kopieren, falls nicht vorhanden; das Rendern mit den echten
  # Werten passiert in step_setup_tls. Die Locations-Datei wird von beiden
  # Server-Bloecken (HTTP und optionaler TLS-Block) eingebunden.
  run mkdir -p "$target_dir"
  if [[ ! -f "${target_dir}/nginx.conf.template" ]]; then
    run install -m 644 "${script_dir}/nginx.conf.template" "${target_dir}/nginx.conf.template"
  else
    step_skip "nginx.conf.template existiert bereits unter ${target_dir}/."
  fi
  if [[ ! -f "${target_dir}/nginx-locations.conf.template" ]]; then
    run install -m 644 "${script_dir}/nginx-locations.conf" "${target_dir}/nginx-locations.conf.template"
  else
    step_skip "nginx-locations.conf.template existiert bereits unter ${target_dir}/."
  fi
  step_ok "nginx-Vorlagen unter ${target_dir}/ bereit — werden mit Ports/Pfad gerendert und aktiviert."
}

# --- Einrichtungsassistent starten ----------------------------------------

STATE_DIR="/var/lib/schulsani-install"
STATE_FILE="${STATE_DIR}/state.json"

server_ip_hint() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [[ -z "$ip" ]]; then
    ip="<server-ip>"
  fi
  echo "$ip"
}

step_start_assistant() {
  step_start "Einrichtungsassistenten starten"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    step_skip "Trockenlauf — Einrichtungsassistent wird nicht gestartet."
    return 0
  fi

  local script_dir app_root assistant_script node_bin token port ip rc
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  app_root="$(cd "${script_dir}/../.." && pwd)"
  assistant_script="${script_dir}/assistant/server.js"

  if [[ ! -f "$assistant_script" ]]; then
    fail_with "Einrichtungsassistent fehlt: ${assistant_script}."
  fi
  node_bin="$(command -v node || true)"
  if [[ -z "$node_bin" ]]; then
    fail_with "node ist nicht auffindbar." "Schritt 'Node.js besorgen' pruefen."
  fi
  if [[ ! -r "$DB_PASSWORD_FILE" ]]; then
    fail_with "Datenbank-Passwort fehlt (${DB_PASSWORD_FILE})." "Schritt 'Datenbank und Rolle anlegen' erneut pruefen."
  fi

  run mkdir -p "$STATE_DIR"
  run chmod 700 "$STATE_DIR"

  token="$(openssl rand -hex 32)"
  # Eigener Assistenten-Port, falls die Standardspanne nicht passt.
  port="${SCHULSANI_ASSISTANT_PORT:-$(( (RANDOM % 10000) + 40000 ))}"
  ip="$(server_ip_hint)"

  printf '\n  Adresse fuer die Einrichtung (von einem Geraet im selben Netz aufrufen):\n'
  printf '  %shttp://%s:%s/setup/%s%s\n\n' "$COLOR_BOLD" "$ip" "$port" "$token" "$COLOR_RESET"
  printf '  Der Assistent beendet sich nach Abschluss der Einrichtung von selbst\n'
  printf '  oder spaetestens nach 60 Minuten ohne Eingabe.\n'
  log_line "Einrichtungsassistent wird gestartet auf Port ${port} (Token nicht protokolliert)."

  set +e
  SCHULSANI_TOKEN="$token" \
  SCHULSANI_PORT="$port" \
  SCHULSANI_STATE_FILE="$STATE_FILE" \
  SCHULSANI_LOG_FILE="$LOG_FILE" \
  SCHULSANI_APP_ROOT="$app_root" \
  SCHULSANI_DATABASE_URL="postgres://${DB_ROLE}:${DB_PASSWORD}@localhost:5432/${DB_NAME}" \
  SCHULSANI_BACKEND_PORT="$BACKEND_PORT" \
  "$node_bin" "$assistant_script"
  rc=$?
  set -e

  if [[ "$rc" -ne 0 ]]; then
    fail_with "Einrichtungsassistent wurde mit Fehler beendet (Code ${rc})." \
      "Protokoll pruefen: ${LOG_FILE}. Fortschritt bleibt in ${STATE_FILE} erhalten — install.sh danach erneut ausfuehren."
  fi
  step_ok "Einrichtung im Assistenten abgeschlossen."
}

# --- Hilfsfunktion: Wert aus einer .env-Datei lesen -----------------------

read_env_value() {
  local file="$1" key="$2" value
  [[ -f "$file" ]] || return 0
  value="$(grep -E "^${key}=" "$file" | tail -1 | cut -d '=' -f2-)"
  if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
    value="${value:1:${#value}-2}"
    value="${value//\\\\/\\}"
    value="${value//\\\"/\"}"
  fi
  printf '%s' "$value"
}

# --- Migrationslauf einbinden (Schritt 7) ----------------------------------

step_run_migrations() {
  step_start "Migrationen einspielen"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    step_skip "Trockenlauf — Migrationen werden nicht ausgefuehrt."
    return 0
  fi

  local script_dir app_root
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  app_root="$(cd "${script_dir}/../.." && pwd)"

  if [[ -z "$DB_PASSWORD" ]] && [[ -r "$DB_PASSWORD_FILE" ]]; then
    DB_PASSWORD="$(cat "$DB_PASSWORD_FILE")"
  fi
  if [[ -z "$DB_PASSWORD" ]]; then
    fail_with "Datenbank-Passwort fehlt." "Schritt 'Datenbank und Rolle anlegen' erneut pruefen."
  fi

  local database_url
  database_url="postgres://${DB_ROLE}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
  set +e
  ( cd "$app_root" && DATABASE_URL="$database_url" pnpm --filter @workspace/db migrate )
  local rc=$?
  set -e
  if [[ "$rc" -ne 0 ]]; then
    fail_with "Migrationslauf fehlgeschlagen (Code ${rc})." \
      "Setzt einen 'migrate'-Befehl in lib/db/package.json voraus (siehe R1-Roadmap). Protokoll/Ausgabe oben pruefen."
  fi
  step_ok "Migrationen eingespielt."
}

# --- Web-Export einbinden (Schritt 8) --------------------------------------

step_web_export() {
  step_start "Web-Export bauen"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    step_skip "Trockenlauf — Web-Export wird nicht gebaut."
    return 0
  fi

  local script_dir app_root app_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  app_root="$(cd "${script_dir}/../.." && pwd)"
  app_dir="${app_root}/artifacts/paramedic-app"

  if [[ ! -f "${app_dir}/.env" ]]; then
    fail_with "artifacts/paramedic-app/.env fehlt." "Erst Konfiguration/Einrichtungsassistenten durchlaufen lassen."
  fi

  # Reste eines fremden Laufs im Metro-Cache haben auf dem Bestandsserver
  # bereits einmal falsche Instanzwerte in dist/ getragen. Vor jedem Export
  # aufraeumen.
  run rm -rf /tmp/metro-cache

  local expo_domain expo_school_name expo_app_name expo_theme_color expo_bundle_id expo_vapid_key
  expo_domain="$(read_env_value "${app_dir}/.env" "EXPO_PUBLIC_DOMAIN")"
  expo_school_name="$(read_env_value "${app_dir}/.env" "EXPO_PUBLIC_SCHOOL_NAME")"
  expo_app_name="$(read_env_value "${app_dir}/.env" "EXPO_PUBLIC_APP_NAME")"
  expo_theme_color="$(read_env_value "${app_dir}/.env" "EXPO_PUBLIC_THEME_COLOR")"
  expo_bundle_id="$(read_env_value "${app_dir}/.env" "APP_BUNDLE_ID")"
  expo_vapid_key="$(read_env_value "${app_dir}/.env" "EXPO_PUBLIC_VAPID_PUBLIC_KEY")"
  if [[ -f "${app_dir}/scripts/generate-web-assets.js" ]]; then
    ( cd "$app_dir" && \
      EXPO_PUBLIC_DOMAIN="$expo_domain" \
      EXPO_PUBLIC_SCHOOL_NAME="$expo_school_name" \
      EXPO_PUBLIC_APP_NAME="$expo_app_name" \
      EXPO_PUBLIC_THEME_COLOR="$expo_theme_color" \
      APP_BUNDLE_ID="$expo_bundle_id" \
      EXPO_PUBLIC_VAPID_PUBLIC_KEY="$expo_vapid_key" \
      run node scripts/generate-web-assets.js )
  fi
  set +e
  ( cd "$app_dir" && \
    EXPO_PUBLIC_DOMAIN="$expo_domain" \
    EXPO_PUBLIC_SCHOOL_NAME="$expo_school_name" \
    EXPO_PUBLIC_APP_NAME="$expo_app_name" \
    EXPO_PUBLIC_THEME_COLOR="$expo_theme_color" \
    APP_BUNDLE_ID="$expo_bundle_id" \
    EXPO_PUBLIC_VAPID_PUBLIC_KEY="$expo_vapid_key" \
    npx expo export --platform web )
  local rc=$?
  set -e
  if [[ "$rc" -ne 0 ]]; then
    fail_with "Web-Export fehlgeschlagen (Code ${rc})." "Ausgabe oben pruefen."
  fi
  step_ok "Web-Export gebaut nach artifacts/paramedic-app/dist/."
}

# --- nginx-Site aktivieren und TLS beziehen (Schritt 11) -------------------

step_setup_tls() {
  step_start "nginx aktivieren und TLS beziehen"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    step_skip "Trockenlauf — TLS wird nicht bezogen."
    return 0
  fi

  local script_dir app_root domain dist_path site_file resolved_ip server_ip
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  app_root="$(cd "${script_dir}/../.." && pwd)"
  domain="$(read_env_value "${app_root}/artifacts/paramedic-app/.env" "EXPO_PUBLIC_DOMAIN")"
  dist_path="${app_root}/artifacts/paramedic-app/dist"

  if [[ -z "$domain" ]]; then
    fail_with "Domain unbekannt (EXPO_PUBLIC_DOMAIN fehlt in .env)." "Erst Einrichtungsassistenten durchlaufen lassen."
  fi
  if [[ ! -d "$dist_path" ]]; then
    fail_with "Web-Export fehlt (${dist_path})." "Schritt 'Web-Export bauen' erneut pruefen."
  fi

  # Die Domain kann einen Port tragen (sani.beispielschule.de:8443), wenn die
  # Standard-Ports belegt sind. server_name und certbot brauchen den reinen
  # Hostnamen; der Port bestimmt den HTTPS-Port der Instanz.
  host="${domain%%:*}"
  https_port="${HTTPS_PORT}"
  if [[ "$domain" == *:* ]]; then
    https_port="${domain##*:}"
  fi
  if [[ "$https_port" == "$HTTP_PORT" ]]; then
    fail_with "HTTPS-Port ${https_port} entspricht dem HTTP-Port ${HTTP_PORT}." \
      "Domain-Port und --http-port muessen verschieden sein."
  fi
  if [[ "$domain" != *:* ]] && [[ "$HTTPS_PORT" != "443" ]]; then
    printf '  %sHinweis:%s Domain ohne Port, aber HTTPS-Port %s konfiguriert: die App ruft https://%s (443) auf.\n  Im Assistenten die Domain mit :%s eintragen.\n' \
      "$COLOR_YELLOW" "$COLOR_RESET" "$HTTPS_PORT" "$host" "$HTTPS_PORT"
  fi

  # DNS frueh pruefen, bevor irgendetwas aktiviert wird.
  resolved_ip="$(getent hosts "$host" 2>/dev/null | awk '{print $1}' | head -1)"
  server_ip="$(server_ip_hint)"
  if [[ -z "$resolved_ip" ]]; then
    fail_with "DNS-Eintrag fuer ${host} nicht gefunden." \
      "A-Record fuer ${host} auf ${server_ip} anlegen, dann install.sh erneut ausfuehren."
  fi
  if [[ "$resolved_ip" != "$server_ip" ]] && [[ "$server_ip" != "<server-ip>" ]]; then
    printf '  %sHinweis:%s %s zeigt auf %s, dieser Server hat %s — kann bei Mehrfach-NAT normal sein.\n' \
      "$COLOR_YELLOW" "$COLOR_RESET" "$host" "$resolved_ip" "$server_ip"
  fi

  # Gemeinsame Locations fuer HTTP- und TLS-Block rendern und ablegen.
  sed -e "s#<DIST_PATH>#${dist_path}#g" -e "s#<BACKEND_PORT>#${BACKEND_PORT}#g" \
    "${script_dir}/nginx-locations.conf" >"/etc/nginx/schulsani/locations.conf"

  site_file="/etc/nginx/sites-available/schulsani"
  if [[ "$https_port" == "443" ]]; then
    # Standardpfad: ein Block auf dem HTTP-Port, certbot --nginx ergaenzt TLS.
    sed -e "s#<DOMAIN>#${host}#g" -e "s#<HTTP_PORT>#${HTTP_PORT}#g" \
      "${script_dir}/nginx.conf.template" >"$site_file"
    log_line "BEFEHL: nginx-Site fuer ${host} nach ${site_file} gerendert (http ${HTTP_PORT})."
    run ln -sf "$site_file" "/etc/nginx/sites-enabled/schulsani"
    run nginx -t
    run systemctl reload nginx
    step_ok "nginx-Site fuer ${host} aktiviert."

    set +e
    certbot --nginx -d "$host" --non-interactive --agree-tos -m "admin@${host#*.}" --redirect
    local rc=$?
    set -e
    if [[ "$rc" -ne 0 ]]; then
      fail_with "certbot ist fehlgeschlagen (Code ${rc})." \
        "Haeufigste Ursache: DNS zeigt noch nicht auf diesen Server, oder Port ${HTTP_PORT} ist von aussen nicht erreichbar."
    fi
    step_ok "TLS-Zertifikat fuer ${host} bezogen."
  else
    # eigener HTTPS-Port: Zertifikat zuerst holen, solange nginx den HTTP-Port
    # noch nicht haelt (certbot --standalone bindet ihn selbst kurz).
    set +e
    certbot certonly --standalone --http-01-port "$HTTP_PORT" --non-interactive --agree-tos -m "admin@${host#*.}" -d "$host"
    local rc=$?
    set -e
    if [[ "$rc" -ne 0 ]]; then
      # Fallback ohne TLS, damit die Instanz trotzdem nutzbar ist.
      sed -e "s#<DOMAIN>#${host}#g" -e "s#<HTTP_PORT>#${HTTP_PORT}#g" \
        "${script_dir}/nginx.conf.template" >"$site_file"
      log_line "BEFEHL: nginx-Site fuer ${host} ohne TLS gerendert (http ${HTTP_PORT})."
      run ln -sf "$site_file" "/etc/nginx/sites-enabled/schulsani"
      run nginx -t
      run systemctl reload nginx
      step_fail "certbot --standalone fehlgeschlagen (Code ${rc}). Die Seite laeuft vorerst ohne TLS ueber http://${host}:${HTTP_PORT}."
      printf '  Von Hand nachholen: certbot certonly --standalone --http-01-port %s -d %s,\n  dann den TLS-Block an %s anhaengen (Vorlage: ops/install/nginx.conf.template).\n' \
        "$HTTP_PORT" "$host" "$site_file"
      return 0
    fi

    # HTTP-Block leitet auf den HTTPS-Port um, TLS-Block bedient die Seite.
    cat >"$site_file" <<EOF
server {
    listen ${HTTP_PORT};
    listen [::]:${HTTP_PORT};
    server_name ${host};
    return 301 https://\$host:${https_port}\$request_uri;
}
EOF
    cat >>"$site_file" <<EOF

server {
    listen ${https_port} ssl;
    listen [::]:${https_port} ssl;
    ssl_certificate /etc/letsencrypt/live/${host}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${host}/privkey.pem;
    server_name ${host};

    include /etc/nginx/schulsani/locations.conf;
}
EOF
    log_line "BEFEHL: nginx-Site fuer ${host} gerendert (http ${HTTP_PORT} -> https ${https_port})."
    run ln -sf "$site_file" "/etc/nginx/sites-enabled/schulsani"
    run nginx -t
    run systemctl reload nginx
    step_ok "TLS-Block fuer ${host}:${https_port} aktiviert."
  fi
}

# --- Dienst starten und Selbstpruefung (Schritt 12) ------------------------

step_start_service_and_check() {
  step_start "Dienst starten und pruefen"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    step_skip "Trockenlauf — Dienst wird nicht gestartet, keine Pruefung."
    return 0
  fi

  local script_dir app_root ecosystem_file domain backend_env db_url http_code

  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  app_root="$(cd "${script_dir}/../.." && pwd)"
  ecosystem_file="/etc/schulsani/ecosystem.config.js"
  backend_env="${app_root}/artifacts/api-server/.env"
  domain="$(read_env_value "${app_root}/artifacts/paramedic-app/.env" "EXPO_PUBLIC_DOMAIN")"

  if [[ ! -f "$ecosystem_file" ]]; then
    fail_with "PM2-Ecosystem-Datei fehlt (${ecosystem_file})."
  fi
  sed -i -e "s#<APP_ROOT>#${app_root}#g" -e "s#<BACKEND_PORT>#${BACKEND_PORT}#g" -e "s#<PM2_NAME>#${PM2_NAME}#g" "$ecosystem_file"

  if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
    run pm2 restart "$PM2_NAME"
  else
    run pm2 start "$ecosystem_file"
  fi
  run pm2 save

  # HTTP-Status pruefen. Liegt kein Zertifikat vor (TLS-Fallback), antwortet
  # https auf dem Domain-Port nicht — dann gilt der HTTP-Port der Instanz.
  local cert_dir
  cert_dir="/etc/letsencrypt/live/${domain%%:*}"
  if [[ -n "$domain" ]] && [[ -d "$cert_dir" ]]; then
    http_code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "https://${domain}/" || echo "000")"
  elif [[ -n "$domain" ]]; then
    http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://${domain%%:*}:${HTTP_PORT}/" || echo "000")"
  else
    http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://localhost:${BACKEND_PORT}/" || echo "000")"
  fi
  if [[ "$http_code" == "200" ]]; then
    step_ok "HTTP-Status ${http_code}."
  else
    step_fail "HTTP-Status ${http_code} (erwartet 200)."
  fi

  # PM2-Status pruefen.
  if pm2 jlist 2>/dev/null | grep -q "\"name\":\"${PM2_NAME}\".*\"status\":\"online\""; then
    step_ok "PM2-Prozess ${PM2_NAME} online."
  else
    step_fail "PM2-Prozess ${PM2_NAME} laeuft nicht."
  fi

  # Datenbankverbindung pruefen.
  db_url="$(read_env_value "$backend_env" "DATABASE_URL")"
  if [[ -n "$db_url" ]] && psql "$db_url" -tAc "SELECT 1" >/dev/null 2>&1; then
    step_ok "Datenbankverbindung erfolgreich."
  else
    step_fail "Datenbankverbindung fehlgeschlagen."
  fi
}

# --- Ablauf ----------------------------------------------------------------

update_main() {
  print_header
  step_prepare_log
  step_check_root
  step_detect_os

  step_run_migrations
  step_web_export
  step_start_service_and_check

  printf '\n%s✔ Aktualisierung abgeschlossen.%s\n' "$COLOR_GREEN" "$COLOR_RESET"
  printf 'Protokoll: %s\n' "$LOG_FILE"
  log_line "=== Aktualisierungslauf abgeschlossen ==="
}

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
  step_install_workspace
  step_verify_workspace
  step_install_postgres
  step_install_nginx
  step_install_certbot
  step_install_pm2

  step_provision_database

  step_install_pm2_ecosystem
  step_install_nginx_template

  printf '\n%s✔ Systemteil abgeschlossen.%s\n' "$COLOR_GREEN" "$COLOR_RESET"
  log_line "=== Systemteil abgeschlossen ==="

  step_run_migrations
  step_start_assistant

  printf '\n%s✔ Konfiguration, Geheimnisse und Eigentuemer-Konto eingerichtet.%s\n' "$COLOR_GREEN" "$COLOR_RESET"
  log_line "=== Assistent abgeschlossen ==="

  step_web_export
  step_setup_tls
  step_start_service_and_check

  printf '\n%s✔ Installation abgeschlossen.%s\n' "$COLOR_GREEN" "$COLOR_RESET"
  printf 'Protokoll: %s\n' "$LOG_FILE"
  log_line "=== Lauf abgeschlossen ==="
}

if [[ "$UPDATE_MODE" -eq 1 ]]; then
  update_main "$@"
else
  main "$@"
fi
