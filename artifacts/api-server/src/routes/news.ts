import { Router } from "express";
import { NEWS, USERS, uid } from "../data/store";
import type { NewsItem } from "../data/store";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";

const router = Router();

// GET /api/news
router.get("/", requireAuth, (req: AuthRequest, res) => {
  const { role, userId } = req.user!;
  const canModerate = ["admin", "teacher", "cto"].includes(role);

  const items = NEWS.filter((n) => {
    if (canModerate) return true;
    return n.status === "approved" || n.authorId === userId;
  });

  res.json(items);
});

// POST /api/news
router.post("/", requireAuth, (req: AuthRequest, res) => {
  const { userId, role } = req.user!;
  const user = USERS.find((u) => u.id === userId);
  const { title, summary, content, category } = req.body as Partial<NewsItem>;

  if (!title || !content) {
    res.status(400).json({ error: "title and content required" });
    return;
  }

  const newItem: NewsItem = {
    id: uid(),
    title,
    summary: summary ?? content.substring(0, 80) + "...",
    content,
    category: category ?? "announcement",
    status: ["admin", "cto"].includes(role) ? "approved" : "pending",
    publishedAt: new Date().toISOString(),
    author: user ? `${user.firstName} ${user.lastName}` : "Unbekannt",
    authorId: userId,
    isRead: false,
  };

  NEWS.unshift(newItem);
  res.status(201).json(newItem);
});

// POST /api/news/:id/approve — moderators only
router.post("/:id/approve", requireAuth, requireRole("admin", "teacher", "cto"), (req, res) => {
  const item = NEWS.find((n) => n.id === req.params["id"]);
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  item.status = "approved";
  res.json(item);
});

// POST /api/news/:id/reject — moderators only
router.post("/:id/reject", requireAuth, requireRole("admin", "teacher", "cto"), (req, res) => {
  const item = NEWS.find((n) => n.id === req.params["id"]);
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  item.status = "rejected";
  item.rejectionReason = req.body.reason ?? "Bitte überarbeite den Beitrag.";
  res.json(item);
});

// POST /api/news/:id/read
router.post("/:id/read", requireAuth, (req, res) => {
  const item = NEWS.find((n) => n.id === req.params["id"]);
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  item.isRead = true;
  res.json({ ok: true });
});

// POST /api/news/read-all
router.post("/read-all", requireAuth, (_req, res) => {
  NEWS.forEach((n) => (n.isRead = true));
  res.json({ ok: true });
});

// DELETE /api/news/:id
router.delete("/:id", requireAuth, (req: AuthRequest, res) => {
  const { userId, role } = req.user!;
  const canModerate = ["admin", "teacher", "cto"].includes(role);
  const idx = NEWS.findIndex((n) => n.id === req.params["id"]);

  if (idx === -1) { res.status(404).json({ error: "Not found" }); return; }

  const item = NEWS[idx]!;
  const isOwner = item.authorId === userId;

  if (!isOwner && !canModerate) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  NEWS.splice(idx, 1);
  res.json({ ok: true });
});

export default router;
