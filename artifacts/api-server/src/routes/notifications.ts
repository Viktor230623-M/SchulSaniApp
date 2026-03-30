import { Router } from "express";
import { NOTIFICATIONS } from "../data/store";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

// GET /api/notifications
router.get("/", requireAuth, (req: AuthRequest, res) => {
  const { userId, role } = req.user!;
  const isAdmin = ["admin", "cto"].includes(role);
  const items = isAdmin
    ? NOTIFICATIONS
    : NOTIFICATIONS.filter((n) => n.userId === userId);
  res.json(items);
});

// POST /api/notifications/read-all
router.post("/read-all", requireAuth, (req: AuthRequest, res) => {
  const { userId } = req.user!;
  NOTIFICATIONS.filter((n) => n.userId === userId).forEach((n) => (n.isRead = true));
  res.json({ ok: true });
});

export default router;
