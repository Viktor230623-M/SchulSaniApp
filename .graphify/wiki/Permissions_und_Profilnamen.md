# Permissions und Profilnamen

> 14 nodes

## Key Concepts

- **RetentionCutoffs (Fristen)** (8 connections) — `artifacts/api-server/src/lib/retentionRules.ts`
- **logProfileChangeTx** (5 connections) — `artifacts/api-server/src/lib/profileChangeLog.ts`
- **PERMISSIONS (Rechtekatalog)** (4 connections) — `artifacts/api-server/src/lib/permissions.ts`
- **logRoleChangeTx** (4 connections) — `artifacts/api-server/src/lib/roleChangeLog.ts`
- **assertAdminReachable** (4 connections) — `artifacts/api-server/src/lib/rolePermissions.ts`
- **logReportAccess** (3 connections) — `artifacts/api-server/src/lib/reportAccessLog.ts`
- **computeCutoffs** (3 connections) — `artifacts/api-server/src/lib/retentionRules.ts`
- **Tx (Transaktionsobjekt)** (3 connections) — `artifacts/api-server/src/lib/rolePermissions.ts`
- **ESSENTIAL_PERMISSIONS** (2 connections) — `artifacts/api-server/src/lib/permissions.ts`
- **validateProfileName** (2 connections) — `artifacts/api-server/src/lib/profileName.ts`
- **retentionRules Tests** (2 connections) — `artifacts/api-server/src/lib/retentionRules.test.ts`
- **isValidPermission** (1 connections) — `artifacts/api-server/src/lib/permissions.ts`
- **LockoutError** (1 connections) — `artifacts/api-server/src/lib/rolePermissions.ts`
- **revokeAllSessionsForUser** (1 connections) — `artifacts/api-server/src/lib/sessions.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/api-server/src/lib/permissions.ts`
- `artifacts/api-server/src/lib/profileChangeLog.ts`
- `artifacts/api-server/src/lib/profileName.ts`
- `artifacts/api-server/src/lib/reportAccessLog.ts`
- `artifacts/api-server/src/lib/retentionRules.test.ts`
- `artifacts/api-server/src/lib/retentionRules.ts`
- `artifacts/api-server/src/lib/roleChangeLog.ts`
- `artifacts/api-server/src/lib/rolePermissions.ts`
- `artifacts/api-server/src/lib/sessions.ts`

## Audit Trail

- EXTRACTED: 20 (47%)
- INFERRED: 19 (44%)
- AMBIGUOUS: 4 (9%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*