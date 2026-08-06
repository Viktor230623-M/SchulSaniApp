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
 * Schreibe die Korrektur in derselben Transaktion wie die Nutzerzeile. Wenn
 * das Protokoll nicht gelingt, darf auch die Namensaenderung nicht bestehen.
 */
export async function logProfileChangeTx(tx: Tx, entry: ProfileChangeEntry): Promise<void> {
  await tx.insert(profileChangeLogTable).values({
    id: randomUUID(),
    actorId: entry.actorId,
    targetUserId: entry.targetUserId,
    field: entry.field,
    before: entry.before,
    after: entry.after,
    createdAt: new Date(),
  });
}
