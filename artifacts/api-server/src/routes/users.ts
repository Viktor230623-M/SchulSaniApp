import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, type UserRole } from "@workspace/db";
import { requireAuth, requirePermission, invalidateUserCache, type AuthRequest } from "../middlewares/auth";
import { assertAdminReachable, LockoutError } from "../lib/rolePermissions";
import { logRoleChangeTx } from "../lib/roleChangeLog";
import { logProfileChangeTx } from "../lib/profileChangeLog";
import { validateProfileName } from "../lib/profileName";

// Quelle der Rollen ist der Aufzaehlungstyp user_role (siehe
// lib/db/src/schema/index.ts).
const VALID_ROLES = ["owner", "admin", "sanitaeter_leitung_admin", "sanitaeter_leitung", "teacher", "sanitaeter"] as const satisfies readonly UserRole[];

function isValidRole(value: string): value is (typeof VALID_ROLES)[number] {
  return (VALID_ROLES as readonly string[]).includes(value);
}

const router = Router();

function safeUser(u: typeof usersTable.$inferSelect) {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

// Which roles a requester is permitted to assign. Only the Owner (owner) may grant owner.
function allowedTargetRoles(requester: string): string[] {
  if (requester === "owner") return [...VALID_ROLES];
  if (requester === "admin") return ["admin", "sanitaeter_leitung", "sanitaeter"];
  if (requester === "sanitaeter_leitung_admin") return ["admin", "sanitaeter_leitung", "sanitaeter"];
  return [];
}

// Whether a requester may modify (change role of / delete) a user who currently holds existingRole.
function canModifyTarget(requester: string, existingRole: string): boolean {
  if (requester === "owner") return true;
  if (requester === "admin") return !["owner", "teacher", "sanitaeter_leitung_admin"].includes(existingRole);
  if (requester === "sanitaeter_leitung_admin") return !["owner", "teacher"].includes(existingRole);
  return false;
}

router.get("/", requireAuth, requirePermission("users.read_all"), async (_req, res) => {
  const users = await db.select().from(usersTable);
  res.json(users.map(safeUser));
});

router.get("/pending", requireAuth, requirePermission("users.read_pending"), async (_req, res) => {
  const users = await db.select().from(usersTable).where(eq(usersTable.isApproved, false));
  res.json(users.map(safeUser));
});

router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const requestingUser = req.user!;
  const requestedId = req.params["id"]!;
  
  // Fremde Profile nur mit users.read_all, eigene immer. Die feste Rollenliste
  // an dieser Stelle gab sanitaeter_leitung Zugriff, obwohl der Katalog die
  // Berechtigung nicht vergibt, und ueberlebte einen Entzug im Verwaltungs-
  // bildschirm.
  const canAccessAll = (requestingUser.permissions ?? []).includes("users.read_all");
  const isOwnData = requestingUser.userId === requestedId;
  
  if (!canAccessAll && !isOwnData) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, requestedId as string));
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(safeUser(user));
});

router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const requestingUser = req.user!;
  const requestedId = req.params["id"]!;
  
  // Users can only update their own profile
  if (requestingUser.userId !== requestedId) {
    res.status(403).json({ error: "Forbidden - can only update your own profile" });
    return;
  }
  
  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.id, requestedId));
  if (!existingUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  
  res.json(safeUser(existingUser));
});

// --- Admin endpoints ---

router.patch("/:id/approve", requireAuth, requirePermission("users.approve"), async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  const { role } = req.body as { role?: string };

  // /role sperrt das eigene Konto als Ziel, weil ein Rollenwechsel an sich
  // selbst die Rangordnung aushebeln kann (z. B. sanitaeter_leitung_admin auf
  // admin). Freischalten traegt denselben optionalen Rollenwechsel und braucht
  // deshalb dieselbe Sperre -- sonst genuegt der Umweg ueber diese Route.
  if (req.user!.userId === id) {
    res.status(403).json({ error: "Cannot approve your own account" }); return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }

  // Same gate as /role and DELETE: approving carries an optional role change, so
  // without this an admin could "approve" an owner account and demote it on the way.
  if (!canModifyTarget(req.user!.role, existing.role ?? "sanitaeter")) {
    res.status(403).json({ error: "Insufficient permissions to modify this user" }); return;
  }

  if (role) {
    // Ein Rollenwechsel ist hier derselbe Vorgang wie in /role und verlangt
    // deshalb dieselbe Berechtigung. Ohne diese Pruefung reicht allein
    // "users.approve", um jede nach allowedTargetRoles erlaubte Rolle zu
    // vergeben -- auch ohne "users.assign_role" zu besitzen.
    const hasAssignPermission = (req.user!.permissions ?? []).includes("users.assign_role");
    if (!hasAssignPermission || !allowedTargetRoles(req.user!.role).includes(role)) {
      res.status(403).json({ error: "Insufficient permissions to assign this role" }); return;
    }
  }

  const newRole: UserRole = role && isValidRole(role) ? role : existing.role ?? "sanitaeter";

  // Derselbe Rahmen wie in /role: ein Rollenwechsel gehoert ins Protokoll, und
  // die Aussperrsicherung muss auch hier greifen. Die Route kann ein bereits
  // freigeschaltetes Konto herabstufen, also auch die letzte Traegerin einer
  // wesentlichen Berechtigung -- ohne die Pruefung waere sie der Umweg um die
  // Sperre, die /role durchsetzt.
  let updated: typeof existing | undefined;
  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .update(usersTable)
        .set({ isApproved: true, approvedBy: req.user!.userId, role: newRole, updatedAt: new Date() })
        .where(eq(usersTable.id, id))
        .returning();
      updated = rows[0];
      await logRoleChangeTx(tx, {
        actorId: req.user!.userId, targetUserId: id, action: "approve",
        before: existing.role, after: newRole,
      });
      await assertAdminReachable(tx, null);
    });
  } catch (err) {
    if (err instanceof LockoutError) { res.status(409).json({ error: err.message }); return; }
    throw err;
  }
  invalidateUserCache(id);
  res.json(safeUser(updated!));
});

router.patch("/:id/role", requireAuth, requirePermission("users.assign_role"), async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  const { role } = req.body as { role: string };
  const requestorRole = req.user!.role;

  if (!role || !isValidRole(role)) {
    res.status(400).json({ error: "Invalid role" }); return;
  }
  if (req.user!.userId === id) {
    res.status(403).json({ error: "Cannot change your own role" }); return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }

  // Requester must be allowed to modify this target AND allowed to assign the new role.
  if (!canModifyTarget(requestorRole, existing.role ?? "sanitaeter") || !allowedTargetRoles(requestorRole).includes(role)) {
    res.status(403).json({ error: "Insufficient permissions to change this user's role" }); return;
  }

  let updated: typeof existing | undefined;
  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .update(usersTable)
        .set({ role, updatedAt: new Date() })
        .where(eq(usersTable.id, id))
        .returning();
      updated = rows[0];
      await logRoleChangeTx(tx, {
        actorId: req.user!.userId, targetUserId: id, action: "assign_role",
        before: existing.role, after: role,
      });
      // In derselben Transaktion, damit zwei gleichzeitige Herabstufungen
      // nicht gemeinsam den letzten Verwalter entfernen.
      await assertAdminReachable(tx, null);
    });
  } catch (err) {
    if (err instanceof LockoutError) { res.status(409).json({ error: err.message }); return; }
    throw err;
  }
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  invalidateUserCache(id);
  res.json(safeUser(updated));
});

// Korrigiert einen falsch eingegebenen Namen. Anders als PATCH /auth/profile
// (einmalig, ohne Berechtigungspruefung, Ziel aus der Sitzung) hier ein Ziel
// im Pfad plus Berechtigung -- der Weg fuer einen Verwalter, wenn der Nutzer
// seinen eigenen Namen bereits verbraucht hat.
router.patch("/:id/profile", requireAuth, requirePermission("users.correct_profile"), async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };

  // Sonst liesse sich der Einmal-Charakter aus PATCH /auth/profile ueber
  // diesen Weg umgehen: wer die Berechtigung traegt, koennte sein eigenes,
  // bereits bestaetigtes Konto beliebig oft "korrigieren".
  if (req.user!.userId === id) {
    res.status(403).json({ error: "Eigenes Konto ist kein zulaessiges Ziel" });
    return;
  }

  const { firstName, lastName } = req.body as { firstName?: unknown; lastName?: unknown };
  const cleanFirstName = validateProfileName(firstName);
  const cleanLastName = validateProfileName(lastName);
  if (!cleanFirstName || !cleanLastName) {
    res.status(400).json({ error: "Vor- und Nachname erforderlich, bis zu 100 Zeichen, ohne Steuerzeichen oder reine Ziffern." });
    return;
  }

  let existing: typeof usersTable.$inferSelect | undefined;
  let correctionError: "not_found" | "forbidden" | undefined;
  let updated: typeof usersTable.$inferSelect | undefined;
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .for("update");
    existing = locked;
    if (!locked) {
      correctionError = "not_found";
      return;
    }
    if (!canModifyTarget(req.user!.role, locked.role ?? "sanitaeter")) {
      correctionError = "forbidden";
      return;
    }

    const rows = await tx
      .update(usersTable)
      .set({ firstName: cleanFirstName, lastName: cleanLastName, profileConfirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning();
    updated = rows[0];
    if (locked.firstName !== cleanFirstName) {
      await logProfileChangeTx(tx, { actorId: req.user!.userId, targetUserId: id, field: "first_name", before: locked.firstName, after: cleanFirstName });
    }
    if (locked.lastName !== cleanLastName) {
      await logProfileChangeTx(tx, { actorId: req.user!.userId, targetUserId: id, field: "last_name", before: locked.lastName, after: cleanLastName });
    }
  });
  if (correctionError === "not_found") {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (correctionError === "forbidden") {
    res.status(403).json({ error: "Insufficient permissions to correct this user" });
    return;
  }
  invalidateUserCache(id);
  res.json(safeUser(updated!));
});

router.delete("/:id", requireAuth, requirePermission("users.delete"), async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  if (req.user!.userId === id) { res.status(403).json({ error: "Cannot delete your own account" }); return; }
  const [target] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (!canModifyTarget(req.user!.role, target.role ?? "sanitaeter")) {
    res.status(403).json({ error: "Insufficient permissions to delete this user" }); return;
  }
  let geloescht = 0;
  try {
    await db.transaction(async (tx) => {
      const result = await tx.delete(usersTable).where(eq(usersTable.id, id)).returning();
      geloescht = result.length;
      if (geloescht > 0) {
        await logRoleChangeTx(tx, {
          actorId: req.user!.userId, targetUserId: id, action: "delete_user",
          before: target.role, after: null,
        });
        await assertAdminReachable(tx, null);
      }
    });
  } catch (err) {
    if (err instanceof LockoutError) { res.status(409).json({ error: err.message }); return; }
    throw err;
  }
  if (geloescht === 0) { res.status(404).json({ error: "User not found" }); return; }
  invalidateUserCache(id);
  res.status(204).send();
});

export default router;
