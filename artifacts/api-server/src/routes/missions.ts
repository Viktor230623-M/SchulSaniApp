import { Router } from "express";
import { MISSIONS, uid } from "../data/store";
import type { Mission } from "../data/store";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";

const router = Router();

// GET /api/missions
router.get("/", requireAuth, (_req, res) => {
  res.json(MISSIONS);
});

// POST /api/missions — create (admin/leitung/cto)
router.post("/", requireAuth, requireRole("admin", "sanitaeter_leitung", "cto"), (req, res) => {
  const { title, description, location, priority, scheduledFor, patientInfo } = req.body as Partial<Mission>;
  if (!title || !location) {
    res.status(400).json({ error: "title and location required" });
    return;
  }
  const m: Mission = {
    id: uid(),
    title,
    description: description ?? "",
    location,
    priority: priority ?? "medium",
    status: "pending",
    requestedAt: new Date().toISOString(),
    scheduledFor: scheduledFor ?? new Date(Date.now() + 30 * 60000).toISOString(),
    patientInfo,
  };
  MISSIONS.push(m);
  res.status(201).json(m);
});

// POST /api/missions/:id/accept
router.post("/:id/accept", requireAuth, (req: AuthRequest, res) => {
  const m = MISSIONS.find((m) => m.id === req.params["id"]);
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  m.status = "accepted";
  m.assignedParamedicId = req.user!.userId;
  res.json(m);
});

// POST /api/missions/:id/reject
router.post("/:id/reject", requireAuth, (req, res) => {
  const m = MISSIONS.find((m) => m.id === req.params["id"]);
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  m.status = "rejected";
  res.json(m);
});

// POST /api/missions/:id/complete
router.post("/:id/complete", requireAuth, (req, res) => {
  const m = MISSIONS.find((m) => m.id === req.params["id"]);
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  m.status = "completed";
  m.notes = req.body.notes;
  res.json(m);
});

export default router;
