# Benachrichtigungs-Service Backend

> 10 nodes

## Key Concepts

- **sendPushNotification** (6 connections) — `artifacts/api-server/src/services/notifications.ts`
- **createNotification** (3 connections) — `artifacts/api-server/src/services/notifications.ts`
- **runRetention** (3 connections) — `artifacts/api-server/src/jobs/retention.ts`
- **sendWebPush** (3 connections) — `artifacts/api-server/src/lib/webPush.ts`
- **sendExpoPushMessages (Chunks zu 100)** (2 connections) — `artifacts/api-server/src/services/notifications.ts`
- **scheduler tick** (2 connections) — `artifacts/api-server/src/jobs/scheduler.ts`
- **notifyUser** (1 connections) — `artifacts/api-server/src/services/notifications.ts`
- **saveDeviceToken / removeDeviceToken** (1 connections) — `artifacts/api-server/src/services/notifications.ts`
- **startScheduler** (1 connections) — `artifacts/api-server/src/jobs/scheduler.ts`
- **ensureConfigured (VAPID)** (1 connections) — `artifacts/api-server/src/lib/webPush.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/api-server/src/jobs/retention.ts`
- `artifacts/api-server/src/jobs/scheduler.ts`
- `artifacts/api-server/src/lib/webPush.ts`
- `artifacts/api-server/src/services/notifications.ts`

## Audit Trail

- EXTRACTED: 16 (70%)
- INFERRED: 7 (30%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*