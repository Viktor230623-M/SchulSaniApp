# SchulSaniApp

Verwaltungs- und Einsatzsoftware für einen Schulsanitätsdienst. Die Anwendung
bildet den laufenden Betrieb einer Schulsanitätsgruppe ab: Dienstplan und
Bereitschaftsstatus, Einsatzannahme, Einsatzdokumentation (Einsatzprotokolle
mit PDF-Export), Neuigkeiten aus der Leitung, Benachrichtigungen sowie eine
Nutzerverwaltung mit rollenbasierten Zugriffsrechten.

## Technik-Stack

- **App**: Expo / React Native, als App und als Web-Export (PWA) lauffähig,
  Routing über `expo-router`.
- **Backend**: Express 5 (TypeScript), REST-API unter `/api`.
- **Datenbank**: PostgreSQL, Zugriff über Drizzle ORM, Migrationen über
  Drizzle Kit.
- **Anmeldung**: OIDC-Anmeldewege mit serverseitigen Sitzungen per
  httpOnly-Cookie.
- **Benachrichtigungen**: Web-Push über VAPID sowie Expo-Push für native Apps.
- **API-Vertrag**: OpenAPI-Spezifikation (`lib/api-spec`), daraus generiert:
  Zod-Schemas (`lib/api-zod`) und ein typisierter React-Client
  (`lib/api-client-react`).

## Aufbau des Monorepos

Verwaltet mit pnpm-Workspaces (`pnpm-workspace.yaml`).

| Pfad                          | Inhalt                                                             |
| ----------------------------- | -------------------------------------------------------------------|
| `artifacts/api-server`        | Express-Backend (Routen, Middleware, Jobs, Services)                |
| `artifacts/paramedic-app`     | Expo-App (App- und Web-Build), Bildschirme unter `app/`             |
| `lib/db`                      | Drizzle-Schema, Migrationen, DB-Client                              |
| `lib/api-spec`                | OpenAPI-Quelle der Schnittstelle                                    |
| `lib/api-zod`                 | Aus der OpenAPI-Spec generierte Zod-Validierung                     |
| `lib/api-client-react`        | Aus der OpenAPI-Spec generierter React-Query-Client                 |
| `scripts`                     | Repo-interne Hilfsskripte                                           |
| `ops/backup`                  | Backup-bezogene Betriebsskripte                                     |
| `ops/install`                 | Installer: Systemteil + Einrichtungsassistent (Prinzipien: `ops/install/README.md`) |

## Lokale Einrichtung

**Voraussetzungen**: Node.js, pnpm, eine erreichbare PostgreSQL-Datenbank.

```sh
pnpm install
```

### Umgebungsvariablen

Backend (`artifacts/api-server/.env`):

| Variable            | Beschreibung                                                          |
| ------------------- | ---------------------------------------------------------------------|
| `DATABASE_URL`      | Postgres-Verbindungsstring                                            |
| `JWT_SECRET`         | Signaturschlüssel für Sitzungs-/Auth-Tokens, mindestens 32 Zeichen    |
| `PORT`               | Port, auf dem der Server lauscht                                     |
| `ALLOWED_ORIGINS`    | Kommagetrennte Liste erlaubter CORS-Origins                            |
| `AUTH_PROVIDERS_PATH` | Pfad zur Konfigurationsdatei der aktiven Anmeldewege                   |
| `SCHOOL_ID`          | Kennung der Schule, wird neu angelegten Nutzern zugewiesen             |
| `ROLE_MAP_PATH`      | Optional: Pfad zu einer Bootstrap-Rollenzuordnung für die Ersteinrichtung |
| `OWNER_USER_ID`      | Nutzer-ID mit Zugriff auf die administrative SQL-Konsole               |
| `VAPID_PUBLIC_KEY`   | Öffentlicher VAPID-Schlüssel für Web-Push                              |
| `VAPID_PRIVATE_KEY`  | Privater VAPID-Schlüssel für Web-Push                                  |
| `VAPID_SUBJECT`      | Kontaktangabe (mailto: oder URL) für Web-Push                          |
| `EXPO_ACCESS_TOKEN`  | Optional: Token für Expo-Push-Benachrichtigungen                       |
| `LIBRETRANSLATE_URL` | Optional: URL einer LibreTranslate-Instanz für Übersetzungen           |

App (`artifacts/paramedic-app/.env`):

| Variable                     | Beschreibung                                  |
| ---------------------------- | -----------------------------------------------|
| `EXPO_PUBLIC_DOMAIN`         | Domain, unter der die App/API erreichbar ist   |
| `EXPO_PUBLIC_VAPID_PUBLIC_KEY` | Öffentlicher VAPID-Schlüssel für Web-Push (Client-Seite) |

Werte werden nirgends im Repository hinterlegt.

### Datenbank

Schema und Migrationen liegen in `lib/db` (Drizzle):

```sh
cd lib/db
pnpm generate      # Migration aus Schemaaenderungen erzeugen
pnpm migrate       # Migrationen gegen DATABASE_URL anwenden
pnpm drift         # prueft, ob Schema und Migrationsstand auseinanderlaufen
```

`pnpm push-unsicher` wendet das Schema direkt an, ohne Migrationsdatei — kein
Weg fuer die Produktion, nur fuer schnelles lokales Experimentieren.

### Start

```sh
# Backend
cd artifacts/api-server && pnpm dev

# App (Expo, Dev-Server)
cd artifacts/paramedic-app && npx expo start

# Web-Export (statischer Build für Nginx o. ä.)
cd artifacts/paramedic-app && npx expo export --platform web
```

## Datenschutz

Die Einsatzprotokolle enthalten gesundheitsbezogene Daten (Patientenangaben,
Vitalwerte, Behandlungsmaßnahmen). Der Zugriff auf diese Daten ist rollenbasiert
eingeschränkt (`lib/access.ts`): nur bestimmte Rollen sehen Patienteninformationen
oder dürfen fremde Protokolle einsehen. Zugriffe auf Protokolle werden protokolliert
(Rechenschaftsnachweis). Für alle betroffenen Tabellen gelten feste Löschfristen,
die als automatisierter Job umgesetzt sind (`artifacts/api-server/src/lib/retentionRules.ts`,
`src/jobs/retention.ts`) — u. a. eingereichte Protokolle nach mehreren Jahren,
Entwürfe nach 30 Tagen, Sitzungen nach Widerruf, Zugriffs- und Konsolenprotokolle
nach 12 Monaten.

## Anmeldewege

Eine Installation kann mehrere OIDC-Anmeldewege gleichzeitig anbieten.
`AUTH_PROVIDERS_PATH` legt fest, welche Einträge aktiv sind. Ein Beispiel mit
Google-, Microsoft-, Apple- und IServ-OIDC-Einträgen liegt unter
`ops/install/auth-providers.example.json`; die Vorlage enthält keine
Zugangsdaten und die Beispiele sind deaktiviert. Ohne Konfigurationsdatei
startet kein Anmeldeweg. Native OIDC-Anmeldung
übergibt die Sitzung über einen einmaligen Code; dafür nutzt die App die
Web-Crypto-Implementierung der unterstützten Expo-Laufzeit. Fehlt sie, wird die
Weiterleitung abgebrochen statt eine Sitzung ohne Nachweis auszustellen. Der
Übergabecode liegt zwei Minuten im Speicher des laufenden Backend-Prozesses;
bei einem Neustart muss die Anmeldung neu begonnen werden.

## Status

Privates Projekt für den Schulsanitätsdienst einer einzelnen Schule. Es wird
aktiv weiterentwickelt, aber ohne öffentlichen Support und ohne Zusage zu
Kompatibilität zwischen Versionen — Änderungen an Datenmodell, Konfiguration
oder Verhalten können ohne Ankündigung erfolgen.
