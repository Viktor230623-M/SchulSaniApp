import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, missionsTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";

const router = Router();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

router.get("/", requireAuth, async (_req, res) => {
  const missions = await db.select().from(missionsTable);
  res.json(missions);
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
