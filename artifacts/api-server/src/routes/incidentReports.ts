import { randomUUID } from "crypto";
import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, incidentReportsTable, missionsTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { notifyUser } from "../services/notifications";
import { canSeePatientInfo, canReadAllReports } from "../lib/access";
import PDFDocument from "pdfkit";

type Addendum = { authorId: string; authorName: string; text: string; createdAt: string };

const VALID_CATEGORIES = [
  "injury_sport", "fall", "cut_wound", "bruise", "nosebleed", "head_injury",
  "faint", "dizziness", "nausea_vomiting", "headache", "abdominal_pain",
  "allergic_reaction", "asthma", "seizure", "insect_sting", "burn",
  "dental", "psychological", "circulatory", "other",
] as const;

const VALID_OUTCOMES = [
  "back_to_class", "rest_then_return", "sent_home", "picked_up_by_parents",
  "family_doctor", "ambulance_112", "hospital", "other",
] as const;

const VALID_MEASURES = [
  "wound_cleaning", "plaster", "bandage", "cooling", "elevation",
  "recovery_position", "rest", "fluids", "reassurance", "immobilization",
  "cpr", "aed", "epipen", "inhaler", "other",
] as const;

const VALID_PATIENT_TYPES = ["student", "staff", "visitor", "other"] as const;
const VALID_AVPU = ["A", "V", "P", "U"] as const;

function canAccessReport(
  report: typeof incidentReportsTable.$inferSelect,
  userId: string,
  role: string
): boolean {
  if (canReadAllReports(role)) return true;
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
  };
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
  const { userId, role } = req.user!;
  const { missionId, status, mine } = req.query;

  let all = await db
    .select()
    .from(incidentReportsTable)
    .orderBy(desc(incidentReportsTable.createdAt));

  if (missionId) all = all.filter((r) => r.missionId === missionId);
  if (status) all = all.filter((r) => r.status === status);

  const accessible = all.filter((r) => {
    if (mine === "true") return r.authorId === userId;
    return canAccessReport(r, userId, role);
  });

  const showPatient = canSeePatientInfo(role);
  const result = accessible.map((r) => {
    const responders = (r.responderIdsJson as string[] | null) ?? [];
    const isAuthorOrResponder = r.authorId === userId || responders.includes(userId);
    return showPatient || isAuthorOrResponder ? r : stripPatient(r);
  });

  res.json(result);
});

// GET /:id — single report
router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const { userId, role } = req.user!;
  const [report] = await db
    .select()
    .from(incidentReportsTable)
    .where(eq(incidentReportsTable.id, req.params["id"]!));

  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  if (!canAccessReport(report, userId, role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const showPatient = canSeePatientInfo(role) ||
    report.authorId === userId ||
    ((report.responderIdsJson as string[] | null) ?? []).includes(userId);

  res.json(showPatient ? report : stripPatient(report));
});

// POST / — create draft
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { userId } = req.user!;
  const body = req.body as Record<string, unknown>;

  const missionId = typeof body["missionId"] === "string" ? body["missionId"] : null;

  // If linked to a mission, verify it exists and user has some relation to it
  if (missionId) {
    const [mission] = await db.select().from(missionsTable).where(eq(missionsTable.id, missionId));
    if (!mission) { res.status(404).json({ error: "Mission not found" }); return; }
  }

  const now = new Date();
  const id = randomUUID();

  const report: typeof incidentReportsTable.$inferInsert = {
    id,
    schoolId: typeof body["schoolId"] === "string" ? body["schoolId"] : null,
    missionId,
    authorId: userId,
    status: "draft",
    patientType: VALID_PATIENT_TYPES.includes(body["patientType"] as any) ? body["patientType"] as string : null,
    patientFirstName: typeof body["patientFirstName"] === "string" ? body["patientFirstName"].slice(0, 100) : null,
    patientLastName: typeof body["patientLastName"] === "string" ? body["patientLastName"].slice(0, 100) : null,
    patientClass: typeof body["patientClass"] === "string" ? body["patientClass"].slice(0, 50) : null,
    incidentAt: body["incidentAt"] ? new Date(body["incidentAt"] as string) : now,
    location: typeof body["location"] === "string" ? body["location"].slice(0, 200) : null,
    careStartedAt: body["careStartedAt"] ? new Date(body["careStartedAt"] as string) : null,
    careEndedAt: body["careEndedAt"] ? new Date(body["careEndedAt"] as string) : null,
    category: VALID_CATEGORIES.includes(body["category"] as any) ? body["category"] as string : null,
    description: typeof body["description"] === "string" ? body["description"].slice(0, 3000) : null,
    measuresJson: Array.isArray(body["measures"])
      ? (body["measures"] as string[]).filter((m) => VALID_MEASURES.includes(m as any))
      : null,
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
  const { userId, role } = req.user!;
  const [existing] = await db
    .select()
    .from(incidentReportsTable)
    .where(eq(incidentReportsTable.id, req.params["id"]!));

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "draft") { res.status(400).json({ error: "Report is already submitted and locked" }); return; }

  const isAuthor = existing.authorId === userId;
  const isLeadership = canReadAllReports(role);
  if (!isAuthor && !isLeadership) { res.status(403).json({ error: "Forbidden" }); return; }

  const body = req.body as Record<string, unknown>;
  const now = new Date();

  const updates: Partial<typeof incidentReportsTable.$inferInsert> = { updatedAt: now };

  if (body["patientType"] !== undefined) updates.patientType = VALID_PATIENT_TYPES.includes(body["patientType"] as any) ? body["patientType"] as string : null;
  if (body["patientFirstName"] !== undefined) updates.patientFirstName = typeof body["patientFirstName"] === "string" ? body["patientFirstName"].slice(0, 100) : null;
  if (body["patientLastName"] !== undefined) updates.patientLastName = typeof body["patientLastName"] === "string" ? body["patientLastName"].slice(0, 100) : null;
  if (body["patientClass"] !== undefined) updates.patientClass = typeof body["patientClass"] === "string" ? body["patientClass"].slice(0, 50) : null;
  if (body["incidentAt"] !== undefined) updates.incidentAt = new Date(body["incidentAt"] as string);
  if (body["location"] !== undefined) updates.location = typeof body["location"] === "string" ? body["location"].slice(0, 200) : null;
  if (body["careStartedAt"] !== undefined) updates.careStartedAt = body["careStartedAt"] ? new Date(body["careStartedAt"] as string) : null;
  if (body["careEndedAt"] !== undefined) updates.careEndedAt = body["careEndedAt"] ? new Date(body["careEndedAt"] as string) : null;
  if (body["category"] !== undefined) updates.category = VALID_CATEGORIES.includes(body["category"] as any) ? body["category"] as string : null;
  if (body["description"] !== undefined) updates.description = typeof body["description"] === "string" ? body["description"].slice(0, 3000) : null;
  if (body["measures"] !== undefined) updates.measuresJson = Array.isArray(body["measures"]) ? (body["measures"] as string[]).filter((m) => VALID_MEASURES.includes(m as any)) : null;
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
    .where(eq(incidentReportsTable.id, req.params["id"]!))
    .returning();

  res.json(updated);
});

// POST /:id/submit — submit and lock
router.post("/:id/submit", requireAuth, async (req: AuthRequest, res) => {
  const { userId, role } = req.user!;
  const [existing] = await db
    .select()
    .from(incidentReportsTable)
    .where(eq(incidentReportsTable.id, req.params["id"]!));

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "draft") { res.status(400).json({ error: "Already submitted" }); return; }

  const isAuthor = existing.authorId === userId;
  const isLeadership = canReadAllReports(role);
  if (!isAuthor && !isLeadership) { res.status(403).json({ error: "Forbidden" }); return; }

  if (!existing.category) { res.status(400).json({ error: "category is required to submit" }); return; }
  if (!existing.outcome) { res.status(400).json({ error: "outcome is required to submit" }); return; }

  const now = new Date();

  const [report] = await db
    .update(incidentReportsTable)
    .set({ status: "submitted", submittedAt: now, updatedAt: now })
    .where(eq(incidentReportsTable.id, req.params["id"]!))
    .returning();

  // If linked to a mission, complete it
  if (report.missionId) {
    const [mission] = await db
      .select()
      .from(missionsTable)
      .where(eq(missionsTable.id, report.missionId));

    if (mission && mission.status === "accepted") {
      await db
        .update(missionsTable)
        .set({ status: "completed", notes: existing.description ?? null })
        .where(eq(missionsTable.id, report.missionId));

      // Notify leadership that the mission has a report
      notifyUser(mission.requestedBy ?? "unknown", {
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
  const { userId, role } = req.user!;
  const [existing] = await db
    .select()
    .from(incidentReportsTable)
    .where(eq(incidentReportsTable.id, req.params["id"]!));

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!canAccessReport(existing, userId, role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const text = typeof req.body["text"] === "string" ? req.body["text"].trim() : "";
  if (!text || text.length > 2000) { res.status(400).json({ error: "text required, max 2000 characters" }); return; }

  const authorName = await getAuthorName(userId);
  const addendum: Addendum = { authorId: userId, authorName, text, createdAt: new Date().toISOString() };

  const existing_addenda = (existing.addendaJson as Addendum[] | null) ?? [];
  const addenda = [...existing_addenda, addendum];

  const [updated] = await db
    .update(incidentReportsTable)
    .set({ addendaJson: addenda, updatedAt: new Date() })
    .where(eq(incidentReportsTable.id, req.params["id"]!))
    .returning();

  res.json(updated);
});

// GET /:id/pdf — render PDF
router.get("/:id/pdf", requireAuth, async (req: AuthRequest, res) => {
  const { userId, role } = req.user!;
  const lang = (req.query["lang"] === "en" ? "en" : "de") as "de" | "en";

  const [report] = await db
    .select()
    .from(incidentReportsTable)
    .where(eq(incidentReportsTable.id, req.params["id"]!));

  if (!report) { res.status(404).json({ error: "Not found" }); return; }
  if (!canAccessReport(report, userId, role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const showPatient = canSeePatientInfo(role) ||
    report.authorId === userId ||
    ((report.responderIdsJson as string[] | null) ?? []).includes(userId);

  const labels = LABELS[lang];
  const categoryLabel = (k: string) => labels.categories[k as keyof typeof labels.categories] ?? k;
  const outcomeLabel = (k: string) => labels.outcomes[k as keyof typeof labels.outcomes] ?? k;
  const measureLabel = (k: string) => labels.measures[k as keyof typeof labels.measures] ?? k;

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="einsatzprotokoll-${report.id.slice(0, 8)}.pdf"`
  );
  doc.pipe(res);

  // Header
  doc.fontSize(20).font("Helvetica-Bold").text(labels.title, { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").fillColor("#666666")
    .text(`${labels.id}: ${report.id.slice(0, 8).toUpperCase()}  |  ${report.status === "submitted" ? labels.submitted : labels.draft}`, { align: "center" });
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
  doc.moveDown(0.5);
  doc.fillColor("#000000");

  function section(title: string) {
    doc.moveDown(0.4);
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#1a1a1a").text(title);
    doc.moveDown(0.2);
    doc.fontSize(10).font("Helvetica").fillColor("#333333");
  }

  function row(label: string, value: string | null | undefined) {
    if (!value) return;
    doc.text(`${label}: ${value}`);
  }

  // Incident section
  section(labels.incident);
  row(labels.date, report.incidentAt ? new Date(report.incidentAt).toLocaleDateString(lang === "de" ? "de-DE" : "en-US") : null);
  row(labels.location, report.location);
  if (report.careStartedAt && report.careEndedAt) {
    const start = new Date(report.careStartedAt).toLocaleTimeString(lang === "de" ? "de-DE" : "en-US", { hour: "2-digit", minute: "2-digit" });
    const end = new Date(report.careEndedAt).toLocaleTimeString(lang === "de" ? "de-DE" : "en-US", { hour: "2-digit", minute: "2-digit" });
    row(labels.careTime, `${start} – ${end}`);
  }
  row(labels.category, report.category ? categoryLabel(report.category) : null);
  if (report.description) {
    doc.text(`${labels.description}:`);
    doc.text(report.description, { indent: 10 });
  }

  // Patient section
  if (showPatient) {
    section(labels.patient);
    row(labels.patientType, report.patientType ? labels.patientTypes[report.patientType as keyof typeof labels.patientTypes] : null);
    if (report.patientFirstName || report.patientLastName) {
      row(labels.patientName, `${report.patientFirstName ?? ""} ${report.patientLastName ?? ""}`.trim());
    }
    row(labels.patientClass, report.patientClass);
  }

  // Vitals section (only if any recorded)
  const hasVitals = report.pulseBpm || report.spo2 || report.respRate || report.bloodPressure || report.consciousnessAvpu || report.painScore !== null;
  if (hasVitals) {
    section(labels.vitals);
    row("Puls / Pulse", report.pulseBpm ? `${report.pulseBpm} bpm` : null);
    row("SpO2", report.spo2 ? `${report.spo2}%` : null);
    row(labels.respRate, report.respRate ? `${report.respRate}/min` : null);
    row(labels.bloodPressure, report.bloodPressure);
    row("AVPU", report.consciousnessAvpu);
    row(labels.pain, report.painScore !== null ? `${report.painScore}/10` : null);
  }

  // Treatment section
  section(labels.treatment);
  const measures = (report.measuresJson as string[] | null) ?? [];
  if (measures.length > 0) {
    doc.text(`${labels.measures_label}: ${measures.map(measureLabel).join(", ")}`);
  }
  row(labels.treatmentNotes, report.treatmentNotes);

  // Outcome section
  section(labels.outcome);
  row(labels.outcomeLabel, report.outcome ? outcomeLabel(report.outcome) : null);
  row(labels.outcomeNotes, report.outcomeNotes);

  // Responders section
  section(labels.responders);
  const responderIds = (report.responderIdsJson as string[] | null) ?? [];
  if (responderIds.length > 0) {
    const users = await db
      .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable);
    const names = responderIds
      .map((id) => {
        const u = users.find((u) => u.id === id);
        return u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : id;
      })
      .join(", ");
    doc.text(names);
  }
  row(labels.witnesses, report.witnesses);

  // Addenda
  const addenda = (report.addendaJson as Addendum[] | null) ?? [];
  if (addenda.length > 0) {
    section(labels.addenda);
    for (const a of addenda) {
      doc.fontSize(9).font("Helvetica-Bold").text(`${a.authorName} — ${new Date(a.createdAt).toLocaleDateString()}`);
      doc.fontSize(10).font("Helvetica").text(a.text, { indent: 10 });
      doc.moveDown(0.3);
    }
  }

  // Footer
  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
  doc.moveDown(0.3);
  doc.fontSize(8).fillColor("#999999")
    .text(`${labels.generated}: ${new Date().toLocaleString(lang === "de" ? "de-DE" : "en-US")}  |  ${labels.confidential}`, { align: "center" });

  doc.end();
});

const LABELS = {
  de: {
    title: "Einsatzprotokoll",
    id: "ID",
    submitted: "Eingereicht",
    draft: "Entwurf",
    incident: "Einsatzdetails",
    date: "Datum",
    location: "Ort",
    careTime: "Behandlungszeit",
    category: "Kategorie",
    description: "Beschreibung",
    patient: "Patient",
    patientType: "Typ",
    patientName: "Name",
    patientClass: "Klasse",
    patientTypes: { student: "Schüler/in", staff: "Personal", visitor: "Besucher/in", other: "Sonstige" },
    vitals: "Vitalzeichen",
    respRate: "Atemfrequenz",
    bloodPressure: "Blutdruck",
    pain: "Schmerz (NRS)",
    treatment: "Behandlung",
    measures_label: "Maßnahmen",
    treatmentNotes: "Anmerkungen",
    outcome: "Ergebnis",
    outcomeLabel: "Ausgang",
    outcomeNotes: "Anmerkungen",
    responders: "Einsatzkräfte",
    witnesses: "Zeugen",
    addenda: "Nachträge",
    generated: "Erstellt",
    confidential: "Vertraulich – nur für den Schulbetrieb",
    categories: {
      injury_sport: "Sportverletzung", fall: "Sturz", cut_wound: "Schnittwunde", bruise: "Prellung",
      nosebleed: "Nasenbluten", head_injury: "Kopfverletzung", faint: "Ohnmacht", dizziness: "Schwindel",
      nausea_vomiting: "Übelkeit / Erbrechen", headache: "Kopfschmerzen", abdominal_pain: "Bauchschmerzen",
      allergic_reaction: "Allergische Reaktion", asthma: "Asthma", seizure: "Krampfanfall",
      insect_sting: "Insektenstich", burn: "Verbrennung", dental: "Zahnsache", psychological: "Psychisch",
      circulatory: "Kreislaufproblem", other: "Sonstiges",
    },
    outcomes: {
      back_to_class: "Zurück in den Unterricht", rest_then_return: "Ausruhen, dann zurück",
      sent_home: "Nach Hause geschickt", picked_up_by_parents: "Von Eltern abgeholt",
      family_doctor: "Zum Arzt", ambulance_112: "Rettungsdienst (112)", hospital: "Krankenhaus", other: "Sonstiges",
    },
    measures: {
      wound_cleaning: "Wundreinigung", plaster: "Pflaster", bandage: "Verband", cooling: "Kühlung",
      elevation: "Hochlagerung", recovery_position: "Stabile Seitenlage", rest: "Ruhe", fluids: "Flüssigkeit",
      reassurance: "Beruhigung", immobilization: "Ruhigstellung", cpr: "HLW", aed: "AED",
      epipen: "Epipen", inhaler: "Inhalator", other: "Sonstiges",
    },
  },
  en: {
    title: "Incident Report",
    id: "ID",
    submitted: "Submitted",
    draft: "Draft",
    incident: "Incident Details",
    date: "Date",
    location: "Location",
    careTime: "Care time",
    category: "Category",
    description: "Description",
    patient: "Patient",
    patientType: "Type",
    patientName: "Name",
    patientClass: "Class",
    patientTypes: { student: "Student", staff: "Staff", visitor: "Visitor", other: "Other" },
    vitals: "Vital Signs",
    respRate: "Resp. rate",
    bloodPressure: "Blood pressure",
    pain: "Pain (NRS)",
    treatment: "Treatment",
    measures_label: "Measures",
    treatmentNotes: "Notes",
    outcome: "Outcome",
    outcomeLabel: "Outcome",
    outcomeNotes: "Notes",
    responders: "Responders",
    witnesses: "Witnesses",
    addenda: "Addenda",
    generated: "Generated",
    confidential: "Confidential – internal school use only",
    categories: {
      injury_sport: "Sports injury", fall: "Fall", cut_wound: "Cut/wound", bruise: "Bruise",
      nosebleed: "Nosebleed", head_injury: "Head injury", faint: "Fainting", dizziness: "Dizziness",
      nausea_vomiting: "Nausea/vomiting", headache: "Headache", abdominal_pain: "Abdominal pain",
      allergic_reaction: "Allergic reaction", asthma: "Asthma", seizure: "Seizure",
      insect_sting: "Insect sting", burn: "Burn", dental: "Dental", psychological: "Psychological",
      circulatory: "Circulatory", other: "Other",
    },
    outcomes: {
      back_to_class: "Back to class", rest_then_return: "Rest then return",
      sent_home: "Sent home", picked_up_by_parents: "Picked up by parents",
      family_doctor: "Family doctor", ambulance_112: "Ambulance (112/999)", hospital: "Hospital", other: "Other",
    },
    measures: {
      wound_cleaning: "Wound cleaning", plaster: "Plaster", bandage: "Bandage", cooling: "Cooling",
      elevation: "Elevation", recovery_position: "Recovery position", rest: "Rest", fluids: "Fluids",
      reassurance: "Reassurance", immobilization: "Immobilization", cpr: "CPR", aed: "AED",
      epipen: "EpiPen", inhaler: "Inhaler", other: "Other",
    },
  },
};

export default router;
