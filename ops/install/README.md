# Installer SchulSani

Bringt einen frischen Debian/Ubuntu-Server in einen betriebsbereiten
Zustand fuer SchulSaniApp. `install.sh` deckt aktuell nur den **Systemteil**
ab (Voraussetzungspruefung, Paketbeschaffung, Datenbank, Vorlagen fuer PM2
und nginx). Konfigurationsabfrage, Geheimniserzeugung, Migrationslauf,
Web-Export und TLS-Beschaffung laufen kuenftig ueber einen
Einrichtungsassistenten im Browser, den dieses Skript am Ende startet —
folgt in einer spaeteren Ausbaustufe.

## Voraussetzungen

- Frischer Server mit Debian oder Ubuntu (`/etc/os-release` wird geprueft,
  alles andere wird abgelehnt).
- Root-Rechte (`sudo install.sh` bzw. als `root` ausgefuehrt).
- Mindestens 2 GB freier Speicherplatz auf `/`.
- Ports 80 und 443 frei (kein anderer nginx/Reverse-Proxy aktiv).
- Netzwerkzugriff nach aussen (apt-Repositories, NodeSource, npm-Registry).

## Aufruf

```sh
sudo ops/install/install.sh
```

Trockenlauf — zeigt nur, was das Skript taete, veraendert nichts am System:

```sh
sudo ops/install/install.sh --dry-run
```

## Was das Skript tut

1. Prueft Root-Rechte und erkennt das Betriebssystem.
2. Prueft freien Speicherplatz, Ports 80/443, bereits laufendes
   nginx/PostgreSQL.
3. Installiert Node.js (NodeSource-Repository), aktiviert `pnpm` ueber
   Corepack, installiert PostgreSQL, nginx, certbot und PM2 — jeweils mit
   Pruefung, ob eine passende Version bereits vorhanden ist.
4. Legt Datenbankrolle und Datenbank an (`schulSani`, Rolle `saniapp`),
   erzeugt ein zufaelliges Passwort. Bei bereits vorhandener Rolle/Datenbank
   wird nichts ueberschrieben.
5. Kopiert `ecosystem.config.js` (PM2-Vorlage) nach `/etc/schulsani/` und
   `nginx.conf.template` (nginx-Vorlage) nach `/etc/nginx/schulsani/` —
   beide mit Platzhaltern, noch ohne konkrete Werte.

Jeder Schritt ist idempotent: ein erneuter Lauf auf einem bereits
teilweise eingerichteten System ueberspringt Erledigtes, statt es erneut
auszufuehren oder zu ueberschreiben.

Ausgabe im Terminal ist mit Farben versehen, wenn das Terminal sie
unterstuetzt (`tput`-Pruefung), sonst schlichter Text. Jeder Schritt zeigt
Haken (✔), Punkt (·, uebersprungen) oder Kreuz (✘, Fehler).

## Protokoll

Alle Schritte werden nach `/var/log/schulsani-install.log` protokolliert
(auch im Trockenlauf, dort mit Kennzeichnung `[TROCKENLAUF]`). Erzeugte
Geheimnisse (Datenbank-Passwort) werden nicht im Klartext protokolliert.

## Was danach von Hand zu pruefen ist

- `psql -U saniapp -d schulSani -c '\conninfo'` — Datenbankverbindung
  funktioniert mit der erzeugten Rolle.
- `/etc/schulsani/ecosystem.config.js` und
  `/etc/nginx/schulsani/nginx.conf.template` enthalten noch Platzhalter
  (`<APP_ROOT>`, `<DOMAIN>`, `<DIST_PATH>`) — werden erst vom
  Einrichtungsassistenten (kuenftig) mit echten Werten gerendert und
  aktiviert.
- DNS-Eintrag der vorgesehenen Domain muss auf diesen Server zeigen, bevor
  spaeter eine TLS-Beschaffung (certbot) versucht wird.
- `systemctl status postgresql nginx` — beide Dienste laufen.

## Offene Punkte

- Konfigurationsabfrage, Geheimniserzeugung (`JWT_SECRET`, VAPID-Paar),
  Migrationslauf, Web-Export, TLS-Beschaffung und Selbstpruefung sind noch
  nicht Teil dieses Skripts — sie haengen an der Instanz-Konfiguration
  (siehe `R2-instanz-konfiguration-entkoppeln.md`) und am geplanten
  Einrichtungsassistenten.
- Kein automatisches Firewall-Handling (ufw) — falls eine Firewall aktiv
  ist, muessen Ports von Hand freigegeben werden.
- Kein Testlauf auf einer echten Debian/Ubuntu-VM durchgefuehrt (siehe
  Roadmap-Schritt 15) — bisher nur `bash -n` und `shellcheck` geprueft.
