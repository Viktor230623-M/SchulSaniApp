import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, dutyTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const [entry] = await db.select().from(dutyTable).where(eq(dutyTable.userId, userId));
  res.json(entry ?? { userId, status: "off_duty", updatedAt: new Date() });
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const { status } = req.body as { status: "on_duty" | "off_duty" };
  if (!["on_duty", "off_duty"].includes(status)) {
    res.status(400).json({ error: "status must be on_duty or off_duty" });
    return;
  }
  const entry = { userId, status, updatedAt: new Date() };
  await db.insert(dutyTable).values(entry).onConflictDoUpdate({
    target: dutyTable.userId,
    set: { status, updatedAt: new Date() },
  });
  res.json(entry);
});

router.get("/on-duty", requireAuth, async (_req, res) => {
  const onDuty = await db.select().from(dutyTable).where(eq(dutyTable.status, "on_duty"));
  const users = await Promise.all(
    onDuty.map(async (entry) => {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, entry.userId));
      if (!user) return null;
      const { passwordHash: _, ...rest } = user;
      return rest;
    })
  );
  res.json(users.filter(Boolean));
});

export default router;
