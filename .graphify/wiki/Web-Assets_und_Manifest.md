# Web-Assets und Manifest

> 10 nodes

## Key Concepts

- **generate-web-assets.js** (4 connections) — `artifacts/paramedic-app/scripts/generate-web-assets.js`
- **sw.template.js (Web-Push Service Worker)** (4 connections) — `artifacts/paramedic-app/public/sw.template.js`
- **WebPushService (Browser)** (4 connections) — `artifacts/paramedic-app/services/WebPushService.ts`
- **NotificationItem (Modell)** (3 connections) — `artifacts/paramedic-app/models/index.ts`
- **PushNotificationService (nativ)** (3 connections) — `artifacts/paramedic-app/services/PushNotificationService.ts`
- **public/sw.js (erzeugt)** (3 connections) — `artifacts/paramedic-app/public/sw.template.js`
- **public/manifest.json (erzeugt)** (2 connections) — `artifacts/paramedic-app/scripts/generate-web-assets.js`
- **enableWebPush()** (2 connections) — `artifacts/paramedic-app/services/WebPushService.ts`
- **Android-Benachrichtigungskanaele (default, high-priority)** (1 connections) — `artifacts/paramedic-app/services/PushNotificationService.ts`
- **webPushState() Zustandsdiagnose** (1 connections) — `artifacts/paramedic-app/services/WebPushService.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/paramedic-app/models/index.ts`
- `artifacts/paramedic-app/public/sw.template.js`
- `artifacts/paramedic-app/scripts/generate-web-assets.js`
- `artifacts/paramedic-app/services/PushNotificationService.ts`
- `artifacts/paramedic-app/services/WebPushService.ts`

## Audit Trail

- EXTRACTED: 16 (59%)
- INFERRED: 11 (41%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*