# API-Client und OpenAPI

> 12 nodes

## Key Concepts

- **OpenAPI Spec (openapi.yaml)** (5 connections) — `lib/api-spec/orval.config.ts`
- **Generierter React-Query-Client** (4 connections) — `lib/api-client-react/src/generated/api.ts`
- **customFetch (Orval-Mutator)** (4 connections) — `lib/api-client-react/src/custom-fetch.ts`
- **Generierte Zod-Schemas** (3 connections) — `lib/api-zod/src/generated/api.ts`
- **Generierte TS-Typen des React-Clients** (2 connections) — `lib/api-client-react/src/generated/api.schemas.ts`
- **Orval Codegen Config** (2 connections) — `lib/api-spec/orval.config.ts`
- **api-client-react Paket-Einstieg** (1 connections) — `lib/api-client-react/src/index.ts`
- **ApiError** (1 connections) — `lib/api-client-react/src/custom-fetch.ts`
- **api-zod Paket-Einstieg** (1 connections) — `lib/api-zod/src/index.ts`
- **Generierte Zod-Typen (types/)** (1 connections) — `lib/api-zod/src/generated/types/index.ts`
- **HealthStatus** (1 connections) — `lib/api-zod/src/generated/types/healthStatus.ts`
- **ResponseParseError** (1 connections) — `lib/api-client-react/src/custom-fetch.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `lib/api-client-react/src/custom-fetch.ts`
- `lib/api-client-react/src/generated/api.schemas.ts`
- `lib/api-client-react/src/generated/api.ts`
- `lib/api-client-react/src/index.ts`
- `lib/api-spec/orval.config.ts`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/generated/types/healthStatus.ts`
- `lib/api-zod/src/generated/types/index.ts`
- `lib/api-zod/src/index.ts`

## Audit Trail

- EXTRACTED: 22 (85%)
- INFERRED: 4 (15%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*