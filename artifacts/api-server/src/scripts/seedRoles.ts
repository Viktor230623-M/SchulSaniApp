// Legt die sieben Bestandsrollen als Zeilen an, mit genau der Zuordnung aus
// DEFAULT_ROLE_PERMISSIONS. Mehrfach ausfuehrbar: vorhandene Rollen werden
// aktualisiert, nicht doppelt angelegt.
//
//   npx tsx src/scripts/seedRoles.ts [schoolId]
import { randomUUID } from "node:crypto";
import { eq, isNull, inArray } from "drizzle-orm";
import { db, rolesTable, rolePermissionsTable } from "@workspace/db";
import { DEFAULT_ROLE_PERMISSIONS, ESSENTIAL_PERMISSIONS } from "../lib/permissions";

interface SeedLabel {
  de: string;
  en: string;
  color: string;
  sortOrder: number;
}

// Anzeigenamen aus constants/i18n.ts (roles-Block, de und en), Farben aus
// ROLE_CONFIG in settings.tsx. Bewusst abgeschrieben, damit sich fuer den
// Bestand nichts aendert.
const SEED_LABELS: Record<string, SeedLabel> = {
  owner: { de: "Eigentuemer", en: "Owner", color: "#0F766E", sortOrder: 10 },
  admin: { de: "Administrator", en: "Administrator", color: "#DC2626", sortOrder: 20 },
  sanitaeter_leitung_admin: { de: "Sanitaeter Leitung Admin", en: "Head Admin", color: "#2563EB", sortOrder: 30 },
  sanitaeter_leitung: { de: "Sanitaeter Leitung", en: "Head Paramedic", color: "#2563EB", sortOrder: 40 },
  teacher: { de: "Lehrer", en: "Teacher", color: "#EA580C", sortOrder: 50 },
  sanitaeter: { de: "Sanitaeter", en: "Paramedic", color: "#16A34A", sortOrder: 60 },
  student_paramedic: { de: "Sanitaeter", en: "Paramedic", color: "#16A34A", sortOrder: 70 },
};

export async function seedRoles(schoolId: string | null): Promise<void> {
  const scope = schoolId ? eq(rolesTable.schoolId, schoolId) : isNull(rolesTable.schoolId);
  const existing = await db.select().from(rolesTable).where(scope);
  const byKey = new Map(existing.map((r) => [r.key, r]));

  for (const [key, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const label = SEED_LABELS[key];
    if (!label) throw new Error(`Kein Anzeigename fuer Rolle "${key}" hinterlegt.`);

    let roleId = byKey.get(key)?.id;
    if (roleId) {
      await db.update(rolesTable).set({
        displayName: label.de,
        displayNameEn: label.en,
        color: label.color,
        sortOrder: label.sortOrder,
        isSystem: true,
        updatedAt: new Date(),
      }).where(eq(rolesTable.id, roleId));
    } else {
      roleId = randomUUID();
      await db.insert(rolesTable).values({
        id: roleId,
        schoolId,
        key,
        displayName: label.de,
        displayNameEn: label.en,
        color: label.color,
        sortOrder: label.sortOrder,
        isSystem: true,
      });
    }

    // Zuordnung auf den Sollstand bringen: fehlende ergaenzen, ueberzaehlige
    // entfernen. So korrigiert ein zweiter Lauf auch Abweichungen.
    const current = await db.select().from(rolePermissionsTable)
      .where(eq(rolePermissionsTable.roleId, roleId));
    const have = new Set(current.map((r) => r.permission));
    const want = new Set<string>(perms);

    for (const perm of want) {
      if (!have.has(perm)) {
        await db.insert(rolePermissionsTable)
          .values({ id: randomUUID(), roleId, permission: perm })
          .onConflictDoNothing();
      }
    }
    const surplus = current.filter((r) => !want.has(r.permission)).map((r) => r.id);
    if (surplus.length > 0) {
      await db.delete(rolePermissionsTable).where(inArray(rolePermissionsTable.id, surplus));
    }
  }

  // Aussperrsicherung: ohne eine Rolle, die Rollen verwalten und zuweisen
  // darf, waere die Installation nach dem Seed nicht mehr steuerbar.
  const scoped = await db.select({ id: rolesTable.id }).from(rolesTable).where(scope);
  const guardians = await db.select({ roleId: rolePermissionsTable.roleId, permission: rolePermissionsTable.permission })
    .from(rolePermissionsTable)
    .where(inArray(rolePermissionsTable.roleId, scoped.map((r) => r.id)));

  const perRole = new Map<string, Set<string>>();
  for (const row of guardians) {
    if (!perRole.has(row.roleId)) perRole.set(row.roleId, new Set());
    perRole.get(row.roleId)!.add(row.permission);
  }
  const hasGuardian = Array.from(perRole.values())
    .some((set) => ESSENTIAL_PERMISSIONS.every((p) => set.has(p)));
  if (!hasGuardian) {
    throw new Error("Seed verletzt die Aussperrsicherung: keine Rolle traegt alle unentbehrlichen Berechtigungen.");
  }
}

// Nur ausfuehren, wenn direkt aufgerufen — nicht beim Import aus Tests.
if (process.argv[1] && process.argv[1].endsWith("seedRoles.ts")) {
  const schoolId = process.argv[2] ?? null;
  seedRoles(schoolId)
    .then(() => {
      console.log(`Rollen-Seed abgeschlossen (schoolId: ${schoolId ?? "global"}).`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Rollen-Seed fehlgeschlagen:", err);
      process.exit(1);
    });
}
