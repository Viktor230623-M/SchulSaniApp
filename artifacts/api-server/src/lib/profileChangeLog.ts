import { randomUUID } from "node:crypto";
import { profileChangeLogTable } from "@workspace/db";
import type { Tx } from "./rolePermissions";

export interface ProfileChangeEntry {
  actorId: string;
  targetUserId: string;
  field: "first_name" | "last_name";
  before: string | null;
  after: string | null;
}

/**
 * Schreibt eine Namenskorrektur ins Protokoll, in derselben Transaktion wie
 * die Aenderung selbst. Sicherungspunkt aus demselben Grund wie in
 * roleChangeLog.ts: ein blosses try/catch nuetzt in einer Transaktion nichts,
 * PostgreSQL verwirft nach einem Fehler alle folgenden Anweisungen darin.
 */
export async function logProfileChangeTx(tx: Tx, entry: ProfileChangeEntry): Promise<void> {
  try {
    await tx.transaction(async (sicherungspunkt) => {
      await sicherungspunkt.insert(profileChangeLogTable).values({
        id: randomUUID(),
        actorId: entry.actorId,
        targetUserId: entry.targetUserId,
        field: entry.field,
        before: entry.before,
        after: entry.after,
        createdAt: new Date(),
      });
    });
  } catch {
    console.error("Protokollierung der Namenskorrektur fehlgeschlagen");
  }
}
