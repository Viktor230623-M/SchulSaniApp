# APP_STORE_READINESS_AUDIT.md

**Date:** 2026-08-18 · **Scope:** code audit only — no changes made, nothing submitted
**Audited against:** Apple App Store Review Guidelines (as of the audit date), GDPR posture, current codebase state
**Repo root:** `SchulSaniApp/` (pnpm monorepo)

> **READ THIS FIRST — THE ONE DECISION THAT BLOCKS EVERYTHING:**
> The current product is built as **one deployment per school** (`SCHOOL_ID` is a single backend env var; the app binary has the school's domain baked in via `EXPO_PUBLIC_DOMAIN`; each school can even get its own bundle ID). The store goal is **one app in the App Store** that a school discovers, downloads, identifies its school, and logs in. These two models are incompatible as-is. Everything in this audit flows from that gap. Until the "one binary / many schools" architecture decision is made, most App Store work cannot start.
> **Do not modify code before this decision is made.**

---

## 1. Executive Summary

SchulSaniApp is technically far ahead of the typical pre-store project: E2E-encrypted health data, server-side tenant isolation enforced in ~63 call sites, a sophisticated auth stack (session cookies + short-lived JWTs, Argon2id-derived proofs so the server never sees a password, OIDC, native Apple sign-in), a real push pipeline (VAPID web, APNs iOS, FCM Android) with intentionally empty payloads, GDPR-shaped retention/export/audit-log machinery, and a one-command self-hosting installer.

**But it is not ready for the App Store, and the gap is architectural, not cosmetic.**

The blocking findings, in order:

| # | Blocker | Why it blocks the store launch |
|---|---|---|
| B1 | **Single-binary vs. per-school deployment mismatch** | One App Store app must serve *all* schools. Today the binary is rebuilt per school (domain baked in, optional per-school bundle ID). No school selection, no school registry, no multi-tenant cloud backend. |
| B2 | **No Apple Developer account / signing / build pipeline** | No EAS config, no CI, no team/signing setup, `ios/` is a gitignored local prebuild. No reproducible store build exists today. |
| B3 | **iOS push entitlement missing** | `ios/` prebuild ships an **empty** `SchulSani.entitlements` — no `aps-environment`. Push will not register/deliver in a release build. |
| B4 | **No account deletion flow in the app** | Guideline 5.1.1(v): apps that create accounts must let users delete them in-app. Admin-only deletion exists; self-service does not. |
| B5 | **No published privacy policy / App Privacy declaration / legal surface** | `docs/datenschutz/` has strong German material (AVV Modell A/B, TOM, Anlage 1–3) but nothing is published at a URL, wired into the app, or declared in App Store Connect. |
| B6 | **No store-facing assets at all** | Name/subtitle/keywords, screenshots (EN+DE), icon polish, age rating, review notes, reviewer demo account, pricing/licensing model — none exist. |

**Overall readiness score: ~15 / 100** for submission today. The *code* is closer to 60–70 on backend maturity; the *store wrapper* (build, signing, legal, metadata, review flow) is ~0.

---

## 2. Current Architecture Overview

```
SchulSaniApp/  (pnpm monorepo)
├── artifacts/paramedic-app     Expo SDK 54 · React Native 0.81.5 · expo-router 6
│   ├── app/                    expo-router routes (login, (tabs)/, admin/, report/)
│   ├── services/               ApiService (typed client), PushNotificationService,
│   │                           WebPushService, crypto/keyManager, demo/mockFetch
│   ├── store/useAppStore.ts    zustand store (persisted: theme, language only)
│   ├── constants/i18n.ts       DE + EN translations
│   ├── models/                 shared types (User, Mission, IncidentReport, …)
│   └── app.json / app.config.ts  version from app.json; name, bundle ID, domain,
│                                 theme color from env (EXPO_PUBLIC_*)
├── artifacts/api-server        Express 5 + Drizzle/PostgreSQL
│   ├── src/routes/             auth, users, news, loa, missions, status,
│   │                           notifications, activity, incident-reports, roles,
│   │                           roster, exports, crypto, webhooks, health
│   ├── src/middlewares/auth.ts JWT verify + live-user cache + schoolIdOf()
│   ├── src/auth/               provider registry (local, OIDC, Apple native)
│   ├── src/lib/                sessions, rolePermissions, retentionRules,
│   │                           webPush, push/fcm, push/apns, userCrypto
│   ├── src/jobs/               scheduler, retention, exports
│   └── src/services/           notifications (push fan-out), mailer
├── lib/db/                     Drizzle schema + migrations (Postgres 17)
├── lib/api-spec|api-zod|api-client-react  OpenAPI-derived client stack
├── landing-site/               static marketing site (index.html, screens/, ratgeber/)
├── ops/install/                self-hosting installer + browser assistant
├── ops/relay/                  central OIDC callback relay
└── ops/backup/                 systemd backup timer
```

**Deployment model today:** one backend instance per school (env `SCHOOL_ID`, `ALLOWED_ORIGINS`, `JWT_SECRET`, SMTP, VAPID, FCM/APNs creds). nginx + PM2 on one server; subdomains per instance (`demo.schulsaniapp.com`, `sani.avo-network.com`, …). Installer (`ops/install/install.sh`) provisions a full Debian/Ubuntu box per school: Postgres, certbot TLS, PM2, web export.

**Mobile today:** the app runs as (a) a web/PWA export, (b) Expo Go, (c) a locally prebuilt `ios/` project (gitignored, regenerated via `expo prebuild`). **No Android native project exists at all** (see `ANDROID_READINESS_AUDIT.md`).

---

## 3. Demo vs. Production Architecture

**Two artifacts exist, intentionally:**

1. **`landing-site/`** — static marketing site (demo.schulsaniapp.com): index, screenshots, ratgeber articles, llms.txt/sitemap/robots for SEO. Purely public.
2. **The app with `EXPO_PUBLIC_DEMO=1`** — the *same* app binary built in demo mode. `services/demo/mockFetch.ts` replaces `global.fetch` with an in-memory mock of the API (fixed German dataset in `services/demo/daten.ts`), so a visitor sees the full product flow (login screen, missions, roster, reports) with zero backend. `_layout.tsx` strips the mock at bundle time when the env var is absent.

**Assessment:**
- The demo approach is clean and reusable: same UI, same components, same routes — exactly the "one product" feel the goal asks for. **Keep it.**
- Risks today: (a) demo uses *German-only* fixed data; (b) demo build is a separate deploy target with no parity check against the real API; (c) demo data lives in `services/demo/daten.ts` next to production code — fine, but it must never be reachable in a production build (guarded by `process.env.EXPO_PUBLIC_DEMO === "1"` at bundle time — confirmed, the block is stripped by Metro inlining; keep it that way and add a test that asserts the demo block is absent from production bundles).
- The App Store **reviewer demo account** (see §18) can be a *real* tenant on a demo instance — the mock-Fetch demo is not a substitute for a reviewer account with real credentials.

---

## 4. Recommended Combined Architecture

Goal: **one product, one store binary, many schools.**

The cleanest path given the codebase's strengths (per-instance isolation is already airtight) is **"one app binary → one cloud entry domain → per-school routing"**, with the option to keep self-hosting for schools that want it:

```
[App Store binary]  (single bundle ID, single build)
   │  HTTPS + cookie session
   ▼
https://app.schulsaniapp.com   ← ONE cloud entry (new, thin)
   │  1. GET /api/schools/… (public registry: search/select school)
   │  2. POST /api/auth/login  (with schoolSlug in the request)
   ▼
[Multi-tenant cloud backend]   (evolved from today's api-server)
   ├── schools table (new): id/slug, name, joinCode, instance routing
   ├── tenants in ONE Postgres, or N single-tenant DBs behind a router
   └── push: one central FCM + APNs account (already the design)
```

Two concrete implementation options (decision needed):

**Option A — Central multi-tenant DB (bigger refactor).** Add a real `schools` table; make `SCHOOL_ID` a runtime value resolved from the login request (`schoolSlug`), never trusted from the client beyond the slug lookup; keep `schoolIdOf(req)` as the enforcement point (all 63 call sites already filter by schoolId — they keep working). Change: auth routes currently read `requiredSchoolId()` from env — these become per-request lookups. High value: one cloud, one schema, easy provisioning, licensing, analytics. Cost: the only deep backend change; needs careful migration + the tenant-isolation test suite (§13).

**Option B — Instance router (smaller refactor).** Keep N single-tenant instances (they're already perfect isolation). The cloud entry is a thin router that maps `schoolSlug → instance base URL` (public registry in Postgres + reverse proxy or backend redirect), and the app sends the bearer token to the routed instance. The app needs a runtime "school picker" and a `SCHOOL_ID`-less login handshake. Cost: proxy complexity, per-instance ops, no shared schema; push/APNs still central.

**Either way the app must change once:** a runtime "which school" step (registry lookup + join-code if set) instead of a baked-in `EXPO_PUBLIC_DOMAIN`. Keep `EXPO_PUBLIC_DOMAIN` as the *cloud entry* for self-hosted instances (see §12) and make it overridable at runtime only via the school-picker flow, not via arbitrary user-entered URLs (security: see ANDROID audit's server-URL note — same applies to iOS).

**What to reuse from the demo** (explicitly): route structure, `(tabs)/` UI, report screens, role/permission-driven visibility, i18n framework. **What to drop:** per-school bundle IDs and per-school app-name builds for the store binary (one brand: "SchulSaniApp"); per-instance branding moves to the *instance* level (school name shown after login), which the app already supports via API data.

---

## 5. Multi-Tenant Assessment

### Current model: single-tenant-per-instance (strong isolation, by construction)
- `SCHOOL_ID` is a **server env var**. Login (`POST /auth/login`, `/auth/params`) resolves users only within `schoolId === requiredSchoolId()`. There is **no client-controlled school/tenant selection anywhere**.
- Every data route derives the tenant from the authenticated session: `schoolIdOf(req)` (63 call sites across exports, crypto, users, incidentReports, missions, status, roster, notifications, activity, loa, news). Queries are additionally filtered by `schoolId` in SQL (`eq(table.schoolId, schoolId)`).
- Cross-tenant push is structurally prevented: `createNotification` re-validates the recipient is in the school; device tokens are registered with `(userId, schoolId)` taken from the session, not the client; `sendPushNotification` selects tokens by `userId AND schoolId`.
- IDOR checks exist where object IDs are user-supplied: `GET /users/:id` requires `users.read_all` unless own ID; `DELETE/PATCH /users/:id` gate on role hierarchy + school scoping; notifications are scoped to the session user (or `notifications.view_all`).
- Privilege escalation guards: `allowedTargetRoles()` + `canModifyTarget()` + `assertAdminReachable()` (no lockout), self-role-change blocked, own-approval blocked, last-admin protection.
- Audit logging for exactly the actions that change data access: `role_change_log`, `profile_change_log`, `identity_change_log`, `report_access_log`, `crypto_grant_log`.

### Gaps / risks
1. **No `schools` table / registry** — a tenant is just a text label scattered across tables. No provisioning metadata, no license/status, no way to enumerate schools (needed for Option A and for "school identifies its school").
2. **Isolation is deployment-level, not DB-level.** If the cloud moves to one shared DB (Option A), every query must keep the school filter — the pattern exists but there is **no automated proof** (no multi-tenant test suite; §13).
3. `removeDeviceToken(token, schoolId)` deletes by token+school, without verifying the token belongs to the caller. A malicious in-school user could delete another user's device token if they know/observe it. **Low severity** (needs an authed in-school attacker with the victim's token), fix by scoping to `userId`.
4. `usersEmailLowerUnique` is **global**, not per-school: two schools can never share an email address. Under Option A this becomes a real product bug (two schools, same teacher email). Must become `(schoolId, lower(email))`.
5. Files: there is no file upload/store in the schema (no attachments) — currently a non-issue; if added, reuse the school-scoped pattern and E2E.
6. `schoolId` is nullable on `users` (legacy). Auth rejects users without school (403 `Schulkontext fehlt`) — good, but make it NOT NULL going forward.

**Verdict:** within one instance, tenant isolation is *very good* — arguably the strongest part of the system. Cross-school isolation in a shared cloud does not exist because the cloud does not exist yet.

---

## 6. Authentication Assessment

**What's already strong (verified in code):**
- **Passwords never reach the server.** Client derives two independent Argon2id keys (login-proof + encryption KEK); server stores only `passwordHash` (SHA-256 of proof) + salt. `/auth/params` serves the derivation salt; unknown usernames get random salts (no user enumeration).
- **Two-layer session model:** httpOnly session cookie (30 d, sliding + absolute cap, `Secure`/`SameSite=Lax`, hashed at rest in `sessions`) + short-lived bearer JWT (2 h). `GET /auth/session` exchanges cookie → fresh JWT, reloading live user state each time (revoked approval takes effect immediately).
- **Revocation is real:** `passwordVersion` in JWT vs. DB (bump on password change / identity unlink kills all tokens); sessions revocable; logout revokes server-side; retention job purges dead sessions.
- **Brute-force protection:** per-route rate limiters (login 5/min, register 10/h per IP, reset 3/h per email, etc.).
- **Identity breadth:** local email accounts (email verification + resend), OIDC providers with state/nonce/JWKS validation, native Apple sign-in with server-issued nonce, identity linking/unlinking with freshness gates, school join code as entry ticket.
- **Recovery:** password reset via hashed one-time tokens (1 h), email verification (24 h), one-time-password + forced change on admin-issued accounts.
- **Storage:** bearer JWT held in memory only (not persisted); crypto key material in `expo-secure-store`, wiped on logout. `zustand` persists only theme/language/avatars. Good.

**Gaps:**
1. **No OAuth2/OIDC for the *school as customer*** — only configured per-school providers. Fine, but document the supported IdPs for App Review (Apple sign-in presence is required if the app offers third-party login — guideline 4.8).
2. **No account lockout** (rate-limit only). Acceptable for now; consider lockout after N failures per account.
3. **No refresh-token revocation API surface** beyond sessions — fine as-is (cookie rotation covers it).
4. **Self-hosted instances each mint their own JWTs with their own `JWT_SECRET`** — correct, but means a token from instance A is meaningless at instance B; keep it that way and never share secrets across instances (under Option A, use one secret or per-tenant keys).
5. `trust proxy = 1` — correct behind nginx, but must be documented/verified in every deployment topology or rate limiting collapses to one IP bucket.

---

## 7. Security Assessment

**Already in place:** helmet, CORS allow-list (no `*`, HTTPS-enforced), JSON body size caps + strict parse, `no-store` cache headers on `/api`, ETag disabled, rate limiting, secrets required-at-startup (config fails closed), crypto-material handling that keeps the server unable to decrypt (DEK/KEK, ciphertext-only incident content, empty push payloads).

**Top security risks to close before store:**
1. **iOS push entitlement missing** → release builds silently without push (empty `aps-environment`). P0.
2. **No Android app at all** (see Android audit). P0 for Play; not strictly an iOS blocker.
3. **No security monitoring:** no structured logs, no error tracking, no Sentry/crash reporting, no audit of login-failure spikes beyond rate limiter counters. You will not know about a breach attempt. P1.
4. **Dependency surface is small but unpinned in places** (`catalog:` versions, `^` ranges) — run `pnpm audit` + lockfile pinning before launch. P1.
5. **`.env` handling** is disciplined (gitignored, `chmod 600` by installer, secrets never logged) — keep, and make sure the FCM/APNs credentials are **never committed** once added (see §11).
6. **In-memory handoff maps** (`webHandoffs`, `nativeHandoffs`, `joinCodeHandoffs`, `appleNativeNonces`) — fine on one instance; under Option A these become cross-instance or shared-state concerns (or move to Redis/DB).
7. **`/auth/providers` is public** (by design, needed pre-login) — it reveals which IdPs an instance supports; acceptable, documented.

---

## 8. Privacy Assessment

**Data processed (inventory):** account data (name, email, phone, username, role), school/settings, missions, duty status, shift/roster data, LOA, **incident reports with full health content** (patient name, class, age, emergency contact, vitals, injury/treatment, outcome) — E2E-encrypted at rest and in transit; notifications (metadata only, empty push payloads); audit logs; device tokens; session hashes.

**Strong existing work:**
- `docs/datenschutz/` — AVV Modell A/B, Anlage 1 (TOM), Anlage 2 (Unterauftragsverarbeiter), Anlage 3 (Datenkategorien), with explicit reasoning about the model: **school = controller (Art. 28 AVV), provider = processor**, EU/Frankfurt hosting, "kein Personenbezug über APNs/FCM" (third-country minimization).
- Retention job (delete/anonymize per schedule), school export bundles (ciphertext-only until client-side decryption, deletion after confirmed download), audit logs with 12-month retention.
- Data minimization by design: no IP/UA stored for sessions, empty push payloads, minimal columns.

**Gaps (P0–P1 for store):**
1. **No published privacy policy URL** — App Store Connect requires one for the app page; the German docs are excellent but internal. Publish (e.g., `https://schulsaniapp.com/datenschutz`) in DE + EN. P0.
2. **App Privacy ("Nutrition Label") declaration not prepared** — must enumerate collected data types (contact info, identifiers, health — health is *encrypted* which is the strongest possible stance, declare as "health & fitness" with encryption claim). P0.
3. **In-app account deletion missing** (Guideline 5.1.1(v)). P0.
4. **Export compliance / encryption declaration** — app uses encryption (libsodium, TLS); must answer Apple's export compliance questions (likely "exempt" under mass-market/standard encryption, but must be answered deliberately, not assumed). P1 — flag for human review.
5. **Minors/students:** target users are students; Apple requires care around account creation for minors (parental consent story, or school-mediated accounts). The current model (school admin approves accounts) is a strong answer — document it for reviewers. P1 — legal review.
6. **Data deletion for a departed school/user:** self-service per-user export/deletion is absent (admin-only). Add a user-facing "export my data" and "delete my account" flow. P1.
7. **Analytics/crash reporting:** none today — good for privacy, but you'll likely want opt-in crash reporting; if added, it must be declared in App Privacy and GDPR docs. P2.

---

## 9. Product Feature Gaps (classified)

| Area | Status | Priority |
|---|---|---|
| School onboarding (school= customer) | **Missing entirely** — no school provisioning, no school ID creation flow, no admin activation | P0 |
| School selection in app | Missing (baked-in instance) | P0 |
| User invitations | Only self-registration + approval; no admin "invite by email" with pre-filled role | P1 |
| Login / logout / password reset / recovery | Complete (see §6) | ✅ |
| Roles/permissions/audit | Complete + audited (role_change_log etc.) | ✅ |
| Emergency alerts | Present (`high_priority_alert`, priority high, alarm sound, content-available) | ✅ (verify UX on tap → see below) |
| Push notification **tap handling** | **Missing** — `addNotificationResponseListener` exported but never used; tapping a notification does not open the related mission/report | P1 |
| Push **token refresh** listener | **Missing** — `addPushTokenListener` not wired; iOS rotates APNs tokens; stale token = dead push until re-login | P1 |
| Push **logout invalidation** | **Missing** — device token is not unregistered on logout; user keeps receiving pushes while logged out (they open app → logged out). Also token stays bound to a deleted user until a push fails | P1 |
| Account deletion (self-service) | Missing | P0 (store) |
| Data export (user-level) | Missing (school-level export exists) | P1 |
| Search / filtering | Basic; no full-text search across missions/reports | P2 |
| Loading/error/empty states | Present throughout (verified in screens); central error boundary | ✅ |
| Accessibility | Reasonable baseline; not audited against WCAG | P2 |
| DE + EN localization | Present (`constants/i18n.ts`, `de`/`en`) | ✅ |
| Offline behavior | Web push/service worker exists; **native offline support not implemented** (all data server-side, E2E keys need network) | P2 |
| In-app notifications list | Present | ✅ |

---

## 10. Mobile / App Store Assessment

**What exists:**
- Expo SDK 54, RN 0.81.5, New Architecture on. `app.json`: version 2.1.0, buildNumber 1, versionCode 1, portrait, scheme `paramedic-app`, `supportsTablet: false`, iOS 15.1 deployment target (from local prebuild), `UIBackgroundModes: remote-notification`.
- `ios/` local prebuild with AppDelegate (ExpoAppDelegate, links universal-link handler), `PrivacyInfo.xcprivacy` (required-reason API declarations present — good).
- Native Apple sign-in via `expo-apple-authentication` (with server nonce flow) — ready.
- Secure storage: `expo-secure-store` for key material.

**What is missing / broken (all P0–P1 for submission):**

1. **No Apple Developer account integration:** no Team ID, no signing certs, no provisioning, no TestFlight, no App Store Connect linkage anywhere in the repo. Nothing can be uploaded.
2. **No EAS / build pipeline:** no `eas.json`, no CI (`.github/workflows` empty), `ios/` is gitignored and regenerated by `expo prebuild` locally. No reproducible release build exists. Add EAS Build + EAS Submit (or Xcode Cloud), with the prebuild step pinned in the pipeline.
3. **Push entitlement absent** (empty `SchulSani.entitlements`; no `aps-environment`). Add `ios.entitlements` config (or enable Push capability in the managed config) so prebuild emits it. Then APNs works against the existing server `sendApns()` (which is already implemented, HTTP/2 + .p8).
4. **Bundle ID:** `com.schulsani.app` is the sensible single-binary ID — but it currently comes from env `APP_BUNDLE_ID` per instance. For the store, freeze one ID and remove per-school bundle builds. (If the cloud stays multi-binary, each school needs its own ASC entry — the wrong model; see §4.)
5. **Version/build drift:** `app.json` (2.1.0 / 1) vs. stale prebuild artifacts (MARKETING_VERSION 1.0, CFBundleShortVersionString 2.0.0). After switching to EAS/prebuild-in-CI this disappears; before that, the release script (`scripts/release.mjs`) updates app.json only — document that `ios/` is regenerated.
6. **Deep links:** custom scheme `paramedic-app://` only (plus `exp://` dev). No **Universal Links** (no `associatedDomains` entitlement; AppDelegate handler exists but is dead without it). Add Universal Links for password-reset links and notification deep links (see §9 push tap).
7. **Icon/splash:** single icon asset; no App Store icon set (1024px, no alpha), no marketing/App Icon variants; splash exists. P1 asset work.
8. **Store metadata:** name/subtitle/keywords/description/category/screenshots (DE+EN)/support URL/marketing URL/age rating/review notes — all absent. Screenshots can reuse the existing app + demo data (better: real screenshots via E2E harness).
9. **Reviewer experience:** need a clearly-labeled demo tenant + reviewer account credentials in Review Notes, plus a reset path. The mock demo build is *not* sufficient for review (guideline: review must not require real accounts, but a reviewer account must exercise real flows).
10. **External payment / licensing:** no IAP/paywall today. If the SaaS license is sold outside the store (school signs up on a website), that is allowed for B2B/schools *if* the app doesn't sell digital goods/features via IAP; but "account required to use the app + paid license" must be described in Review Notes. **Legal review needed** (subscription vs. free-with-license; EU consumer law; school procurement).
11. **Age rating:** self-assessment needed (likely 4+ or 12+; health content is E2E-encrypted and school-mediated — document for reviewer).
12. **Minor/student users** (§8.5): document school-mediated account creation; consider requiring school approval before first use (already the model: `isApproved` gate) — good story for reviewers.
13. **Offline/crash/lifecycle:** no crash reporting, no offline cache for native. Acceptable for v1 with a documented error boundary + no-store network behavior; add Sentry (opt-in, declared) at P1.

---

## 11. Cloud-Hosting Assessment

- **Current cloud = shared server, per-school instances.** nginx sites per domain, PM2 per backend, one Postgres per instance (or shared Postgres with separate DBs). Backups: `ops/backup` systemd timer.
- **Missing for a real cloud product:** provisioning API/control plane (school signup → tenant → subdomain → first owner account), per-tenant isolation guarantees across instances on one host (fine today), central monitoring/alerting, central push credentials management (FCM service account + APNs .p8 + VAPID are per-instance env today; centralize under Option A), central log aggregation, license/billing (none exists — no payment code anywhere; school = customer model needs a sales/licensing flow, can stay offline for now), and a **recovery story** (what happens when a school's E2E keys are lost — DEK wraps exist per user; document key-recovery/rotation flows, currently `crypto/recover` exists in API).
- **Encryption/export compliance** must be declared regardless of hosting model (§8.4).

---

## 12. Self-Hosting Assessment

**Strong — this is the most complete part of the product:**
- `ops/install/install.sh`: fresh Debian/Ubuntu → running TLS instance; idempotent, dry-run, `--update`; Postgres 17, Node 24, certbot, PM2; secrets with `chmod 600`; browser assistant (`ops/install/assistant/`) writes `.env` files + first owner account; self-check at the end.
- Migrations: Drizzle + `drift` check before deploy (documented in CLAUDE.md).
- Versioning: `scripts/release.mjs` (semver from commits, bumps app.json + buildNumber/versionCode, CHANGELOG).
- **Gaps:** no Docker/docker-compose path (bare-metal only — acceptable, document), no automatic updates (manual `git pull` + build), no health-check beyond `/healthz` (present), no monitoring for self-hosted instances, no documented disaster-recovery runbook (backup timer exists — restore procedure undocumented), FCM/APNs env vars are **not in `.env.example`** (they exist only in code comments — must be added with the installer/assistant for self-hosted push to be reproducible).

---

## 13. Testing Gaps

**What exists** (`artifacts/api-server/src`): 14 vitest files — local provider, OIDC, registry, permission matrix, rolePermissions, retentionRules, sessionRules, schoolIdOf, HTTP tests for login, approval, roster, exports, profile confirmation, password-reset guard. Solid unit + route-level coverage of the trickiest logic.

**Missing (priority order):**
1. **Tenant-isolation tests (P0 under Option A):** School A must not reach School B's users/incidents/schedules/notifications/files/settings/audit logs. Today tests run single-school; add a two-tenant HTTP suite that asserts 403/404/empty on every cross-tenant probe.
2. **Push tests (P1):** token registration scoping (cannot register for another user/school), unregister ownership, gone-token cleanup, per-school fan-out isolation.
3. **E2E (P1):** Playwright for web flows (login → mission → report → export); Detox/Maestro for native once it builds. Screenshot harness for store assets (§10.8) can reuse this.
4. **Mobile tests (P1):** none today.
5. **Self-hosting tests (P2):** installer on a real VM (README admits it's untested on a real box).
6. **CI (P1):** nothing runs tests automatically; vitest currently only runs on the server (linux-only esbuild per workspace config) — fix the platform pinning so tests run on a Mac/CI runner too, or move test execution fully to CI.
7. **Crypto tests (P1):** key management, DEK wrap/unwrap, report decrypt strict-mode are critical paths with no dedicated tests.

---

## 14. Top 10 Blockers (for App Store submission)

| # | Blocker | Priority | Effort |
|---|---|---|---|
| 1 | **Architecture decision: one binary / many schools** (Option A vs B) | P0 | Decision first; A ≈ weeks, B ≈ days–weeks |
| 2 | Apple Developer account + Team + signing + TestFlight | P0 | 1–2 d setup (account already needed) |
| 3 | EAS Build/Submit or Xcode Cloud + CI with pinned prebuild | P0 | 2–3 d |
| 4 | iOS push entitlement (`aps-environment`) + APNs key wiring | P0 | 0.5 d code + account config |
| 5 | Self-service account deletion in-app | P0 | 1–2 d |
| 6 | Published privacy policy (DE+EN) + App Privacy declaration + export compliance | P0 | 1–2 d (legal review) |
| 7 | Reviewer demo tenant + Review Notes + age rating | P0 | 1 d |
| 8 | Store metadata + screenshots (DE+EN) + icon set | P0 | 1–2 d |
| 9 | Notification tap handling + token refresh + logout unregistration | P1 | 2–3 d |
| 10 | Legal: minors, licensing model, controller/processor docs finalized & published | P0/P1 | legal review |

## 15. Top 10 Security Risks

| # | Risk | Severity |
|---|---|---|
| 1 | iOS push silently dead in release (missing entitlement) — emergency alerts unreliable | High |
| 2 | No monitoring/logging/crash reporting — breaches undetected | High |
| 3 | Global unique email index blocks Option A (two schools, same email) | High (A) / n/a (B) |
| 4 | No tenant-isolation test suite — regression risk when moving to shared cloud | High (A) |
| 5 | Device-token deletion not ownership-scoped (`removeDeviceToken`) | Low |
| 6 | In-memory handoff maps — need shared state under Option A | Medium (A) |
| 7 | Unpinned deps (`catalog:`/`^`) — run audit before launch | Medium |
| 8 | No account lockout (rate limit only) | Medium |
| 9 | No audit of failed-login spikes (tied to #2) | Medium |
| 10 | JWT secret rotation runbook absent (single shared secret per instance) | Medium |

## 16. Top 10 Missing Product Features

1. School registry + school selection (P0)
2. School provisioning/onboarding flow (P0)
3. Self-service account deletion + per-user data export (P0/P1)
4. Notification tap → deep link to mission/report (P1)
5. APNs token-refresh listener + logout token cleanup (P1)
6. Admin user invitations (P1)
7. Universal Links for reset links + notifications (P1)
8. Search across missions/reports (P2)
9. Native offline mode (P2)
10. Opt-in crash reporting (P2)

## 17. Recommended School Onboarding Flow

```
School signs up (website / sales call)
  → provisions tenant (Option A: registry row; Option B: new instance)
  → school gets: school ID/slug + join code (SCHOOL_JOIN_CODE already exists)
  → first Owner account created (installer already does this on self-host)
  → school configures: export interval, SMTP reply-to, OIDC providers (optional)
  → admin invites/approves users (approval flow already exists)
  → users download store app → pick school → join code / login
```

## 18. Recommended App Store User Flow

```
Open app → "Finde deine Schule" (search registry, DE+EN)
  → if school uses SchulSaniApp Cloud: login (local/OIDC/Apple) → app
  → if school not found: "SchulSaniApp für deine Schule" info screen
    → link to schulsaniapp.com onboarding (school is the customer — no self-serve)
Reviewer: dedicated "Review" tenant, documented credentials in Review Notes,
  preloaded demo data, reset endpoint (owner-only).
```

## 19. Prioritized Roadmap

| Phase | Items | Exit criteria |
|---|---|---|
| **P0 — Decide + unblock** | Architecture decision (A/B); Apple Developer account; privacy policy published; App Privacy + export compliance declared; account deletion; reviewer tenant | Legal + architecture sign-off |
| **P0 — Build pipeline** | EAS + CI + pinned prebuild; aps-environment; bundle ID frozen; versioning verified end-to-end (release script → TestFlight) | First TestFlight build installs, push works, review-ready |
| **P1 — Product** | Notification tap/refresh/logout; invitations; user export/deletion; Universal Links; tenant-isolation + push test suites; monitoring (Sentry + logs) | All P1 tests green; two-school cloud demo |
| **P2 — Polish** | Search, offline, screenshots/assets pipeline, accessibility audit, crash reporting, Docker path, recovery runbook | Store listing complete; self-host docs updated |
| **P3** | Analytics (opt-in), push analytics, billing/licensing automation, multi-language beyond DE/EN | — |

**Human/legal review required before submission:** privacy policy & App Privacy accuracy; export compliance (encryption); minors/student accounts; school licensing model & external payment; controller/processor contracts (AVV) for the cloud; Apple Developer Program legal name/entity.

---

*This audit describes the state of the code as inspected on 2026-08-18. No code was modified, nothing was submitted to Apple, no production credentials were created.*
