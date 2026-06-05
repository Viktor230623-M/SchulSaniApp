import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";

const VALID_ROLES = ["cto", "admin", "sanitaeter_leitung_admin", "sanitaeter_leitung", "teacher", "sanitaeter", "student_paramedic"] as const;

const router = Router();

function safeUser(u: typeof usersTable.$inferSelect) {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

router.get("/", requireAuth, requireRole("admin", "cto", "sanitaeter_leitung_admin", "teacher"), async (_req, res) => {
  const users = await db.select().from(usersTable);
  res.json(users.map(safeUser));
});

router.get("/on-duty", requireAuth, async (_req, res) => {
  const users = await db.select().from(usersTable);
  res.json(users.map(safeUser));
});

router.get("/pending", requireAuth, requireRole("admin", "cto"), async (_req, res) => {
  const users = await db.select().from(usersTable).where(eq(usersTable.isApproved, false));
  res.json(users.map(safeUser));
});

router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const requestingUser = req.user!;
  const requestedId = req.params["id"]!;
  
  // Allow users to access their own data or allow admins/teachers to access any
  const canAccessAll = ["admin", "cto", "teacher", "sanitaeter_leitung_admin", "sanitaeter_leitung"].includes(requestingUser.role);
  const isOwnData = requestingUser.userId === requestedId;
  
  if (!canAccessAll && !isOwnData) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, requestedId));
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

router.patch("/:id/approve", requireAuth, requireRole("admin", "cto"), async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  const { role } = req.body as { role?: string };

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }

  const newRole = role && (VALID_ROLES as readonly string[]).includes(role) ? role : existing.role ?? "sanitaeter";
  const [updated] = await db
    .update(usersTable)
    .set({ isApproved: true, approvedBy: req.user!.userId, role: newRole, updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning();
  res.json(safeUser(updated!));
});

router.patch("/:id/role", requireAuth, requireRole("admin", "cto"), async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  const { role } = req.body as { role: string };

  if (!role || !(VALID_ROLES as readonly string[]).includes(role)) {
    res.status(400).json({ error: "Invalid role" }); return;
  }
  if (req.user!.userId === id && req.user!.role !== "cto") {
    res.status(403).json({ error: "Cannot change your own role" }); return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ role, updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json(safeUser(updated));
});

router.delete("/:id", requireAuth, requireRole("admin", "cto"), async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  if (req.user!.userId === id) { res.status(403).json({ error: "Cannot delete your own account" }); return; }
  const result = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  if (result.length === 0) { res.status(404).json({ error: "User not found" }); return; }
  res.status(204).send();
});

export default router;
