import { randomUUID } from "node:crypto";
import { roleChangeLogTable } from "@workspace/db";
import type { Tx } from "./rolePermissions";

export interface RoleChangeEntry {
  schoolId: string | null;
  actorId: string;
  actorName?: string | null;
  roleId?: string | null;
  roleKey?: string | null;
  targetUserId?: string | null;
  action: string;
  before: unknown;
  after: unknown;
}

/**
 * Schreibt eine Rollenaenderung ins Protokoll, in derselben Transaktion wie
 * die Aenderung selbst. Ein fehlgeschlagener Protokolleintrag darf das
 * eigentliche Ergebnis nicht verdecken — deshalb der eigene Sicherungspunkt:
 * ein blosses try/catch wuerde hier nichts nuetzen, weil PostgreSQL die
 * gesamte Transaktion nach einem Fehler verwirft und jede folgende Anweisung
 * darin ebenfalls scheitert.
 */
export async function logRoleChangeTx(tx: Tx, entry: RoleChangeEntry): Promise<void> {
  try {
    await tx.transaction(async (sicherungspunkt) => {
      await sicherungspunkt.insert(roleChangeLogTable).values({
        id: randomUUID(),
        schoolId: entry.schoolId,
        actorId: entry.actorId,
        actorName: entry.actorName ?? null,
        roleId: entry.roleId ?? null,
        roleKey: entry.roleKey ?? null,
        targetUserId: entry.targetUserId ?? null,
        action: entry.action,
        permissionsBefore: entry.before ?? null,
        permissionsAfter: entry.after ?? null,
        createdAt: new Date(),
      });
    });
  } catch {
    console.error("Protokollierung der Rollenaenderung fehlgeschlagen");
  }
}
