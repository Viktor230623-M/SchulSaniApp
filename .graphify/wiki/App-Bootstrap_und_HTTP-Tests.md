# App-Bootstrap und HTTP-Tests

> 19 nodes

## Key Concepts

- **createApp - Express-Bootstrap** (15 connections) — `artifacts/api-server/src/app.ts`
- **Auth-Routen (Anmeldung, OIDC, Sitzung)** (5 connections) — `artifacts/api-server/src/routes/auth.ts`
- **Nutzerverwaltungs-Routen** (5 connections) — `artifacts/api-server/src/routes/users.ts`
- **Einsatz-Routen** (3 connections) — `artifacts/api-server/src/routes/missions.ts`
- **Aktivitaetsprotokoll-Routen** (2 connections) — `artifacts/api-server/src/routes/activity.ts`
- **Datenbank-Konsole (Owner)** (2 connections) — `artifacts/api-server/src/routes/dbConsole.ts`
- **Einsatzbericht-Routen** (2 connections) — `artifacts/api-server/src/routes/incidentReports.ts`
- **Abwesenheitsmeldungs-Routen** (2 connections) — `artifacts/api-server/src/routes/loa.ts`
- **News-Routen** (2 connections) — `artifacts/api-server/src/routes/news.ts`
- **Benachrichtigungs-Routen** (2 connections) — `artifacts/api-server/src/routes/notifications.ts`
- **Rollenverwaltungs-Routen** (2 connections) — `artifacts/api-server/src/routes/roles.ts`
- **App-HTTP-Test** (1 connections) — `artifacts/api-server/src/app.http.test.ts`
- **config - zentrale Konfiguration** (1 connections) — `artifacts/api-server/src/config.ts`
- **Server-Start (listen)** (1 connections) — `artifacts/api-server/src/index.ts`
- **Login-HTTP-Test** (1 connections) — `artifacts/api-server/src/routes/login.http.test.ts`
- **Profilbestaetigungs-HTTP-Test** (1 connections) — `artifacts/api-server/src/routes/profileConfirmation.http.test.ts`
- **Health-Route** (1 connections) — `artifacts/api-server/src/routes/health.ts`
- **Status-Routen** (1 connections) — `artifacts/api-server/src/routes/status.ts`
- **Freischaltungs-Test** (1 connections) — `artifacts/api-server/src/routes/users.approve.test.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/api-server/src/app.http.test.ts`
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/config.ts`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/routes/activity.ts`
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/api-server/src/routes/dbConsole.ts`
- `artifacts/api-server/src/routes/health.ts`
- `artifacts/api-server/src/routes/incidentReports.ts`
- `artifacts/api-server/src/routes/loa.ts`
- `artifacts/api-server/src/routes/login.http.test.ts`
- `artifacts/api-server/src/routes/missions.ts`
- `artifacts/api-server/src/routes/news.ts`
- `artifacts/api-server/src/routes/notifications.ts`
- `artifacts/api-server/src/routes/profileConfirmation.http.test.ts`
- `artifacts/api-server/src/routes/roles.ts`
- `artifacts/api-server/src/routes/status.ts`
- `artifacts/api-server/src/routes/users.approve.test.ts`
- `artifacts/api-server/src/routes/users.ts`

## Audit Trail

- EXTRACTED: 36 (72%)
- INFERRED: 14 (28%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*