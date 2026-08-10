# SchulSaniApp

[Deutsch](README.md) · English

Management and operations software for a school first aid service. The app
covers the day-to-day running of a school first aid group: duty rosters and
on-duty status, incident intake, incident documentation (reports with PDF
export), news from the team leadership, notifications, and user management
with role-based access control.

## Tech stack

- **App**: Expo / React Native, runs as an app and as a web export (PWA),
  routing via `expo-router`.
- **Backend**: Express 5 (TypeScript), REST API under `/api`.
- **Database**: PostgreSQL, accessed through Drizzle ORM, migrations via
  Drizzle Kit.
- **Sign-in**: OIDC providers with server-side sessions via httpOnly cookie.
- **Notifications**: web push over VAPID, plus Expo push for native apps.
- **API contract**: OpenAPI spec (`lib/api-spec`), from which Zod schemas
  (`lib/api-zod`) and a typed React client (`lib/api-client-react`) are
  generated.

## Monorepo layout

Managed with pnpm workspaces (`pnpm-workspace.yaml`).

| Path                        | Contents                                                          |
| --------------------------- | ------------------------------------------------------------------|
| `artifacts/api-server`      | Express backend (routes, middleware, jobs, services)              |
| `artifacts/paramedic-app`   | Expo app (app and web build), screens under `app/`                |
| `lib/db`                    | Drizzle schema, migrations, DB client                             |
| `lib/api-spec`              | OpenAPI source of the interface                                   |
| `lib/api-zod`               | Zod validation generated from the OpenAPI spec                    |
| `lib/api-client-react`      | React Query client generated from the OpenAPI spec                |
| `scripts`                   | Repo-internal helper scripts                                      |
| `ops/backup`                | Backup-related operations scripts                                 |
| `ops/install`               | Installer: system part + setup wizard (principles: `ops/install/README.md`) |

## Local setup

**Prerequisites**: Node.js, pnpm, a reachable PostgreSQL database.

```sh
pnpm install
```

### Environment variables

Backend (`artifacts/api-server/.env`):

| Variable             | Description                                                          |
| -------------------- | ---------------------------------------------------------------------|
| `DATABASE_URL`       | Postgres connection string                                            |
| `JWT_SECRET`         | Signing key for session/auth tokens, at least 32 characters           |
| `PORT`               | Port the server listens on                                            |
| `ALLOWED_ORIGINS`    | Comma-separated list of allowed CORS origins                          |
| `AUTH_PROVIDERS_PATH` | Path to the config file of the active sign-in providers              |
| `SCHOOL_ID`          | The school's official school number (e.g. `4321`); new accounts get this ID assigned |
| `ROLE_MAP_PATH`      | Optional: path to a bootstrap role mapping for first-time setup       |
| `OWNER_USER_ID`      | User ID with access to the administrative SQL console                 |
| `VAPID_PUBLIC_KEY`   | Public VAPID key for web push                                         |
| `VAPID_PRIVATE_KEY`  | Private VAPID key for web push                                        |
| `VAPID_SUBJECT`      | Contact (mailto: or URL) for web push                                 |
| `FCM_SERVICE_ACCOUNT_PATH` | Optional: path to the provider's service account JSON (FCM, Android) |
| `FCM_PROJECT_ID`     | Optional: provider's Firebase project ID (FCM)                          |
| `APNS_KEY_PATH`      | Optional: path to the provider's .p8 auth key (APNs, iOS)               |
| `APNS_KEY_ID`        | Optional: key ID of the .p8 key (APNs)                                  |
| `APNS_TEAM_ID`       | Optional: provider's Apple team ID (APNs)                               |
| `APNS_BUNDLE_ID`     | Optional: app bundle ID (APNs)                                          |
| `APNS_ENV`           | Optional: `production` or `sandbox` (APNs)                              |
| `LIBRETRANSLATE_URL` | Optional: URL of a LibreTranslate instance for translations           |

App (`artifacts/paramedic-app/.env`):

| Variable                     | Description                                  |
| ---------------------------- | -----------------------------------------------|
| `EXPO_PUBLIC_DOMAIN`         | Domain under which the app/API is reachable  |
| `EXPO_PUBLIC_VAPID_PUBLIC_KEY` | Public VAPID key for web push (client side) |

No values are stored anywhere in the repository.

### Database

Schema and migrations live in `lib/db` (Drizzle):

```sh
cd lib/db
pnpm generate      # create a migration from schema changes
pnpm migrate       # apply migrations against DATABASE_URL
pnpm drift         # check whether schema and migration state have diverged
```

`pnpm push-unsicher` applies the schema directly, without a migration file —
not for production, only for quick local experiments.

### Start

```sh
# Backend
cd artifacts/api-server && pnpm dev

# App (Expo dev server)
cd artifacts/paramedic-app && npx expo start

# Web export (static build for nginx or similar)
cd artifacts/paramedic-app && npx expo export --platform web
```

## Privacy

Incident reports contain health-related data (patient details, vital signs,
treatments). Access to this data is restricted by role (`lib/access.ts`):
only certain roles see patient information or may view other people's
reports. Access to reports is logged (accountability). All affected tables
have fixed deletion periods, implemented as an automated job
(`artifacts/api-server/src/lib/retentionRules.ts`,
`src/jobs/retention.ts`) — among others, submitted reports after several
years, drafts after 30 days, sessions after revocation, access and console
logs after 12 months.

## Sign-in providers

An installation can offer several OIDC providers at the same time.
`AUTH_PROVIDERS_PATH` determines which entries are active. An example with
Google, Microsoft, Apple, and IServ OIDC entries is in
`ops/install/auth-providers.example.json`; the template contains no
credentials, and the examples are disabled. Without a config file, no
provider starts. Native OIDC sign-in passes the session over a one-time
code; for that, the app uses the Web Crypto implementation of the supported
Expo runtime. If it is missing, the redirect is aborted rather than issuing
a session without proof. The transfer code lives in the running backend
process's memory for two minutes; after a restart, sign-in must begin again.

## Status

Private project for the first aid service of a single school. It is actively
developed, but without public support and without any promise of
compatibility between versions — changes to the data model, configuration,
or behavior can happen without notice.
