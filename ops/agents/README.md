# Subagent-Spawner für Buffy (Freebuff)

Es gibt **zwei Wege**, damit Buffy Subagents spawnen kann — der native
(`~/.agents`, funktioniert jetzt) und der CLI-Weg (Claude-CLI, als Fallback).

---

## Weg 1 (NATIVE, aktiviert): `spawn_agents` via `~/.agents` ✅

Freebuff/Codebuff lädt beim Start **User-Agents aus `.agents`-Verzeichnissen**
(`~/.agents`, `{cwd}/.agents`, `{cwd}/../.agents`). Ein User-Agent mit
**derselben `id` wie ein gebündelter Agent ersetzt diesen**. Genau das nutzen
wir: Der Root-Agent `base3-free-deepseek-flash` (also Buffy selbst) bekommt
per Override das Tool `spawn_agents` plus die Liste spawnbarer Sub-Agents.

### Was liegt wo

| Datei | Zweck |
|---|---|
| `~/.agents/base3-free-deepseek.ts` | **Root-Override (Pro)**: behält id + Modell, ergänzt `spawn_agents` + `spawnableAgents` |
| `~/.agents/base3-free-deepseek-flash.ts` | **Root-Override (Flash)**: dito — deckt beide DeepSeek-Modelle ab |
| `~/.agents/researcher-web.ts` | Researcher-Override: Web- **und** Codebase-Tools (code_search, read_files, glob) für Research-Fanouts über den Projekt-Code |
| `~/.agents/code-reviewer-deepseek-flash.ts` | Reviewer-Override: kann echten Code lesen + Typecheck/Tests laufen lassen |

### Warum das funktioniert (verifiziert im Freebuff-Quellcode)

1. **Loading:** CLI ruft beim Start `initializeAgentRegistry()` →
   `loadLocalAgents()` scannt `~/.agents` etc. (binär verifiziert: `0.0.150`
   enthält die komplette Maschinerie).
2. **Override:** `loadAgentDefinitions()` merged User- und Bundled-Agents —
   gleiche `id` ⇒ User-Version gewinnt.
3. **Root-Auflösung:** `getAgentTemplate()` schaut zuerst in
   `localAgentTemplates` — der Session-Root (Buffy) ist also der Override.
4. **Placeholder:** `{CODEBUFF_CURRENT_DATE}`, `{CODEBUFF_GIT_CHANGES_PROMPT}`
   usw. werden zur Laufzeit für ALLE Agent-Prompts gefüllt — auch für
   User-Agents. Der Override-Prompt bleibt damit identisch zum Original.
5. **Free-Mode-Gate:** Der Server erlaubt nur Agent-IDs + Modelle aus
   `FREE_MODE_AGENT_MODELS`. Alle hier verwendeten IDs/Modelle sind dort:
   - `base3-free-deepseek-flash` → `deepseek/deepseek-v4-flash`
   - `researcher-web` → `google/gemini-3.5-flash-lite` (Allowlist: Gemini Flash Lite)
   - `researcher-docs` → Gemini Flash Lite
   - `code-reviewer-deepseek-flash` → `deepseek/deepseek-v4-flash`
   - `file-picker`, `file-lister` → Gemini (gebündelt, unverändert)

### So benutzt du es

Sag Buffy einfach z.B.:

> „Starte einen Research-Fanout über 5 Bereiche (Security, Auth, Privacy,
> Push, Tenant-Isolation) mit spawn_agents — researcher-web mit je einem
> Brief, danach code-reviewer-deepseek-flash über die Findings."

Buffy ruft dann `spawn_agents` mit `agent_type: 'researcher-web'` und pro
Agent einem Prompt auf. Die Sub-Agents laufen **parallel**, jeder mit eigenem
Kontext, und liefern ihre Antwort zurück.

**Wichtig:** Änderungen an `~/.agents/*.ts` greifen erst **nach einem
Neustart** der Freebuff-Session (Registry wird beim Start geladen).

### Neue Sub-Agents hinzufügen

Nur Free-Mode-allowlistete IDs sind spawnbar (sonst 403 vom Server). Sichere
IDs: `researcher-web`, `researcher-docs`, `code-reviewer-deepseek-flash`,
`file-picker`, `file-lister`. Eigene neue IDs bräuchten einen Server-Eintrag
in `FREE_MODE_AGENT_MODELS` — nicht ohne Freebuff-Team möglich. Stattdessen:
bestehende allowlistete ID **overriden** (gleiche id + gleiches Modell,
andere Tools/Prompts), wie `researcher-web` hier zeigt.

---

## Weg 2 (FALLBACK): Claude-CLI als Subagent-Motor

Falls `spawn_agents` im Client doch nicht greift, gibt es den CLI-Spawner:

```
Buffy (Freebuff)                      Claude-CLI (Subagents)
   │  bash ops/agents/spawn.sh             │
   │  ───────────────────────────────▶   claude -p "Brief A"  ──▶ reports/a.md
   │  (Wellen à 5 parallel)              claude -p "Brief B"  ──▶ reports/b.md
   │  ◀─── alle Reports gelesen ───────  …
```

- **Spawner = Bash-Skript** (`spawn.sh`), **Briefs = Markdown** (`briefs/*.md`).
- Jeder Subagent ist strikt read-only (`--allowedTools "Read,Glob,Grep"`).
- Reports landen in `ops/agents/reports/` — Buffy liest sie und synthetisiert.

### Voraussetzungen (Weg 2)

1. **Claude-Code-CLI installiert & eingeloggt:** `claude --version`
   (liegt vor: v2.1.235 unter `/usr/local/bin/claude`).
2. **Freies Session-Limit auf dem Konto** (die CLI läuft auf dem
   Claude-Konto mit dessen Modell, z.B. Opus).
3. **Projekt-Root** als Arbeitsverzeichnis.

### Nutzung (Weg 2)

```bash
# Alle Briefe spawnen (Wellen à 5, parallel)
bash ops/agents/spawn.sh

# Nur bestimmte Briefe
bash ops/agents/spawn.sh auth-oidc tenant-isolation crypto-e2e

# Report eines Subagents ansehen
cat ops/agents/reports/auth-oidc.md
```

### Neue Briefe schreiben (Weg 2)

Datei in `ops/agents/briefs/` anlegen, z. B. `mein-thema.md`:

```markdown
Du bist ein READ-ONLY Research-Agent.
BEREICH: <was untersuchen, mit Dateipfaden>
PRÜFE: <konkrete Fragen>
BERICHT: (1) Was existiert (2) Gaps mit file:line (3) Top-3 Empfehlungen.
NIEMALS editieren, erstellen oder löschen.
```

Danach `bash ops/agents/spawn.sh mein-thema` — fertig.

---

## Grenzen (beide Wege)

- `~/.agents`-Änderungen brauchen einen **Session-Neustart**.
- Custom-Agent-IDs außerhalb der Free-Mode-Allowlist geben 403 — immer
  allowlistete IDs overriden statt neue erfinden.
- CLI-Spawner: Session-Limit gilt pro Zeitfenster; große Fanouts auf Wellen
  verteilen.
