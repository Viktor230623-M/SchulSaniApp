import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, loaTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";

const router = Router();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId, role } = req.user!;
  const canSeeAll = ["admin", "teacher", "sanitaeter_leitung", "cto"].includes(role);
  const items = canSeeAll
    ? await db.select().from(loaTable)
    : await db.select().from(loaTable).where(eq(loaTable.userId, userId));
  res.json(items);
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const { fromDate, toDate, reason, userName } = req.body;
  if (!fromDate || !toDate || !reason) {
    res.status(400).json({ error: "fromDate, toDate, reason required" });
    return;
  }
  const newReq = {
    id: uid(),
    userId,
    userName: userName ?? userId,
    fromDate,
    toDate,
    reason,
    status: "pending" as const,
    createdAt: new Date(),
    adminNote: null,
    appealNote: null,
    reviewedBy: null,
    reviewedAt: null,
  };
  await db.insert(loaTable).values(newReq);
  res.status(201).json(newReq);
});

router.post("/:id/approve", requireAuth, requireRole("admin", "teacher", "sanitaeter_leitung", "cto"), async (req: AuthRequest, res) => {
  const [r] = await db.update(loaTable).set({
    status: "approved",
    adminNote: req.body.note ?? null,
    reviewedBy: req.user!.userId,
    reviewedAt: new Date(),
  }).where(eq(loaTable.id, req.params["id"]!)).returning();
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  res.json(r);
});

router.post("/:id/reject", requireAuth, requireRole("admin", "teacher", "sanitaeter_leitung", "cto"), async (req: AuthRequest, res) => {
  const [r] = await db.update(loaTable).set({
    status: "rejected",
    adminNote: req.body.reason ?? "Nicht möglich.",
    reviewedBy: req.user!.userId,
    reviewedAt: new Date(),
  }).where(eq(loaTable.id, req.params["id"]!)).returning();
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  res.json(r);
});

router.post("/:id/appeal", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const [existing] = await db.select().from(loaTable).where(eq(loaTable.id, req.params["id"]!));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  const [r] = await db.update(loaTable).set({
    status: "appealed",
    appealNote: req.body.appealNote ?? null,
  }).where(eq(loaTable.id, req.params["id"]!)).returning();
  res.json(r);
});

export default router;
