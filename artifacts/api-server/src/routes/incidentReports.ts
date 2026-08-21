import { randomUUID } from "crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, incidentReportsTable, missionsTable } from "@workspace/db";
import { requireAuth, schoolIdOf, type AuthRequest } from "../middlewares/auth";
import { notifyUser } from "../services/notifications";
import { logReportAccess } from "../lib/reportAccessLog";
import { withoutReportPlaintext } from "../lib/reportSerialization";

// Der Server sieht den Inhalt eines Einsatzprotokolls nie im Klartext: Alle
// Gesundheitsfelder liegen nur als Chiffrat (content_encrypted) vor, das der
// Client mit dem schulweiten Datenschluessel erzeugt. Diese Route verwaltet
// ausschliesslich Metadaten und das Chiffrat.
const MAX_CONTENT_LENGTH = 200_000;

function isValidContent(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_CONTENT_LENGTH && /^[A-Za-z0-9+/=_-]+$/.test(value);
}

function isValidKeyVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100000;
}

function canAccessReport(
  report: typeof incidentReportsTable.$inferSelect,
  userId: string,
  perms: readonly string[]
): boolean {
  if (perms.includes("reports.read_all")) return true;
  const responderIds = (report.responderIdsJson as string[] | null) ?? [];
  return report.authorId === userId || responderIds.includes(userId);
}

// Hangt den Missionstitel an, damit der Client "Protokoll <Einsatztitel>"
// anzeigen kann, ohne die Mission separat laden zu muessen.
type ReportLike = { missionId?: string | null };
async function withMissionTitles<T extends ReportLike>(
  reports: T[]
): Promise<(T & { missionTitle: string | null })[]> {
  const missionIds = [...new Set(reports.map((r) => r.missionId).filter((m): m is string => !!m))];
  if (missionIds.length === 0) return reports.map((r) => ({ ...r, missionTitle: null }));

  const missions = await db
    .select({ id: missionsTable.id, title: missionsTable.title })
    .from(missionsTable)
    .where(inArray(missionsTable.id, missionIds));
  const byId = new Map(missions.map((m) => [m.id, m.title]));
  return reports.map((r) => ({ ...r, missionTitle: r.missionId ? (byId.get(r.missionId) ?? null) : null }));
}

const router = Router();
const reportCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Zu viele Protokolle, bitte kurz warten." },
});

// GET / — list reports (scope by access). Nur Metadaten plus Chiffrat; die
// Klartextfelder sind Teil von content_encrypted und bleiben auf dem Geraet.
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const perms: readonly string[] = req.user!.permissions ?? [];
  const { missionId, status, mine } = req.query;

  let all = await db
    .select()
    .from(incidentReportsTable)
    .where(eq(incidentReportsTable.schoolId, schoolId))
    .orderBy(desc(incidentReportsTable.createdAt));

  if (missionId) all = all.filter((r) => r.missionId === missionId);
  if (status) all = all.filter((r) => r.status === status);

  const accessible = all.filter((r) => {
    if (mine === "true") return r.authorId === userId;
    return canAccessReport(r, userId, perms);
  });

  // Ob der Aufrufer Inhalte entschluesseln kann, entscheidet sein Client an
  // der Schluesselverteilung (DEK-Umschlag) -- der Server sieht es nicht.
  logReportAccess({
    schoolId,
    userId,
    action: "list",
    patientVisible: false,
    count: accessible.length,
  });

  const withTitles = await withMissionTitles(accessible);
  res.json(withTitles.map((report) => withoutReportPlaintext(report)));
});

// GET /:id — single report
router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const perms: readonly string[] = req.user!.permissions ?? [];
  const [report] = await db
    .select()
    .from(incidentReportsTable)
    .where(and(eq(incidentReportsTable.id, (req.params.id as string)), eq(incidentReportsTable.schoolId, schoolId)));

  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  if (!canAccessReport(report, userId, perms)) { res.status(403).json({ error: "Forbidden" }); return; }

  logReportAccess({
    schoolId,
    userId,
    reportId: report.id,
    action: "detail",
    patientVisible: false,
  });

  const [withTitle] = await withMissionTitles([report]);
  res.json(withoutReportPlaintext(withTitle));
});

// POST / — create draft. Der Client verschluesselt den gesamten Inhalt und
// schickt nur Metadaten plus Chiffrat; der Titel liegt im Chiffrat.
router.post("/", requireAuth, reportCreateLimiter, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const body = req.body as Record<string, unknown>;

  const contentEncrypted = isValidContent(body["contentEncrypted"]) ? body["contentEncrypted"] : null;
  const contentKeyVersion = isValidKeyVersion(body["contentKeyVersion"]) ? body["contentKeyVersion"] : null;
  if (!contentEncrypted || !contentKeyVersion) {
    res.status(400).json({ error: "contentEncrypted und contentKeyVersion sind erforderlich." });
    return;
  }

  const missionId = typeof body["missionId"] === "string" ? body["missionId"] : null;
  const suppliedClientDraftId = body["clientDraftId"];
  const clientDraftId = suppliedClientDraftId === undefined ? null :
    typeof suppliedClientDraftId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedClientDraftId)
      ? suppliedClientDraftId
      : null;
  if (suppliedClientDraftId !== undefined && !clientDraftId) {
    res.status(400).json({ error: "clientDraftId muss eine UUID sein." });
    return;
  }

  if (clientDraftId) {
    const [existing] = await db.select().from(incidentReportsTable).where(and(
      eq(incidentReportsTable.id, clientDraftId),
      eq(incidentReportsTable.schoolId, schoolId),
    ));
    if (existing) {
      if (existing.authorId !== userId) {
        res.status(409).json({ error: "clientDraftId wird bereits verwendet." });
        return;
      }
      const [withTitle] = await withMissionTitles([existing]);
      res.json(withoutReportPlaintext(withTitle));
      return;
    }
  }

  // If linked to a mission, verify it exists and user has some relation to it
  if (missionId) {
    const [mission] = await db.select().from(missionsTable).where(and(eq(missionsTable.id, missionId), eq(missionsTable.schoolId, schoolId)));
    if (!mission) { res.status(404).json({ error: "Mission not found" }); return; }
  }

  const now = new Date();
  const id = clientDraftId ?? randomUUID();

  const incidentAt = body["incidentAt"] ? new Date(body["incidentAt"] as string) : now;
  if (isNaN(incidentAt.getTime())) {
    res.status(400).json({ error: "incidentAt muss ein gueltiges Datum sein." });
    return;
  }

  const responders = Array.isArray(body["responders"]) ? body["responders"] as string[] : [userId];

  const report: typeof incidentReportsTable.$inferInsert = {
    id,
    schoolId,
    missionId,
    authorId: userId,
    status: "draft",
    location: typeof body["location"] === "string" ? body["location"].slice(0, 200) : null,
    incidentAt,
    responderIdsJson: responders,
    contentEncrypted,
    contentKeyVersion,
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
  };

  await db.insert(incidentReportsTable).values(report);
  const [withTitle] = await withMissionTitles([report]);
  res.status(201).json(withoutReportPlaintext(withTitle));
});

// PUT /:id — update draft
router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const perms: readonly string[] = req.user!.permissions ?? [];
  const [existing] = await db
    .select()
    .from(incidentReportsTable)
    .where(and(eq(incidentReportsTable.id, (req.params.id as string)), eq(incidentReportsTable.schoolId, schoolId)));

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "draft") { res.status(400).json({ error: "Report is already submitted and locked" }); return; }

  const isAuthor = existing.authorId === userId;
  const isLeadership = perms.includes("reports.read_all");
  if (!isAuthor && !isLeadership) { res.status(403).json({ error: "Forbidden" }); return; }

  const body = req.body as Record<string, unknown>;
  const expectedUpdatedAt = typeof body["updatedAt"] === "string" ? new Date(body["updatedAt"]) : null;
  if (!expectedUpdatedAt || isNaN(expectedUpdatedAt.getTime())) {
    res.status(400).json({ error: "updatedAt ist fuer Entwurfsaenderungen erforderlich." });
    return;
  }
  if (!existing.updatedAt || existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    res.status(409).json({ error: "Das Protokoll wurde inzwischen geaendert. Bitte neu laden." });
    return;
  }
  const updates: Partial<typeof incidentReportsTable.$inferInsert> = { updatedAt: new Date() };

  const contentEncrypted = isValidContent(body["contentEncrypted"]) ? body["contentEncrypted"] : null;
  const contentKeyVersion = isValidKeyVersion(body["contentKeyVersion"]) ? body["contentKeyVersion"] : null;
  if (contentEncrypted) updates.contentEncrypted = contentEncrypted;
  if (contentKeyVersion) updates.contentKeyVersion = contentKeyVersion;

  if (body["location"] !== undefined) updates.location = typeof body["location"] === "string" ? body["location"].slice(0, 200) : null;
  if (body["incidentAt"] !== undefined) {
    const incidentAt = new Date(body["incidentAt"] as string);
    if (isNaN(incidentAt.getTime())) {
      res.status(400).json({ error: "incidentAt muss ein gueltiges Datum sein." });
      return;
    }
    updates.incidentAt = incidentAt;
  }
  if (body["responders"] !== undefined) updates.responderIdsJson = Array.isArray(body["responders"]) ? body["responders"] as string[] : [userId];

  const [updated] = await db
    .update(incidentReportsTable)
    .set(updates)
    .where(and(
      eq(incidentReportsTable.id, (req.params.id as string)),
      eq(incidentReportsTable.schoolId, schoolId),
      eq(incidentReportsTable.updatedAt, existing.updatedAt),
    ))
    .returning();

  if (!updated) {
    res.status(409).json({ error: "Das Protokoll wurde inzwischen geaendert. Bitte neu laden." });
    return;
  }

  const [withTitle] = await withMissionTitles([updated]);
  res.json(withoutReportPlaintext(withTitle));
});

// POST /:id/submit — submit and lock. Pflichtfelder prueft der Client vor dem
// Verschluesseln; der Server kann sie nicht mehr lesen.
router.post("/:id/submit", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const perms: readonly string[] = req.user!.permissions ?? [];
  const [existing] = await db
    .select()
    .from(incidentReportsTable)
    .where(and(eq(incidentReportsTable.id, (req.params.id as string)), eq(incidentReportsTable.schoolId, schoolId)));

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "draft") { res.status(400).json({ error: "Already submitted" }); return; }

  const isAuthor = existing.authorId === userId;
  const isLeadership = perms.includes("reports.read_all");
  if (!isAuthor && !isLeadership) { res.status(403).json({ error: "Forbidden" }); return; }

  if (!existing.contentEncrypted) {
    res.status(400).json({ error: "Inhalt ist noch nicht verschluesselt." });
    return;
  }

  const now = new Date();

  const [report] = await db
    .update(incidentReportsTable)
    .set({ status: "submitted", submittedAt: now, updatedAt: now })
    .where(and(
      eq(incidentReportsTable.id, (req.params.id as string)),
      eq(incidentReportsTable.schoolId, schoolId),
      eq(incidentReportsTable.status, "draft"),
    ))
    .returning();

  if (!report) {
    res.status(409).json({ error: "Das Protokoll wurde inzwischen eingereicht." });
    return;
  }

  // If linked to a mission, complete it
  if (report.missionId) {
    const [mission] = await db
      .select()
      .from(missionsTable)
      .where(and(eq(missionsTable.id, report.missionId), eq(missionsTable.schoolId, schoolId)));

    if (mission && mission.status === "accepted") {
      // Die Einsatznotizen liegen verschluesselt vor; der Server uebernimmt
      // nur den Statusabschluss, keine Inhalte.
      await db
        .update(missionsTable)
        .set({ status: "completed" })
        .where(and(eq(missionsTable.id, report.missionId), eq(missionsTable.schoolId, schoolId)));

      // Notify leadership that the mission has a report
      notifyUser(mission.requestedBy ?? "unknown", {
        schoolId,
        type: "mission_completed",
        title: "Einsatzprotokoll eingereicht",
        body: `Protokoll für "${mission.title}" wurde abgegeben`,
        relatedId: mission.id,
      }).catch(console.error);
    }
  }

  res.json(withoutReportPlaintext(report));
});

// POST /:id/addendum — Nachrichten nach dem Sperren. Der Client entschluesselt
// den Inhalt, haengt den Nachtrag an und verschluesselt den ganzen Inhalt neu.
router.post("/:id/addendum", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const perms: readonly string[] = req.user!.permissions ?? [];
  const [existing] = await db
    .select()
    .from(incidentReportsTable)
    .where(and(eq(incidentReportsTable.id, (req.params.id as string)), eq(incidentReportsTable.schoolId, schoolId)));

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!canAccessReport(existing, userId, perms)) { res.status(403).json({ error: "Forbidden" }); return; }

  const body = req.body as Record<string, unknown>;
  const contentEncrypted = isValidContent(body["contentEncrypted"]) ? body["contentEncrypted"] : null;
  const contentKeyVersion = isValidKeyVersion(body["contentKeyVersion"]) ? body["contentKeyVersion"] : null;
  const expectedUpdatedAt = typeof body["updatedAt"] === "string" ? new Date(body["updatedAt"]) : null;
  if (!contentEncrypted || !contentKeyVersion || !expectedUpdatedAt || isNaN(expectedUpdatedAt.getTime())) {
    res.status(400).json({ error: "contentEncrypted, contentKeyVersion und updatedAt sind erforderlich." });
    return;
  }

  const [updated] = await db
    .update(incidentReportsTable)
    .set({ contentEncrypted, contentKeyVersion, updatedAt: new Date() })
    .where(and(
      eq(incidentReportsTable.id, (req.params.id as string)),
      eq(incidentReportsTable.schoolId, schoolId),
      eq(incidentReportsTable.updatedAt, expectedUpdatedAt),
    ))
    .returning();

  if (!updated) {
    res.status(409).json({ error: "Das Protokoll wurde inzwischen geaendert. Bitte neu laden." });
    return;
  }

  res.json(withoutReportPlaintext(updated));
});

export default router;
