import { Router } from "express";
import { USERS, DUTY_STATUS } from "../data/store";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";

const router = Router();

function safeUser(u: (typeof USERS)[0]) {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

// GET /api/users — admin/cto only
router.get("/", requireAuth, requireRole("admin", "cto"), (_req, res) => {
  res.json(USERS.map(safeUser));
});

// GET /api/users/on-duty
router.get("/on-duty", requireAuth, (_req, res) => {
  const onDuty = [...DUTY_STATUS.entries()]
    .filter(([, entry]) => entry.status === "on_duty")
    .map(([userId]) => USERS.find((u) => u.id === userId))
    .filter(Boolean)
    .map((u) => safeUser(u!));
  res.json(onDuty);
});

// GET /api/users/:id
router.get("/:id", requireAuth, (req: AuthRequest, res) => {
  const user = USERS.find((u) => u.id === req.params["id"]);
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(safeUser(user));
});

export default router;
