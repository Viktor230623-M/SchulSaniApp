# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Mobile**: Expo + Expo Router (React Native)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── paramedic-app/      # Expo mobile app (School Paramedic Manager)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Mobile App — School Paramedic Manager

Located at `artifacts/paramedic-app/`.

### Architecture: MVVM + Service Layer

- **Models** (`models/index.ts`): User, Mission, DutyStatus, NewsItem, NotificationItem, HolidayItem
- **Services** (`services/ApiService.ts`): Simulates REST API with mock data + async/await — ready for real backend
- **Context/ViewModel** (`context/AppContext.tsx`): Global state via React Context
- **Views** (`app/(tabs)/`): 5 screens — news, holidays, duty, missions, notifications

### API Endpoints (mock, ready to plug in real networking)

- `GET /user/me`
- `GET /missions`
- `POST /missions/:id/accept`
- `POST /missions/:id/reject`
- `GET /news`
- `POST /news/:id/read`
- `GET /holidays`
- `GET /notifications`
- `POST /notifications/read-all`
- `GET /status`
- `POST /status`

### Features

- Toggle duty status (On Duty / Off Duty) with haptic feedback
- Mission list with Accept/Reject actions
- Priority badges (High/Medium/Low)
- News with expandable cards, unread indicators
- Holidays with school/public filter tabs
- Notifications with mark-all-read
- Wave background patterns, green medical cross animation
- German/English localization system (`constants/i18n.ts`)
- NativeTabs with Liquid Glass support (iOS 26+)

### Language

- Localization via `constants/i18n.ts` — supports German (`de`) and English (`en`)
- Detects device language automatically
- All UI strings externalized as keys

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes in `src/routes/`.

### `artifacts/paramedic-app` (`@workspace/paramedic-app`)

Expo React Native mobile app for school paramedic management.

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI spec and Orval codegen config.

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from OpenAPI.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks from OpenAPI.
