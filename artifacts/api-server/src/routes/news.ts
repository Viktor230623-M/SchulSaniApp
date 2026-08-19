import { randomUUID } from "crypto";
import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, newsTable, newsReadsTable, usersTable } from "@workspace/db";
import { requireAuth, requirePermission, schoolIdOf, type AuthRequest } from "../middlewares/auth";
import { notifySanitaeters } from "../services/notifications";
import { translateToLanguages } from "../services/translator";
import { z } from "@workspace/api-zod";
import { validate } from "../middlewares/validate";

const router = Router();

const newsCreateBody = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(300).nullish(),
  content: z.string().min(1).max(10000),
  category: z.enum(["announcement", "training", "update", "alert"]).nullish(),
});

// Gelesen-Zustand ist je Nutzer, nicht je Beitrag: die fruehere Spalte is_read
// auf der news-Zeile markierte einen Beitrag fuer alle als gelesen, sobald ihn
// eine Person geoeffnet hatte. Hier traegt jede Person ihre eigene Zeile ein.
async function geleseneNewsIds(userId: string, schoolId: string): Promise<Set<string>> {
  const rows = await db
    .select({ newsId: newsReadsTable.newsId })
    .from(newsReadsTable)
    .where(and(eq(newsReadsTable.userId, userId), eq(newsReadsTable.schoolId, schoolId)));
  return new Set(rows.map((r) => r.newsId));
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const canModerate = (req.user!.permissions ?? []).includes("news.moderate");
  const items = await db.select().from(newsTable).where(eq(newsTable.schoolId, schoolId)).orderBy(desc(newsTable.publishedAt));
  const filtered = items.filter((n) => {
    if (canModerate) return true;
    if (n.status === "rejected") return false;
    return n.status === "approved" || n.authorId === userId;
  });
  const gelesen = await geleseneNewsIds(userId, schoolId);
  res.json(filtered.map((n) => ({ ...n, isRead: gelesen.has(n.id) })));
});

router.post("/", requireAuth, validate({ body: newsCreateBody }), async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const { title, summary, content, category } = req.body;
  const [user] = await db.select().from(usersTable).where(and(eq(usersTable.id, userId), eq(usersTable.schoolId, schoolId)));
  const authorName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : userId;
  const newItem: typeof newsTable.$inferInsert = {
    id: randomUUID(),
    schoolId,
    title,
    summary: summary ?? (content.length > 80 ? content.substring(0, 80) + "..." : content),
    content,
    category: category ?? "announcement",
    status: (req.user!.permissions ?? []).includes("news.publish_direct") ? "approved" as const : "pending" as const,
    publishedAt: new Date(),
    author: authorName,
    authorId: userId,
    rejectionReason: null,
  };
  await db.insert(newsTable).values(newItem);

  const t = await translateToLanguages({ title, summary: newItem.summary ?? "", content }, "de").catch(() => ({}));
  if (Object.keys(t).length > 0) {
    await db.update(newsTable).set({ translationsJson: JSON.stringify(t) }).where(and(eq(newsTable.id, newItem.id), eq(newsTable.schoolId, schoolId)));
    newItem.translationsJson = JSON.stringify(t);
  }

  res.status(201).json({ ...newItem, isRead: false });
});

router.post("/:id/approve", requireAuth, requirePermission("news.moderate"), async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const [item] = await db.update(newsTable).set({ status: "approved" }).where(and(eq(newsTable.id, req.params.id as string), eq(newsTable.schoolId, schoolId))).returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  notifySanitaeters({
    schoolId,
    type: "news",
    title: item.title,
    body: item.summary ?? "Neue Nachricht veröffentlicht",
    relatedId: item.id,
  }).catch(console.error);

  res.json(item);
});

router.post("/:id/reject", requireAuth, requirePermission("news.moderate"), async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const { reason } = req.body as { reason?: string };
  if (!reason || !reason.trim()) {
    res.status(400).json({ error: "reason is required" });
    return;
  }
  if (reason.length > 500) {
    res.status(400).json({ error: "reason max 500 characters" });
    return;
  }
  const [item] = await db.update(newsTable).set({ status: "rejected", rejectionReason: reason }).where(and(eq(newsTable.id, req.params.id as string), eq(newsTable.schoolId, schoolId))).returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(item);
});

router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const { userId, role } = req.user!;
  const schoolId = schoolIdOf(req);
  const [item] = await db.select().from(newsTable).where(and(eq(newsTable.id, req.params.id as string), eq(newsTable.schoolId, schoolId)));
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  if (item.authorId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (item.status !== "rejected") { res.status(400).json({ error: "Nur abgelehnte News können bearbeitet werden" }); return; }
  const { title, summary, content } = req.body;
  if (title && (typeof title !== "string" || title.length > 200)) {
    res.status(400).json({ error: "title max 200 characters" });
    return;
  }
  if (summary && (typeof summary !== "string" || summary.length > 300)) {
    res.status(400).json({ error: "summary max 300 characters" });
    return;
  }
  if (content && (typeof content !== "string" || content.length > 10000)) {
    res.status(400).json({ error: "content max 10000 characters" });
    return;
  }
  const [updated] = await db.update(newsTable).set({
    title: title ?? item.title,
    summary: summary ?? item.summary,
    content: content ?? item.content,
    status: "pending",
    rejectionReason: null,
  }).where(and(eq(newsTable.id, req.params.id as string), eq(newsTable.schoolId, schoolId))).returning();
  res.json(updated);
});

router.post("/:id/read", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  await db.insert(newsReadsTable).values({
    id: randomUUID(),
    schoolId,
    userId,
    newsId: req.params.id as string,
    createdAt: new Date(),
  }).onConflictDoNothing();
  res.json({ ok: true });
});

router.post("/read-all", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  // Nur veroeffentlichte Beitraege haben einen Gelesen-Zustand; eigene
  // Entwuerfe und Ablehnungen laufen nicht unter "ungelesen".
  const approved = await db.select({ id: newsTable.id }).from(newsTable).where(and(eq(newsTable.schoolId, schoolId), eq(newsTable.status, "approved")));
  if (approved.length > 0) {
    await db.insert(newsReadsTable).values(
      approved.map((n) => ({
        id: randomUUID(),
        schoolId,
        userId,
        newsId: n.id,
        createdAt: new Date(),
      })),
    ).onConflictDoNothing();
  }
  res.json({ ok: true });
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const canModerate = (req.user!.permissions ?? []).includes("news.moderate");
  const [item] = await db.select().from(newsTable).where(and(eq(newsTable.id, req.params.id as string), eq(newsTable.schoolId, schoolId)));
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  if (item.authorId !== userId && !canModerate) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  await db.delete(newsTable).where(and(eq(newsTable.id, req.params.id as string), eq(newsTable.schoolId, schoolId)));
  res.json({ ok: true });
});

export default router;
