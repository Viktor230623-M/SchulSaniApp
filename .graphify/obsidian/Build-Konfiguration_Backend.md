# Build-Konfiguration Backend

> 16 nodes

## Key Concepts

- **guardStatement** (10 connections) — `artifacts/api-server/src/lib/sqlGuard.ts`
- **guardPatientData** (6 connections) — `artifacts/api-server/src/lib/sqlGuard.ts`
- **vitest.config (Testumgebung)** (5 connections) — `artifacts/api-server/vitest.config.ts`
- **SQL_PRESETS** (5 connections) — `artifacts/api-server/src/lib/sqlPresets.ts`
- **PROTECTED_TABLE (incident_reports)** (4 connections) — `artifacts/api-server/src/lib/patientColumns.ts`
- **sqlGuard Tests** (4 connections) — `artifacts/api-server/src/lib/sqlGuard.test.ts`
- **ADMIN_VIEW (incident_reports_admin)** (3 connections) — `artifacts/api-server/src/lib/patientColumns.ts`
- **PATIENT_COLUMNS** (2 connections) — `artifacts/api-server/src/lib/patientColumns.ts`
- **GuardResult (Datenform)** (2 connections) — `artifacts/api-server/src/lib/sqlGuard.ts`
- **buildAll (esbuild-Bundle)** (1 connections) — `artifacts/api-server/build.ts`
- **FORBIDDEN_FUNCTIONS** (1 connections) — `artifacts/api-server/src/lib/sqlGuard.ts`
- **FORBIDDEN_VERBS** (1 connections) — `artifacts/api-server/src/lib/sqlGuard.ts`
- **countStatements** (1 connections) — `artifacts/api-server/src/lib/sqlGuard.ts`
- **maskLiterals** (1 connections) — `artifacts/api-server/src/lib/sqlGuard.ts`
- **stripComments** (1 connections) — `artifacts/api-server/src/lib/sqlGuard.ts`
- **placeholdersOf** (1 connections) — `artifacts/api-server/src/lib/sqlPresets.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/api-server/build.ts`
- `artifacts/api-server/src/lib/patientColumns.ts`
- `artifacts/api-server/src/lib/sqlGuard.test.ts`
- `artifacts/api-server/src/lib/sqlGuard.ts`
- `artifacts/api-server/src/lib/sqlPresets.ts`
- `artifacts/api-server/vitest.config.ts`

## Audit Trail

- EXTRACTED: 34 (71%)
- INFERRED: 12 (25%)
- AMBIGUOUS: 2 (4%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*