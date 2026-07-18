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
 */

export type StatementKind = "read" | "write";

export interface GuardResult {
  ok: boolean;
  /** Reason the statement was refused; only set when ok is false. */
  error?: string;
  kind?: StatementKind;
  /** True for UPDATE/DELETE without a WHERE clause — the classic table-wiper. */
  unbounded?: boolean;
  /** Statement with comments stripped and the trailing semicolon removed. */
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

const READ_STARTERS = ["select", "with", "explain", "show", "table"];
const WRITE_STARTERS = ["insert", "update", "delete"];

/** Removes -- line comments and block comments so they cannot hide keywords. */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/**
 * Splits on semicolons that are not inside a string literal, so a semicolon in
 * 'O'Brien; DROP ...' is treated as data rather than as a statement separator.
 */
function countStatements(sql: string): number {
  let inSingle = false;
  let inDouble = false;
  let statements = 1;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" && !inDouble) {
      if (inSingle && sql[i + 1] === "'") { i++; continue; } // escaped quote
      inSingle = !inSingle;
    } else if (c === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (c === ";" && !inSingle && !inDouble) {
      if (sql.slice(i + 1).trim().length > 0) statements++;
    }
  }
  return statements;
}

export function guardStatement(raw: string): GuardResult {
  const stripped = stripComments(raw).trim();
  if (!stripped) return { ok: false, error: "Leere Anweisung." };

  if (countStatements(stripped) > 1) {
    return {
      ok: false,
      error: "Nur eine Anweisung pro Ausführung. Mehrere Befehle bitte einzeln ausführen.",
    };
  }

  const normalized = stripped.replace(/;\s*$/, "").trim();
  const lower = normalized.toLowerCase();
  const firstWord = lower.split(/[\s(]+/)[0] ?? "";

  if (FORBIDDEN_VERBS.includes(firstWord)) {
    return {
      ok: false,
      error: `"${firstWord.toUpperCase()}" ist gesperrt — Schemaänderungen laufen nicht über die Konsole.`,
    };
  }

  // Catch a forbidden verb hiding after a CTE, e.g. WITH x AS (...) DROP ...
  for (const verb of FORBIDDEN_VERBS) {
    if (new RegExp(`(^|[\\s(;])${verb}\\s+(table|schema|database|index|view|role|user|function)\\b`, "i").test(normalized)) {
      return { ok: false, error: `"${verb.toUpperCase()}" ist gesperrt — Schemaänderungen laufen nicht über die Konsole.` };
    }
  }

  for (const fn of FORBIDDEN_FUNCTIONS) {
    if (new RegExp(`\\b${fn}\\b`, "i").test(normalized)) {
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
  // whatever was selected. INSERT INTO is the legitimate use of the keyword, so
  // remove those first and refuse anything that still contains INTO.
  const withoutInsertInto = normalized.replace(/\binsert\s+into\b/gi, " ");
  if (/\binto\b/i.test(withoutInsertInto)) {
    return {
      ok: false,
      error: "\"SELECT ... INTO\" ist gesperrt — es würde eine neue Tabelle anlegen.",
    };
  }

  // A CTE can still perform a write; classify by what the statement actually does.
  const kind: StatementKind =
    isWrite || /\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i.test(normalized)
      ? "write"
      : "read";

  // Flags any UPDATE/DELETE with no WHERE anywhere, including one wrapped in a
  // CTE such as: WITH d AS (DELETE FROM missions RETURNING *) SELECT * FROM d
  const unbounded =
    kind === "write" &&
    /\b(delete\s+from|update\s+\S+\s+set)\b/i.test(normalized) &&
    !/\bwhere\b/i.test(normalized);

  return { ok: true, kind, unbounded, normalized };
}
