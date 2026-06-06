import { randomUUID } from "crypto";
import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db, loaTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";
import { notifyUser } from "../services/notifications";
import { translateToLanguages } from "../services/translator";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId, role } = req.user!;
  const canSeeAll = ["admin", "teacher", "sanitaeter_leitung", "sanitaeter_leitung_admin", "cto"].includes(role);
  const items = canSeeAll
    ? await db.select().from(loaTable).orderBy(desc(loaTable.createdAt))
    : await db.select().from(loaTable).where(eq(loaTable.userId, userId)).orderBy(desc(loaTable.createdAt));
  res.json(items);
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const { fromDate, toDate, reason, userName } = req.body;
  if (!fromDate || !toDate || !reason) {
    res.status(400).json({ error: "fromDate, toDate, reason required" });
    return;
  }
  if (reason.length > 1000) {
    res.status(400).json({ error: "reason max 1000 characters" });
    return;
  }
  if (userName && (typeof userName !== "string" || userName.length > 200)) {
    res.status(400).json({ error: "userName max 200 characters" });
    return;
  }
  const parsedFromDate = new Date(fromDate);
  const parsedToDate = new Date(toDate);
  if (isNaN(parsedFromDate.getTime()) || isNaN(parsedToDate.getTime())) {
    res.status(400).json({ error: "fromDate and toDate must be valid ISO date strings" });
    return;
  }
  const toYMD = (d: Date) => d.toISOString().split("T")[0]!;
  const newReq = {
    id: randomUUID(),
    userId,
    userName: userName ?? userId,
    fromDate: toYMD(parsedFromDate),
    toDate: toYMD(parsedToDate),
    reason,
    status: "pending" as const,
    createdAt: new Date(),
    adminNote: null,
    appealNote: null,
    reviewedBy: null,
    reviewedAt: null,
  };
  await db.insert(loaTable).values(newReq);

  translateToLanguages({ reason }, "de")
    .then((t) => Object.keys(t).length > 0
      ? db.update(loaTable).set({ translationsJson: JSON.stringify(t) }).where(eq(loaTable.id, newReq.id))
      : null
    ).catch(() => {});

  res.status(201).json(newReq);
});

router.post("/:id/approve", requireAuth, requireRole("admin", "teacher", "sanitaeter_leitung", "sanitaeter_leitung_admin", "cto"), async (req: AuthRequest, res) => {
  const note = req.body.note;
  if (note && note.length > 500) {
    res.status(400).json({ error: "note max 500 characters" });
    return;
  }
  const [r] = await db.update(loaTable).set({
    status: "approved",
    adminNote: note ?? null,
    reviewedBy: req.user!.userId,
    reviewedAt: new Date(),
  }).where(eq(loaTable.id, req.params["id"]!)).returning();
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  
  notifyUser(r.userId, {
    type: "loa_update",
    title: "LOA genehmigt",
    body: `Dein Abwesenheitsantrag wurde genehmigt`,
    relatedId: r.id,
  }).catch(console.error);
  
  res.json(r);
});

router.post("/:id/reject", requireAuth, requireRole("admin", "teacher", "sanitaeter_leitung", "sanitaeter_leitung_admin", "cto"), async (req: AuthRequest, res) => {
  const reason = req.body.reason ?? "Nicht möglich.";
  if (reason.length > 500) {
    res.status(400).json({ error: "reason max 500 characters" });
    return;
  }
  const [r] = await db.update(loaTable).set({
    status: "rejected",
    adminNote: reason,
    reviewedBy: req.user!.userId,
    reviewedAt: new Date(),
  }).where(eq(loaTable.id, req.params["id"]!)).returning();
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  
  notifyUser(r.userId, {
    type: "loa_update",
    title: "LOA abgelehnt",
    body: `Dein Abwesenheitsantrag wurde abgelehnt`,
    relatedId: r.id,
  }).catch(console.error);
  
  res.json(r);
});

router.post("/:id/appeal", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const [existing] = await db.select().from(loaTable).where(eq(loaTable.id, req.params["id"]!));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  const appealNote = req.body.appealNote ?? null;
  if (appealNote !== null && (typeof appealNote !== "string" || appealNote.length > 1000)) {
    res.status(400).json({ error: "appealNote max 1000 characters" });
    return;
  }
  const [r] = await db.update(loaTable).set({
    status: "appealed",
    appealNote,
  }).where(eq(loaTable.id, req.params["id"]!)).returning();
  res.json(r);
});

export default router;
