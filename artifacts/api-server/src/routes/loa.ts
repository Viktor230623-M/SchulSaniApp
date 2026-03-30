import { Router } from "express";
import { LOA_REQUESTS, USERS, uid } from "../data/store";
import type { LOARequest } from "../data/store";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";

const router = Router();

// GET /api/loa
router.get("/", requireAuth, (req: AuthRequest, res) => {
  const { userId, role } = req.user!;
  const canSeeAll = ["admin", "teacher", "sanitaeter_leitung", "cto"].includes(role);
  const items = canSeeAll ? LOA_REQUESTS : LOA_REQUESTS.filter((r) => r.userId === userId);
  res.json(items);
});

// POST /api/loa
router.post("/", requireAuth, (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const user = USERS.find((u) => u.id === userId);
  const { fromDate, toDate, reason } = req.body as Partial<LOARequest>;

  if (!fromDate || !toDate || !reason) {
    res.status(400).json({ error: "fromDate, toDate, reason required" });
    return;
  }

  const newReq: LOARequest = {
    id: uid(),
    userId,
    userName: user ? `${user.firstName} ${user.lastName}` : "Unbekannt",
    fromDate,
    toDate,
    reason,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  LOA_REQUESTS.unshift(newReq);
  res.status(201).json(newReq);
});

// POST /api/loa/:id/approve
router.post("/:id/approve", requireAuth, requireRole("admin", "teacher", "sanitaeter_leitung", "cto"), (req: AuthRequest, res) => {
  const r = LOA_REQUESTS.find((r) => r.id === req.params["id"]);
  if (!r) { res.status(404).json({ error: "Not found" }); return; }

  const reviewer = USERS.find((u) => u.id === req.user!.userId);
  r.status = "approved";
  r.adminNote = req.body.note;
  r.reviewedBy = reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : "Admin";
  r.reviewedAt = new Date().toISOString();
  res.json(r);
});

// POST /api/loa/:id/reject
router.post("/:id/reject", requireAuth, requireRole("admin", "teacher", "sanitaeter_leitung", "cto"), (req: AuthRequest, res) => {
  const r = LOA_REQUESTS.find((r) => r.id === req.params["id"]);
  if (!r) { res.status(404).json({ error: "Not found" }); return; }

  const reviewer = USERS.find((u) => u.id === req.user!.userId);
  r.status = "rejected";
  r.adminNote = req.body.reason ?? "Nicht möglich.";
  r.reviewedBy = reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : "Admin";
  r.reviewedAt = new Date().toISOString();
  res.json(r);
});

// POST /api/loa/:id/appeal
router.post("/:id/appeal", requireAuth, (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const r = LOA_REQUESTS.find((r) => r.id === req.params["id"]);
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  if (r.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  r.status = "appealed";
  r.appealNote = req.body.appealNote;
  res.json(r);
});

export default router;
