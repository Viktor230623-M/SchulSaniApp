# Benachrichtigungen App

> 7 nodes

## Key Concepts

- **useAppStore (Zustand)** (5 connections) — `artifacts/paramedic-app/store/useAppStore.ts`
- **Root Layout / Auth Guard Stack** (4 connections) — `artifacts/paramedic-app/app/_layout.tsx`
- **Notifications Tab** (4 connections) — `artifacts/paramedic-app/app/(tabs)/notifications.tsx`
- **registerForPushNotificationsAsync** (2 connections) — `artifacts/paramedic-app/services/PushNotificationService.ts`
- **ApiService.getNotifications** (1 connections) — `artifacts/paramedic-app/services/ApiService.ts`
- **ApiService.markAllNotificationsRead** (1 connections) — `artifacts/paramedic-app/services/ApiService.ts`
- **ApiService.restoreSession** (1 connections) — `artifacts/paramedic-app/services/ApiService.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/paramedic-app/app/(tabs)/notifications.tsx`
- `artifacts/paramedic-app/app/_layout.tsx`
- `artifacts/paramedic-app/services/ApiService.ts`
- `artifacts/paramedic-app/services/PushNotificationService.ts`
- `artifacts/paramedic-app/store/useAppStore.ts`

## Audit Trail

- EXTRACTED: 15 (83%)
- INFERRED: 3 (17%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*