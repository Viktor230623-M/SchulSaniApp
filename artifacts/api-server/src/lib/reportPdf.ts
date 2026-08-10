import PDFDocument from "pdfkit";
import { db, incidentReportsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type Addendum = { authorId: string; authorName: string; text: string; createdAt: string };
export type ReportForPdf = typeof incidentReportsTable.$inferSelect;

export const REPORT_LABELS = {
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
    patientAge: "Alter",
    emergencyContact: "Notfallkontakt",
    injurySites: "Verletzungsstellen",
    patientTypes: { student: "Schüler/in", teacher: "Lehrkraft", visitor: "Besucher/in", other: "Sonstige" },
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
    outcomes: {
      back_to_class: "Zurück in den Unterricht", rest_then_return: "Ausruhen, dann zurück",
      sent_home: "Nach Hause geschickt", picked_up_by_parents: "Von Eltern abgeholt",
      family_doctor: "Zum Arzt", ambulance_112: "Rettungsdienst (112)", hospital: "Krankenhaus", other: "Sonstiges",
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
    patientAge: "Age",
    emergencyContact: "Emergency contact",
    injurySites: "Injury sites",
    patientTypes: { student: "Student", teacher: "Teacher", visitor: "Visitor", other: "Other" },
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
    outcomes: {
      back_to_class: "Back to class", rest_then_return: "Rest then return",
      sent_home: "Sent home", picked_up_by_parents: "Picked up by parents",
      family_doctor: "Family doctor", ambulance_112: "Ambulance (112/999)", hospital: "Hospital", other: "Other",
    },
  },
} as const;

export type ReportLabels = (typeof REPORT_LABELS)["de"];

async function resolveUserNames(schoolId: string): Promise<Map<string, string>> {
  const users = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.schoolId, schoolId));
  return new Map(users.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.id]));
}

export function renderReportIntoDoc(
  doc: PDFKit.PDFDocument,
  report: ReportForPdf,
  opts: { lang: "de" | "en"; showPatient: boolean; userNameOf: (id: string) => string },
): void {
  const labels = REPORT_LABELS[opts.lang];
  const outcomeLabel = (k: string) => labels.outcomes[k as keyof typeof labels.outcomes] ?? k;
  const locale = opts.lang === "de" ? "de-DE" : "en-US";

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

  section(labels.incident);
  row(labels.date, report.incidentAt ? new Date(report.incidentAt).toLocaleDateString(locale) : null);
  row(labels.location, report.location);
  if (report.careStartedAt && report.careEndedAt) {
    const start = new Date(report.careStartedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    const end = new Date(report.careEndedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    row(labels.careTime, `${start} – ${end}`);
  }
  row(labels.category, report.category);
  if (report.description) {
    doc.text(`${labels.description}:`);
    doc.text(report.description, { indent: 10 });
  }
  row(labels.injurySites, report.injurySites);

  if (opts.showPatient) {
    section(labels.patient);
    row(labels.patientType, report.patientType ? labels.patientTypes[report.patientType as keyof typeof labels.patientTypes] : null);
    if (report.patientFirstName || report.patientLastName) {
      row(labels.patientName, `${report.patientFirstName ?? ""} ${report.patientLastName ?? ""}`.trim());
    }
    row(labels.patientClass, report.patientClass);
    row(labels.patientAge, report.patientAge !== null ? String(report.patientAge) : null);
    if (report.emergencyContactName || report.emergencyContactPhone) {
      row(labels.emergencyContact, [report.emergencyContactName, report.emergencyContactPhone].filter(Boolean).join(" · "));
    }
  }

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

  section(labels.treatment);
  row(labels.measures_label, report.measures);
  row(labels.treatmentNotes, report.treatmentNotes);

  section(labels.outcome);
  row(labels.outcomeLabel, report.outcome ? outcomeLabel(report.outcome) : null);
  row(labels.outcomeNotes, report.outcomeNotes);

  section(labels.responders);
  const responderIds = (report.responderIdsJson as string[] | null) ?? [];
  if (responderIds.length > 0) {
    doc.text(responderIds.map((id) => opts.userNameOf(id)).join(", "));
  }
  row(labels.witnesses, report.witnesses);

  const addenda = (report.addendaJson as Addendum[] | null) ?? [];
  if (addenda.length > 0) {
    section(labels.addenda);
    for (const a of addenda) {
      doc.fontSize(9).font("Helvetica-Bold").text(`${a.authorName} — ${new Date(a.createdAt).toLocaleDateString()}`);
      doc.fontSize(10).font("Helvetica").text(a.text, { indent: 10 });
      doc.moveDown(0.3);
    }
  }

  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
  doc.moveDown(0.3);
  doc.fontSize(8).fillColor("#999999")
    .text(`${labels.generated}: ${new Date().toLocaleString(locale)}  |  ${labels.confidential}`, { align: "center" });
}

/**
 * Baut ein PDF mit mehreren Protokollen, je Protokoll eine Seite.
 * Liefert das Dokument fertig geschrieben (doc.end() aufgerufen) zurueck.
 */
export function renderReportBundlePdf(reports: ReportForPdf[], opts: { lang: "de" | "en"; showPatient: boolean; schoolId: string }): Promise<PDFKit.PDFDocument> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, autoFirstPage: true });
    resolveUserNames(opts.schoolId)
      .then((names) => {
        const userNameOf = (id: string) => names.get(id) ?? id;
        reports.forEach((report, i) => {
          if (i > 0) doc.addPage();
          renderReportIntoDoc(doc, report, { lang: opts.lang, showPatient: opts.showPatient, userNameOf });
        });
        doc.end();
        resolve(doc);
      })
      .catch(reject);
  });
}
