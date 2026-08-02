# Installer SchulSani

Bringt einen frischen Debian/Ubuntu-Server in einen betriebsbereiten
Zustand fuer SchulSaniApp. `install.sh` erledigt als `root` den Systemteil
(Voraussetzungspruefung, Paketbeschaffung, Datenbank, Vorlagen fuer PM2 und
nginx) und startet danach den Einrichtungsassistenten
(`ops/install/assistant/`) — eine kleine, lokal ausgelieferte Weboberflaeche,
ueber die Konfiguration eingegeben, Geheimnisse erzeugt und das erste
Administrator-Konto angelegt werden. Migrationslauf, Web-Export,
TLS-Beschaffung und Selbstpruefung sind noch nicht angebunden — folgt in
einer spaeteren Ausbaustufe (siehe "Offene Punkte" unten).

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
3. Installiert Node.js 24.x (NodeSource-Repository), aktiviert `pnpm` ueber
   Corepack, installiert PostgreSQL, nginx, certbot und PM2 — jeweils mit
   Pruefung, ob eine passende Version bereits vorhanden ist. Fuer PostgreSQL
   gilt eine Mindest-Hauptversion 17 (passend zum Bestandsserver); liefert
   die Distribution per Paketmanager eine aeltere Version, bricht das
   Skript mit einem Hinweis auf das PGDG-Apt-Repository ab, statt still mit
   einer zu alten Version weiterzumachen.
4. Legt Datenbankrolle und Datenbank an (`schulSani`, Rolle `saniapp`),
   erzeugt ein zufaelliges Passwort und hinterlegt es unter
   `/root/.schulsani-db-password` (`chmod 600`) — damit ein erneuter Lauf
   dieselbe `DATABASE_URL` zusammenbauen kann, ohne dass Postgres das
   Passwort im Klartext herausgeben muesste. Bei bereits vorhandener
   Rolle/Datenbank wird nichts ueberschrieben.
5. Kopiert `ecosystem.config.js` (PM2-Vorlage) nach `/etc/schulsani/` und
   `nginx.conf.template` (nginx-Vorlage) nach `/etc/nginx/schulsani/` —
   beide mit Platzhaltern, noch ohne konkrete Werte.
6. Startet den Einrichtungsassistenten (`ops/install/assistant/server.js`)
   auf einem zufaelligen Port (40000–49999), gibt eine Einmal-URL mit Token
   im Terminal aus und wartet im Vordergrund, bis die Einrichtung im
   Browser abgeschlossen ist oder 60 Minuten ohne Eingabe vergehen. Der
   Assistent fragt Domain, Schulname, IServ-Domain, Mail-Domain,
   Anwendungsname, Themefarbe, Bundle-Kennung und optionale Werte ab,
   erzeugt `JWT_SECRET` und das VAPID-Schluesselpaar, schreibt
   `artifacts/api-server/.env` und `artifacts/paramedic-app/.env`
   (`chmod 600`) und legt die IServ-Kennung des ersten Administrators mit
   Rolle `cto` und Vorabfreigabe an — vorausgesetzt, die Datenbanktabellen
   existieren bereits (Migrationslauf ist noch nicht Teil dieses Skripts,
   siehe "Offene Punkte").

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
  (`<APP_ROOT>`, `<DOMAIN>`, `<DIST_PATH>`) — werden erst in einer
  spaeteren Ausbaustufe des Assistenten mit echten Werten gerendert und
  aktiviert.
- `artifacts/api-server/.env` und `artifacts/paramedic-app/.env` enthalten
  die vom Assistenten geschriebenen Werte — stichprobenartig gegen die
  Eingabe pruefen, Dateirechte muessen `600` sein.
- `/etc/schulsani/role-map.json` enthaelt die IServ-Kennung des ersten
  Administrators mit Rolle `cto`.
- DNS-Eintrag der vorgesehenen Domain muss auf diesen Server zeigen, bevor
  spaeter eine TLS-Beschaffung (certbot) versucht wird.
- `systemctl status postgresql nginx` — beide Dienste laufen.

## Offene Punkte

- Migrationslauf, Web-Export, TLS-Beschaffung und Selbstpruefung sind noch
  nicht Teil des Assistenten — sie haengen an R1/R2-Ergebnissen und kommen
  in einer spaeteren Ausbaustufe. Das Administrator-Konto kann der
  Assistent erst anlegen, wenn die `users`-Tabelle bereits existiert
  (Migrationen vorher von Hand ausfuehren, falls dieser Schritt noch
  fehlschlaegt).
- Kein automatisches Firewall-Handling (ufw) — falls eine Firewall aktiv
  ist, muessen Ports von Hand freigegeben werden, inklusive des
  zufaelligen Assistent-Ports waehrend der Einrichtung.
- Kein Testlauf auf einer echten Debian/Ubuntu-VM durchgefuehrt (siehe
  Roadmap-Schritt 15) — bisher nur `bash -n`, `shellcheck`, `node -c` und
  ein lokaler Trockenlauf des Assistenten mit einer Testdatenbank-Attrappe
  geprueft.
