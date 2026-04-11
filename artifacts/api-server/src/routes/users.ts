import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";

const router = Router();

function safeUser(u: typeof usersTable.$inferSelect) {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

router.get("/", requireAuth, requireRole("admin", "cto", "sanitaeter_leitung_admin"), async (_req, res) => {
  const users = await db.select().from(usersTable);
  res.json(users.map(safeUser));
});

router.get("/on-duty", requireAuth, async (_req, res) => {
  const users = await db.select().from(usersTable);
  res.json(users.map(safeUser));
});

router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.params["id"]!));
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(safeUser(user));
});

export default router;
