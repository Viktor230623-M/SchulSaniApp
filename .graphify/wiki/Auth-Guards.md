# Auth-Guards

> 7 nodes

## Key Concepts

- **authenticate (Middleware-Kern)** (6 connections) — `artifacts/api-server/src/middlewares/auth.ts`
- **requireAuth** (3 connections) — `artifacts/api-server/src/middlewares/auth.ts`
- **requireAuthForPasswordChange** (2 connections) — `artifacts/api-server/src/middlewares/auth.ts`
- **requirePermission** (2 connections) — `artifacts/api-server/src/middlewares/auth.ts`
- **signToken / verifyToken (JWT_SECRET)** (2 connections) — `artifacts/api-server/src/middlewares/auth.ts`
- **requireAuthAllowUnconfirmedProfile** (1 connections) — `artifacts/api-server/src/middlewares/auth.ts`
- **requireAuthForLogout** (1 connections) — `artifacts/api-server/src/middlewares/auth.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/api-server/src/middlewares/auth.ts`

## Audit Trail

- EXTRACTED: 11 (65%)
- INFERRED: 6 (35%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*