# Session-Regel-Tests

> 10 nodes

## Key Concepts

- **sessionRules Tests** (4 connections) — `artifacts/api-server/src/lib/sessionRules.test.ts`
- **computeNewSession** (4 connections) — `artifacts/api-server/src/lib/sessionRules.ts`
- **resolveSession** (4 connections) — `artifacts/api-server/src/lib/sessions.ts`
- **ABSOLUTE_LIFETIME_MS (180 Tage)** (3 connections) — `artifacts/api-server/src/lib/sessionRules.ts`
- **computeSlidingExtension** (3 connections) — `artifacts/api-server/src/lib/sessionRules.ts`
- **isSessionValid** (3 connections) — `artifacts/api-server/src/lib/sessionRules.ts`
- **hashToken** (3 connections) — `artifacts/api-server/src/lib/sessions.ts`
- **createSession** (2 connections) — `artifacts/api-server/src/lib/sessions.ts`
- **revokeSession** (2 connections) — `artifacts/api-server/src/lib/sessions.ts`
- **SLIDING_WINDOW_MS (30 Tage)** (1 connections) — `artifacts/api-server/src/lib/sessionRules.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/api-server/src/lib/sessionRules.test.ts`
- `artifacts/api-server/src/lib/sessionRules.ts`
- `artifacts/api-server/src/lib/sessions.ts`

## Audit Trail

- EXTRACTED: 24 (83%)
- INFERRED: 5 (17%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*