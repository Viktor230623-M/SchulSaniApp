import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, newsTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";
import { notifySanitaeters } from "../services/notifications";

const router = Router();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const { role, userId } = req.user!;
  const canModerate = ["admin", "teacher", "cto"].includes(role);
  const items = await db.select().from(newsTable);
  const filtered = items.filter((n) => {
    if (canModerate) return true;
    if (n.status === "rejected") return false;
    return n.status === "approved" || n.authorId === userId;
  });
  res.json(filtered);
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId, role } = req.user!;
  const { title, summary, content, category } = req.body;
  if (!title || !content) {
    res.status(400).json({ error: "title and content required" });
    return;
  }
  if (title.length > 200 || (summary?.length ?? 0) > 300 || content.length > 10000) {
    res.status(400).json({ error: "title max 200, summary max 300, content max 10000" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const authorName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : userId;
  const newItem = {
    id: uid(),
    title,
    summary: summary ?? content.substring(0, 80) + "...",
    content,
    category: category ?? "announcement",
    status: ["admin", "cto"].includes(role) ? "approved" as const : "pending" as const,
    publishedAt: new Date(),
    author: authorName,
    authorId: userId,
    isRead: false,
    rejectionReason: null,
  };
  await db.insert(newsTable).values(newItem);
  res.status(201).json(newItem);
});

router.post("/:id/approve", requireAuth, requireRole("admin", "teacher", "cto"), async (req, res) => {
  const [item] = await db.update(newsTable).set({ status: "approved" }).where(eq(newsTable.id, req.params["id"]!)).returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  
  notifySanitaeters({
    type: "news",
    title: item.title,
    body: item.summary ?? "Neue Nachricht veröffentlicht",
    relatedId: item.id,
  }).catch(console.error);
  
  res.json(item);
});

router.post("/:id/reject", requireAuth, requireRole("admin", "teacher", "cto"), async (req, res) => {
  const reason = req.body.reason ?? "Bitte überarbeite den Beitrag.";
  if (reason.length > 500) {
    res.status(400).json({ error: "reason max 500 characters" });
    return;
  }
  const [item] = await db.update(newsTable).set({ status: "rejected", rejectionReason: reason }).where(eq(newsTable.id, req.params["id"]!)).returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(item);
});

router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const { userId, role } = req.user!;
  const [item] = await db.select().from(newsTable).where(eq(newsTable.id, req.params["id"]!));
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  if (item.authorId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (item.status !== "rejected") { res.status(400).json({ error: "Nur abgelehnte News können bearbeitet werden" }); return; }
  const { title, summary, content } = req.body;
  const [updated] = await db.update(newsTable).set({
    title: title ?? item.title,
    summary: summary ?? item.summary,
    content: content ?? item.content,
    status: "pending",
    rejectionReason: null,
  }).where(eq(newsTable.id, req.params["id"]!)).returning();
  res.json(updated);
});

router.post("/:id/read", requireAuth, async (req, res) => {
  await db.update(newsTable).set({ isRead: true }).where(eq(newsTable.id, req.params["id"]!));
  res.json({ ok: true });
});

router.post("/read-all", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  await db.update(newsTable).set({ isRead: true }).where(eq(newsTable.authorId, userId));
  res.json({ ok: true });
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const { userId, role } = req.user!;
  const canModerate = ["admin", "teacher", "cto"].includes(role);
  const [item] = await db.select().from(newsTable).where(eq(newsTable.id, req.params["id"]!));
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  if (item.authorId !== userId && !canModerate) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  await db.delete(newsTable).where(eq(newsTable.id, req.params["id"]!));
  res.json({ ok: true });
});

export default router;
