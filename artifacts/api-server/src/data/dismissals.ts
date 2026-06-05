import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, missionDismissalsTable } from "@workspace/db";

export async function getDismissedFor(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ missionId: missionDismissalsTable.missionId })
    .from(missionDismissalsTable)
    .where(eq(missionDismissalsTable.userId, userId));
  return new Set(rows.map((r) => r.missionId));
}

export async function addDismissal(userId: string, missionId: string): Promise<void> {
  await db
    .insert(missionDismissalsTable)
    .values({ id: randomUUID(), userId, missionId })
    .onConflictDoNothing();
}

export async function removeDismissal(userId: string, missionId: string): Promise<void> {
  await db
    .delete(missionDismissalsTable)
    .where(and(eq(missionDismissalsTable.userId, userId), eq(missionDismissalsTable.missionId, missionId)));
}
