# Installer SchulSani

Bash-Installer und Browser-Assistent sind zwei Schritte desselben Konfigurationswegs.
Bash installiert System und Workspace, legt Datenbank und geschuetzte Arbeitsverzeichnisse
an und startet den Assistenten. Der Assistent schreibt anschliessend Backend-.env,
App-.env und aktive Anmeldewege. Es gibt keine zweite, abweichende Konfigurationsquelle.

Bringt einen frischen Debian/Ubuntu-Server in eine laufende, per TLS
erreichbare SchulSaniApp-Instanz. `install.sh` erledigt als `root` den
Systemteil (Voraussetzungspruefung, Paketbeschaffung, Datenbank, Vorlagen
fuer PM2 und nginx), startet danach den Einrichtungsassistenten
(`ops/install/assistant/`) fuer Konfiguration/Geheimnisse/Eigentuemer-Konto
und schliesst mit Migrationen, Web-Export, TLS-Beschaffung und
Selbstpruefung ab.

## Voraussetzungen

- Frischer Server mit Debian oder Ubuntu (`/etc/os-release` wird geprueft,
  alles andere wird abgelehnt).
- Root-Rechte (`sudo install.sh` bzw. als `root` ausgefuehrt).
- Mindestens 2 GB freier Speicherplatz auf `/`.
- Ports 80 und 443 frei (kein anderer nginx/Reverse-Proxy aktiv).
- Netzwerkzugriff nach aussen (apt-Repositories, NodeSource, npm-Registry).
- DNS-Eintrag der vorgesehenen Domain zeigt bereits auf diesen Server, bevor
  Schritt 11 (TLS) erreicht wird — sonst bricht certbot mit einer
  verstaendlichen Meldung ab.

## Aufruf

Erstinstallation:

```sh
sudo ops/install/install.sh
```

Trockenlauf — zeigt nur, was das Skript taete, veraendert nichts am System:

```sh
sudo ops/install/install.sh --dry-run
```

Aktualisierung einer bereits eingerichteten Instanz (z. B. nach neuen
Migrationen oder einem neuen Web-Export) — ueberspringt Systemteil und
Einrichtungsassistenten, liest die vorhandenen `.env`-Dateien:

```sh
sudo ops/install/install.sh --update
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
   Skript mit einem Hinweis auf das PGDG-Apt-Repository ab.
4. Legt Datenbankrolle und Datenbank an (`schulSani`, Rolle `saniapp`),
   erzeugt ein zufaelliges Passwort und hinterlegt es unter
   `/root/.schulsani-db-password` (`chmod 600`) fuer einen erneuten Lauf.
   Bei bereits vorhandener Rolle/Datenbank wird nichts ueberschrieben.
5. Kopiert `ecosystem.config.js` (PM2-Vorlage) nach `/etc/schulsani/` und
   `nginx.conf.template` (nginx-Vorlage) nach `/etc/nginx/schulsani/` —
   beide mit Platzhaltern, noch ohne konkrete Werte.
6. Installiert die Workspace-Abhaengigkeiten und startet den Einrichtungsassistenten
   (`ops/install/assistant/server.js`) auf einem zufaelligen Port (40000–49999).
   Die Einmal-URL mit Token erscheint im Terminal; der Assistent wartet im
   Vordergrund, bis die Einrichtung im Browser abgeschlossen ist oder 60 Minuten
   ohne Eingabe vergehen. Bash und Browser verwenden denselben Vertrag: Der
   Assistent fragt Domain, Schulname, Anmeldemodus, SMTP-Mailserver,
   Anwendungsname, Themefarbe, Bundle-Kennung und optionale Werte ab. Erzeugt
   `JWT_SECRET` und das VAPID-Schluesselpaar, schreibt
   `artifacts/api-server/.env`, `artifacts/paramedic-app/.env` und
   `/etc/schulsani/auth-providers.json` jeweils mit restriktiven Dateirechten.   Lokale E-Mail-Anmeldung und OIDC sind vorgesehen; E-Mail kann zusammen mit
   bis zu zwei OIDC-Anbietern aktiviert werden. Eine alte Formularanmeldung
   wird nicht automatisch wieder aktiviert. Im letzten Schritt wird das erste
   freigegebene Eigentuimerkonto angelegt.
7. Installiert die Workspace-Abhaengigkeiten, spielt Migrationen mit der
   bereitgestellten Datenbank-URL ein und startet danach den Browser-Assistenten
   fuer die Einrichtung und das erste Eigentuimerkonto.
8. Raeumt `/tmp/metro-cache` auf (dort lagen auf dem Bestandsserver einmal
   Reste eines fremden Laufs, die falsche Instanzwerte in `dist/` getragen
   haben) und baut den Web-Export (`npx expo export --platform web`).
9. Rendert `nginx.conf.template` mit der echten Domain und dem `dist/`-Pfad,
   aktiviert die Site, prueft den DNS-Eintrag und bezieht ein
   TLS-Zertifikat mit `certbot --nginx`.
10. Rendert `ecosystem.config.js` mit dem echten Installationspfad, startet
    (oder startet neu) den PM2-Prozess `sani-backend`, prueft danach
    HTTP-Status, PM2-Status und Datenbankverbindung.

Jeder Schritt ist idempotent: ein erneuter Lauf auf einem bereits
teilweise eingerichteten System ueberspringt Erledigtes, statt es erneut
auszufuehren oder zu ueberschreiben. `--update` deckt den haeufigsten
Wiederholungsfall (nur Migrationen/Web-Export/Neustart) gezielt ab, ohne
erneut nach Konfiguration zu fragen.

Ausgabe im Terminal ist mit Farben versehen, wenn das Terminal sie
unterstuetzt (`tput`-Pruefung), sonst schlichter Text. Jeder Schritt zeigt
Haken (✔), Punkt (·, uebersprungen) oder Kreuz (✘, Fehler).

## Protokoll

Alle Schritte werden nach `/var/log/schulsani-install.log` protokolliert
(auch im Trockenlauf, dort mit Kennzeichnung `[TROCKENLAUF]`). Erzeugte
Geheimnisse (Datenbank-Passwort, `JWT_SECRET`, VAPID-Paar) werden nicht im
Klartext protokolliert.

## Was danach von Hand zu pruefen ist

- `psql -U saniapp -d schulSani -c '\conninfo'` — Datenbankverbindung
  funktioniert mit der erzeugten Rolle.
- `artifacts/api-server/.env` und `artifacts/paramedic-app/.env` enthalten
  die vom Assistenten geschriebenen Werte — stichprobenartig gegen die
  Eingabe pruefen, Dateirechte muessen `600` sein.
- `/etc/schulsani/auth-providers.json` enthaelt nur die im Assistenten
  aktivierten lokalen oder OIDC-Anmeldewege.
- `pm2 status sani-backend` — Prozess laeuft, `pm2 logs sani-backend` bei
  Auffaelligkeiten.
- `systemctl status postgresql nginx` — beide Dienste laufen.
- `curl -I https://<domain>/` — TLS greift, Antwort 200.

## Offene Punkte

- SMTP-Erreichbarkeit wird beim ersten lokalen Registrierungsversuch mit
  `verifyMailer()` geprueft; der Installer testet absichtlich keinen
  Mailversand und protokolliert keine Zugangsdaten.
- Kein automatisches Firewall-Handling (ufw) — falls eine Firewall aktiv
  ist, muessen Ports von Hand freigegeben werden, inklusive des
  zufaelligen Assistent-Ports waehrend der Einrichtung.
- Kein Testlauf auf einer echten Debian/Ubuntu-VM (Roadmap-Schritt 15
  entfaellt mangels Testsystem) — Nachweis bislang nur `bash -n`,
  `shellcheck` und `node -c`.
- `pnpm --filter @workspace/db migrate` setzt einen entsprechenden
  Migrationsbefehl in `lib/db/package.json` voraus (R1); ist er noch nicht
  vorhanden, bricht Schritt 7 mit einer erklaerenden Meldung ab.
