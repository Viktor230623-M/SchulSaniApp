import { randomUUID } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, rolesTable, rolePermissionsTable, usersTable } from "@workspace/db";
import { requireAuth, requirePermission, invalidateRoleCache, invalidateAllRoleCaches, type AuthRequest } from "../middlewares/auth";
import { isValidPermission, PERMISSIONS } from "../lib/permissions";
import {
  assertAdminReachable,
  getRolePermissions,
  invalidateRolePermissions,
  roleHasPermission,
  LockoutError,
} from "../lib/rolePermissions";
import { logRoleChangeTx } from "../lib/roleChangeLog";

const router = Router();

// Schreibende Rollenaenderungen sind selten und teuer; ein enges Limit kostet
// im Alltag nichts und nimmt einem gekaperten Konto die Geschwindigkeit.
const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;

// Eine Schule je Installation, und der Rollenbestand liegt ungebunden vor
// (school_id IS NULL). Wuerde hier SCHOOL_ID stehen, faende scopeCondition
// keine einzige Rolle: die Rollenliste bliebe leer, der Verwaltungsbildschirm
// zeigte nichts an, und assertAdminReachable liefe in seine Abkuerzung "keine
// Rollenzeilen, also nichts zu schuetzen" — die Aussperrsicherung waere still
// abgeschaltet.
//
// Die Rechtepruefung selbst ist davon unberuehrt: permissionsForRole nimmt die
// Schulkennung der Nutzerzeile und beruecksichtigt schulgebundene wie
// ungebundene Rollen, wobei die schulgebundene gewinnt. Ein spaeterer Umzug des
// Bestands auf eine Schulkennung ist damit moeglich, ohne dass hier vorher
// etwas kaputtgeht. Sobald mehrere Mandanten auf einer Instanz laufen, kommt
// die Kennung aus dem Token — dann zieht diese Funktion nach.
function scopeOf(_req: AuthRequest): string | null {
  return null;
}

// Ohne Argument, also alle Bereiche. Eine ungebundene Rolle geht in die
// Rechtetabelle jeder Schule ein; nur den eigenen Bereich zu verwerfen liesse
// die Nutzer bis zum Ablauf der Zwischenspeicherfrist auf dem alten Stand —
// und "wirkt sofort, ohne Neuanmeldung" ist der Zweck der ganzen Uebung.
function verwerfeRechte(): void {
  invalidateRolePermissions();
}

function scopeCondition(schoolId: string | null) {
  return schoolId ? eq(rolesTable.schoolId, schoolId) : isNull(rolesTable.schoolId);
}

/**
 * Lesend fuer jeden angemeldeten Nutzer: Anzeigename, Farbe und Reihenfolge
 * braucht die App zur Darstellung. Welche Berechtigungen an einer Rolle
 * haengen, steht hier bewusst nicht drin.
 */
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const [rows, counts] = await Promise.all([
    db.select({
      id: rolesTable.id,
      key: rolesTable.key,
      displayName: rolesTable.displayName,
      displayNameEn: rolesTable.displayNameEn,
      color: rolesTable.color,
      sortOrder: rolesTable.sortOrder,
      isSystem: rolesTable.isSystem,
    })
      .from(rolesTable)
      .where(scopeCondition(scopeOf(req)))
      .orderBy(rolesTable.sortOrder),
    db.select({ role: usersTable.role, count: sql<number>`count(*)` })
      .from(usersTable)
      .groupBy(usersTable.role),
  ]);
  const countByKey = new Map(counts.map((c) => [String(c.role), Number(c.count)]));
  res.json(rows.map((r) => ({ ...r, userCount: countByKey.get(r.key) ?? 0 })));
});

/** Berechtigungskatalog mit deutschen Beschreibungen — nur fuer die Verwaltung. */
router.get("/permissions", requireAuth, requirePermission("roles.manage"), async (_req: AuthRequest, res) => {
  res.json(PERMISSIONS);
});

/** Berechtigungen einer Rolle — nur fuer die Verwaltung. */
router.get("/:id/permissions", requireAuth, requirePermission("roles.manage"), async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  const [role] = await db.select().from(rolesTable)
    .where(and(eq(rolesTable.id, id), scopeCondition(scopeOf(req)))).limit(1);
  if (!role) { res.status(404).json({ error: "Nicht gefunden" }); return; }
  res.json({ permissions: await getRolePermissions(id) });
});

router.post("/", requireAuth, requirePermission("roles.manage"), writeLimiter, async (req: AuthRequest, res) => {
  const { key, displayName, displayNameEn, color, sortOrder } = req.body as Record<string, unknown>;

  if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
    res.status(400).json({ error: "Ungueltiger Rollenschluessel" }); return;
  }
  if (typeof displayName !== "string" || displayName.trim().length < 1 || displayName.length > 100) {
    res.status(400).json({ error: "Ungueltiger Anzeigename" }); return;
  }
  if (displayNameEn !== undefined && displayNameEn !== null &&
      (typeof displayNameEn !== "string" || displayNameEn.length > 100)) {
    res.status(400).json({ error: "Ungueltiger englischer Anzeigename" }); return;
  }
  if (color !== undefined && color !== null && (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color))) {
    res.status(400).json({ error: "Ungueltige Farbe" }); return;
  }

  const schoolId = scopeOf(req);
  const [vorhanden] = await db.select({ id: rolesTable.id }).from(rolesTable)
    .where(and(eq(rolesTable.key, key), scopeCondition(schoolId))).limit(1);
  if (vorhanden) { res.status(409).json({ error: "Diesen Rollenschluessel gibt es bereits." }); return; }

  const roleId = randomUUID();
  // Eine neue Rolle startet ohne Berechtigungen. Vergeben werden sie ueber
  // PUT /:id/permissions, und dort greift die Teilmengenregel.
  await db.insert(rolesTable).values({
    id: roleId,
    schoolId,
    key,
    displayName: displayName.trim(),
    displayNameEn: typeof displayNameEn === "string" ? displayNameEn : null,
    color: typeof color === "string" ? color : null,
    isSystem: false,
    sortOrder: typeof sortOrder === "number" ? sortOrder : 999,
  });
  verwerfeRechte();
  res.status(201).json({ id: roleId, key });
});

/**
 * Anzeigename, englischer Anzeigename, Farbe, Reihenfolge. Der Schluessel
 * bleibt unveraenderlich: er verbindet die Rolle ueber einen Textvergleich mit
 * users.role, eine Umbenennung wuerde alle Traeger von ihrer Rolle trennen.
 */
router.patch("/:id", requireAuth, requirePermission("roles.manage"), writeLimiter, async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  const { displayName, displayNameEn, color, sortOrder } = req.body as Record<string, unknown>;
  const schoolId = scopeOf(req);

  const [role] = await db.select().from(rolesTable)
    .where(and(eq(rolesTable.id, id), scopeCondition(schoolId))).limit(1);
  if (!role) { res.status(404).json({ error: "Nicht gefunden" }); return; }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (displayName !== undefined) {
    if (typeof displayName !== "string" || displayName.trim().length < 1 || displayName.length > 100) {
      res.status(400).json({ error: "Ungueltiger Anzeigename" }); return;
    }
    patch["displayName"] = displayName.trim();
  }
  if (displayNameEn !== undefined) {
    if (displayNameEn !== null && (typeof displayNameEn !== "string" || displayNameEn.length > 100)) {
      res.status(400).json({ error: "Ungueltiger englischer Anzeigename" }); return;
    }
    patch["displayNameEn"] = displayNameEn;
  }
  if (color !== undefined) {
    if (color !== null && (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color))) {
      res.status(400).json({ error: "Ungueltige Farbe" }); return;
    }
    patch["color"] = color;
  }
  if (sortOrder !== undefined) {
    if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder)) {
      res.status(400).json({ error: "Ungueltige Reihenfolge" }); return;
    }
    patch["sortOrder"] = sortOrder;
  }

  await db.update(rolesTable).set(patch).where(eq(rolesTable.id, id));
  verwerfeRechte();
  res.json({ id });
});

router.delete("/:id", requireAuth, requirePermission("roles.manage"), writeLimiter, async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  const schoolId = scopeOf(req);

  const [role] = await db.select().from(rolesTable)
    .where(and(eq(rolesTable.id, id), scopeCondition(schoolId))).limit(1);
  if (!role) { res.status(404).json({ error: "Nicht gefunden" }); return; }
  if (role.isSystem) {
    res.status(403).json({ error: "Eine Systemrolle kann nicht geloescht werden." }); return;
  }

  const [holders] = await db.select({ count: sql<number>`count(*)` }).from(usersTable)
    .where(sql`${usersTable.role}::text = ${role.key}`);
  const anzahl = Number(holders?.count ?? 0);
  if (anzahl > 0) {
    res.status(409).json({ error: `Dieser Rolle sind noch ${anzahl} Nutzer zugeordnet.` });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      // role_permissions haengt per Fremdschluessel mit onDelete cascade daran.
      await tx.delete(rolesTable).where(eq(rolesTable.id, id));
      await logRoleChangeTx(tx, { actorId: req.user!.userId, roleId: id, roleKey: role.key, action: "delete", before: role, after: null });
      await assertAdminReachable(tx, schoolId);
    });
  } catch (err) {
    if (err instanceof LockoutError) { res.status(409).json({ error: err.message }); return; }
    throw err;
  }

  verwerfeRechte();
  invalidateAllRoleCaches();
  res.status(204).send();
});

/**
 * Berechtigungen einer Rolle setzen. Zwei Eindaemmungen sitzen hier:
 * die Teilmengenregel (niemand vergibt oder entzieht, was er selbst nicht
 * hat) und die Sperre gegen die Vergabe von roles.manage ueber die
 * Oberflaeche.
 */
router.put("/:id/permissions", requireAuth, requirePermission("roles.manage"), writeLimiter, async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  const schoolId = scopeOf(req);
  const body = req.body as { permissions?: unknown };

  if (!Array.isArray(body.permissions)) {
    res.status(400).json({ error: "permissions muss eine Liste sein" }); return;
  }
  const requested = Array.from(new Set(body.permissions as unknown[]));
  if (!requested.every((p): p is string => typeof p === "string" && isValidPermission(p))) {
    res.status(400).json({ error: "Unbekannte Berechtigung im Antrag" }); return;
  }

  const [role] = await db.select().from(rolesTable)
    .where(and(eq(rolesTable.id, id), scopeCondition(schoolId))).limit(1);
  if (!role) { res.status(404).json({ error: "Nicht gefunden" }); return; }

  // roles.manage darf ueber diese Route nie neu hinzukommen. Wer sie schon
  // hat, behaelt sie; vergeben wird sie nur vom Seed oder vom Betreiber.
  if (requested.includes("roles.manage") && !(await roleHasPermission(id, "roles.manage"))) {
    res.status(403).json({ error: "roles.manage kann ueber die Oberflaeche nicht vergeben werden." });
    return;
  }

  const actorPerms = req.user!.permissions ?? [];
  const current = await getRolePermissions(id);
  const added = requested.filter((p) => !current.includes(p));
  const removed = current.filter((p) => !requested.includes(p));
  const notHeldByActor = [...added, ...removed].filter((p) => !actorPerms.includes(p));
  if (notHeldByActor.length > 0) {
    res.status(403).json({
      error: `Diese Berechtigungen kannst du nicht vergeben oder entziehen, weil du sie selbst nicht hast: ${notHeldByActor.join(", ")}`,
    });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, id));
      for (const p of requested) {
        await tx.insert(rolePermissionsTable).values({ id: randomUUID(), roleId: id, permission: p });
      }
      await logRoleChangeTx(tx, {
        actorId: req.user!.userId, roleId: id, roleKey: role.key, action: "set_permissions", before: current, after: requested,
      });
      await assertAdminReachable(tx, schoolId);
    });
  } catch (err) {
    if (err instanceof LockoutError) { res.status(409).json({ error: err.message }); return; }
    throw err;
  }

  // Beide Zwischenspeicher: die Zuordnung selbst und die daraus abgeleiteten
  // Rechte der angemeldeten Nutzer. Sonst wirkt der Entzug erst nach einer
  // Minute.
  verwerfeRechte();
  invalidateRoleCache(role.key);
  res.json({ permissions: requested });
});

export default router;
