# Server-Start und Jobs

> 7 nodes

## Key Concepts

- **index.ts** (5 connections) — `artifacts/api-server/src/index.ts`
- **scheduler.ts** (5 connections) — `artifacts/api-server/src/jobs/scheduler.ts`
- **startScheduler()** (2 connections) — `artifacts/api-server/src/jobs/scheduler.ts`
- **tick()** (2 connections) — `artifacts/api-server/src/jobs/scheduler.ts`
- **envPath** (1 connections) — `artifacts/api-server/src/index.ts`
- **main()** (1 connections) — `artifacts/api-server/src/index.ts`
- **port** (1 connections) — `artifacts/api-server/src/index.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/jobs/scheduler.ts`

## Audit Trail

- EXTRACTED: 17 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*