import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";

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

export default router;
