# DB-Archiv und Constraints

> 58 nodes

## Key Concepts

- **Migration 0000 Grundlinie** (29 connections) — `lib/db/drizzle/0000_grundlinie.sql`
- **Drizzle-Schema (Gesamtdatei)** (23 connections) — `lib/db/src/schema/index.ts`
- **Tabelle users** (22 connections) — `lib/db/drizzle/0000_grundlinie.sql`
- **Tabelle missions** (9 connections) — `lib/db/drizzle/0000_grundlinie.sql`
- **Tabelle incident_reports** (8 connections) — `lib/db/drizzle/0000_grundlinie.sql`
- **Tabelle notifications** (8 connections) — `lib/db/drizzle/0000_grundlinie.sql`
- **Tabelle role_change_log** (8 connections) — `lib/db/drizzle/0003_rollenprotokoll_migration.sql`
- **Tabelle sessions** (8 connections) — `lib/db/drizzle/0000_grundlinie.sql`
- **Migration 0004 Anmeldeweg und Subjekt** (7 connections) — `lib/db/drizzle/0004_anmeldeweg_und_subjekt.sql`
- **Migration 0006 Rollen zusammenfuehren** (7 connections) — `lib/db/drizzle/0006_rollen_zusammenfuehren.sql`
- **Tabelle roles** (7 connections) — `lib/db/drizzle/0002_rollen_und_rechte.sql`
- **Enum user_role** (6 connections) — `lib/db/drizzle/0000_grundlinie.sql`
- **Tabelle loa** (6 connections) — `lib/db/drizzle/0000_grundlinie.sql`
- **Tabelle news** (6 connections) — `lib/db/drizzle/0000_grundlinie.sql`
- **Tabelle user_identities** (6 connections) — `lib/db/drizzle/0009_equal_ben_parker.sql`
- **Eigentuemer-Bootstrap (upsertOwner)** (5 connections) — `ops/install/assistant/server.js`
- **Migration 0002 Rollen und Rechte** (5 connections) — `lib/db/drizzle/0002_rollen_und_rechte.sql`
- **Tabelle duty** (5 connections) — `lib/db/drizzle/0000_grundlinie.sql`
- **Tabelle role_permissions** (5 connections) — `lib/db/drizzle/0002_rollen_und_rechte.sql`
- **Migration 0001 Sicht und Kommentare** (4 connections) — `lib/db/drizzle/0001_sicht_und_kommentare.sql`
- **Migration 0007 Namensbestaetigung** (4 connections) — `lib/db/drizzle/0007_namensbestaetigung.sql`
- **Migration 0009 Benutzeridentitaeten** (4 connections) — `lib/db/drizzle/0009_equal_ben_parker.sql`
- **Tabelle db_console_log** (4 connections) — `lib/db/drizzle/0000_grundlinie.sql`
- **Tabelle device_tokens** (4 connections) — `lib/db/drizzle/0000_grundlinie.sql`
- **Tabelle profile_change_log** (4 connections) — `lib/db/drizzle/0007_namensbestaetigung.sql`
- *... and 33 more nodes in this community*

## Relationships

- No strong cross-community connections detected

## Source Files

- `lib/db/archiv/drizzle-vor-grundlinie/0000_natural_scream.sql`
- `lib/db/archiv/drizzle-vor-grundlinie/0001_incident_reports_admin_view.sql`
- `lib/db/archiv/drizzle-vor-grundlinie/0002_sessions.sql`
- `lib/db/archiv/drizzle-vor-grundlinie/0003_notification_types.sql`
- `lib/db/drizzle.config.ts`
- `lib/db/drizzle/0000_grundlinie.sql`
- `lib/db/drizzle/0001_sicht_und_kommentare.sql`
- `lib/db/drizzle/0002_rollen_und_rechte.sql`
- `lib/db/drizzle/0003_rollenprotokoll_migration.sql`
- `lib/db/drizzle/0004_anmeldeweg_und_subjekt.sql`
- `lib/db/drizzle/0005_pflichtwechsel_und_einmalpasswort.sql`
- `lib/db/drizzle/0006_rollen_zusammenfuehren.sql`
- `lib/db/drizzle/0007_namensbestaetigung.sql`
- `lib/db/drizzle/0009_equal_ben_parker.sql`
- `lib/db/scripts/drift.ts`
- `lib/db/src/index.ts`
- `lib/db/src/schema/index.ts`
- `ops/install/assistant/server.js`
- `ops/relay/server.js`

## Audit Trail

- EXTRACTED: 182 (65%)
- INFERRED: 92 (33%)
- AMBIGUOUS: 8 (3%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*