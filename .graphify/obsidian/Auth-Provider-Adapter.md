# Auth-Provider-Adapter

> 15 nodes

## Key Concepts

- **createLocalProvider** (7 connections) — `artifacts/api-server/src/auth/providers/local.ts`
- **createOidcRedirectProvider** (7 connections) — `artifacts/api-server/src/auth/providers/oidc.ts`
- **completeRedirect** (4 connections) — `artifacts/api-server/src/auth/providers/oidc.ts`
- **buildProvider** (4 connections) — `artifacts/api-server/src/auth/registry.ts`
- **AuthResult Projection** (3 connections) — `artifacts/api-server/src/auth/types.ts`
- **verifyNativeToken (Apple nativ)** (2 connections) — `artifacts/api-server/src/auth/providers/oidc.ts`
- **Test: oidc-provider-tests** (2 connections) — `artifacts/api-server/src/auth/providers/oidc.test.ts`
- **loadAuthProviders** (2 connections) — `artifacts/api-server/src/auth/registry.ts`
- **Test: local-provider-tests** (1 connections) — `artifacts/api-server/src/auth/providers/local.test.ts`
- **beginRedirect** (1 connections) — `artifacts/api-server/src/auth/providers/oidc.ts`
- **AuthRelaySettings** (1 connections) — `artifacts/api-server/src/auth/registry.ts`
- **Test: Auth-Provider-Registry** (1 connections) — `artifacts/api-server/src/auth/registry.test.ts`
- **AuthProfile** (1 connections) — `artifacts/api-server/src/auth/types.ts`
- **PasswordAuthProvider (type: local)** (1 connections) — `artifacts/api-server/src/auth/types.ts`
- **RedirectAuthProvider (type: oidc-redirect)** (1 connections) — `artifacts/api-server/src/auth/types.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/api-server/src/auth/providers/local.test.ts`
- `artifacts/api-server/src/auth/providers/local.ts`
- `artifacts/api-server/src/auth/providers/oidc.test.ts`
- `artifacts/api-server/src/auth/providers/oidc.ts`
- `artifacts/api-server/src/auth/registry.test.ts`
- `artifacts/api-server/src/auth/registry.ts`
- `artifacts/api-server/src/auth/types.ts`

## Audit Trail

- EXTRACTED: 30 (79%)
- INFERRED: 8 (21%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*