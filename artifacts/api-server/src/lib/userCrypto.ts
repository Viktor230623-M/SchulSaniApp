import { randomUUID } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, userCryptoKeysTable, cryptoGrantLogTable, schoolDeksTable, schoolDekWrapsTable, usersTable } from "@workspace/db";
import type { Tx } from "./rolePermissions";

// Laengenbegrenzungen als Schutz gegen unverhaeltnismaessige Requests; die
// echten Groessen (32-Byte-Schluessel, base64) liegen weit darunter.
export const MAX_BLOB_LENGTH = 8192; // base64-Schluessel, Salts, Umschlaege
export const MAX_KEY_VERSION = 100000;

export function isValidCryptoBlob(value: unknown, max = MAX_BLOB_LENGTH): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && /^[A-Za-z0-9+/=_-]+$/.test(value);
}

export function isValidSalt(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= MAX_BLOB_LENGTH && /^[A-Za-z0-9+/=_-]+$/.test(value);
}

export function isValidKeyVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_KEY_VERSION;
}

/** Speichert das Schluesselpaar eines Nutzers; ein vorhandener Eintrag wird ersetzt. */
export async function upsertUserCryptoKey(tx: Tx | typeof db, userId: string, data: {
  publicKey: string;
  encryptedPrivateKey: string;
  saltEnc: string;
}): Promise<void> {
  const now = new Date();
  await tx.insert(userCryptoKeysTable).values({
    userId,
    publicKey: data.publicKey,
    encryptedPrivateKey: data.encryptedPrivateKey,
    saltEnc: data.saltEnc,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: userCryptoKeysTable.userId,
    set: {
      publicKey: data.publicKey,
      encryptedPrivateKey: data.encryptedPrivateKey,
      saltEnc: data.saltEnc,
      keyVersion: sql`${userCryptoKeysTable.keyVersion} + 1`,
      updatedAt: now,
    },
  });
}

/** Wer darf einen DEK anlegen, weiterreichen oder neu verpacken. */
export function canManageDek(permissions: readonly string[]): boolean {
  return permissions.includes("reports.read_all") || permissions.includes("reports.see_patient_info");
}

export interface DekWrapInput {
  schoolId: string;
  userId: string;
  dekVersion: number;
  wrappedDek: string;
  grantedBy?: string | null;
}

/** Legt den DEK-Umschlag fuer einen Empfaenger ab; ein vorhandener wird ersetzt. */
export async function upsertDekWrap(tx: Tx | typeof db, input: DekWrapInput): Promise<void> {
  await tx.insert(schoolDekWrapsTable).values({
    id: randomUUID(),
    schoolId: input.schoolId,
    dekVersion: input.dekVersion,
    userId: input.userId,
    wrappedDek: input.wrappedDek,
    grantedBy: input.grantedBy ?? null,
  }).onConflictDoUpdate({
    target: [schoolDekWrapsTable.schoolId, schoolDekWrapsTable.userId, schoolDekWrapsTable.dekVersion],
    set: { wrappedDek: input.wrappedDek, grantedBy: input.grantedBy ?? null },
  });
}

/** Protokolliert DEK-Init/Grant/Recovery (Rechenschaftsnachweis, Art. 5 Abs. 2 DSGVO). */
export async function logCryptoGrant(tx: Tx | typeof db, input: {
  schoolId: string;
  actorId: string;
  actorName?: string | null;
  targetUserId?: string | null;
  action: "init" | "grant" | "recover";
  dekVersion: number;
}): Promise<void> {
  await tx.insert(cryptoGrantLogTable).values({
    id: randomUUID(),
    schoolId: input.schoolId,
    actorId: input.actorId,
    actorName: input.actorName ?? null,
    targetUserId: input.targetUserId ?? null,
    action: input.action,
    dekVersion: input.dekVersion,
  });
}

/** Prueft, ob die Zielperson zur Schule gehoert; liefert ihren Namen fuers Log. */
export async function schoolUserOrNull(schoolId: string, userId: string): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.schoolId, schoolId)))
    .limit(1);
  if (!row) return null;
  return { id: row.id, name: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() };
}

/** Hoechste vorhandene DEK-Version der Schule, oder null. */
export async function latestDekVersion(schoolId: string): Promise<number | null> {
  const [row] = await db
    .select({ version: schoolDeksTable.version })
    .from(schoolDeksTable)
    .where(eq(schoolDeksTable.schoolId, schoolId))
    .orderBy(desc(schoolDeksTable.version))
    .limit(1);
  return row?.version ?? null;
}
