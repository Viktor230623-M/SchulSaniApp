/**
 * Safety rails for the owner-only SQL console.
 *
 * The console is deliberately powerful, so the guard focuses on the mistakes that
 * are unrecoverable rather than on restricting what can be queried:
 *   - schema destruction (DROP/TRUNCATE/ALTER) is refused outright
 *   - multiple statements in one request are refused, so a trailing statement can
 *     never ride along behind a harmless-looking one
 *   - writes without a WHERE clause are flagged so the UI can warn before running
 *
 * Everything that passes still runs inside a transaction that is only committed
 * after an explicit confirmation, so a surprising row count can be rolled back.
 *
 * Two rules make the analysis trustworthy:
 *   1. All inspection happens on a copy with string literals masked out, so a
 *      keyword sitting inside quoted data is never mistaken for a real keyword.
 *   2. What gets executed is the statement the user typed, never the inspection
 *      copy — stripping a comment out of a text value would silently corrupt it.
 */

export type StatementKind = "read" | "write";

export interface GuardResult {
  ok: boolean;
  /** Reason the statement was refused; only set when ok is false. */
  error?: string;
  kind?: StatementKind;
  /** True for UPDATE/DELETE without a WHERE clause — the classic table-wiper. */
  unbounded?: boolean;
  /** The user's statement with only the trailing semicolon removed. */
  normalized?: string;
}

/** Verbs that change or destroy schema. No preview can make these safe. */
const FORBIDDEN_VERBS = [
  "drop", "truncate", "alter", "create", "grant", "revoke", "reindex",
  "vacuum", "cluster", "comment", "security", "call", "do",
];

/** Functions that reach outside the database (filesystem, network). */
const FORBIDDEN_FUNCTIONS = [
  "pg_read_file", "pg_read_binary_file", "pg_ls_dir", "pg_stat_file",
  "lo_import", "lo_export", "dblink", "pg_sleep", "copy",
];

/** Any of these appearing outside a literal means the statement can change data. */
const WRITE_KEYWORDS = ["insert", "update", "delete", "merge"];

const READ_STARTERS = ["select", "with", "explain", "show", "table"];
const WRITE_STARTERS = ["insert", "update", "delete"];

/**
 * Replaces the *contents* of string literals with spaces, preserving length and
 * the surrounding quotes. Keyword scanning then cannot be fooled by data such as
 * `WHERE note = 'please delete me'`, and comment stripping cannot reach into a
 * value like `'vor /* nicht *​/ zurueck'`.
 *
 * Handles single quotes (with '' escapes), double-quoted identifiers, and
 * dollar-quoted strings.
 */
function maskLiterals(sql: string): string {
  const out = sql.split("");
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];

    if (c === "'") {
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { out[i] = " "; out[i + 1] = " "; i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        out[i] = " ";
        i++;
      }
      continue;
    }

    if (c === '"') {
      i++;
      while (i < sql.length && sql[i] !== '"') { out[i] = " "; i++; }
      i++;
      continue;
    }

    if (c === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (tag) {
        const marker = tag[0];
        const end = sql.indexOf(marker, i + marker.length);
        const stop = end === -1 ? sql.length : end + marker.length;
        for (let k = i + marker.length; k < Math.min(stop - marker.length, sql.length); k++) out[k] = " ";
        i = stop;
        continue;
      }
    }

    i++;
  }
  return out.join("");
}

/** Removes -- line comments and block comments. Only ever used for inspection. */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/** Counts statements on an already-masked string, so semicolons in data are safe. */
function countStatements(masked: string): number {
  let statements = 1;
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === ";" && masked.slice(i + 1).trim().length > 0) statements++;
  }
  return statements;
}

export function guardStatement(raw: string): GuardResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Leere Anweisung." };

  // Everything below inspects this copy; the user's own text is what runs.
  const inspect = stripComments(maskLiterals(trimmed)).trim();
  if (!inspect) return { ok: false, error: "Leere Anweisung." };

  if (countStatements(inspect) > 1) {
    return {
      ok: false,
      error: "Nur eine Anweisung pro Ausführung. Mehrere Befehle bitte einzeln ausführen.",
    };
  }

  const normalized = trimmed.replace(/;\s*$/, "").trim();
  const inspectBody = inspect.replace(/;\s*$/, "").trim();
  const firstWord = inspectBody.toLowerCase().split(/[\s(]+/)[0] ?? "";

  if (FORBIDDEN_VERBS.includes(firstWord)) {
    return {
      ok: false,
      error: `"${firstWord.toUpperCase()}" ist gesperrt — Schemaänderungen laufen nicht über die Konsole.`,
    };
  }

  // Catch a forbidden verb hiding after a CTE, e.g. WITH x AS (...) DROP ...
  for (const verb of FORBIDDEN_VERBS) {
    if (new RegExp(`(^|[\\s(;])${verb}\\s+(table|schema|database|index|view|role|user|function)\\b`, "i").test(inspectBody)) {
      return { ok: false, error: `"${verb.toUpperCase()}" ist gesperrt — Schemaänderungen laufen nicht über die Konsole.` };
    }
  }

  for (const fn of FORBIDDEN_FUNCTIONS) {
    if (new RegExp(`\\b${fn}\\b`, "i").test(inspectBody)) {
      return { ok: false, error: `"${fn}" ist gesperrt.` };
    }
  }

  const isRead = READ_STARTERS.includes(firstWord);
  const isWrite = WRITE_STARTERS.includes(firstWord);
  if (!isRead && !isWrite) {
    return { ok: false, error: `Anweisungen mit "${firstWord.toUpperCase()}" sind nicht erlaubt.` };
  }

  // SELECT ... INTO creates a table without starting with CREATE, which would
  // otherwise sail past the verb check and leave a permanent unredacted copy of
  // whatever was selected. INSERT INTO is the legitimate use of the keyword.
  const withoutInsertInto = inspectBody.replace(/\binsert\s+into\b/gi, " ");
  if (/\binto\b/i.test(withoutInsertInto)) {
    return {
      ok: false,
      error: '"SELECT ... INTO" ist gesperrt — es würde eine neue Tabelle anlegen.',
    };
  }

  // Classify by whether a write keyword appears anywhere outside a literal, not
  // by shape. Matching on patterns like `update <name> set` missed schema
  // qualification (public.users) and aliases (users AS u), and a misclassified
  // write would commit without a confirmation and be logged as uncommitted.
  const hasWriteKeyword = WRITE_KEYWORDS.some((k) =>
    new RegExp(`\\b${k}\\b`, "i").test(inspectBody)
  );
  const kind: StatementKind = isWrite || hasWriteKeyword ? "write" : "read";

  // Flags any UPDATE/DELETE with no WHERE, including one wrapped in a CTE such as
  // WITH d AS (DELETE FROM missions RETURNING *) SELECT * FROM d
  const touchesExistingRows = /\b(delete|update)\b/i.test(inspectBody);
  const unbounded = kind === "write" && touchesExistingRows && !/\bwhere\b/i.test(inspectBody);

  return { ok: true, kind, unbounded, normalized };
}
