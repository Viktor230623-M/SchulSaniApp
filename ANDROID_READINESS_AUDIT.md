# ANDROID_READINESS_AUDIT.md

**Date:** 2026-08-18 · **Scope:** code audit only — no changes made, nothing submitted to Google Play
**Audited against:** Google Play requirements (as of the audit date), Android platform conventions
**Repo root:** `SchulSaniApp/`

---

## 1. Android Readiness Summary

**There is no Android app.**

- No `android/` folder exists in `artifacts/paramedic-app/` (the `ios/` folder exists as a local, gitignored prebuild; `android/` was never generated).
- No Gradle files, no `AndroidManifest.xml`, no `google-services.json`, no Firebase project config, no signing config, no Play Console linkage.
- The app is Expo SDK 54 / RN 0.81.5 (`expo run:android` would prebuild a project on demand), so the *foundation* is sound — but **nothing Android-specific has been built, configured, or tested.**
- The **server side of Android push is already implemented and tenant-safe** (`sendFcm()` in `src/lib/push/fcm.ts`, FCM HTTP v1 with service account, empty payloads). The missing half is entirely client-side: a Firebase-enabled Android build that can obtain FCM device tokens.

**Readiness scores (0–100):**

| Area | Score | Comment |
|---|---|---|
| Android app | **5/100** | Prebuildable skeleton only; nothing shipped, tested, or configured |
| Google Play submission | **0/100** | No Play Console, no signing, no listing, no Data Safety form |
| Android push notifications | **20/100** | Server path done (FCM v1, tenant-scoped); client + Firebase project missing |
| iOS push notifications | **40/100** | Server done; client wired via expo-notifications but **aps-environment entitlement missing** in the iOS prebuild → dead in release until fixed |
| Cross-platform push architecture | **55/100** | Design is good (direct APNs/FCM, no Expo Push dependency, empty payloads, per-(user,school) token binding). Both native client halves incomplete |

---

## 2. Current Android Architecture

```
Client:  artifacts/paramedic-app  (Expo 54 / RN 0.81.5)
   ├── app.json        android: { versionCode: 1, permissions: [RECEIVE_BOOT_COMPLETED,
   │                   VIBRATE, POST_NOTIFICATIONS], softwareKeyboardLayoutMode: "pan" }
   ├── app.config.ts   android.package ← env APP_BUNDLE_ID (per-instance today)
   ├── services/PushNotificationService.ts  (expo-notifications; Android channels
   │                   "default" + "high-priority"; getDevicePushTokenAsync → FCM token)
   └── (no android/ folder, no google-services.json, no Firebase config)

Server:  artifacts/api-server/src/lib/push/fcm.ts  ✅ exists, production-grade
   └── FCM HTTP v1 via service account (FCM_SERVICE_ACCOUNT[_PATH], FCM_PROJECT_ID)
       → sendFcm(token, { title:"Neue Meldung", data:{notificationId,type,relatedId}, priority, sound })
       → "gone" on UNREGISTERED/INVALID_ARGUMENT → deletes token row
   └── device_tokens table: (schoolId, userId, token, platform, deviceId)
       registered only from the authenticated session (schoolIdOf(req))
```

**Net:** the entire native Android layer is hypothetical. Everything below is either missing or unverified-on-Android.

---

## 3. Missing Android Features (complete list)

| Feature | Status |
|---|---|
| Android project (`android/`, Gradle, Kotlin/Java) | ❌ Missing (prebuild would generate) |
| Application/package ID | ⚠️ Env-driven `APP_BUNDLE_ID`; default would be `com.schulsani.app` |
| minSdk / targetSdk / compileSdk | ❌ Not set anywhere (Expo default only) — **Play requires target API ≥ current-1 year; verify at build** |
| versionCode / versionName | ⚠️ `versionCode: 1`, version from app.json (release script bumps versionCode) |
| Release build config (minify/R8, proguard) | ❌ Missing |
| Signing (release keystore / Play App Signing) | ❌ Missing (no `.jks` anywhere — and `.jks` is gitignored, correct) |
| App icon + adaptive icons + splash | ❌ Only iOS-style assets exist; no `mipmap` adaptive-icon set |
| `google-services.json` / Firebase project | ❌ Missing → **FCM client cannot run** |
| Production API config | ⚠️ `EXPO_PUBLIC_DOMAIN` baked at build time (per-instance; same architecture decision as iOS — see APP_STORE_READINESS_AUDIT §4) |
| Secure token storage | ✅ Design: JWT in memory; E2E keys in `expo-secure-store` (Android Keystore-backed) |
| Deep links / Android App Links | ❌ Custom scheme only (`paramedic-app://`); no App Links (assetlinks.json + intent filters) |
| Authentication (incl. external browser) | ✅ OIDC via `expo-web-browser` custom-tabs flow; Apple native is iOS-only (fine) |
| Network error handling / offline | ⚠️ Timeouts + fallbacks exist in ApiService; no native offline cache |
| Loading/error/empty states | ✅ Present in screens |
| Android lifecycle / background behavior | ⚠️ Defaults only; foreground-service or boot behavior not implemented |
| Accessibility | ⚠️ RN baseline; not audited |
| Screen sizes / keyboard | ✅ `softwareKeyboardLayoutMode: "pan"`; needs device testing |
| File handling / PDF export | ⚠️ `expo-file-system` + `expo-sharing` — PDF export works on Android in principle; **untested** |
| Permissions | ⚠️ `POST_NOTIFICATIONS`, `VIBRATE`, `RECEIVE_BOOT_COMPLETED` declared; runtime permission flow exists in PushNotificationService |

---

## 4. Google Play Blockers (P0)

1. **No Android app to upload.** Nothing builds, nothing is signed, nothing is in Play Console.
2. **No Firebase project / `google-services.json`** → push (a core feature: emergency alerts) cannot work on Android.
3. **No release signing** — no keystore, no Play App Signing enrollment.
4. **Target API level unverified** — Play rejects apps whose targetSdk is >1 year old; must be set and verified (Expo 54 default targetSdk should be recent, but it must be confirmed in the generated project and kept current).
5. **Data Safety form + privacy policy** — same legal surface as iOS (§6 of APP_STORE_READINESS_AUDIT): published privacy policy URL required; Data Safety form must declare health data (E2E-encrypted), identifiers, contact info, and note **data is NOT shared/collected beyond the school instance**.
6. **Account deletion** — Play requires apps with account creation to offer account deletion (in-app or web). Missing (same as iOS).
7. **Store listing** — title/description/screenshots/feature graphic (1024×500)/icon (512)/content rating (IARC questionnaire)/support email — none exist.
8. **Reviewer access** — need a demo tenant + reviewer credentials in "App access" notes.

---

## 5. Android Security Risks

1. **Per-instance baked domain** (`EXPO_PUBLIC_DOMAIN`) — under the store model this must be a runtime school-selection flow. Never allow arbitrary user-entered server URLs without validation (certificate pinning or at least HTTPS-only + allow-list). The current design has no such input — keep it that way.
2. **`google-services.json` contains the Firebase project config** — it is *not* a secret (Google Cloud console is the source of truth for restricting the API key), but committing it is sloppy; generate it in CI/build from a secret or a private repo.
3. **FCM service account private key** (`FCM_SERVICE_ACCOUNT`) is a high-value secret — must live in backend env (installer/assistant), never in git. Already the pattern; keep.
4. **Notification data payload is empty of content** (only ids/types) — good privacy design; keep. The notification title is always "Neue Meldung" (neutral) — good.
5. **APK/keystore handling:** `.jks`, `.p8`, `.key` are gitignored — correct. Use Play App Signing and keep the upload key safe.
6. **No integrity checks** — Play Integrity API not integrated (fine for v1; consider for license enforcement later).
7. **`RECEIVE_BOOT_COMPLETED`** is declared but nothing uses it — either implement the boot-reschedule story (alarms/re-request permissions) or remove it to keep the permission surface minimal (reviewers look at this).
8. **Vibration/sound on high-priority alerts** — configured in the high-priority channel; ensure Android 13+ (`POST_NOTIFICATIONS` runtime) prompt is not skipped (it exists in `requestNotificationPermissions`).

---

## 6. Android Push Notification Assessment

**Server → Android (complete, verified):**
- `sendFcm()`: OAuth2 JWT from service account → FCM HTTP v1 `messages:send`; `priority: high` sets `android.priority=high` + custom sound `alarm.wav`; returns `ok | gone | error`; `gone` deletes the device token row. ✅
- Token lifecycle: `POST /notifications/register-device` and `/unregister-device`, both behind `requireAuth`, school from session (`schoolIdOf(req)`), recipient re-validated in-school before every fan-out. ✅
- Multi-device: supported via unique tokens per device (FCM tokens are per-app-install). `deviceId` column exists but **the client never sends it** — harmless today.

**Client (Android) — missing/broken:**
1. **No native Android project** → no FCM registration possible. P0.
2. `requestNotificationPermissions()` handles Android channels + runtime permission — the code is correct and would work once the native project + Firebase exist.
3. **No token-refresh listener** (`addPushTokenListener`) — FCM rotates tokens; without re-registration, pushes die silently until re-login. P1 (same gap as iOS).
4. **No notification-tap handling** — `addNotificationResponseListener` exported, never used; tapping an alert does not open the mission/report. P1.
5. **Logout does not unregister the token** — user keeps receiving pushes while logged out. P1.
6. **Foreground notifications:** `setNotificationHandler` shows alert/banner/list in foreground — ✅.
7. **Background/terminated:** FCM delivers via system tray — ✅ (data-only messages currently use `data` payload; the app must render them via `Notifications.addNotificationReceivedListener`/channel; verify behavior when app is terminated — data-only messages in background require the notification to be constructed client-side; confirm with a device test. **Flag for testing.**)

**Trace (target state):**
```
Android device → getDevicePushTokenAsync → FCM token (needs Firebase project + google-services.json)
→ POST /notifications/register-device {token, platform:"android"} (session-derived user+school)
→ backend stores (userId, schoolId, token)
→ mission created → createNotificationForMultipleUsers (in-school validation)
→ sendFcm → FCM → device → app renders notification → tap → deep link to report/mission (missing)
```

---

## 7. iOS Push Notification Assessment

Same server core (`sendApns()`, HTTP/2 + .p8, empty payloads, `gone` handling). Client:
- `expo-notifications` `getDevicePushTokenAsync` → APNs token; registration identical to Android. ✅
- **Blocking gap:** the iOS prebuild's `SchulSani.entitlements` is an **empty dict** — no `aps-environment`. Release builds will not register for remote notifications until the Push capability is added (managed config or capability in the project). **P0.**
- Same missing client features as Android: no token-refresh listener, no tap handling, no logout unregistration. (Details in APP_STORE_READINESS_AUDIT §9/§10.)

---

## 8. iOS vs Android Push Comparison

| Feature | iOS | Android |
|---|---|---|
| Native push | ⚠️ Wired, but **aps-environment missing** → dead in release | ❌ No native project at all |
| Device token | ✅ via expo-notifications (needs entitlement) | ✅ code path exists (needs Firebase) |
| Backend registration | ✅ `/register-device` (session-scoped) | ✅ same endpoint |
| Token refresh | ❌ no `addPushTokenListener` | ❌ same |
| Logout invalidation | ❌ token not unregistered on logout | ❌ same |
| Multiple devices | ✅ unique tokens per device | ✅ same |
| Foreground notifications | ✅ handler configured | ✅ handler + channels |
| Background notifications | ✅ `UIBackgroundModes: remote-notification` | ✅ system tray (verify data-only handling) |
| Notification tap | ❌ listener unused | ❌ same |
| Deep linking | ❌ no Universal Links (scheme only) | ❌ no App Links |
| Emergency alerts | ⚠️ priority/sound/content-available wired; blocked by entitlement | ⚠️ priority/sound channel wired; blocked by missing app |
| Tenant isolation | ✅ server-enforced (user+school) | ✅ same server path |

**Summary:** backend = parity. Client = identical missing pieces on both platforms, plus iOS's entitlement gap and Android's total absence.

---

## 9. Multi-Tenant Notification Security Assessment

- **Token registration is tenant-safe:** the endpoint derives `(userId, schoolId)` from the authenticated session — a client cannot register a token for another school or user. ✅
- **Fan-out is tenant-safe:** every notification insert re-validates the recipient against the school; `sendPushNotification` selects tokens by `userId AND schoolId`; emergency fan-outs (`notifySanitaeters`, `notifyOnDutyUsers`) are scoped by `schoolId`. ✅
- **`removeDeviceToken(token, schoolId)`** deletes without ownership check — an in-school authed user could delete another user's token if they know it. Low severity; scope to `userId`. (Carried from iOS audit.)
- **Edge cases to test when the cloud goes multi-instance/multi-tenant:** disabled users (approval revocation already cuts push via `requireAuth` on registration, but *existing* tokens still receive pushes — the fan-out queries don't check `isApproved`! **Check:** `createNotificationForMultipleUsers` selects users by id+school only, not `isApproved`. A revoked/disabled user keeps getting emergency pushes until their token fails. **P1 finding — filter `isApproved` in recipient selection.**), deleted users (token rows cascade/cleanup on failed send — verify), account switching/school switching (n/a in single-school model; becomes relevant under Option A).

---

## 10. Android/iOS Feature Parity Assessment

Everything the app does (missions, roster, duty, LOA, news, notifications, incident reports + PDF export, roles/permissions, exports, crypto unlock) is React Native shared code — **parity is structural, not a risk**, once Android builds. Platform-specific deltas today:
- Native Apple sign-in: iOS only (fine; Android gets email/OIDC).
- `expo-location` is a **declared but unused** dependency (no `Location.*` call anywhere) — the location strings in the iOS Info.plist are prebuild defaults. Trim the dependency or leave it; no runtime location permission is actually requested on either platform.
- PDF export: `expo-file-system`/`expo-sharing` — verify Android `FileProvider`/share sheet.
- Haptics, glass effect, symbols — iOS-leaning polish; verify Android fallbacks render (no crash).
- **Verify on device:** keyboard panning, back-button behavior (RN `BackHandler` with expo-router), screen sizes, notch/status bar, notification icons (small icon `ic_launcher` requirement).

---

## 11. Cloud / Self-Hosted Compatibility (Android)

- App talks to `https://${EXPO_PUBLIC_DOMAIN}/api` — works for cloud and self-hosted identically (each build points at its instance; the store model needs runtime school selection — see APP_STORE_READINESS_AUDIT §4).
- **HTTPS is mandatory and enforced** (Android 9+ blocks cleartext by default; app uses https only — ✅).
- Self-hosted TLS: certbot-issued — ✅ (no self-signed certs; document that schools must use a real cert or the app will refuse).
- Version compatibility: the app and server ship together (monorepo) — document that self-hosted instances must upgrade to the same release as the store app (no API versioning exists yet; **P2**: add API versioning or compatibility guarantees before external tenants exist).
- Deep links for self-hosted: scheme-based works; App Links would need per-instance assetlinks (only for the cloud domain under the store model).

---

## 12. Required Tests

1. **FCM round-trip** (P0): register Android token → create mission → assert push received on device (real device; emulator lacks FCM reliably).
2. **Token lifecycle** (P1): refresh, re-register same token (idempotent upsert), unregister, `gone` cleanup, logout invalidation (after fix).
3. **Tenant isolation via push** (P1): school A's alert never reaches school B's tokens; recipient validation on every fan-out (multi-instance HTTP tests).
4. **Disabled/deleted user push** (P1): revoked user stops receiving (after `isApproved` fix).
5. **Notification tap → navigation** (P1): tap alert opens the correct mission/report (after implementing).
6. **App-links/universal-links** (P2): reset links open the app on both platforms.
7. **Build reproducibility** (P1): CI build → install → smoke test on both platforms.
8. **Accessibility/keyboard/screen-size pass** (P2): device matrix.

---

## 13–16. Prioritized Lists

### P0 — Google Play blockers
1. Generate + configure the Android native project (Expo prebuild) with Firebase (`google-services.json`)
2. Release signing (upload keystore + Play App Signing) and CI build (EAS Build/Submit or Gradle in CI)
3. Verify targetSdk/compileSdk meets Play requirements; set versionCode flow (release script already bumps it)
4. Published privacy policy URL + Data Safety form + content rating (IARC) + account deletion
5. Store listing: title/description/screenshots/feature graphic/icon/support email + reviewer credentials
6. Device test pass: push, PDF export, keyboard, back button, lifecycle

### P1 — Production requirements
7. Push: token-refresh listener, notification-tap → deep link, logout token unregistration
8. Recipient selection filter `isApproved` in `createNotificationForMultipleUsers` (all platforms)
9. Ownership-scope `removeDeviceToken` to the caller
10. Monitoring/crash reporting (opt-in Sentry) + structured logs
11. Tenant-isolation + push test suites; CI that runs them
12. Runtime school-selection flow (shared with iOS; unblocks the store model)

### P2 — Improvements
13. App Links (Android) + Universal Links (iOS) with per-domain assetlinks for self-hosted
14. API versioning / compatibility contract for self-hosted instances
15. Play Integrity API (license enforcement later)
16. Offline cache for native; notification action buttons (e.g., "Accept" on mission alerts)
17. Remove or implement `RECEIVE_BOOT_COMPLETED`

### P3 — Nice to have
18. Android 14+ predictive back, edge-to-edge, Material You theming pass
19. Notification grouping/channels per school, quiet hours
20. Widgets (duty status, on-call count)

---

## 17. Overall Readiness Scores (summary)

| Area | Score | Reason |
|---|---|---|
| Android app | **5/100** | Prebuildable foundation only; zero Android-native work done or tested |
| Google Play submission | **0/100** | Nothing to submit; no signing, listing, or console |
| Android push notifications | **20/100** | Server half production-grade; client half + Firebase project absent |
| iOS push notifications | **40/100** | Server half done; client wired but blocked by missing `aps-environment` entitlement |
| Cross-platform push architecture | **55/100** | Direct APNs/FCM design is correct and privacy-conscious; both client halves incomplete |

**Bottom line:** Android is a greenfield build on a solid Expo foundation. The server-side push + tenant-isolation design should be preserved as-is; the work is client build configuration, Firebase setup, the missing client push lifecycle features, and the shared legal/listing surface (which also blocks iOS).

---

*This audit describes the state of the code as inspected on 2026-08-18. No code was modified, nothing was submitted to Google Play, no production credentials were created.*
