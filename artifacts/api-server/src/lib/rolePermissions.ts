// Zuordnung Rolle -> Berechtigungen, aus der Datenbank statt aus der
// Konstante. permissions.ts bleibt bewusst frei von Datenbankzugriffen, damit
// der Katalog auch ohne Verbindung nutzbar ist.
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, rolesTable, rolePermissionsTable, usersTable } from "@workspace/db";
import { DEFAULT_ROLE_PERMISSIONS, ESSENTIAL_PERMISSIONS } from "./permissions";

/** Transaktionsobjekt, wie es db.transaction dem Rumpf uebergibt. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  map: Record<string, string[]>;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(schoolId: string | null): string {
  return schoolId ?? "__global__";
}

export function invalidateRolePermissions(schoolId?: string | null): void {
  if (schoolId === undefined) {
    cache.clear();
    return;
  }
  cache.delete(cacheKey(schoolId));
}

export async function loadRolePermissions(schoolId: string | null): Promise<Record<string, string[]>> {
  const key = cacheKey(schoolId);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.map;

  // Eine schulgebundene Rolle und eine ungebundene mit demselben Schluessel
  // koennen nebeneinander bestehen (Bestand liegt ungebunden vor, eine neue
  // Installation kann trotzdem schon schulgebunden anlegen). Beide zaehlen,
  // die schulgebundene gewinnt bei gleichem Schluessel -- sonst faende eine
  // Abfrage nur auf die Schul-Kennung null Zeilen und der Rueckfall auf
  // DEFAULT_ROLE_PERMISSIONS griffe faelschlich weiter.
  const rows = await db
    .select({ key: rolesTable.key, permission: rolePermissionsTable.permission, rowSchoolId: rolesTable.schoolId })
    .from(rolesTable)
    .innerJoin(rolePermissionsTable, eq(rolePermissionsTable.roleId, rolesTable.id))
    .where(schoolId ? or(eq(rolesTable.schoolId, schoolId), isNull(rolesTable.schoolId)) : isNull(rolesTable.schoolId));

  const global: Record<string, string[]> = {};
  const scoped: Record<string, string[]> = {};
  for (const row of rows) {
    const bucket = schoolId !== null && row.rowSchoolId === schoolId ? scoped : global;
    (bucket[row.key] ??= []).push(row.permission);
  }
  // Schulgebundene Definition ersetzt die ungebundene vollstaendig, nicht nur
  // ergaenzend -- wer fuer diese Schule eine eigene Rolle "sanitaeter" anlegt,
  // will genau deren Rechteliste, nicht die Vereinigung mit der globalen.
  const out: Record<string, string[]> = { ...global, ...scoped };

  // Solange keine Rollen eingespielt sind, gilt weiter die Konstante. Ohne
  // diesen Rueckfall waere eine Installation nach dem Aufspielen der Migration
  // und vor dem Seed komplett gesperrt.
  if (Object.keys(out).length === 0) {
    for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      out[role] = [...perms];
    }
  }

  cache.set(key, { map: out, expires: Date.now() + CACHE_TTL_MS });
  return out;
}

export async function permissionsForRole(role: string, schoolId: string | null): Promise<string[]> {
  const map = await loadRolePermissions(schoolId);
  return map[role] ?? [];
}

export class LockoutError extends Error {}

/**
 * Wird am Ende jeder schreibenden Rollen- oder Nutzeraenderung innerhalb
 * derselben Transaktion aufgerufen. Wirft, wenn nach der bereits geschriebenen
 * Aenderung keine Rolle mit einem freigeschalteten Traeger mehr existiert, die
 * roles.manage beziehungsweise users.assign_role haelt.
 *
 * Die Pruefung sitzt bewusst in der Transaktion und sperrt die betroffenen
 * Nutzerzeilen: zwei gleichzeitige Anfragen duerfen nicht gemeinsam den
 * letzten Verwalter entfernen.
 */
export async function assertAdminReachable(tx: Tx, schoolId: string | null): Promise<void> {
  // Vor dem Seed gibt es keine Rollenzeilen; dann gilt noch die Konstante und
  // es gibt nichts zu schuetzen. Ohne diese Abkuerzung wuerde die Sicherung
  // auf einer frisch migrierten Installation jede Aenderung mit 409 sperren.
  const [vorhanden] = await tx.select({ id: rolesTable.id }).from(rolesTable)
    .where(schoolId ? eq(rolesTable.schoolId, schoolId) : isNull(rolesTable.schoolId))
    .limit(1);
  if (!vorhanden) return;

  for (const essential of ESSENTIAL_PERMISSIONS) {
    const rows = await tx
      .select({ userId: usersTable.id })
      .from(usersTable)
      .innerJoin(rolesTable, sql`${rolesTable.key} = ${usersTable.role}::text`)
      .innerJoin(rolePermissionsTable, eq(rolePermissionsTable.roleId, rolesTable.id))
      .where(and(
        eq(rolePermissionsTable.permission, essential),
        eq(usersTable.isApproved, true),
        schoolId ? eq(rolesTable.schoolId, schoolId) : isNull(rolesTable.schoolId),
      ))
      .for("update");
    if (rows.length === 0) {
      throw new LockoutError(
        `Dies ist die letzte Rolle, die "${essential}" traegt, oder ihr letzter freigeschalteter Nutzer.`,
      );
    }
  }
}

export async function getRolePermissions(roleId: string): Promise<string[]> {
  const rows = await db.select({ permission: rolePermissionsTable.permission })
    .from(rolePermissionsTable)
    .where(eq(rolePermissionsTable.roleId, roleId));
  return rows.map((r) => r.permission);
}

export async function roleHasPermission(roleId: string, permission: string): Promise<boolean> {
  const rows = await db.select({ id: rolePermissionsTable.id })
    .from(rolePermissionsTable)
    .where(and(eq(rolePermissionsTable.roleId, roleId), eq(rolePermissionsTable.permission, permission)))
    .limit(1);
  return rows.length > 0;
}

