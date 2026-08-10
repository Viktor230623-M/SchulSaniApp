import { randomUUID } from "crypto";
import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, incidentReportsTable, missionsTable, usersTable } from "@workspace/db";
import { requireAuth, schoolIdOf, type AuthRequest } from "../middlewares/auth";
import { notifyUser } from "../services/notifications";

import { logReportAccess } from "../lib/reportAccessLog";
import PDFDocument from "pdfkit";
import { renderReportIntoDoc, type ReportForPdf } from "../lib/reportPdf";

type Addendum = { authorId: string; authorName: string; text: string; createdAt: string };

const VALID_OUTCOMES = [
  "back_to_class", "rest_then_return", "sent_home", "picked_up_by_parents",
  "family_doctor", "ambulance_112", "hospital", "other",
] as const;

const VALID_PATIENT_TYPES = ["student", "teacher", "visitor", "other"] as const;
const VALID_AVPU = ["A", "V", "P", "U"] as const;

function canAccessReport(
  report: typeof incidentReportsTable.$inferSelect,
  userId: string,
  perms: readonly string[]
): boolean {
  if (perms.includes("reports.read_all")) return true;
  const responderIds = (report.responderIdsJson as string[] | null) ?? [];
  return report.authorId === userId || responderIds.includes(userId);
}

function stripPatient(report: typeof incidentReportsTable.$inferSelect) {
  return {
    ...report,
    patientFirstName: undefined,
    patientLastName: undefined,
    patientClass: undefined,
    patientType: undefined,
    patientAge: undefined,
    emergencyContactName: undefined,
    emergencyContactPhone: undefined,
  };
}

// Hangt den Missionstitel an, damit der Client "Protokoll <Einsatztitel>"
// anzeigen kann, ohne die Mission separat laden zu muessen.
type ReportLike = { missionId: string | null };
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

async function getAuthorName(userId: string): Promise<string> {
  const [user] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : userId;
}

const router = Router();

// GET / — list reports (scope by access)
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

  const showPatient = perms.includes("reports.see_patient_info");
  const visible = accessible.map((r) => {
    const responders = (r.responderIdsJson as string[] | null) ?? [];
    const isAuthorOrResponder = r.authorId === userId || responders.includes(userId);
    return showPatient || isAuthorOrResponder ? r : stripPatient(r);
  });
  const result = await withMissionTitles(visible);

  logReportAccess({
    schoolId,
    userId,
    action: "list",
    patientVisible: showPatient,
    count: result.length,
  });

  res.json(result);
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

  const showPatient = perms.includes("reports.see_patient_info") ||
    report.authorId === userId ||
    ((report.responderIdsJson as string[] | null) ?? []).includes(userId);

  logReportAccess({
    schoolId,
    userId,
    reportId: report.id,
    action: "detail",
    patientVisible: showPatient,
  });

  const [withTitle] = await withMissionTitles([report]);
  res.json(showPatient ? withTitle : stripPatient(withTitle));
});

// POST / — create draft
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const body = req.body as Record<string, unknown>;

  const missionId = typeof body["missionId"] === "string" ? body["missionId"] : null;

  // If linked to a mission, verify it exists and user has some relation to it
  if (missionId) {
    const [mission] = await db.select().from(missionsTable).where(and(eq(missionsTable.id, missionId), eq(missionsTable.schoolId, schoolId)));
    if (!mission) { res.status(404).json({ error: "Mission not found" }); return; }
  }

  const now = new Date();
  const id = randomUUID();

  const report: typeof incidentReportsTable.$inferInsert = {
    id,
    schoolId,
    missionId,
    title: typeof body["title"] === "string" ? body["title"].trim().slice(0, 120) || null : null,
    authorId: userId,
    status: "draft",
    patientType: VALID_PATIENT_TYPES.includes(body["patientType"] as any) ? body["patientType"] as string : null,
    patientFirstName: typeof body["patientFirstName"] === "string" ? body["patientFirstName"].slice(0, 100) : null,
    patientLastName: typeof body["patientLastName"] === "string" ? body["patientLastName"].slice(0, 100) : null,
    patientClass: typeof body["patientClass"] === "string" ? body["patientClass"].slice(0, 50) : null,
    patientAge: typeof body["patientAge"] === "number" ? Math.min(120, Math.max(0, Math.trunc(body["patientAge"]))) : null,
    emergencyContactName: typeof body["emergencyContactName"] === "string" ? body["emergencyContactName"].slice(0, 100) : null,
    emergencyContactPhone: typeof body["emergencyContactPhone"] === "string" ? body["emergencyContactPhone"].slice(0, 40) : null,
    incidentAt: body["incidentAt"] ? new Date(body["incidentAt"] as string) : now,
    location: typeof body["location"] === "string" ? body["location"].slice(0, 200) : null,
    careStartedAt: body["careStartedAt"] ? new Date(body["careStartedAt"] as string) : null,
    careEndedAt: body["careEndedAt"] ? new Date(body["careEndedAt"] as string) : null,
    category: typeof body["category"] === "string" ? body["category"].slice(0, 300) : null,
    description: typeof body["description"] === "string" ? body["description"].slice(0, 3000) : null,
    injurySites: typeof body["injurySites"] === "string" ? body["injurySites"].slice(0, 500) : null,
    measures: typeof body["measures"] === "string" ? body["measures"].slice(0, 500) : null,
    treatmentNotes: typeof body["treatmentNotes"] === "string" ? body["treatmentNotes"].slice(0, 2000) : null,
    pulseBpm: typeof body["pulseBpm"] === "number" ? body["pulseBpm"] : null,
    spo2: typeof body["spo2"] === "number" ? body["spo2"] : null,
    respRate: typeof body["respRate"] === "number" ? body["respRate"] : null,
    bloodPressure: typeof body["bloodPressure"] === "string" ? body["bloodPressure"].slice(0, 20) : null,
    consciousnessAvpu: VALID_AVPU.includes(body["consciousnessAvpu"] as any) ? body["consciousnessAvpu"] as string : null,
    painScore: typeof body["painScore"] === "number" ? Math.min(10, Math.max(0, body["painScore"])) : null,
    outcome: VALID_OUTCOMES.includes(body["outcome"] as any) ? body["outcome"] as string : null,
    outcomeNotes: typeof body["outcomeNotes"] === "string" ? body["outcomeNotes"].slice(0, 2000) : null,
    responderIdsJson: Array.isArray(body["responderIds"]) ? body["responderIds"] as string[] : [userId],
    witnesses: typeof body["witnesses"] === "string" ? body["witnesses"].slice(0, 500) : null,
    addendaJson: [],
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
  };

  await db.insert(incidentReportsTable).values(report);
  res.status(201).json(report);
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
  const now = new Date();

  const updates: Partial<typeof incidentReportsTable.$inferInsert> = { updatedAt: now };

  if (body["title"] !== undefined) updates.title = typeof body["title"] === "string" ? body["title"].trim().slice(0, 120) || null : null;
  if (body["patientType"] !== undefined) updates.patientType = VALID_PATIENT_TYPES.includes(body["patientType"] as any) ? body["patientType"] as string : null;
  if (body["patientFirstName"] !== undefined) updates.patientFirstName = typeof body["patientFirstName"] === "string" ? body["patientFirstName"].slice(0, 100) : null;
  if (body["patientLastName"] !== undefined) updates.patientLastName = typeof body["patientLastName"] === "string" ? body["patientLastName"].slice(0, 100) : null;
  if (body["patientClass"] !== undefined) updates.patientClass = typeof body["patientClass"] === "string" ? body["patientClass"].slice(0, 50) : null;
  if (body["patientAge"] !== undefined) updates.patientAge = typeof body["patientAge"] === "number" ? Math.min(120, Math.max(0, Math.trunc(body["patientAge"]))) : null;
  if (body["emergencyContactName"] !== undefined) updates.emergencyContactName = typeof body["emergencyContactName"] === "string" ? body["emergencyContactName"].slice(0, 100) : null;
  if (body["emergencyContactPhone"] !== undefined) updates.emergencyContactPhone = typeof body["emergencyContactPhone"] === "string" ? body["emergencyContactPhone"].slice(0, 40) : null;
  if (body["incidentAt"] !== undefined) updates.incidentAt = new Date(body["incidentAt"] as string);
  if (body["location"] !== undefined) updates.location = typeof body["location"] === "string" ? body["location"].slice(0, 200) : null;
  if (body["careStartedAt"] !== undefined) updates.careStartedAt = body["careStartedAt"] ? new Date(body["careStartedAt"] as string) : null;
  if (body["careEndedAt"] !== undefined) updates.careEndedAt = body["careEndedAt"] ? new Date(body["careEndedAt"] as string) : null;
  if (body["category"] !== undefined) updates.category = typeof body["category"] === "string" ? body["category"].slice(0, 300) : null;
  if (body["description"] !== undefined) updates.description = typeof body["description"] === "string" ? body["description"].slice(0, 3000) : null;
  if (body["injurySites"] !== undefined) updates.injurySites = typeof body["injurySites"] === "string" ? body["injurySites"].slice(0, 500) : null;
  if (body["measures"] !== undefined) updates.measures = typeof body["measures"] === "string" ? body["measures"].slice(0, 500) : null;
  if (body["treatmentNotes"] !== undefined) updates.treatmentNotes = typeof body["treatmentNotes"] === "string" ? body["treatmentNotes"].slice(0, 2000) : null;
  if (body["pulseBpm"] !== undefined) updates.pulseBpm = typeof body["pulseBpm"] === "number" ? body["pulseBpm"] : null;
  if (body["spo2"] !== undefined) updates.spo2 = typeof body["spo2"] === "number" ? body["spo2"] : null;
  if (body["respRate"] !== undefined) updates.respRate = typeof body["respRate"] === "number" ? body["respRate"] : null;
  if (body["bloodPressure"] !== undefined) updates.bloodPressure = typeof body["bloodPressure"] === "string" ? body["bloodPressure"].slice(0, 20) : null;
  if (body["consciousnessAvpu"] !== undefined) updates.consciousnessAvpu = VALID_AVPU.includes(body["consciousnessAvpu"] as any) ? body["consciousnessAvpu"] as string : null;
  if (body["painScore"] !== undefined) updates.painScore = typeof body["painScore"] === "number" ? Math.min(10, Math.max(0, body["painScore"])) : null;
  if (body["outcome"] !== undefined) updates.outcome = VALID_OUTCOMES.includes(body["outcome"] as any) ? body["outcome"] as string : null;
  if (body["outcomeNotes"] !== undefined) updates.outcomeNotes = typeof body["outcomeNotes"] === "string" ? body["outcomeNotes"].slice(0, 2000) : null;
  if (body["responderIds"] !== undefined) updates.responderIdsJson = Array.isArray(body["responderIds"]) ? body["responderIds"] as string[] : [userId];
  if (body["witnesses"] !== undefined) updates.witnesses = typeof body["witnesses"] === "string" ? body["witnesses"].slice(0, 500) : null;

  const [updated] = await db
    .update(incidentReportsTable)
    .set(updates)
    .where(and(eq(incidentReportsTable.id, (req.params.id as string)), eq(incidentReportsTable.schoolId, schoolId)))
    .returning();

  const [withTitle] = await withMissionTitles([updated]);
  res.json(withTitle);
});

// POST /:id/submit — submit and lock
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

  if (!existing.category) { res.status(400).json({ error: "category is required to submit" }); return; }
  if (!existing.outcome) { res.status(400).json({ error: "outcome is required to submit" }); return; }

  const now = new Date();

  const [report] = await db
    .update(incidentReportsTable)
    .set({ status: "submitted", submittedAt: now, updatedAt: now })
    .where(and(eq(incidentReportsTable.id, (req.params.id as string)), eq(incidentReportsTable.schoolId, schoolId)))
    .returning();

  // If linked to a mission, complete it
  if (report.missionId) {
    const [mission] = await db
      .select()
      .from(missionsTable)
      .where(and(eq(missionsTable.id, report.missionId), eq(missionsTable.schoolId, schoolId)));

    if (mission && mission.status === "accepted") {
      await db
        .update(missionsTable)
        .set({ status: "completed", notes: existing.description ?? null })
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

  res.json(report);
});

// POST /:id/addendum — add a note after locking
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

  const text = typeof req.body["text"] === "string" ? req.body["text"].trim() : "";
  if (!text || text.length > 2000) { res.status(400).json({ error: "text required, max 2000 characters" }); return; }

  const authorName = await getAuthorName(userId);
  const addendum: Addendum = { authorId: userId, authorName, text, createdAt: new Date().toISOString() };

  const existing_addenda = (existing.addendaJson as Addendum[] | null) ?? [];
  const addenda = [...existing_addenda, addendum];

  const [updated] = await db
    .update(incidentReportsTable)
    .set({ addendaJson: addenda, updatedAt: new Date() })
    .where(and(eq(incidentReportsTable.id, (req.params.id as string)), eq(incidentReportsTable.schoolId, schoolId)))
    .returning();

  res.json(updated);
});

// GET /:id/pdf — render PDF
router.get("/:id/pdf", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const schoolId = schoolIdOf(req);
  const perms: readonly string[] = req.user!.permissions ?? [];
  const lang = (req.query["lang"] === "en" ? "en" : "de") as "de" | "en";

  const [report] = await db
    .select()
    .from(incidentReportsTable)
    .where(and(eq(incidentReportsTable.id, (req.params.id as string)), eq(incidentReportsTable.schoolId, schoolId)));

  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  if (!canAccessReport(report, userId, perms)) { res.status(403).json({ error: "Forbidden" }); return; }

  const showPatient = perms.includes("reports.see_patient_info") ||
    report.authorId === userId ||
    ((report.responderIdsJson as string[] | null) ?? []).includes(userId);

  logReportAccess({
    schoolId,
    userId: req.user!.userId,
    reportId: report.id,
    action: "pdf",
    patientVisible: showPatient,
  });

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="einsatzprotokoll-${report.id.slice(0, 8)}.pdf"`
  );
  doc.pipe(res);

  renderReportIntoDoc(doc, report as ReportForPdf, {
    lang,
    showPatient,
    userNameOf: (id) => id,
  });

  doc.end();
});

export default router;
