# Graph Report - .  (2026-08-08)

## Corpus Check
- 164 files · ~138.854 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1458 nodes · 2364 edges · 114 communities detected
- Extraction: 93% EXTRACTED · 6% INFERRED · 1% AMBIGUOUS · INFERRED: 142 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output
- Edge kinds: contains: 930 · imports: 392 · calls: 326 · imports_from: 289 · references: 196 · shares_data_with: 72 · conceptually_related_to: 56 · implements: 56 · semantically_similar_to: 36 · method: 6 · cites: 3 · re_exports: 2


## Input Scope
- Requested: auto
- Resolved: committed (source: cli)
- Included files: 164 · Candidates: 219
- Excluded: 1 untracked · 72281 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.
## God Nodes (most connected - your core abstractions)
1. `useAppStore` - 29 edges
2. `Migration 0000 Grundlinie` - 29 edges
3. `getTheme()` - 28 edges
4. `t()` - 23 edges
5. `Drizzle-Schema (Gesamtdatei)` - 23 edges
6. `handleApi()` - 22 edges
7. `Tabelle users` - 22 edges
8. `Settings Tab` - 21 edges
9. `Login Screen` - 18 edges
10. `useTopPad()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Root()` --conceptually_related_to--> `Tabs Layout`  [INFERRED]
  /Users/viktorgnjatic/Projects/SchulSaniApp/artifacts/paramedic-app/app/+html.tsx → artifacts/paramedic-app/app/(tabs)/_layout.tsx
- `Incident Report Editor Screen` --semantically_similar_to--> `KeyboardAwareScrollViewCompat`  [AMBIGUOUS] [semantically similar]
  artifacts/paramedic-app/app/report/[id].tsx → artifacts/paramedic-app/components/KeyboardAwareScrollViewCompat.tsx
- `Relay-Header-Durchreichung` --conceptually_related_to--> `Tabelle sessions`  [INFERRED]
  ops/relay/server.js → lib/db/drizzle/0000_grundlinie.sql
- `Datenbank-Konsole (Owner)` --semantically_similar_to--> `Nutzerverwaltungs-Routen`  [INFERRED] [semantically similar]
  artifacts/api-server/src/routes/dbConsole.ts → artifacts/api-server/src/routes/users.ts
- `SQL_PRESETS` --semantically_similar_to--> `RetentionCutoffs (Fristen)`  [INFERRED] [semantically similar]
  artifacts/api-server/src/lib/sqlPresets.ts → artifacts/api-server/src/lib/retentionRules.ts

## Hyperedges (group relationships)
- **Rollen, Rechte und ihr Protokoll** — table_roles, table_role_permissions, table_role_change_log, enum_user_role, table_users [EXTRACTED 0.95]
- **Anmeldung, Sitzungen und Identitaeten** — table_users, table_sessions, table_user_identities, users_identity_columns, users_password_policy_columns [INFERRED 0.85]
- **Einsatzprotokolle, redigierte Sicht und Zugriffsprotokolle** — table_incident_reports, view_incident_reports_admin, table_report_access_log, table_db_console_log [INFERRED 0.80]
- **SchulSani Icon Set - one green cross mark across platforms and sizes** — asset_app_icon_green_cross, asset_splash_icon_green_cross, asset_apple_touch_icon, asset_pwa_icon_192, asset_pwa_icon_512, concept_green_medical_cross_mark, concept_mint_wave_motif [INFERRED 0.90]
- **Berechtigungs-Guards je Domäne** — routes_users, routes_roles, routes_missions, routes_news, routes_loa, routes_activity [EXTRACTED 1.00]
- **HTTP-Tests decken Routen ab** — app_http_test, login_http_test, profileConfirmation_http_test, users_approve_test [EXTRACTED 1.00]
- **Schutzkette Patientendaten in der SQL-Konsole** — patientColumns_PATIENT_COLUMNS, patientColumns_ADMIN_VIEW, sqlGuard_guardPatientData, sqlPresets_SQL_PRESETS, sqlGuardTest_suite [EXTRACTED 0.95]
- **Protokollierung von Verwaltungshandeln und ihre Aufbewahrung** — roleChangeLog_logRoleChangeTx, profileChangeLog_logProfileChangeTx, reportAccessLog_logReportAccess, rolePermissions_Tx, retentionRules_RetentionCutoffs [INFERRED 0.85]
- **Lebenszyklus einer Anmeldesitzung** — sessions_createSession, sessionRules_computeNewSession, sessions_resolveSession, sessionRules_isSessionValid, sessionRules_computeSlidingExtension, sessions_revokeSession, retentionRules_RetentionCutoffs [EXTRACTED 0.90]
- **OIDC-Anmeldeablauf mit PKCE und State-Verbrauch** — oidc_beginRedirect, oidc_completeRedirect, types_AuthResult [EXTRACTED 1.00]
- **Benachrichtigungskette von Empfaengerkreis bis Geraet** — notifications_notifySanitaeters, rolePermissions_loadRolePermissions, notifications_createNotificationForMultipleUsers, notifications_sendPushNotification, webPush_sendWebPush, notifications_sendExpoPushMessages [EXTRACTED 1.00]
- **Vom Anmeldeweg zur durchgesetzten Berechtigung** — registry_loadAuthProviders, registry_buildProvider, auth_signToken, auth_getLiveUser, auth_requirePermission [INFERRED 0.80]
- **Registrierung -> E-Mail bestaetigen -> Freischaltung warten -> Login** — app_registrieren, app_email_bestaetigen, app_freischaltung_warten, app_login [EXTRACTED 1.00]
- **OIDC-Anmeldung -> Handoff -> Schul-Code -> Tabs** — app_login, app_schul_code, tabs_news [EXTRACTED 1.00]
- **Guards vor der Anwendung: Passwortwechsel dann Namensbestaetigung** — app_root_layout, app_index_redirect, app_passwort_wechseln, app_name_bestaetigen, tabs_news [EXTRACTED 1.00]
- **Glass UI component family** — GlasTabLeiste_Glasflaeche, GlasTabLeiste_GlasTabLeiste, GlassLoader_GlassLoader, liquid_glass_LiquidGlassView [INFERRED 0.82]
- **Incident report editing flow** — report_index_ReportsIndexScreen, report_id_ReportScreen, ChipTextField_ChipTextField, BodyMap_BodyMap, BodyMap_BODY_REGION_KEYS [EXTRACTED 1.00]
- **Admin screens gated by permission or owner flag** — database_DatabaseConsoleScreen, roles_RolesScreen, sani_activity_SaniActivityScreen, useAppStore_has [EXTRACTED 1.00]
- **Web-Export-Kette: Env, Vorlagen, erzeugte Assets** — appconfig_instanzkonfiguration, generatewebassets_skript, swtemplate_service_worker, swjs_web_artifact, manifestjson_web_artifact [EXTRACTED 0.95]
- **Push-Registrierung nativ und im Web auf denselben Endpunkt** — pushnotificationservice_registrierung, webpushservice_enablewebpush, apiservice_client, swjs_web_artifact [EXTRACTED 0.90]
- **Sitzungswiederherstellung beim Start** — apiservice_restoresession, apiservice_authtoken, useappstore_authstatus, useappstore_store [EXTRACTED 0.92]
- **OpenAPI-Spec erzeugt Zod-Schemas und React-Query-Client** — api_spec_openapi_yaml, orval_config, api_zod_generated, api_client_react_generated, custom_fetch [EXTRACTED 1.00]
- **Rolle, Rechte, Nutzer und die Pruefspur darueber** — table_roles, table_role_permissions, table_users, table_role_change_log [EXTRACTED 1.00]
- **Assistent schreibt Backend-.env, App-.env, Anbieterdatei und legt den Eigentuemer an** — installer_assistant, installer_owner_bootstrap [EXTRACTED 1.00]

## Communities

### Community 0 - "Installer-Assistent"
Cohesion: 0.06
Nodes (57): APP_ENV_PATH, authModeIsLocal(), BACKEND_ENV_PATH, base64url(), buildAppEnv(), buildBackendEnv(), candidate, clearPendingSecrets() (+49 more)

### Community 1 - "DB-Schema und Tabellen"
Cohesion: 0.03
Nodes (61): AuthToken, AuthTokenKind, authTokenKindEnum, authTokensTable, DbConsoleLog, dbConsoleLogTable, DeviceToken, deviceTokensTable (+53 more)

### Community 2 - "DB-Archiv und Constraints"
Cohesion: 0.09
Nodes (57): Archiv 0000 natural_scream, Archiv 0001 incident_reports_admin View, Archiv 0002 sessions, Archiv 0003 notification_type Werte, Constraint users_iserv_username_unique, Constraint users_school_id_auth_provider_external_subject_key, Drift-Pruefung (drift.ts), @workspace/db Einstieg (Pool + drizzle) (+49 more)

### Community 3 - "Auth-Routen und Sitzungen"
Cohesion: 0.05
Nodes (40): validateProfileName(), actualVerifierHash, appleNativeNonces, authLimiter, authProviders, cleanFirstName, cleanLastName, completeOidcCallback() (+32 more)

### Community 4 - "Admin-Bildschirme"
Cohesion: 0.07
Nodes (31): styles, COLOR_CHOICES, PATIENT_DATA_PERMISSIONS, styles, confirmAction(), ConfirmOptions, notify(), ActivityType (+23 more)

### Community 5 - "Generierter API-Client"
Cohesion: 0.09
Nodes (35): Awaited, AwaitedInput, getHealthCheckQueryKey(), getHealthCheckQueryOptions(), getHealthCheckUrl(), healthCheck(), HealthCheckQueryError, HealthCheckQueryResult (+27 more)

### Community 6 - "App-Kern und Kontext"
Cohesion: 0.11
Nodes (34): ApiService, AppProvider, useApp, AuthField, AuthShell, BODY_REGION_KEYS, BodyMap, ChipTextField (+26 more)

### Community 7 - "Auth-Screens der App"
Cohesion: 0.17
Nodes (15): styles, AuthButton(), AuthField(), AuthLink(), AuthMessage(), AuthShell(), AuthShellProps, AuthTheme (+7 more)

### Community 8 - "Einsatzberichte und Zugriffslog"
Cohesion: 0.07
Nodes (23): logReportAccess(), ReportAccessAction, accessible, addenda, Addendum, body, doc, end (+15 more)

### Community 9 - "Aktivitaets- und Profil-Screens"
Cohesion: 0.11
Nodes (16): ACTION_CONFIG, ActivitySummaryItem, ActivityUser, styles, styles, styles, MedicalCross(), MedicalCrossProps (+8 more)

### Community 10 - "Rechtematrix-Tests"
Cohesion: 0.07
Nodes (22): addr, allowed, covered, dbMock, ENDPOINTS, entries, EXPECTED, granted (+14 more)

### Community 11 - "Auth-Middleware und Berechtigungen"
Cohesion: 0.11
Nodes (24): authenticate(), AuthRequest, getLiveUser(), JwtPayload, LiveUser, requireAuth(), requireAuthAllowUnconfirmedProfile(), requireAuthForLogout() (+16 more)

### Community 12 - "Web-Build-Skripte"
Cohesion: 0.12
Nodes (25): basePath, checkMetroHealth(), clearMetroCache(), downloadAssets(), downloadBundle(), downloadBundlesAndManifests(), downloadFile(), downloadManifest() (+17 more)

### Community 13 - "OIDC-Provider-Tests"
Cohesion: 0.09
Nodes (13): body, discoveryDoc, { jwtVerifyMock, importPKCS8Mock, fetchMock, signJwtCalls }, nonce, provider, redirect, redirectParams(), returnChallenge (+5 more)

### Community 14 - "Aktivitaetslog und Layout"
Cohesion: 0.11
Nodes (13): ACTION_CONFIG, styles, queryClient, styles, GlassLoader(), GlassLoaderProps, RINGE, styles (+5 more)

### Community 15 - "Web-Push-Backend"
Cohesion: 0.15
Nodes (19): ensureConfigured(), sendWebPush(), WebPushPayload, canSeeAll, router, { token }, { token, platform, deviceId }, createNotification() (+11 more)

### Community 16 - "Profilbestaetigung"
Cohesion: 0.09
Nodes (13): invalidateAllRoleCaches(), signToken(), actor, confirmedAt, dbMock, FakeUserRow, fakeUsers, profileChangeEntries (+5 more)

### Community 17 - "ApiService-Auth-Methoden"
Cohesion: 0.13
Nodes (20): ApiService.approveNews, ApiService.changePassword, ApiService.completeJoinCode, ApiService.confirmProfile, ApiService.createNews, ApiService.deleteNews, ApiService.editNews, ApiService.getNews (+12 more)

### Community 18 - "Einsaetze und Dismissals"
Cohesion: 0.14
Nodes (15): addDismissal(), getDismissedFor(), removeDismissal(), _canSeePatient, isLeadership, m, missionId, router (+7 more)

### Community 19 - "Rollenverwaltung Backend"
Cohesion: 0.10
Nodes (16): invalidateRoleCache(), added, anzahl, body, countByKey, { displayName, displayNameEn, color, sortOrder }, { id }, { key, displayName, displayNameEn, color, sortOrder } (+8 more)

### Community 20 - "App-Bootstrap und HTTP-Tests"
Cohesion: 0.15
Nodes (19): createApp - Express-Bootstrap, App-HTTP-Test, config - zentrale Konfiguration, Server-Start (listen), Login-HTTP-Test, Profilbestaetigungs-HTTP-Test, Aktivitaetsprotokoll-Routen, Auth-Routen (Anmeldung, OIDC, Sitzung) (+11 more)

### Community 21 - "Themes der App"
Cohesion: 0.12
Nodes (15): amethystTheme, crimsonTheme, darkTheme, lightTheme, midnightTheme, redTheme, sunsetTheme, tealTheme (+7 more)

### Community 22 - "Abwesenheitsmeldungen (LOA)"
Cohesion: 0.13
Nodes (10): DatePickerField(), DAYS, formatDate(), MONTHS, Props, styles, LOARequest, LOAStatus (+2 more)

### Community 23 - "App-Store und ApiService-Kern"
Cohesion: 0.16
Nodes (11): AppContext, AppContextValue, ActivityLog, DutyStatus, Mission, NewsItem, NotificationItem, ApiService (+3 more)

### Community 24 - "Patientenspalten und SQL-Guard"
Cohesion: 0.18
Nodes (14): PATIENT_COLUMNS, countStatements(), FORBIDDEN_FUNCTIONS, FORBIDDEN_VERBS, guardPatientData(), GuardResult, guardStatement(), maskLiterals() (+6 more)

### Community 25 - "Build-Konfiguration Backend"
Cohesion: 0.17
Nodes (16): buildAll (esbuild-Bundle), vitest.config (Testumgebung), ADMIN_VIEW (incident_reports_admin), PATIENT_COLUMNS, PROTECTED_TABLE (incident_reports), sqlGuard Tests, FORBIDDEN_FUNCTIONS, FORBIDDEN_VERBS (+8 more)

### Community 26 - "Session-Regeln"
Cohesion: 0.20
Nodes (12): computeNewSession(), computeSlidingExtension(), isSessionValid(), SessionTimestamps, base, NOW, s, createSession() (+4 more)

### Community 27 - "Koerperkarte und Chips"
Cohesion: 0.16
Nodes (12): BACK, BODY_REGION_KEYS, FRONT, Props, Region, styles, hasTerm(), Props (+4 more)

### Community 28 - "Preview-Server (serve.js)"
Cohesion: 0.13
Nodes (11): appName, basePath, fs, http, landingPageTemplate, MIME_TYPES, path, port (+3 more)

### Community 29 - "Auth-Relay (ops/relay)"
Cohesion: 0.16
Nodes (13): ALLOWED_ORIGINS, clientIp(), forward(), fs, handleCallback(), hits, HOP_BY_HOP, http (+5 more)

### Community 30 - "Release-Skript"
Cohesion: 0.22
Nodes (15): APP_JSON, APP_PACKAGE, CHANGELOG, changelogAbschnitt(), commitsSeit(), erhoehe(), git(), leseJsonWert() (+7 more)

### Community 31 - "ApiService-Anmeldemethoden"
Cohesion: 0.18
Nodes (15): ApiService.completeAppleNative, ApiService.exchangeNativeSession, ApiService.getAuthProviders, ApiService.getProviderStartUrl, ApiService.loginLocal, ApiService.registerLocalAccount, ApiService.requestPasswordReset, ApiService.resendLocalVerification (+7 more)

### Community 32 - "Login-Screen der App"
Cohesion: 0.17
Nodes (8): LoginScreen(), providerVisual(), styles, APP_NAME, SCHOOL_NAME, THEME_COLOR, AuthError, AuthProviderInfo

### Community 33 - "Auth-Provider-Adapter"
Cohesion: 0.17
Nodes (15): createLocalProvider, Test: local-provider-tests, beginRedirect, completeRedirect, createOidcRedirectProvider, verifyNativeToken (Apple nativ), Test: oidc-provider-tests, AuthRelaySettings (+7 more)

### Community 34 - "ApiService-Einsaetze"
Cohesion: 0.15
Nodes (14): ApiService.acceptMission, ApiService.createMission, ApiService.dismissMission, ApiService.getDutyStatus, ApiService.getMissions, ApiService.getOnDutyUsers, ApiService.updateDutyStatus, Root() (+6 more)

### Community 35 - "ApiService-Nutzerverwaltung"
Cohesion: 0.15
Nodes (14): ApiService.approveUser, ApiService.correctUserProfile, ApiService.deleteUser, ApiService.getAllUsers, ApiService.getAuthIdentities, ApiService.getMyActivity, ApiService.getPendingUsers, ApiService.startAuthLink (+6 more)

### Community 36 - "Auth-Typen"
Cohesion: 0.16
Nodes (9): AuthProfile, AuthProvider, AuthProviderBase, AuthProviderType, AuthResult, RedirectAuthProvider, OidcDiscoveryDocument, OidcRedirectProviderConfig (+1 more)

### Community 37 - "Login-HTTP-Tests"
Cohesion: 0.14
Nodes (9): { activeUserId }, dbMock, fakeIdentities, FakeIdentityRow, FakeUserRow, fakeUsers, hier, userIdentitiesTableMock (+1 more)

### Community 38 - "Nutzerverwaltung Backend"
Cohesion: 0.14
Nodes (9): invalidateUserCache(), canAccessAll, cleanFirstName, cleanLastName, { firstName, lastName }, hasAssignPermission, { id }, { role } (+1 more)

### Community 39 - "Grundlinien-Tabellen"
Cohesion: 0.14
Nodes (13): db_console_log, device_tokens, duty, incident_reports, loa, mission_activity_log, mission_dismissals, missions (+5 more)

### Community 40 - "Permissions und Profilnamen"
Cohesion: 0.19
Nodes (14): ESSENTIAL_PERMISSIONS, PERMISSIONS (Rechtekatalog), isValidPermission, logProfileChangeTx, validateProfileName, logReportAccess, retentionRules Tests, RetentionCutoffs (Fristen) (+6 more)

### Community 41 - "App-Modelle"
Cohesion: 0.18
Nodes (13): setAuthToken() / Bearer-Token, restoreSession() Sitzungswiederherstellung, AppTheme, DutyStatus (Modell), LOARequest (Modell), Mission (Modell), NewsItem (Modell), getTheme() (+5 more)

### Community 42 - "Rollenberechtigungen Backend"
Cohesion: 0.23
Nodes (11): assertAdminReachable(), cache, CacheEntry, cacheKey(), getRolePermissions(), invalidateRolePermissions(), loadRolePermissions(), LockoutError (+3 more)

### Community 43 - "Mailer-Service"
Cohesion: 0.26
Nodes (12): appBaseUrl, assertMailerConfig(), authLink(), getTransporter(), mailerConfig, mailFrom, required(), sendMail() (+4 more)

### Community 44 - "Glas-Oberflaeche"
Cohesion: 0.21
Nodes (9): Glasflaeche(), GlasTabLeiste(), mitDeckung(), styles, TabLeisteProps, TabOptionen, TabRoute, LiquidGlassView() (+1 more)

### Community 45 - "API-Client und OpenAPI"
Cohesion: 0.20
Nodes (12): Generierter React-Query-Client, api-client-react Paket-Einstieg, Generierte TS-Typen des React-Clients, ApiError, OpenAPI Spec (openapi.yaml), Generierte Zod-Schemas, api-zod Paket-Einstieg, Generierte Zod-Typen (types/) (+4 more)

### Community 46 - "Lokaler Auth-Provider"
Cohesion: 0.18
Nodes (9): PasswordAuthProvider, createLocalProvider(), DUMMY_HASH, hashPassword(), LocalProviderConfig, existingUser, existingUserHash, mockRows (+1 more)

### Community 47 - "Auth-Registry"
Cohesion: 0.18
Nodes (7): AuthRelaySettings, loadAuthProviders(), RawLocalProviderConfig, RawOidcRedirectProviderConfig, keyPath, providers, createOidcRedirectProvider()

### Community 48 - "SQL-Presets und DB-Konsole"
Cohesion: 0.18
Nodes (6): SQL_PRESETS, SqlPreset, body, consoleLimiter, guard, router

### Community 49 - "Health- und LOA-Routen"
Cohesion: 0.17
Nodes (8): data, router, router, canSeeAll, newReq, parsedFromDate, parsedToDate, router

### Community 50 - "Retention-Job"
Cohesion: 0.25
Nodes (8): RetentionResult, runRetention(), computeCutoffs(), minusDays(), minusMonths(), RetentionCutoffs, cutoffs, now

### Community 51 - "Default-Berechtigungen"
Cohesion: 0.22
Nodes (7): DEFAULT_ROLE_PERMISSIONS, ESSENTIAL_PERMISSIONS, isValidPermission(), PermissionDef, PermissionKey, SEED_LABELS, SeedLabel

### Community 52 - "ErrorBoundary"
Cohesion: 0.22
Nodes (6): ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, ErrorFallback(), ErrorFallbackProps, styles

### Community 53 - "Push-Notification-Service App"
Cohesion: 0.22
Nodes (2): registerForPushNotificationsAsync(), requestNotificationPermissions()

### Community 54 - "Permission-Prüfung Kern"
Cohesion: 0.31
Nodes (10): getLiveUser (60s-Cache), Benutzer-/Rollen-Cache-Invalidierung, Permission Matrix Test (Rolle x Endpunkt), DEFAULT_ROLE_PERMISSIONS, hasPermission (statisch), rolePermissions Tests (CWE-863), invalidateRolePermissions, loadRolePermissions (+2 more)

### Community 55 - "Farben und Uebersetzungen"
Cohesion: 0.20
Nodes (10): Farbpalette (Colors), lib/dialog (notify, confirmAction), t(path, lang), i18n Uebersetzungskatalog, nativeGlassAvailable Flag, LiquidGlassView (natives iOS-Glas), localized() Inhaltsuebersetzung, AppLanguage (+2 more)

### Community 56 - "Web-Assets und Manifest"
Cohesion: 0.27
Nodes (9): public/manifest.json (erzeugt), NotificationItem (Modell), Android-Benachrichtigungskanaele (default, high-priority), PushNotificationService (nativ), public/sw.js (erzeugt), sw.template.js (Web-Push Service Worker), enableWebPush(), WebPushService (Browser) (+1 more)

### Community 57 - "Benachrichtigungs-Service Backend"
Cohesion: 0.22
Nodes (10): createNotification, notifyUser, saveDeviceToken / removeDeviceToken, sendExpoPushMessages (Chunks zu 100), sendPushNotification, runRetention, startScheduler, scheduler tick (+2 more)

### Community 58 - "Session-Regel-Tests"
Cohesion: 0.29
Nodes (10): sessionRules Tests, ABSOLUTE_LIFETIME_MS (180 Tage), SLIDING_WINDOW_MS (30 Tage), computeNewSession, computeSlidingExtension, isSessionValid, createSession, hashToken (+2 more)

### Community 59 - "App-Konfiguration"
Cohesion: 0.25
Nodes (9): Instanzkonfiguration (appConfig), app.config.ts (dynamische Expo-Config), mitRouterOrigin() expo-router origin, babel.config.js (babel-preset-expo), scripts/build.js (Expo-Update-Build), metro.config.js Monorepo-Aufloesung, Landingpage-Auslieferung, Manifest-Route (expo-platform Header) (+1 more)

### Community 60 - "Freischaltungs-Tests"
Cohesion: 0.22
Nodes (4): actors, dbMock, FakeUserRow, fakeUsers

### Community 61 - "App-Konfig (app.config)"
Cohesion: 0.22
Nodes (6): appName, basis, bundleId, domain, PluginEntry, themeColor

### Community 62 - "News-Screen"
Cohesion: 0.25
Nodes (6): NewsStatus, categoryConfig(), Filter, NewsCard(), NewsCardProps, styles

### Community 63 - "Backend-Konfiguration"
Cohesion: 0.32
Nodes (7): allowedOrigins, authRelayBaseUrl, fehlend, lies(), pflicht(), pflichtOrigins(), url

### Community 64 - "Einstellungen-Screen"
Cohesion: 0.36
Nodes (6): AppTheme, AuthIdentityInfo, formatFullName(), formatName(), SettingsScreen(), styles

### Community 65 - "Web-Assets-Generator"
Cohesion: 0.32
Nodes (6): ersetze(), fs, main(), path, pflicht(), projectRoot

### Community 66 - "App-Icons und Assets"
Cohesion: 0.61
Nodes (8): App Icon - Green Medical Cross (1024x1024), Apple Touch Icon (180x180), PWA Icon 192x192, PWA Icon 512x512, Splash Screen Icon - Green Medical Cross (1024x1024), Green Medical Cross Brand Mark, Mint Wave Motif, PWA / Web Icon Set

### Community 67 - "DB-Drift-Skript"
Cohesion: 0.29
Nodes (7): dateiListe(), DRIZZLE_KIT, HIER, main(), ORIGINAL_DRIZZLE, ROOT, SCHEMA_PFAD

### Community 68 - "Benachrichtigungen App"
Cohesion: 0.29
Nodes (7): ApiService.getNotifications, ApiService.markAllNotificationsRead, ApiService.restoreSession, Root Layout / Auth Guard Stack, registerForPushNotificationsAsync, Notifications Tab, useAppStore (Zustand)

### Community 69 - "App-Bootstrap-Tests"
Cohesion: 0.29
Nodes (3): app, generalLimiter, config

### Community 70 - "Server-Start und Jobs"
Cohesion: 0.33
Nodes (4): startScheduler(), tick(), envPath, port

### Community 71 - "Profil- und Rollen-Logs"
Cohesion: 0.29
Nodes (5): logProfileChangeTx(), ProfileChangeEntry, logRoleChangeTx(), RoleChangeEntry, Tx

### Community 72 - "Auth-Guards"
Cohesion: 0.33
Nodes (7): authenticate (Middleware-Kern), requireAuth, requireAuthAllowUnconfirmedProfile, requireAuthForLogout, requireAuthForPasswordChange, requirePermission, signToken / verifyToken (JWT_SECRET)

### Community 73 - "DB-Archiv Vorgrundlinie"
Cohesion: 0.29
Nodes (6): duty_entries, loa_requests, missions, news, notifications, users

### Community 74 - "ApiService-LOA"
Cohesion: 0.33
Nodes (6): ApiService.appealLOA, ApiService.approveLOA, ApiService.createLOA, ApiService.getLOARequests, ApiService.rejectLOA, LOA Tab

### Community 75 - "Web-Push App"
Cohesion: 0.60
Nodes (5): enableWebPush(), isStandalone(), urlBase64ToUint8Array(), webPushState(), webPushSupported()

### Community 76 - "Generierte API-Typen"
Cohesion: 0.33
Nodes (2): HealthCheckResponse, HealthStatus

### Community 77 - "Lokales Passwort und Mail"
Cohesion: 0.33
Nodes (6): createOneTimePassword, hashPassword (bcrypt cost 12), assertMailerConfig, authLink, sendMail, Nodemailer-Transport (lazy, TLS erzwungen)

### Community 78 - "Backend-Build"
Cohesion: 0.40
Nodes (3): allowlist, __dirname, __filename

### Community 79 - "Orval-API-Generierung"
Cohesion: 0.40
Nodes (3): apiClientReactSrc, apiZodSrc, root

### Community 80 - "ApiService-Fetch und Store"
Cohesion: 0.40
Nodes (4): apiFetch() mit 401-Abmeldung, AuthError mit Join-Code-Handoff, ApiService (Backend-Client), logout() Zustandsreset

### Community 81 - "Metro-Konfiguration"
Cohesion: 0.40
Nodes (4): config, { getDefaultConfig }, path, workspaceRoot

### Community 82 - "Dokumentation"
Cohesion: 0.40
Nodes (5): CHANGELOG, OpenAPI-Spezifikation der API, pnpm-Workspace-Konfiguration, README Installer, Projekt-README SchulSaniApp

### Community 83 - "Dismissals und Benachrichtigung"
Cohesion: 0.50
Nodes (5): addDismissal / removeDismissal, getDismissedFor, createNotificationForMultipleUsers, notifyOnDutyUsers, notifySanitaeters

### Community 84 - "Wave-Hintergrund"
Cohesion: 0.67
Nodes (3): adjustColor(), WaveBackground(), WaveBackgroundProps

### Community 85 - "Rollen-Migration"
Cohesion: 0.67
Nodes (3): public.roles, role_permissions, roles

### Community 86 - "Vitest-Konfiguration"
Cohesion: 0.67
Nodes (2): hier, testUmgebung

### Community 87 - "404-Screen"
Cohesion: 0.67
Nodes (1): styles

### Community 88 - "Keyboard-Aware-Scroll"
Cohesion: 0.67
Nodes (1): Props

### Community 89 - "Ben-Parker-Migration"
Cohesion: 1.00
Nodes (2): public.users, user_identities

### Community 90 - "ErrorBoundary und Theme"
Cohesion: 0.67
Nodes (3): ErrorBoundary, ErrorFallback, getTheme

### Community 91 - "Glossar und Uebersetzung"
Cohesion: 0.67
Nodes (3): applyGlossary, translateText (LibreTranslate), translateToLanguages

### Community 92 - "DB-Pool"
Cohesion: 0.67
Nodes (2): db, pool

### Community 93 - "Nutzer-Modelle und Rechte"
Cohesion: 0.67
Nodes (3): RoleInfo / PermissionDef, User (Modell), has(permission)

### Community 94 - "Farbpalette"
Cohesion: 1.00
Nodes (1): Colors

### Community 95 - "Service-Worker"
Cohesion: 1.00
Nodes (1): data

### Community 96 - "Rollenprotokoll-Migration"
Cohesion: 1.00
Nodes (1): role_change_log

### Community 97 - "Namensbestaetigungs-Migration"
Cohesion: 1.00
Nodes (1): profile_change_log

### Community 98 - "Sessions-Archiv"
Cohesion: 1.00
Nodes (1): sessions

### Community 99 - "Healthstatus-Typen"
Cohesion: 1.00
Nodes (1): HealthStatus

### Community 100 - "Instanzbild-README"
Cohesion: 1.00
Nodes (2): README instanzspezifische Bilder, README instanzspezifische PWA-Icons

### Community 101 - "Rollenberechtigungs-Abfragen"
Cohesion: 1.00
Nodes (2): getRolePermissions, roleHasPermission

### Community 103 - "AuthButton"
Cohesion: 1.00
Nodes (1): AuthButton

### Community 104 - "AuthLink"
Cohesion: 1.00
Nodes (1): AuthLink

### Community 105 - "AuthMessage"
Cohesion: 1.00
Nodes (1): AuthMessage

### Community 106 - "Landing-Page-Template"
Cohesion: 1.00
Nodes (1): Expo-Go Landing-Page-Template

### Community 114 - "Drizzle-Archiv-Doku"
Cohesion: 1.00
Nodes (1): Archiv der Migrationen vor der Grundlinie

### Community 115 - "DB-Konsolen-Ergebnis"
Cohesion: 1.00
Nodes (1): SqlPreset / DbConsoleResult

### Community 116 - "Einsatzbericht-Modell"
Cohesion: 1.00
Nodes (1): IncidentReport (Modell)

### Community 117 - "Datensicherungs-Doku"
Cohesion: 1.00
Nodes (1): README Datensicherung

### Community 118 - "Relay-Doku"
Cohesion: 1.00
Nodes (1): README Callback-Relay

### Community 119 - "Release-Hilfsmittel"
Cohesion: 1.00
Nodes (1): Release-Skript (scripts/release.mjs)

### Community 120 - "Hello-Skript"
Cohesion: 1.00
Nodes (1): @workspace/scripts Platzhalter

### Community 122 - "Installer-Wizard"
Cohesion: 1.00
Nodes (1): Einrichtungsassistent Wizard-Oberflaeche

## Ambiguous Edges - Review These
- `Migration 0006 Rollen zusammenfuehren` → `Tabelle role_change_log`  [AMBIGUOUS]
  lib/db/drizzle/0006_rollen_zusammenfuehren.sql · relation: conceptually_related_to
- `Migration 0009 Benutzeridentitaeten` → `Migration 0007 Namensbestaetigung`  [AMBIGUOUS]
  lib/db/drizzle/0009_equal_ben_parker.sql · relation: references
- `Archiv 0001 incident_reports_admin View` → `Tabelle incident_reports`  [AMBIGUOUS]
  lib/db/archiv/drizzle-vor-grundlinie/0001_incident_reports_admin_view.sql · relation: references
- `PWA Icon 512x512` → `App Icon - Green Medical Cross (1024x1024)`  [AMBIGUOUS]
  artifacts/paramedic-app/assets/images/icon.png · relation: conceptually_related_to
- `validateProfileName` → `PERMISSIONS (Rechtekatalog)`  [AMBIGUOUS]
  artifacts/api-server/src/lib/profileName.ts · relation: conceptually_related_to
- `revokeAllSessionsForUser` → `assertAdminReachable`  [AMBIGUOUS]
  artifacts/api-server/src/lib/sessions.ts · relation: conceptually_related_to
- `buildAll (esbuild-Bundle)` → `guardStatement`  [AMBIGUOUS]
  artifacts/api-server/build.ts · relation: conceptually_related_to
- `seedRoles` → `Benutzer-/Rollen-Cache-Invalidierung`  [AMBIGUOUS]
  artifacts/api-server/src/scripts/seedRoles.ts · relation: conceptually_related_to
- `getDismissedFor` → `notifyOnDutyUsers`  [AMBIGUOUS]
  artifacts/api-server/src/data/dismissals.ts · relation: conceptually_related_to
- `Settings Tab` → `Activity Log Screen`  [AMBIGUOUS]
  artifacts/paramedic-app/app/activity-log.tsx · relation: references
- `Settings Tab` → `Admin Sani Activity Screen`  [AMBIGUOUS]
  artifacts/paramedic-app/app/(tabs)/settings.tsx · relation: references
- `DatePickerField` → `useAppStore`  [AMBIGUOUS]
  artifacts/paramedic-app/components/DatePickerField.tsx · relation: references
- `Incident Report Editor Screen` → `KeyboardAwareScrollViewCompat`  [AMBIGUOUS]
  artifacts/paramedic-app/app/report/[id].tsx · relation: semantically_similar_to
- `WaveBackground` → `AuthShell`  [AMBIGUOUS]
  artifacts/paramedic-app/components/WaveBackground.tsx · relation: conceptually_related_to
- `lib/dialog (notify, confirmAction)` → `t(path, lang)`  [AMBIGUOUS]
  artifacts/paramedic-app/lib/dialog.ts · relation: conceptually_related_to
- `Tabelle incident_reports` → `Tabelle device_tokens`  [AMBIGUOUS]
  lib/db/src/schema/index.ts · relation: conceptually_related_to

## Knowledge Gaps
- **628 isolated node(s):** `__filename`, `__dirname`, `allowlist`, `app`, `generalLimiter` (+623 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Push-Notification-Service App`** (2 nodes): `registerForPushNotificationsAsync()`, `requestNotificationPermissions()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Generierte API-Typen`** (2 nodes): `HealthCheckResponse`, `HealthStatus`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vitest-Konfiguration`** (2 nodes): `hier`, `testUmgebung`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `404-Screen`** (1 nodes): `styles`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Keyboard-Aware-Scroll`** (1 nodes): `Props`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Ben-Parker-Migration`** (2 nodes): `public.users`, `user_identities`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `DB-Pool`** (2 nodes): `db`, `pool`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Farbpalette`** (1 nodes): `Colors`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Service-Worker`** (1 nodes): `data`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rollenprotokoll-Migration`** (1 nodes): `role_change_log`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Namensbestaetigungs-Migration`** (1 nodes): `profile_change_log`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Sessions-Archiv`** (1 nodes): `sessions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Healthstatus-Typen`** (1 nodes): `HealthStatus`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Instanzbild-README`** (2 nodes): `README instanzspezifische Bilder`, `README instanzspezifische PWA-Icons`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rollenberechtigungs-Abfragen`** (2 nodes): `getRolePermissions`, `roleHasPermission`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `AuthButton`** (1 nodes): `AuthButton`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `AuthLink`** (1 nodes): `AuthLink`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `AuthMessage`** (1 nodes): `AuthMessage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Landing-Page-Template`** (1 nodes): `Expo-Go Landing-Page-Template`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Drizzle-Archiv-Doku`** (1 nodes): `Archiv der Migrationen vor der Grundlinie`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `DB-Konsolen-Ergebnis`** (1 nodes): `SqlPreset / DbConsoleResult`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Einsatzbericht-Modell`** (1 nodes): `IncidentReport (Modell)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Datensicherungs-Doku`** (1 nodes): `README Datensicherung`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Relay-Doku`** (1 nodes): `README Callback-Relay`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Release-Hilfsmittel`** (1 nodes): `Release-Skript (scripts/release.mjs)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Hello-Skript`** (1 nodes): `@workspace/scripts Platzhalter`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Installer-Wizard`** (1 nodes): `Einrichtungsassistent Wizard-Oberflaeche`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Migration 0006 Rollen zusammenfuehren` and `Tabelle role_change_log`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Migration 0009 Benutzeridentitaeten` and `Migration 0007 Namensbestaetigung`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Archiv 0001 incident_reports_admin View` and `Tabelle incident_reports`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `PWA Icon 512x512` and `App Icon - Green Medical Cross (1024x1024)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `validateProfileName` and `PERMISSIONS (Rechtekatalog)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `revokeAllSessionsForUser` and `assertAdminReachable`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `buildAll (esbuild-Bundle)` and `guardStatement`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._