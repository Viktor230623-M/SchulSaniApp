# Profil- und Rollen-Logs

> 7 nodes

## Key Concepts

- **roleChangeLog.ts** (6 connections) — `artifacts/api-server/src/lib/roleChangeLog.ts`
- **profileChangeLog.ts** (5 connections) — `artifacts/api-server/src/lib/profileChangeLog.ts`
- **logRoleChangeTx()** (3 connections) — `artifacts/api-server/src/lib/roleChangeLog.ts`
- **Tx** (3 connections) — `artifacts/api-server/src/lib/rolePermissions.ts`
- **logProfileChangeTx()** (2 connections) — `artifacts/api-server/src/lib/profileChangeLog.ts`
- **ProfileChangeEntry** (1 connections) — `artifacts/api-server/src/lib/profileChangeLog.ts`
- **RoleChangeEntry** (1 connections) — `artifacts/api-server/src/lib/roleChangeLog.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/api-server/src/lib/profileChangeLog.ts`
- `artifacts/api-server/src/lib/roleChangeLog.ts`
- `artifacts/api-server/src/lib/rolePermissions.ts`

## Audit Trail

- EXTRACTED: 21 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*