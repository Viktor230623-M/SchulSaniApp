import { randomUUID } from "crypto";
import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { and, desc, eq } from "drizzle-orm";
import { db, newsTable, newsReadsTable, usersTable } from "@workspace/db";
import { requireAuth, requirePermission, schoolIdOf, type AuthRequest } from "../middlewares/auth";
import { notifySanitaeters, notifyUser } from "../services/notifications";
import { translateToLanguages } from "../services/translator";
import { z } from "@workspace/api-zod";
import { validate } from "../middlewares/validate";

const router = Router();

// Signup/Unsign togglen kann den Organisator per Push zuspammen (bei jedem
// Wechsel eine Benachrichtigung). Das Limit begrenzt den Missbrauch, ohne
// echte Teilnahmewechsel zu behindern.
const meetingSignupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Zu viele Anmeldungs-Aenderungen, bitte kurz warten." },
});

const newsCreateBody = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(300).nullish(),
  content: z.string().min(1).max(10000),
  category: z.enum(["announcement", "training", "update", "alert"]).nullish(),
  // Meeting: ein Beitrag kann ein Termin sein, zu dem sich Nutzer anmelden.
  meetingAt: z.string().nullish(),
  meetingEndAt: z.string().nullish(),
  meetingLocation: z.string().max(200).nullish(),
  meetingNotifyOnSignup: z.boolean().nullish(),
});

interface MeetingSignup {
  userId: string;
  name: string;
  signedAt: string;
}

function parseSignups(raw: unknown): MeetingSignup[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is MeetingSignup => {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return typeof o.userId === "string" && typeof o.name === "string" && typeof o.signedAt === "string";
  });
}

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
  res.json(filtered.map((n) => {
    const signups = parseSignups(n.meetingSignupsJson);
    return { ...n, isRead: gelesen.has(n.id), meetingSignups: signups, signedUp: signups.some((s) => s.userId === userId) };
  }));
});

router.post("/", requireAuth, validate({ body: newsCreateBody }), async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const { title, summary, content, category, meetingAt, meetingEndAt, meetingLocation, meetingNotifyOnSignup } = req.body;
  let meetingStart: Date | null = null;
  let meetingEnd: Date | null = null;
  if (meetingAt != null) {
    meetingStart = new Date(meetingAt);
    if (isNaN(meetingStart.getTime())) {
      res.status(400).json({ error: "meetingAt muss ein gueltiges Datum sein." });
      return;
    }
    if (meetingEndAt != null) {
      meetingEnd = new Date(meetingEndAt);
      if (isNaN(meetingEnd.getTime())) {
        res.status(400).json({ error: "meetingEndAt muss ein gueltiges Datum sein." });
        return;
      }
      if (meetingEnd.getTime() < meetingStart.getTime()) {
        res.status(400).json({ error: "meetingEndAt darf nicht vor meetingAt liegen." });
        return;
      }
    }
  } else if (meetingEndAt != null || meetingLocation != null || meetingNotifyOnSignup === true) {
    res.status(400).json({ error: "meetingAt ist erforderlich fuer Meeting-Felder." });
    return;
  }
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
    meetingAt: meetingStart,
    meetingEndAt: meetingEnd,
    meetingLocation: typeof meetingLocation === "string" ? meetingLocation.slice(0, 200) : null,
    meetingNotifyOnSignup: meetingNotifyOnSignup === true,
    meetingSignupsJson: null,
  };
  await db.insert(newsTable).values(newItem);

  // Uebersetzung ist Beiwerk: Der Beitrag darf nicht auf den MT-Dienst warten.
  // Fehler und Zeitueberschreitungen (3 s) landen im Nichts, die Antwort kommt
  // sofort.
  void translateToLanguages({ title, summary: newItem.summary ?? "", content }, "de")
    .then((t) => {
      if (Object.keys(t).length === 0) return;
      return db.update(newsTable).set({ translationsJson: JSON.stringify(t) })
        .where(and(eq(newsTable.id, newItem.id), eq(newsTable.schoolId, schoolId)));
    })
    .catch(() => {});

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

async function loadMeetingItem(req: AuthRequest, res: Response) {
  const schoolId = schoolIdOf(req);
  const [item] = await db.select().from(newsTable).where(and(eq(newsTable.id, req.params.id as string), eq(newsTable.schoolId, schoolId)));
  if (!item) { res.status(404).json({ error: "Not found" }); return null; }
  return item;
}

async function userNameOf(userId: string, schoolId: string): Promise<string> {
  const [user] = await db.select().from(usersTable).where(and(eq(usersTable.id, userId), eq(usersTable.schoolId, schoolId)));
  return user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || userId : userId;
}

// POST /:id/signup — Teilnahme an einem veroeffentlichten Meeting.
// Laeuft in einer Transaktion mit Zeilensperre: zwei gleichzeitige Anmeldungen
// duerfen sich nicht gegenseitig ueberschreiben (Lost Update).
router.post("/:id/signup", requireAuth, meetingSignupLimiter, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  await db.transaction(async (tx) => {
    const [item] = await tx.select().from(newsTable)
      .where(and(eq(newsTable.id, req.params.id as string), eq(newsTable.schoolId, schoolId)))
      .for("update")
      .limit(1);
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    if (item.status !== "approved") { res.status(400).json({ error: "Nur veroeffentlichte Meetings." }); return; }
    if (!item.meetingAt) { res.status(400).json({ error: "Dieser Beitrag ist kein Meeting." }); return; }
    if (new Date(item.meetingAt).getTime() < Date.now()) { res.status(400).json({ error: "Das Meeting ist bereits vorbei." }); return; }
    const signups = parseSignups(item.meetingSignupsJson);
    if (signups.some((s) => s.userId === userId)) { res.status(400).json({ error: "Du bist bereits angemeldet." }); return; }
    const name = await userNameOf(userId, schoolId);
    signups.push({ userId, name, signedAt: new Date().toISOString() });
    const [updated] = await tx.update(newsTable).set({ meetingSignupsJson: signups })
      .where(and(eq(newsTable.id, item.id), eq(newsTable.schoolId, schoolId))).returning();
    if (item.meetingNotifyOnSignup && item.authorId !== userId) {
      notifyUser(item.authorId, {
        schoolId,
        type: "news",
        title: `Neue Anmeldung: ${item.title}`,
        body: `${name} hat sich angemeldet (${signups.length} Teilnehmende).`,
        relatedId: item.id,
      }).catch(console.error);
    }
    res.json({ ...updated, meetingSignups: signups, signedUp: true });
  });
});

// POST /:id/unsign — Teilnahme zurueckziehen.
router.post("/:id/unsign", requireAuth, meetingSignupLimiter, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  await db.transaction(async (tx) => {
    const [item] = await tx.select().from(newsTable)
      .where(and(eq(newsTable.id, req.params.id as string), eq(newsTable.schoolId, schoolId)))
      .for("update")
      .limit(1);
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    const signups = parseSignups(item.meetingSignupsJson).filter((s) => s.userId !== userId);
    const [updated] = await tx.update(newsTable).set({ meetingSignupsJson: signups })
      .where(and(eq(newsTable.id, item.id), eq(newsTable.schoolId, schoolId))).returning();
    if (item.meetingNotifyOnSignup && item.authorId !== userId) {
      const name = await userNameOf(userId, schoolId);
      notifyUser(item.authorId, {
        schoolId,
        type: "news",
        title: `Abmeldung: ${item.title}`,
        body: `${name} hat sich abgemeldet (${signups.length} Teilnehmende).`,
        relatedId: item.id,
      }).catch(console.error);
    }
    res.json({ ...updated, meetingSignups: signups, signedUp: false });
  });
});

// POST /:id/meeting-notify — Organisator schaltet Teilnahme-Benachrichtigungen
// an/aus, auch nach der Veroeffentlichung.
router.post("/:id/meeting-notify", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const item = await loadMeetingItem(req, res);
  if (!item) return;
  if (item.authorId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  const enabled = req.body?.enabled === true;
  const [updated] = await db.update(newsTable).set({ meetingNotifyOnSignup: enabled })
    .where(and(eq(newsTable.id, req.params.id as string), eq(newsTable.schoolId, schoolId))).returning();
  res.json({ ...updated, meetingSignups: parseSignups(updated.meetingSignupsJson), signedUp: parseSignups(updated.meetingSignupsJson).some((x) => x.userId === userId) });
});

router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const [item] = await db.select().from(newsTable).where(and(eq(newsTable.id, req.params.id as string), eq(newsTable.schoolId, schoolId)));
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  if (item.authorId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (item.status !== "rejected") { res.status(400).json({ error: "Nur abgelehnte News können bearbeitet werden" }); return; }
  const { title, summary, content, meetingAt, meetingEndAt, meetingLocation, meetingNotifyOnSignup } = req.body;
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
  if (meetingLocation && (typeof meetingLocation !== "string" || meetingLocation.length > 200)) {
    res.status(400).json({ error: "meetingLocation max 200 characters" });
    return;
  }
  let meetingStart = item.meetingAt;
  let meetingEnd = item.meetingEndAt;
  if (meetingAt !== undefined) {
    if (meetingAt === null) { meetingStart = null; meetingEnd = null; }
    else {
      const d = new Date(meetingAt);
      if (isNaN(d.getTime())) { res.status(400).json({ error: "meetingAt muss ein gueltiges Datum sein." }); return; }
      meetingStart = d;
    }
  }
  if (meetingEndAt !== undefined) {
    if (meetingEndAt === null) { meetingEnd = null; }
    else {
      const d = new Date(meetingEndAt);
      if (isNaN(d.getTime())) { res.status(400).json({ error: "meetingEndAt muss ein gueltiges Datum sein." }); return; }
      meetingEnd = d;
    }
  }
  if (meetingStart && meetingEnd && meetingEnd.getTime() < meetingStart.getTime()) {
    res.status(400).json({ error: "meetingEndAt darf nicht vor meetingAt liegen." });
    return;
  }
  const [updated] = await db.update(newsTable).set({
    title: title ?? item.title,
    summary: summary ?? item.summary,
    content: content ?? item.content,
    meetingAt: meetingStart,
    meetingEndAt: meetingEnd,
    meetingLocation: meetingLocation === undefined ? item.meetingLocation : (typeof meetingLocation === "string" ? meetingLocation.slice(0, 200) : null),
    meetingNotifyOnSignup: meetingNotifyOnSignup === undefined ? item.meetingNotifyOnSignup : meetingNotifyOnSignup === true,
    status: "pending",
    rejectionReason: null,
  }).where(and(eq(newsTable.id, req.params.id as string), eq(newsTable.schoolId, schoolId))).returning();
  const signups = parseSignups(updated.meetingSignupsJson);
  res.json({ ...updated, meetingSignups: signups, signedUp: signups.some((x) => x.userId === req.user!.userId) });
});

router.post("/:id/read", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const [news] = await db
    .select({ id: newsTable.id })
    .from(newsTable)
    .where(and(eq(newsTable.id, req.params.id as string), eq(newsTable.schoolId, schoolId)))
    .limit(1);
  if (!news) {
    res.status(404).json({ error: "Not found" });
    return;
  }
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
