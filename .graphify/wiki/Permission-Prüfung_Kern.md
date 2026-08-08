# Permission-Prüfung Kern

> 10 nodes

## Key Concepts

- **loadRolePermissions** (6 connections) — `artifacts/api-server/src/lib/rolePermissions.ts`
- **rolePermissions Tests (CWE-863)** (5 connections) — `artifacts/api-server/src/lib/rolePermissions.test.ts`
- **getLiveUser (60s-Cache)** (4 connections) — `artifacts/api-server/src/middlewares/auth.ts`
- **Permission Matrix Test (Rolle x Endpunkt)** (4 connections) — `artifacts/api-server/src/lib/permissionMatrix.test.ts`
- **DEFAULT_ROLE_PERMISSIONS** (4 connections) — `artifacts/api-server/src/lib/permissions.ts`
- **permissionsForRole** (4 connections) — `artifacts/api-server/src/lib/rolePermissions.ts`
- **invalidateRolePermissions** (3 connections) — `artifacts/api-server/src/lib/rolePermissions.ts`
- **Benutzer-/Rollen-Cache-Invalidierung** (2 connections) — `artifacts/api-server/src/middlewares/auth.ts`
- **hasPermission (statisch)** (2 connections) — `artifacts/api-server/src/lib/permissions.ts`
- **seedRoles** (2 connections) — `artifacts/api-server/src/scripts/seedRoles.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/api-server/src/lib/permissionMatrix.test.ts`
- `artifacts/api-server/src/lib/permissions.ts`
- `artifacts/api-server/src/lib/rolePermissions.test.ts`
- `artifacts/api-server/src/lib/rolePermissions.ts`
- `artifacts/api-server/src/middlewares/auth.ts`
- `artifacts/api-server/src/scripts/seedRoles.ts`

## Audit Trail

- EXTRACTED: 23 (64%)
- INFERRED: 11 (31%)
- AMBIGUOUS: 2 (6%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*