import { Router } from "express";
import { DUTY_STATUS, USERS } from "../data/store";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

// GET /api/status — current user's duty status
router.get("/", requireAuth, (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const entry = DUTY_STATUS.get(userId) ?? {
    userId,
    status: "off_duty",
    updatedAt: new Date().toISOString(),
  };
  res.json(entry);
});

// POST /api/status — toggle duty status
router.post("/", requireAuth, (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const { status } = req.body as { status: "on_duty" | "off_duty" };

  if (!["on_duty", "off_duty"].includes(status)) {
    res.status(400).json({ error: "status must be on_duty or off_duty" });
    return;
  }

  const entry = { userId, status, updatedAt: new Date().toISOString() };
  DUTY_STATUS.set(userId, entry);
  res.json(entry);
});

// GET /api/status/on-duty — who is on duty
router.get("/on-duty", requireAuth, (_req, res) => {
  const onDuty = [...DUTY_STATUS.entries()]
    .filter(([, e]) => e.status === "on_duty")
    .map(([userId]) => {
      const u = USERS.find((u) => u.id === userId);
      if (!u) return null;
      const { passwordHash: _, ...rest } = u;
      return rest;
    })
    .filter(Boolean);
  res.json(onDuty);
});

export default router;
