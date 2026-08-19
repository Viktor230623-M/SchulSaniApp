# SchulSaniApp — Best-Practices-Research-Fanout (konsolidiert)

Stand: 19.08.2026 · Methode: 30+ researcher-web/-docs Subagents (read-only) + direkte Verifikation (Tests, Typecheck, Grep).

---

## 0. Executive Summary

SchulSaniApp ist architektonisch **überdurchschnittlich gut** aufgestellt: Ende-zu-Ende-Verschlüsselung (Server sieht nur Chiffrat), Zero-Knowledge-Passwortableitung (Argon2id, Server sieht nur SHA-256 des Proofs), saubere Tenant-Isolation über `schoolIdOf(req)` + `eq(schoolId)`-Filter, ein striktes Retention-Konzept (23-Uhr-Anonymisierung) und Fail-Fast-Konfiguration.

Die **größten Risiken** sind nicht fehlende Features, sondern **unverifizierte Garantien**: Die Tenant-Isolations-Integrationstests laufen im Testlauf als *skipped* (keine Live-PostgreSQL), es gibt **kein PostgreSQL Row-Level-Security** als zweite Verteidigungslinie, und **keine der 14 Daten-Routen validiert Input mit Zod** (nur `health.ts`, und das nur für Output). Dazu kommt: Push-Tokens werden bei Kontosperrung **nicht sofort** invalidiert.

### Verifikation (Phase 3, selbst ausgeführt)

| Prüfung | Ergebnis |
|---|---|
| `api-server` Typecheck | ✅ sauber (exit 0) |
| `paramedic-app` Typecheck | ✅ sauber (exit 0) |
| `api-server` Tests | ✅ 217 passed / 12 skipped |
| Tenant-Isolations-Integrationstests | ⚠️ `tenantIsolation.integration.test.ts` (7) + `multiTenant.integration.test.ts` (5) **skipped** — brauchen Live-DB |
| Zod in Routes | ⚠️ nur `health.ts` (Output), 14 Daten-Routen validieren manuell |
| App-Tests | ❌ `paramedic-app` hat **kein** `test`-Script → 0 automatisierte App-Tests |
| Docker | ❌ kein Dockerfile/docker-compose im Haupt-Repo (Bash-Installer statt Container) |
| Secrets im Repo | ✅ keine `.env`-Dateien eingecheckt, Fail-Fast-Config |

---

## 1. Was bereits stark ist (kein Handlungsbedarf)

- **E2E-Verschlüsselung:** Server speichert nur `contentEncrypted`; DEK-Umschlag, KEK leitet sich clientseitig aus dem Passwort ab, Klartext-Schlüssel verlässt das Gerät nie (`auth/providers/local.ts:25-35`, `keyManager.ts:7-9`).
- **Zero-Knowledge-Login:** Server sieht nie das Passwort, nur SHA-256 des Argon2id-Proofs; Dummy-Hash + `timingSafeEqual` gegen Enumeration (`auth/providers/local.ts:31-57`).
- **Tenant-Isolation im App-Layer:** `schoolId` kommt aus der Session (`schoolIdOf`), 109+ `eq(schoolId)`-Filter in den Routen.
- **Retention:** strikte Fristen (`lib/retentionRules.ts`), Job in `jobs/retention.ts:74-107`, 23-Uhr-Anonymisierung.
- **Leere Push-Payloads:** nur `notificationId`/`type`/`relatedId`, keine Gesundheitsdaten über APNs/FCM (`services/notifications.ts:182`).
- **Kein File-Upload:** kein Multer/kein Pfad-Traversal-Angriffsvektor; JSON-Limit `50kb` in `app.ts`.
- **Fail-Fast-Config:** `config.ts` wirft bei fehlenden Pflichtwerten; CORS `*` ist explizit ausgeschlossen.
- **Audit-Logs read-only:** keine Update/Delete-Routen für Logs; transaktionales Logging (`lib/roleChangeLog.ts`).
- **Lockout-Prevention:** `assertAdminReachable` verhindert Aussperren des letzten Admins (`routes/users.ts`).
- **Password-Reset:** Anti-Enumeration (einheitliche 202-Antwort, künstliche Verzögerung), Token-Hash-Speicherung, `passwordVersion` invalidiert JWTs.

---

## 2. P0 — MUSS behoben werden (Sicherheit/Korrektheit)

### P0-1 · Tenant-Isolations-Tests laufen nicht (skipped)
- **Problem:** `tenantIsolation.integration.test.ts` (7 Tests) und `multiTenant.integration.test.ts` (5 Tests) sind im Testlauf *skipped* — der zentrale Beweis „Schule A kann Schule B nicht lesen" wird nie ausgeführt.
- **Verifikation:** `pnpm test` → `Test Files 15 passed | 2 skipped`, `217 passed | 12 skipped`.
- **Fix:** Live-PostgreSQL (Testcontainer oder `pnpm db:up`) in CI + lokal vor den Tests starten; Tests dürfen nicht still skippen.

### P0-2 · Kein PostgreSQL Row-Level-Security (RLS)
- **Problem:** Isolation hängt zu 100 % an App-Filtern. Ein vergessenes `eq(schoolId)` = Cross-Tenant-Leak. Kein `row level security`/`policy` in `lib/db` oder Migrationen.
- **Fix:** RLS mit `current_setting('app.current_school_id')` als zweite Verteidigungslinie auf Metadaten-Tabellen (users, notifications, device_tokens, logs). Beachten: E2E-Chiffrat-Tabellen brauchen RLS nicht für Inhalt, aber für Metadaten-Zuordnung.

### P0-3 · Zod-Validierung fehlt auf allen Daten-Routen
- **Problem:** Nur `health.ts` nutzt Zod (und nur für Output). Alle 14 Daten-Routen casten `req.body as ...` ohne Schema-Validierung.
- **Verifikation:** Grep über `src/routes/` → 3 Treffer, alle in `health.ts`.
- **Fix:** Middleware-Factory `validate({ body, query, params })` mit `safeParse` (Rück-Überschreiben von `req.body = result.data`), Schemas aus `lib/api-zod` anbinden — zuerst an den mutierenden High-Risk-Endpoints (users, missions, notifications, exports, auth).

### P0-4 · Push-Tokens nicht bei Sperrung invalidiert
- **Problem:** Deaktivierte/nicht freigegebene Nutzer erhalten weiter Push, bis FCM/APNs „gone" meldet (`services/notifications.ts` prüft nur `isApproved` bei Erstellung).
- **Fix:** Bei `users.approve`/Status-Änderung alle `device_tokens` des Nutzers sofort löschen.

### P0-5 · `secure`-Cookie-Flag an NODE_ENV gekoppelt
- **Problem:** Cookie `secure` hängt an der Umgebung — in Prod muss es zwingend `true` sein (Session-Cookie `sani-session`).
- **Fix:** `secure` hart auf `true` (bzw. explizit aus Config `COOKIE_SECURE`), nie implizit aus NODE_ENV ableiten.

### P0-6 · CSRF-Lücke an Cookie-Endpunkten
- **Problem:** Cookie-authentifizierte Endpunkte (logout, account/delete) haben keinen vollständigen CSRF-Schutz (kein double-submit/Origin-Check durchgängig).
- **Fix:** Origin-/SameSite-Prüfung zentral in Middleware; für state-changing Cookie-Endpoints double-submit-Token.

### P0-7 · Rate-Limiter nur in-memory
- **Problem:** `express-rate-limit` in-memory → nicht distributed, reset bei Neustart, pro-Instanz.
- **Fix:** Für Cloud-Betrieb einen verteilten Store (Redis) hinter den Limiter; `trust proxy` korrekt setzen.

### P0-8 · Audit-Log-Tabellen ohne `school_id`
- **Problem:** `roleChangeLogTable`, `profileChangeLogTable`, `identityChangeLogTable` haben keine `school_id` (`lib/db/src/schema/index.ts:352,369,384`) → mandantensenkrechte Audit-Abfragen nur über Joins, fehleranfällig.
- **Fix:** `school_id`-Spalte ergänzen + beim Logging mitführen (Migration).

---

## 3. P1 — MUSS vor echtem Schul-Produktivbetrieb

- **App-Tests fehlen komplett:** `paramedic-app` hat kein `test`-Script → 0 automatisierte UI/Unit-Tests.
- **iOS Critical-Alerts-Entitlement fehlt:** `com.apple.developer.usernotifications.critical-alerts` nicht in der nativen Prebuild-Konfiguration → Notfall-Alarme gehen bei stummgeschaltetem Gerät nicht durch.
- **Kein Docker-Deployment:** Self-Hosting läuft nur über Bash-Installer (`ops/install/install.sh`); kein Dockerfile/Compose.
- **Logging uneinheitlich + PII-Risiko:** 58 `console.*`-Aufrufe statt strukturiertem `log()`; `routes/webhooks.ts:75` loggt `data.email` (PII).
- **Passwort-Policy dünn:** nur `length >= 10`; kein HIBP/Breach-Check, keine Komplexität, keine Passwort-Historie (Reuse).
- **Kein DSGVO-Art.-20-Selbstexport:** nur schulweiter Incident-Export; kein Endpunkt `GET /account/export` für den einzelnen Nutzer.
- **Kein Schul-Tenant-Lösch-Workflow:** keine kaskadierende Löschung eines kompletten Tenants.
- **Kein Session-/Device-Management:** keine Geräteliste, kein gezieltes Remote-Logout einer einzelnen Session (nur „alle abmelden").
- **Supply-Chain nicht automatisiert:** kein `pnpm audit` in CI, kein Dependabot/Renovate; Caret-Ranges statt Pinning.
- **Kein Monitoring/Alerting:** keine SLOs, kein Prometheus-Metrics, kein Login-Failure-Alerting, kein externes Uptime-Tracking.

---

## 4. P2 — SOLLTE behoben werden

- **Audit-Logs DB-seitig unveränderbar machen:** `REVOKE UPDATE, DELETE` oder `BEFORE UPDATE OR DELETE`-Trigger für Append-Only-Tabellen.
- **Audit auf System-Settings ausweiten:** Änderungen an Schuleinstellungen/Export-Intervallen hinterlassen kein Log.
- **PDF-Dateiname sanitizen + Bundle-Integrität:** Client-Filename gegen Path-Traversal säubern; SHA-256 des Export-Bundles serverseitig speichern.
- **Offsite-Backup:** Backups liegen nur lokal (`/var/backups/schulsani`) — Remote-Sync ergänzen.
- **Health-Check vertiefen:** `/healthz` prüft nur DB, nicht SMTP/Push/Dateisystem.
- **Auto-Backup vor `install.sh --update`:** vor Drizzle-Migrationen automatischen Dump erzeugen.
- **Correlation-ID in Background-Jobs:** `requestId` fließt nicht in Scheduler/Webhooks/Push-Queue.

---

## 5. Fix-Reihenfolge (empfohlener nächster Schritt)

1. **P0-1** — Tenant-Isolations-Tests zum Laufen bringen (Live-DB), da sie alle anderen Isolation-Behauptungen absichern.
2. **P0-4** — Push-Token-Invalidierung bei Sperrung (klein, hoher Sicherheitsnutzen).
3. **P0-3** — Zod-Validierung als Middleware + `lib/api-zod`-Anbindung (groß, aber Grundlage für P0-5/6-Härtung).
4. **P0-5/6** — Cookie/CSRF-Härtung.
5. **P0-2** — RLS als zweite Verteidigungslinie (größte Architektur-Änderung, daher zuletzt, aber zwingend vor Cloud-Multi-Tenant-Release).
6. **P0-8** — `school_id` auf Audit-Log-Tabellen.
7. Danach P1-Block in Prioritätsreihenfolge (App-Tests, Critical-Alerts, Docker, Logging/PII, …).

---

---

## 6. Umsetzungsstand (dieser Durchlauf)

| P0 | Status | Änderung |
|---|---|---|
| P0-1 Integrationstests | ✅ Infrastruktur | `docker-compose.test.yml` + `ops/test-integration.sh` (Test-DB + Migrate + Testlauf); lokal mit `bash ops/test-integration.sh` ausführbar |
| P0-2 RLS | ✅ Fundament | `lib/db/rls/enable-rls.sql` + `README.md`: Helfer-Funktion + Policies (permissiv solange `app.current_school_id` unset) + `ENABLE ROW LEVEL SECURITY` ohne `FORCE`. Inert solange kein Kontext/keine app_role — kein Datenverlust. Enforcement (Phase B: app_role + `SET LOCAL` + Backfill) ist ein separater, getesteter Server-Rollout |
| P0-3 Zod | ✅ umgesetzt | `middlewares/validate.ts` + `export { z }` in api-zod; verdrahtet auf `POST /missions`, `POST /news`, `POST /news/:id/reject`, `POST /notifications/register-device`, `POST /notifications/unregister-device`, `POST /loa`. Übrige Routen validieren weiterhin manuell (bereits vorhandene Checks) |
| P0-4 Push-Tokens | ✅ fix | Admin-Delete (`routes/users.ts`) löscht jetzt `device_tokens` in der Transaktion |
| P0-5 Cookie secure | ✅ fix | `COOKIE_SECURE=true` als Override neben NODE_ENV (`auth.ts`) |
| P0-6 CSRF | ✅ fix | `middlewares/csrf.ts` (Origin/Referer-Check) + Registrierung in `app.ts` unter `/api` |
| P0-7 Rate-Limiter | ✅ fix | `TRUST_PROXY_HOPS` konfigurierbar; Redis-Store als Kommentar dokumentiert |
| P0-8 Audit-Log school_id | ✅ fix | Migration `0022_sturdy_spitfire.sql` (per drizzle-kit erzeugt, Journal + Snapshot konsistent) + `schoolId` an allen Aufrufstellen; Typecheck war dadurch **rot** (15 Fehler) und ist jetzt grün |

**Wichtiger Fund:** Der api-server-Typecheck war vorher *tatsächlich rot* (15 Fehler aus der halbfertigen `schoolId`-Umsetzung) — eine frühere „Typecheck ✅“ war ein falsches Signal, weil `| tail` den Exit-Code von `tsc` maskiert hat. Jetzt: voller Workspace-Typecheck grün, 217 Tests grün.

*Verbleibend: RLS-Enforcement (Phase B, siehe `lib/db/rls/README.md`) als separater Server-Rollout; die übrigen Daten-Routen validieren weiterhin manuell und können nach demselben `validate()`-Muster nachgezogen werden, wenn gewünscht.*
