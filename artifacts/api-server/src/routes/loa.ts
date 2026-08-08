import { randomUUID } from "crypto";
import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, loaTable, usersTable } from "@workspace/db";
import { requireAuth, requirePermission, schoolIdOf, type AuthRequest } from "../middlewares/auth";
import { notifyUser } from "../services/notifications";
import { translateToLanguages } from "../services/translator";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const canSeeAll = (req.user!.permissions ?? []).includes("loa.moderate");
  const items = canSeeAll
    ? await db.select().from(loaTable).where(eq(loaTable.schoolId, schoolId)).orderBy(desc(loaTable.createdAt))
    : await db.select().from(loaTable).where(and(eq(loaTable.userId, userId), eq(loaTable.schoolId, schoolId))).orderBy(desc(loaTable.createdAt));
  res.json(items);
});

router.post("/", requireAuth, requirePermission("loa.create"), async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const { fromDate, toDate, reason } = req.body;
  if (!fromDate || !toDate || !reason) {
    res.status(400).json({ error: "fromDate, toDate, reason required" });
    return;
  }
  if (reason.length > 1000) {
    res.status(400).json({ error: "reason max 1000 characters" });
    return;
  }
  const parsedFromDate = new Date(fromDate);
  const parsedToDate = new Date(toDate);
  if (isNaN(parsedFromDate.getTime()) || isNaN(parsedToDate.getTime())) {
    res.status(400).json({ error: "fromDate and toDate must be valid ISO date strings" });
    return;
  }
  // Derive the display name server-side from the authenticated user — never trust the client.
  const [profile] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.schoolId, schoolId)));
  const resolvedName = profile
    ? `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() || userId
    : userId;
  const toYMD = (d: Date) => d.toISOString().split("T")[0]!;
  const newReq: typeof loaTable.$inferInsert = {
    id: randomUUID(),
    schoolId,
    userId,
    userName: resolvedName,
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

  const t = await translateToLanguages({ reason }, "de").catch(() => ({}));
  if (Object.keys(t).length > 0) {
    await db.update(loaTable).set({ translationsJson: JSON.stringify(t) }).where(and(eq(loaTable.id, newReq.id), eq(loaTable.schoolId, schoolId)));
    newReq.translationsJson = JSON.stringify(t);
  }

  res.status(201).json(newReq);
});

router.post("/:id/approve", requireAuth, requirePermission("loa.moderate"), async (req: AuthRequest, res) => {
  const note = req.body.note;
  if (note && note.length > 500) {
    res.status(400).json({ error: "note max 500 characters" });
    return;
  }
  const schoolId = schoolIdOf(req);
  const [r] = await db.update(loaTable).set({
    status: "approved",
    adminNote: note ?? null,
    reviewedBy: req.user!.userId,
    reviewedAt: new Date(),
  }).where(and(eq(loaTable.id, req.params.id as string), eq(loaTable.schoolId, schoolId))).returning();
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  
  notifyUser(r.userId, {
    schoolId,
    type: "loa_update",
    title: "LOA genehmigt",
    body: `Dein Abwesenheitsantrag wurde genehmigt`,
    relatedId: r.id,
  }).catch(console.error);
  
  res.json(r);
});

router.post("/:id/reject", requireAuth, requirePermission("loa.moderate"), async (req: AuthRequest, res) => {
  const reason = req.body.reason ?? "Nicht möglich.";
  if (reason.length > 500) {
    res.status(400).json({ error: "reason max 500 characters" });
    return;
  }
  const schoolId = schoolIdOf(req);
  const [r] = await db.update(loaTable).set({
    status: "rejected",
    adminNote: reason,
    reviewedBy: req.user!.userId,
    reviewedAt: new Date(),
  }).where(and(eq(loaTable.id, req.params.id as string), eq(loaTable.schoolId, schoolId))).returning();
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  
  notifyUser(r.userId, {
    schoolId,
    type: "loa_update",
    title: "LOA abgelehnt",
    body: `Dein Abwesenheitsantrag wurde abgelehnt`,
    relatedId: r.id,
  }).catch(console.error);
  
  res.json(r);
});

router.post("/:id/appeal", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const [existing] = await db.select().from(loaTable).where(and(eq(loaTable.id, req.params.id as string), eq(loaTable.schoolId, schoolId)));
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
  }).where(and(eq(loaTable.id, req.params.id as string), eq(loaTable.schoolId, schoolId))).returning();
  res.json(r);
});

export default router;
