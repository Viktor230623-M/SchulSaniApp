# Lokaler Auth-Provider

> 12 nodes

## Key Concepts

- **local.ts** (10 connections) — `artifacts/api-server/src/auth/providers/local.ts`
- **local.test.ts** (6 connections) — `artifacts/api-server/src/auth/providers/local.test.ts`
- **PasswordAuthProvider** (3 connections) — `artifacts/api-server/src/auth/types.ts`
- **createLocalProvider()** (3 connections) — `artifacts/api-server/src/auth/providers/local.ts`
- **hashPassword()** (2 connections) — `artifacts/api-server/src/auth/providers/local.ts`
- **createOneTimePassword()** (1 connections) — `artifacts/api-server/src/auth/providers/local.ts`
- **DUMMY_HASH** (1 connections) — `artifacts/api-server/src/auth/providers/local.ts`
- **LocalProviderConfig** (1 connections) — `artifacts/api-server/src/auth/providers/local.ts`
- **existingUser** (1 connections) — `artifacts/api-server/src/auth/providers/local.test.ts`
- **existingUserHash** (1 connections) — `artifacts/api-server/src/auth/providers/local.test.ts`
- **mockRows** (1 connections) — `artifacts/api-server/src/auth/providers/local.test.ts`
- **provider** (1 connections) — `artifacts/api-server/src/auth/providers/local.test.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/api-server/src/auth/providers/local.test.ts`
- `artifacts/api-server/src/auth/providers/local.ts`
- `artifacts/api-server/src/auth/types.ts`

## Audit Trail

- EXTRACTED: 31 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*