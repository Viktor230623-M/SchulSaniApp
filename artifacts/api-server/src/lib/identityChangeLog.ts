import { randomUUID } from "node:crypto";
import { identityChangeLogTable } from "@workspace/db";
import type { Tx } from "./rolePermissions";

export interface IdentityChangeEntry {
  userId: string;
  providerKey: string;
  action: "link" | "unlink";
}

/**
 * Schreibe eine Verknuepfungsaenderung in derselben Transaktion wie die
 * Identitaet. Schlaegt das Protokoll fehl, darf auch die Aenderung nicht
 * bestehen -- wie bei role_change_log.
 */
export async function logIdentityChangeTx(tx: Tx, entry: IdentityChangeEntry): Promise<void> {
  await tx.insert(identityChangeLogTable).values({
    id: randomUUID(),
    userId: entry.userId,
    providerKey: entry.providerKey,
    action: entry.action,
    createdAt: new Date(),
  });
}
