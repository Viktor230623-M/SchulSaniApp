import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId, role } = req.user!;
  const canSeeAll = ["admin", "cto", "sanitaeter_leitung", "sanitaeter_leitung_admin"].includes(role);
  const items = canSeeAll
    ? await db.select().from(notificationsTable)
    : await db.select().from(notificationsTable).where(eq(notificationsTable.userId, userId));
  res.json(items);
});

router.post("/read-all", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.userId, userId));
  res.json({ ok: true });
});

export default router;
