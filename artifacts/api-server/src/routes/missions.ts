import { randomUUID } from "crypto";
import { Router } from "express";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, missionsTable, missionActivityLogTable, usersTable } from "@workspace/db";
import { requireAuth, requirePermission, schoolIdOf, type AuthRequest } from "../middlewares/auth";
import { z } from "@workspace/api-zod";
import { validate } from "../middlewares/validate";
import { addDismissal, getDismissedFor, removeDismissal } from "../data/dismissals";
import { notifyOnDutyUsers, notifyUser } from "../services/notifications";
import { translateToLanguages } from "../services/translator";


async function logMissionAction(
  userId: string,
  missionId: string,
  missionTitle: string,
  action: "accepted" | "dismissed" | "completed" | "unanswered",
  schoolId: string
): Promise<void> {
  const now = new Date();
  const [user] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.schoolId, schoolId)));
  const userName = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : userId;
  const dayKey = now.toISOString().split("T")[0]!;
  const d = new Date(now);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  const wn = 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  const weekKey = `${d.getFullYear()}-W${String(wn).padStart(2, "0")}`;
  await db.insert(missionActivityLogTable).values({
    id: randomUUID(), schoolId, userId, userName, missionId, missionTitle, action, weekKey, dayKey, createdAt: now,
  }).onConflictDoNothing();
}

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const _canSeePatient = (req.user!.permissions ?? []).includes("reports.see_patient_info");

  // Auto-archive pending/accepted missions from previous calendar days
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  await db.update(missionsTable)
    .set({ status: "archived" })
    .where(
      sql`${missionsTable.schoolId} = ${schoolId} AND ${missionsTable.status} IN ('pending', 'accepted') AND ${missionsTable.requestedAt} < ${todayStart}`
    );

  const all = await db.select().from(missionsTable).where(eq(missionsTable.schoolId, schoolId)).orderBy(desc(missionsTable.requestedAt));
  const dismissed = await getDismissedFor(req.user!.userId, schoolId);
  const visible = all
    .filter((m) => m.status !== "rejected" && m.status !== "archived" && !dismissed.has(m.id))
    .map((m) => _canSeePatient ? m : { ...m, patientInfo: undefined });
  res.json(visible);
});

const missionCreateBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  location: z.string().min(1).max(200),
  priority: z.string().optional(),
  scheduledFor: z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), "scheduledFor muss ein gueltiges Datum sein").optional(),
  patientInfo: z.unknown().optional(),
});

router.post("/", requireAuth, requirePermission("missions.create"), validate({ body: missionCreateBody }), async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const { title, description, location, priority, scheduledFor, patientInfo } = req.body;
  const parsedScheduledFor: Date | undefined = scheduledFor ? new Date(scheduledFor) : undefined;
  const m: typeof missionsTable.$inferInsert = {
    id: randomUUID(),
    title,
    description: description ?? "",
    location,
    priority: priority ?? "medium",
    status: "pending" as const,
    requestedAt: new Date(),
    requestedBy: req.user!.userId,
    schoolId,
    scheduledFor: parsedScheduledFor ?? new Date(Date.now() + 30 * 60000),
    patientInfo: patientInfo ?? null,
    assignedParamedicId: null,
    notes: null,
  };
  await db.insert(missionsTable).values(m);

  const t = await translateToLanguages({ title, description: description ?? "", location }, "de").catch(() => ({}));
  if (Object.keys(t).length > 0) {
    await db.update(missionsTable).set({ translationsJson: JSON.stringify(t) }).where(and(eq(missionsTable.id, m.id), eq(missionsTable.schoolId, schoolId)));
    m.translationsJson = JSON.stringify(t);
  }

  notifyOnDutyUsers({
    schoolId,
    type: "mission_created",
    title: "Neue Mission",
    body: `${title} - ${location}`,
    priority: priority === "high" ? "high" : "normal",
    relatedId: m.id,
  }).catch(console.error);

  res.status(201).json(m);
});

router.post("/:id/accept", requireAuth, async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const [existing] = await db.select().from(missionsTable).where(and(eq(missionsTable.id, req.params.id as string), eq(missionsTable.schoolId, schoolId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "pending") { res.status(400).json({ error: "Mission is not pending" }); return; }
  const [m] = await db.update(missionsTable).set({ status: "accepted", assignedParamedicId: req.user!.userId }).where(and(eq(missionsTable.id, req.params.id as string), eq(missionsTable.schoolId, schoolId))).returning();
  
  notifyUser(existing.requestedBy ?? "unknown", {
    schoolId,
    type: "mission_assigned",
    title: "Mission angenommen",
    body: `Deine Mission "${m.title}" wurde angenommen`,
    relatedId: m.id,
  }).catch(console.error);

  logMissionAction(req.user!.userId, m.id, m.title, "accepted", schoolId).catch(console.error);

  res.json(m);
});

router.post("/:id/dismiss", requireAuth, async (req: AuthRequest, res) => {
  const missionId = req.params.id as string;
  const schoolId = schoolIdOf(req);
  const [existing] = await db.select({ id: missionsTable.id }).from(missionsTable).where(and(eq(missionsTable.id, missionId), eq(missionsTable.schoolId, schoolId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  await addDismissal(req.user!.userId, missionId, schoolId);
  const [mission] = await db.select({ title: missionsTable.title }).from(missionsTable).where(and(eq(missionsTable.id, missionId), eq(missionsTable.schoolId, schoolId)));
  if (mission) logMissionAction(req.user!.userId, missionId, mission.title, "dismissed", schoolId).catch(console.error);
  res.json({ success: true, missionId });
});

router.post("/:id/undismiss", requireAuth, async (req: AuthRequest, res) => {
  const missionId = req.params.id as string;
  const schoolId = schoolIdOf(req);
  const [existing] = await db.select({ id: missionsTable.id }).from(missionsTable).where(and(eq(missionsTable.id, missionId), eq(missionsTable.schoolId, schoolId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  await removeDismissal(req.user!.userId, missionId, schoolId);
  res.json({ success: true, missionId });
});

router.post("/:id/reject", requireAuth, requirePermission("missions.moderate"), async (req, res) => {
  const schoolId = schoolIdOf(req);
  const [m] = await db.update(missionsTable).set({ status: "rejected" }).where(and(eq(missionsTable.id, req.params.id as string), eq(missionsTable.schoolId, schoolId))).returning();
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  res.json(m);
});

router.post("/:id/complete", requireAuth, async (req: AuthRequest, res) => {
  const notes = req.body.notes ?? null;
  if (notes !== null && (typeof notes !== "string" || notes.length > 2000)) {
    res.status(400).json({ error: "notes max 2000 characters" });
    return;
  }
  const schoolId = schoolIdOf(req);
  const [existing] = await db.select().from(missionsTable).where(and(eq(missionsTable.id, req.params.id as string), eq(missionsTable.schoolId, schoolId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const userId = req.user!.userId;
  const isLeadership = (req.user!.permissions ?? []).includes("missions.view_all");
  const isAssignedResponder = existing.assignedParamedicId === userId;
  if (!isLeadership && !isAssignedResponder) {
    res.status(403).json({ error: "Forbidden – only the assigned responder or leadership can complete this mission" });
    return;
  }

  const [m] = await db.update(missionsTable).set({ status: "completed", notes }).where(and(eq(missionsTable.id, req.params.id as string), eq(missionsTable.schoolId, schoolId))).returning();
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  
  notifyUser(m.assignedParamedicId ?? "unknown", {
    schoolId,
    type: "mission_completed",
    title: "Mission abgeschlossen",
    body: `Die Mission "${m.title}" wurde abgeschlossen`,
    relatedId: m.id,
  }).catch(console.error);

  if (m.assignedParamedicId) {
    logMissionAction(m.assignedParamedicId, m.id, m.title, "completed", schoolId).catch(console.error);
  }

  res.json(m);
});

export default router;
