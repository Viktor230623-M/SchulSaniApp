import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, missionsTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";
import { addDismissal, getDismissedFor, removeDismissal } from "../data/dismissals";

const router = Router();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const all = await db.select().from(missionsTable);
  const dismissed = getDismissedFor(req.user!.userId);
  const visible = all.filter(
    (m: any) => m.status !== "rejected" && !dismissed.has(m.id)
  );
  res.json(visible);
});

router.post("/", requireAuth, requireRole("admin", "sanitaeter_leitung", "sanitaeter_leitung_admin", "cto", "teacher"), async (req, res) => {
  const { title, description, location, priority, scheduledFor, patientInfo } = req.body;
  if (!title || !location) {
    res.status(400).json({ error: "title and location required" });
    return;
  }
  const m = {
    id: uid(),
    title,
    description: description ?? "",
    location,
    priority: priority ?? "medium",
    status: "pending" as const,
    requestedAt: new Date(),
    scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(Date.now() + 30 * 60000),
    patientInfo: patientInfo ?? null,
    assignedParamedicId: null,
    notes: null,
  };
  await db.insert(missionsTable).values(m);
  res.status(201).json(m);
});

router.post("/:id/accept", requireAuth, async (req: AuthRequest, res) => {
  const [m] = await db.update(missionsTable).set({ status: "accepted", assignedParamedicId: req.user!.userId }).where(eq(missionsTable.id, req.params["id"]!)).returning();
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  res.json(m);
});

router.post("/:id/dismiss", requireAuth, async (req: AuthRequest, res) => {
  const missionId = req.params["id"]!;
  addDismissal(req.user!.userId, missionId);
  res.json({ success: true, missionId });
});

router.post("/:id/undismiss", requireAuth, async (req: AuthRequest, res) => {
  const missionId = req.params["id"]!;
  removeDismissal(req.user!.userId, missionId);
  res.json({ success: true, missionId });
});

router.post("/:id/reject", requireAuth, async (req, res) => {
  const [m] = await db.update(missionsTable).set({ status: "rejected" }).where(eq(missionsTable.id, req.params["id"]!)).returning();
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  res.json(m);
});

router.post("/:id/complete", requireAuth, async (req, res) => {
  const [m] = await db.update(missionsTable).set({ status: "completed", notes: req.body.notes ?? null }).where(eq(missionsTable.id, req.params["id"]!)).returning();
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  res.json(m);
});

export default router;
