# App-Konfiguration

> 9 nodes

## Key Concepts

- **Instanzkonfiguration (appConfig)** (3 connections) — `artifacts/paramedic-app/constants/appConfig.ts`
- **app.config.ts (dynamische Expo-Config)** (3 connections) — `artifacts/paramedic-app/app.config.ts`
- **metro.config.js Monorepo-Aufloesung** (3 connections) — `artifacts/paramedic-app/metro.config.js`
- **server/serve.js (Update-Server)** (3 connections) — `artifacts/paramedic-app/server/serve.js`
- **scripts/build.js (Expo-Update-Build)** (2 connections) — `artifacts/paramedic-app/scripts/build.js`
- **Manifest-Route (expo-platform Header)** (2 connections) — `artifacts/paramedic-app/server/serve.js`
- **mitRouterOrigin() expo-router origin** (1 connections) — `artifacts/paramedic-app/app.config.ts`
- **babel.config.js (babel-preset-expo)** (1 connections) — `artifacts/paramedic-app/babel.config.js`
- **Landingpage-Auslieferung** (1 connections) — `artifacts/paramedic-app/server/serve.js`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/paramedic-app/app.config.ts`
- `artifacts/paramedic-app/babel.config.js`
- `artifacts/paramedic-app/constants/appConfig.ts`
- `artifacts/paramedic-app/metro.config.js`
- `artifacts/paramedic-app/scripts/build.js`
- `artifacts/paramedic-app/server/serve.js`

## Audit Trail

- EXTRACTED: 6 (32%)
- INFERRED: 13 (68%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*