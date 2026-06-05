import { randomUUID } from "crypto";
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, missionsTable, missionActivityLogTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";
import { addDismissal, getDismissedFor, removeDismissal } from "../data/dismissals";
import { notifySanitaeters, notifyUser } from "../services/notifications";

async function logMissionAction(
  userId: string,
  missionId: string,
  missionTitle: string,
  action: "accepted" | "dismissed" | "completed" | "unanswered"
): Promise<void> {
  const now = new Date();
  const [user] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const userName = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : userId;
  const dayKey = now.toISOString().split("T")[0]!;
  const d = new Date(now);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  const wn = 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  const weekKey = `${d.getFullYear()}-W${String(wn).padStart(2, "0")}`;
  await db.insert(missionActivityLogTable).values({
    id: randomUUID(), userId, userName, missionId, missionTitle, action, weekKey, dayKey, createdAt: now,
  }).onConflictDoNothing();
}

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const role = req.user!.role;
  const canSeePatientInfo = ["admin", "cto", "sanitaeter_leitung", "sanitaeter_leitung_admin", "teacher"].includes(role);
  const all = await db.select().from(missionsTable);
  const dismissed = await getDismissedFor(req.user!.userId);
  const visible = all
    .filter((m) => m.status !== "rejected" && !dismissed.has(m.id))
    .map((m) => canSeePatientInfo ? m : { ...m, patientInfo: undefined });
  res.json(visible);
});

router.post("/", requireAuth, requireRole("admin", "sanitaeter_leitung", "sanitaeter_leitung_admin", "cto", "teacher"), async (req, res) => {
  const { title, description, location, priority, scheduledFor, patientInfo } = req.body;
  if (!title || !location) {
    res.status(400).json({ error: "title and location required" });
    return;
  }
  if (title.length > 200 || (description?.length ?? 0) > 2000 || location.length > 200) {
    res.status(400).json({ error: "title max 200, description max 2000, location max 200" });
    return;
  }
  let parsedScheduledFor: Date | undefined;
  if (scheduledFor) {
    parsedScheduledFor = new Date(scheduledFor);
    if (isNaN(parsedScheduledFor.getTime())) {
      res.status(400).json({ error: "scheduledFor must be a valid ISO date string" });
      return;
    }
  }
  const m = {
    id: randomUUID(),
    title,
    description: description ?? "",
    location,
    priority: priority ?? "medium",
    status: "pending" as const,
    requestedAt: new Date(),
    requestedBy: req.user!.userId,
    scheduledFor: parsedScheduledFor ?? new Date(Date.now() + 30 * 60000),
    patientInfo: patientInfo ?? null,
    assignedParamedicId: null,
    notes: null,
  };
  await db.insert(missionsTable).values(m);
  
  notifySanitaeters({
    type: "mission_created",
    title: "Neue Mission",
    body: `${title} - ${location}`,
    priority: priority === "high" ? "high" : "normal",
    relatedId: m.id,
  }).catch(console.error);
  
  res.status(201).json(m);
});

router.post("/:id/accept", requireAuth, async (req: AuthRequest, res) => {
  const [existing] = await db.select().from(missionsTable).where(eq(missionsTable.id, req.params["id"]!));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "pending") { res.status(400).json({ error: "Mission is not pending" }); return; }
  const [m] = await db.update(missionsTable).set({ status: "accepted", assignedParamedicId: req.user!.userId }).where(eq(missionsTable.id, req.params["id"]!)).returning();
  
  notifyUser(existing.requestedBy ?? "unknown", {
    type: "mission_assigned",
    title: "Mission angenommen",
    body: `Deine Mission "${m.title}" wurde angenommen`,
    relatedId: m.id,
  }).catch(console.error);

  logMissionAction(req.user!.userId, m.id, m.title, "accepted").catch(console.error);

  res.json(m);
});

router.post("/:id/dismiss", requireAuth, async (req: AuthRequest, res) => {
  const missionId = req.params["id"]!;
  await addDismissal(req.user!.userId, missionId);
  const [mission] = await db.select({ title: missionsTable.title }).from(missionsTable).where(eq(missionsTable.id, missionId));
  if (mission) logMissionAction(req.user!.userId, missionId, mission.title, "dismissed").catch(console.error);
  res.json({ success: true, missionId });
});

router.post("/:id/undismiss", requireAuth, async (req: AuthRequest, res) => {
  const missionId = req.params["id"]!;
  await removeDismissal(req.user!.userId, missionId);
  res.json({ success: true, missionId });
});

router.post("/:id/reject", requireAuth, requireRole("admin", "sanitaeter_leitung", "sanitaeter_leitung_admin", "cto", "teacher"), async (req, res) => {
  const [m] = await db.update(missionsTable).set({ status: "rejected" }).where(eq(missionsTable.id, req.params["id"]!)).returning();
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  res.json(m);
});

router.post("/:id/complete", requireAuth, requireRole("admin", "sanitaeter_leitung", "sanitaeter_leitung_admin", "cto", "teacher"), async (req: AuthRequest, res) => {
  const notes = req.body.notes ?? null;
  if (notes !== null && (typeof notes !== "string" || notes.length > 2000)) {
    res.status(400).json({ error: "notes max 2000 characters" });
    return;
  }
  const [m] = await db.update(missionsTable).set({ status: "completed", notes }).where(eq(missionsTable.id, req.params["id"]!)).returning();
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  
  notifyUser(m.assignedParamedicId ?? "unknown", {
    type: "mission_completed",
    title: "Mission abgeschlossen",
    body: `Die Mission "${m.title}" wurde abgeschlossen`,
    relatedId: m.id,
  }).catch(console.error);

  if (m.assignedParamedicId) {
    logMissionAction(m.assignedParamedicId, m.id, m.title, "completed").catch(console.error);
  }

  res.json(m);
});

export default router;
