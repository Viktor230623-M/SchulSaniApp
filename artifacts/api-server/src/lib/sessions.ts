import { createHash, randomBytes, randomUUID } from "node:crypto";
import { eq, isNull, and } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";
import {
  computeNewSession,
  computeSlidingExtension,
  isSessionValid,
} from "./sessionRules";

/**
 * Anmeldesitzungen.
 *
 * Das Klartexttoken verlaesst diese Datei genau einmal: als Rueckgabewert von
 * `createSession`, damit der Aufrufer es ins Cookie schreiben kann. Persistiert
 * wird ausschliesslich der Hash.
 */

/** 32 Byte = 256 Bit Entropie. Raten ist damit praktisch ausgeschlossen. */
const TOKEN_BYTES = 32;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function createSession(userId: string, now: Date = new Date()): Promise<string> {
  const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
  const { expiresAt, absoluteExpiresAt } = computeNewSession(now);

  await db.insert(sessionsTable).values({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(rawToken),
    createdAt: now,
    lastUsedAt: now,
    expiresAt,
    absoluteExpiresAt,
    revokedAt: null,
  });

  return rawToken;
}

/**
 * Prueft ein Sitzungstoken und verlaengert die gleitende Frist.
 *
 * Liefert `null`, sobald irgendetwas nicht stimmt — unbekannt, abgelaufen oder
 * widerrufen. Der Aufrufer erfaehrt bewusst nicht, welcher der Faelle vorlag.
 */
export async function resolveSession(
  rawToken: string,
  now: Date = new Date(),
): Promise<{ userId: string } | null> {
  const rows = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.tokenHash, hashToken(rawToken)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const timestamps = {
    expiresAt: row.expiresAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    revokedAt: row.revokedAt,
  };
  if (!isSessionValid(timestamps, now)) return null;

  await db
    .update(sessionsTable)
    .set({ expiresAt: computeSlidingExtension(timestamps, now), lastUsedAt: now })
    .where(eq(sessionsTable.id, row.id));

  return { userId: row.userId };
}

export async function revokeSession(rawToken: string, now: Date = new Date()): Promise<void> {
  await db
    .update(sessionsTable)
    .set({ revokedAt: now })
    .where(eq(sessionsTable.tokenHash, hashToken(rawToken)));
}

/** Fuer "auf allen Geraeten abmelden" und beim Entzug der Freischaltung. */
export async function revokeAllSessionsForUser(userId: string, now: Date = new Date()): Promise<void> {
  await db
    .update(sessionsTable)
    .set({ revokedAt: now })
    .where(and(eq(sessionsTable.userId, userId), isNull(sessionsTable.revokedAt)));
}
