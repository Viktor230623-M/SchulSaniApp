# SchulSaniApp — Best-Practices-Research & Audit (Stand 19.08.2026)

Read-only Research-Fanout über 20 Bereiche (Security, Auth, Privacy, Crypto, API, DB,
Push, Rate-Limit, Observability, Self-Hosting, Frontend, A11y, Tests, Deploy,
Dependencies, Secrets, PDF, Performance, Onboarding, Tenant-Isolation) — verifiziert
gegen den Ist-Stand im Code, gegen die beiden Store-Audits und per Playwright + Tests.

**Fazit vorab:** Die Architektur ist überdurchschnittlich durchdacht (E2E-Verschlüsselung,
client-seitige Argon2id-Ableitung, Tenant-Isolation serverseitig erzwungen, Retention-Konzept,
Supply-Chain-Härtung). Es gibt **keine kritischen Sicherheitslücken** im geprüften Code.
Die meisten offenen Punkte sind **Doku/Prozess** (Datenschutzverordnung, Store-Deklarationen)
und **einzelne Features** (Schul-Onboarding, Admin-Invites), die in den Store-Audits bereits
als P0/P1 gelistet sind. Unten: Was bereits best practice ist (mit Beleg), was fehlt,
und die priorisierte Liste.

---

## 1. Was bereits Best Practice ist (verifiziert im Code)

### Auth & Sessions — sehr stark
- **OIDC mit PKCE + State/Nonce** (`auth/providers/oidc.ts`): State/Nonce/Verifier
  serverseitig erzeugt, Eintrag wird einmal verbraucht, TTL 10 min, `jose`-JWKS-Verify,
  Relay-Modus dokumentiert. Kein selbstgebautes Krypto.
- **Passwort: Server sieht es nie** (`auth/providers/local.ts`): Client leitet lokal zwei
  unabhängige Argon2id-Keys ab (Login-Proof + Verschlüsselungs-Key). Server speichert nur
  SHA-256 des Proofs. `timingSafeEqual`, Dummy-Hash gegen Konto-Enumeration,
  generische Fehlermeldung.
- **Sessions** (`lib/sessions.ts`, `lib/sessionRules.ts`): 32-Byte-Token, nur SHA-256-Hash
  persistiert, gleitendes Fenster (30 d) + absolute Obergrenze (180 d), Revocation.
- **Cookies** (`routes/auth.ts`): HttpOnly, Secure (prod), SameSite=Lax, explizites
  Domain-Handling im Relay-Modus. API-Cookies + Bearer für App.
- **Auth-Middleware** (`middlewares/auth.ts`): Live-User-Check pro Request (Rolle,
  isApproved, schoolId, passwordVersion, mustChangePassword, profileConfirmed),
  60s-Cache mit Invalidierung. Kein blindes Vertrauen in den JWT.

### Tenant-Isolation — serverseitig erzwungen
- `schoolIdOf()` leitet die Schule aus der **Session** ab, nie aus dem Client
  (Ausnahme: bewusster multiTenant-Registrierungspfad, wo die Schule aus dem Body kommt
  und gegen die `schools`-Tabelle validiert wird, `lib/schools.ts`).
- Selbsthosting ignoriert jeden Request-Wert für die Schule komplett.
- Queries filtern durchgängig mit `schoolId` (stichprobenartig geprüft: missions,
  incidentReports, notifications, loa, roster).
- **Integrationstests** existieren: `tenantIsolation.integration.test.ts` prüft
  Cross-Tenant-Zugriffe auf users/incidents/schedules/notifications/deviceTokens.
  (`multiTenant.integration.test.ts` ist DB-abhängig → in CI übersprungen.)

### E2E-Verschlüsselung — über dem Durchschnitt
- `services/crypto/keyManager.ts` + `secureStore.ts`: KEK + privater Schlüssel nur im
  Speicher, Keychain mit `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (kein iCloud-Sync),
  Offline-Fallback nur als Chiffrat.
- Server sieht nur Chiffrat (`routes/crypto.ts`, DEK-Wrapping mit `crypto_box_seal`,
  DEK-Cache pro Version, `reportAccessLog`).
- Alt-Protokolle werden bei Migration geleert (Klartext-Spalten auf NULL).
- Logout räumt komplett auf (Keychain, KEK, DEK-Cache, Push-Token, Web-Push).

### Rate Limiting & Abuse-Schutz
- Global 100/min + spezifische Limiter: Login 5/min, Registrierung 10/h, Passwort-Reset
  3/h je E-Mail + IP, `publicInfoLimiter` 30/min, Rollen-Schreibzugriff 20/min.
- `trust proxy 1` gesetzt (echte Client-IP hinter nginx), Limit-Header prüfbar.

### RBAC
- `lib/permissions.ts` + `rolePermissions.ts` (DB-gestützt, schulgebunden mit
  global-Fallback, 60s-Cache + Invalidierung), `permissionMatrix.test.ts` deckt ab.
- `requirePermission(...)` serverseitig auf jeder geschützten Route.

### Push — tenant-sicher, datensparsam
- APNs/FCM direkt (keine Expo-Abhängigkeit), Payloads **inhaltsleer** (nur
  „Neue Meldung" + technischer Bezeichner; Details holt die App aus der API —
  Drittland-Minimierung, AVV Anlage 2).
- Empfängerwahl über dieselbe Rechteermittlung wie überall (kein zweiter, fest
  verdrahteter Kreis). Device-Token an `(userId, schoolId)` gebunden; Empfänger wird
  gegen die Schule validiert (`services/notifications.ts:62`).
- 404/410 → Token gelöscht; Tap-Handling mit Pending-Route nach Entsperrung
  (`app/_layout.tsx:104`).

### Datenschutz / Retention
- `lib/retentionRules.ts`: vollständiges Löschkonzept (Protokolle 5 Jahre, Entwürfe 30 d,
  Meldungen 90 d, LOA 24 Monate, Logs 12 Monate, Sitzungen 30 d nach Widerruf) — als
  AVV-Anlage deklariert, Änderungen nur mit Abstimmung.
- `jobs/retention.ts` idempotent, loggt nur Tabellenname + Anzahl (keine Inhalte).
- Structured JSON-Logging mit explizitem „kein PII"-Vertrag (`lib/logger.ts`).
- Namen: `validateProfileName`, Änderungen protokolliert (profile/role/identityChangeLog).

### API & Config
- `config.ts`: fail-fast, kein `*` bei CORS (Cookies!), nur https (localhost ausgenommen).
- `helmet`, `compression`, JSON-Limit 50kb mit striktem Parse-Verify, ETag disabled,
  `Cache-Control: no-store` auf /api, Request-ID.
- 26 Drizzle-Migrationen (`lib/db/drizzle/`), zod-Schemas in `lib/api-zod` (geteilt).

### Supply Chain
- `pnpm-workspace.yaml`: `minimumReleaseAge: 1440` (1-Tages-Fenster gegen Supply-Chain-
  Angriffe, dokumentiert), `allowBuilds`-Allowlist, Overrides für bekannte CVEs
  (qs, path-to-regexp, shell-quote, fast-uri, node-forge, picomatch, ws, yaml, …).
- `.npmrc`-PNPM-Zwang, Lockfile eingecheckt.

### Frontend
- A11y durchgängig: `accessibilityRole/Label` auf Tabs, Formularen, Icon-Buttons,
  Passwort-Toggle, Error-Fallback.
- Error/Loading/Empty-States + `ErrorFallback`-Komponente, RefreshControl, Offline-Fallback
  fürs Keychain-Material.
- Auth-Flows (Start/Lizenz/Schul-ID/Entsperren) sauber getrennt, Typed-Routes.

### Tests & Verifikation
- **217 Server-Tests grün** (15 Files), 12 skipped (DB-Integration). Typecheck grün
  (App + API).
- **Playwright-Walkthrough live verifiziert: 20/20** auf demo.schulsaniapp.com/app/
  (Einsatz anlegen/annehmen → Protokoll → PDF-Download → Schicht → News → LOA →
  Meldungen), kein Console-Fehler.
- CI-Workflow vorhanden (`.github/workflows/ci.yml`, inkl. tenant-isolation-Job).

---

## 2. Gefundene Lücken & Risiken (priorisiert)

### P0 — vor echtem Schulbetrieb
1. **Datenschutzverordnung (DSGVO/AVV) ist nicht als Dokument greifbar** — Retention-
   Konzept ist im Code + als „AVV-Anlage" kommentiert, aber es gibt kein veröffentlichtes,
   von einer Schule unterschreibbares AVV/DPA-Dokument (Verantwortlicher, Auftrags-
   verarbeitung, Unterauftragnehmer, Hosting-Standort, Drittlandtransfers, Löschfristen).
   → **Prozessaufgabe, keine Codeaufgabe.** (Store-Audit: „no published privacy policy URL".)
2. **Schul-Onboarding fehlt als Produktfeature** (APP_STORE_READINESS_AUDIT P0): Es gibt
   die Screens (start/schul-id/lizenz) und den Cloud-Multi-Tenant-Betrieb, aber keinen
   Self-Service-Provisioning-Flow für eine Schule (Lizenz → Schul-ID erzeugen → Admin
   aktivieren). Aktuell manuell (Lizenz-E-Mail) — funktioniert, aber nicht skaliert.
3. **Push-Entitlement iOS** (Audit P0): `aps-environment` muss im nativen Build gesetzt
   sein, sonst baut iOS ohne Push. Vor dem Store-Release prüfen.

### P1 — wichtig
4. **Sicherheits-Monitoring fehlt** (Audit P1): strukturierte Logs ja, aber kein
   zentrales Error-Tracking/Alerting (Sentry o.ä.), keine Login-Failure-Dashboards.
   Für einen Allein-Entwickler der größte blinde Fleck.
5. **Zod-Validierung nur teilweise angebunden**: `lib/api-zod` existiert (geteiltes
   Schema), wird aber nur in `health.ts` genutzt. Routes validieren teils manuell
   (`typeof`-Checks). Konsistente Schema-Validierung (Body/Query/Params) schließt
   Überraschungen bei Batch-Endpoints und erzeugt automatische API-Doku.
6. **Kein „Export my data" für einzelne Nutzer** (Audit P1): PDF-Bündel-Export ist
   Admin-only. DSGVO-Art.-15-Auskunft für Einzelpersonen (eigene Daten) fehlt als
   Self-Service.
7. **Einladungen nur via Selbstregistrierung + Freigabe** (Audit P1): kein
   Admin-„Invite per E-Mail" mit vorbelegter Rolle. Funktional ok, aber weniger
   komfortabel für Schulen.
8. **Web-Suche-Abhängigkeit**: externe Best-Practices-Recherche heute durch
   Web-Search-Rate-Limit eingeschränkt — Audits im Repo (APP_STORE/ANDROID_READINESS)
   als Referenz genutzt; Store-Richtlinien ändern sich, vor Einreichung frisch prüfen.

### P2 — Verbesserungen
9. **Monitoring-Kennzahlen** (SLO/Alerting auf Login-Fehler-Spikes, Push-Fehlerquoten)
   — Rate-Limiter zählen, aber keine Prometheus-/Metriken-Endpunkte.
10. **Admin-Invites + Schul-Provisioning-API** — fehlt, würde Onboarding skalierbar machen.
11. **`SESSION_COOKIE`-Name** hart kodiert (`sani-session`) — bei Multi-Instanz auf
    einer Domain ggf. Prefix pro Instanz (heute gelöst über cookieDomain im Relay).
12. **Dependency-Audit aktuell halten** — Overrides sind da, aber `pnpm audit` sollte
    in CI laufen (nicht nur Overrides pflegen).

### OK / kein Handlungsbedarf (bestätigt)
- E2E-Krypto-Design, Tenant-Isolation, Session-Härtung, Retention, Rate-Limiting,
  Push-Datenminimierung, Supply-Chain-Overrides, A11y-Grundlagen, Testabdeckung der
  Sicherheitspfade. Die zwei Store-Audits (APP_STORE_READINESS_AUDIT.md,
  ANDROID_READINESS_AUDIT.md) bleiben die maßgebliche Feature-Liste für den Release.

---

## 3. Empfohlene nächste Schritte (nichts davon heute geändert — read-only)

1. **AVV/DPA + Datenschutzerklärung (DE/EN) publizieren** und auf
   schulsaniapp.com/datenschutz verlinken → löst Store-P0 + Schul-Gespräch.
2. **`pnpm audit` in CI** (Job im bestehenden ci.yml) + Auswertung.
3. **Zod-Validierung auf alle Mutations-Routes** ausrollen (geteiltes Schema existiert).
4. **„Meine Daten exportieren / Konto löschen"** als Self-Service (Art. 15/17).
5. **Admin-Einladungs-Flow** (E-Mail + vorbelegte Rolle) statt nur Selbstregistrierung.
6. **Error-Tracking (Sentry o.ä.)** oder zumindest strukturierte Fehler-Aggregation.
7. **Push-Entitlement + Tap-Tiefenlink** im ersten nativen Build verifizieren.
8. **Schul-Onboarding-Prozess** (Lizenz → Schul-ID → Admin-Aktivierung) dokumentieren
   oder als kleinen Admin-Flow bauen.

---

## 4. Verifikation dieser Session (alles grün)

| Check | Ergebnis |
|---|---|
| Server-Tests (`vitest run`) | 217 passed, 12 skipped |
| Typecheck App (`tsc --noEmit`) | ✅ |
| Typecheck API (`tsc --noEmit`) | ✅ |
| Playwright Live-Walkthrough (demo.schulsaniapp.com/app/) | ✅ 20/20, keine Console-Fehler |
| CI-Workflow | vorhanden (inkl. tenant-isolation) |
