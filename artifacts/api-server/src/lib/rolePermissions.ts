// Zuordnung Rolle -> Berechtigungen, aus der Datenbank statt aus der
// Konstante. permissions.ts bleibt bewusst frei von Datenbankzugriffen, damit
// der Katalog auch ohne Verbindung nutzbar ist.
import { eq, isNull } from "drizzle-orm";
import { db, rolesTable, rolePermissionsTable } from "@workspace/db";
import { DEFAULT_ROLE_PERMISSIONS } from "./permissions";

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

  const rows = await db
    .select({ key: rolesTable.key, permission: rolePermissionsTable.permission })
    .from(rolesTable)
    .innerJoin(rolePermissionsTable, eq(rolePermissionsTable.roleId, rolesTable.id))
    .where(schoolId ? eq(rolesTable.schoolId, schoolId) : isNull(rolesTable.schoolId));

  const out: Record<string, string[]> = {};
  for (const row of rows) (out[row.key] ??= []).push(row.permission);

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
