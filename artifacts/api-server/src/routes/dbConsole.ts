import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Response } from "express";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db, pool, usersTable, dbConsoleLogTable } from "@workspace/db";

import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { guardStatement } from "../lib/sqlGuard";
import { SQL_PRESETS } from "../lib/sqlPresets";

const router: IRouter = Router();

/**
 * The console is bound to one specific account, not to a role — a second admin
 * or cto account must not inherit it. Override via env when handing it over.
 */
const OWNER_USER_ID = process.env["OWNER_USER_ID"] ?? "iserv-viktor.gnjatic";

const MAX_ROWS = 200;
const MAX_STATEMENT_LENGTH = 4000;
/** Statements are killed rather than allowed to hold locks on production tables. */
const STATEMENT_TIMEOUT_MS = 5000;

const consoleLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

function requireOwner(req: AuthRequest, res: Response, next: () => void) {
  if (req.user?.userId !== OWNER_USER_ID) {
    // Deliberately vague: a non-owner should not learn that this route exists.
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
}

async function ownerName(userId: string): Promise<string> {
  const [u] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : userId;
}

async function audit(entry: {
  userId: string;
  userName: string;
  statement: string;
  presetKey?: string | null;
  committed: boolean;
  rowsAffected?: number | null;
  error?: string | null;
}) {
  try {
    await db.insert(dbConsoleLogTable).values({
      id: randomUUID(),
      userId: entry.userId,
      userName: entry.userName,
      statement: entry.statement.slice(0, 4000),
      presetKey: entry.presetKey ?? null,
      committed: entry.committed,
      rowsAffected: entry.rowsAffected ?? null,
      error: entry.error ? entry.error.slice(0, 1000) : null,
      createdAt: new Date(),
    });
  } catch (err) {
    // Never let a failing audit write hide the actual result from the caller.
    console.error("db console audit write failed");
  }
}

router.use(requireAuth, requireOwner, consoleLimiter);

/** Ready-made statements, grouped for the UI. */
router.get("/presets", (_req, res) => {
  res.json({ presets: SQL_PRESETS });
});

/** Table names with their current row counts. */
router.get("/tables", async (_req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT relname AS table, n_live_tup AS approx_rows
      FROM pg_stat_user_tables
      ORDER BY relname
    `);
    res.json({ tables: rows });
  } catch (err) {
    res.status(500).json({ error: "Tabellen konnten nicht gelesen werden." });
  } finally {
    client.release();
  }
});

/**
 * Runs a statement inside a transaction. Without `confirm`, the transaction is
 * always rolled back and only the row count is reported — so a DELETE can be
 * inspected before it becomes permanent. With `confirm`, it commits.
 */
router.post("/execute", async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const body = req.body as Record<string, unknown>;
  const statement = typeof body["statement"] === "string" ? body["statement"] : "";
  const presetKey = typeof body["presetKey"] === "string" ? body["presetKey"] : null;
  const confirm = body["confirm"] === true;

  if (statement.length > MAX_STATEMENT_LENGTH) {
    res.status(400).json({ error: "Anweisung zu lang." });
    return;
  }

  const guard = guardStatement(statement);
  if (!guard.ok) {
    const name = await ownerName(userId);
    await audit({ userId, userName: name, statement, presetKey, committed: false, error: guard.error });
    res.status(400).json({ error: guard.error });
    return;
  }

  const name = await ownerName(userId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

    const result = await client.query(guard.normalized!);
    const rowsAffected = result.rowCount ?? 0;
    const isRead = guard.kind === "read";

    // Reads never need confirmation; writes commit only when explicitly confirmed.
    const shouldCommit = isRead || confirm;
    await client.query(shouldCommit ? "COMMIT" : "ROLLBACK");

    await audit({
      userId,
      userName: name,
      statement: guard.normalized!,
      presetKey,
      committed: shouldCommit && !isRead,
      rowsAffected,
    });

    res.json({
      kind: guard.kind,
      unbounded: guard.unbounded ?? false,
      committed: shouldCommit && !isRead,
      // A write that was not confirmed reports what it *would* have changed.
      preview: !isRead && !confirm,
      rowsAffected,
      fields: isRead ? result.fields?.map((f) => f.name) ?? [] : [],
      rows: isRead ? result.rows.slice(0, MAX_ROWS) : [],
      truncated: isRead && result.rows.length > MAX_ROWS,
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* connection already broken */ }
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    await audit({
      userId,
      userName: name,
      statement: guard.normalized ?? statement,
      presetKey,
      committed: false,
      error: message,
    });
    res.status(400).json({ error: message });
  } finally {
    client.release();
  }
});

export default router;
