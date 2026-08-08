# ApiService-Fetch und Store

> 5 nodes

## Key Concepts

- **ApiService (Backend-Client)** (4 connections) — `artifacts/paramedic-app/services/ApiService.ts`
- **apiFetch() mit 401-Abmeldung** (3 connections) — `artifacts/paramedic-app/services/ApiService.ts`
- **AuthError mit Join-Code-Handoff** (1 connections) — `artifacts/paramedic-app/services/ApiService.ts`
- **registerForPushNotificationsAsync()** (1 connections) — `artifacts/paramedic-app/services/PushNotificationService.ts`
- **logout() Zustandsreset** (1 connections) — `artifacts/paramedic-app/store/useAppStore.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/paramedic-app/services/ApiService.ts`
- `artifacts/paramedic-app/services/PushNotificationService.ts`
- `artifacts/paramedic-app/store/useAppStore.ts`

## Audit Trail

- EXTRACTED: 10 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*