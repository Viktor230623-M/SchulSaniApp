import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { IncidentReport } from "@/models";

/**
 * PDF-Erzeugung im Client: Die Einsatzprotokolle sind Ende-zu-Ende
 * verschluesselt, der Server kann keine PDFs mehr bauen. Dieses Modul rendert
 * ein einzelnes Protokoll oder ein Buendel aus dem bereits entschluesselten
 * Inhalt (pdf-lib, reines JS, Standard-Fonts).
 */

type Lang = "de" | "en";

const LABELS: Record<Lang, Record<string, string>> = {
  de: {
    title: "Einsatzprotokoll",
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
    patientSex: "Geschlecht",
    patientBirthDate: "Geburtsdatum",
    teacherName: "Lehrer",
    emergencyContact: "Notfallkontakt",
    injurySites: "Verletzungsstellen",
    assessment: "Erstbefund",
    breathing: "Atmung",
    skinColor: "Hautfarbe",
    pulseRegularity: "Puls regelmäßig",
    orientation: "Orientierung",
    pupils: "Pupillen",
    pupilReaction: "Lichtreaktion",
    interview: "Befragung",
    complaintHistory: "Beschwerdebeginn und -verlauf",
    medications: "Medikamente",
    allergies: "Allergien",
    progress: "Verlauf",
    progressNotes: "Verlauf während der Hilfeleistung",
    recheckMeasurement: "Messung",
    recheckTime: "Zeit",
    vitals: "Vitalzeichen",
    pulse: "Puls",
    respRate: "Atemfrequenz",
    bloodPressure: "Blutdruck",
    pain: "Schmerz (NRS)",
    treatment: "Behandlung",
    measures: "Maßnahmen",
    treatmentNotes: "Anmerkungen",
    outcome: "Ergebnis",
    outcomeNotes: "Anmerkungen",
    leadingSymptom: "Leitsymptom",
    handoverProperty: "Patienteneigentum übergeben",
    accompaniedBy: "In Begleitung",
    signatures: "Unterschriften",
    responders: "Einsatzkräfte",
    witnesses: "Zeugen",
    addenda: "Nachträge",
    generated: "Erstellt",
    confidential: "Vertraulich – nur für den Schulbetrieb",
    disclaimer: "Keine ärztliche Anleitung: führe nur Maßnahmen durch, die du aus deiner Ausbildung kennst. Im Notfall: 112 anrufen.",
    draft: "Entwurf",
    submitted: "Eingereicht",
  },
  en: {
    title: "Incident Report",
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
    patientSex: "Sex",
    patientBirthDate: "Date of birth",
    teacherName: "Teacher",
    emergencyContact: "Emergency contact",
    injurySites: "Injury sites",
    assessment: "Initial Assessment",
    breathing: "Breathing",
    skinColor: "Skin colour",
    pulseRegularity: "Pulse regular",
    orientation: "Orientation",
    pupils: "Pupils",
    pupilReaction: "Light reaction",
    interview: "Interview",
    complaintHistory: "Onset and course of complaints",
    medications: "Medication",
    allergies: "Allergies",
    progress: "Progress",
    progressNotes: "Progress during care",
    recheckMeasurement: "Measurement",
    recheckTime: "Time",
    vitals: "Vital Signs",
    pulse: "Pulse",
    respRate: "Resp. rate",
    bloodPressure: "Blood pressure",
    pain: "Pain (NRS)",
    treatment: "Treatment",
    measures: "Measures",
    treatmentNotes: "Notes",
    outcome: "Outcome",
    outcomeNotes: "Notes",
    leadingSymptom: "Leading symptom",
    handoverProperty: "Patient property handed over",
    accompaniedBy: "Accompanied by",
    signatures: "Signatures",
    responders: "Responders",
    witnesses: "Witnesses",
    addenda: "Addenda",
    generated: "Generated",
    confidential: "Confidential – internal school use only",
    disclaimer: "Not medical instruction: only perform measures you know from your training. In an emergency, call 112.",
    draft: "Draft",
    submitted: "Submitted",
  },
};

const PATIENT_TYPES: Record<string, Record<Lang, string>> = {
  student: { de: "Schüler/in", en: "Student" },
  teacher: { de: "Lehrkraft", en: "Teacher" },
  visitor: { de: "Besucher/in", en: "Visitor" },
  other: { de: "Sonstige", en: "Other" },
};

const SEXES: Record<string, Record<Lang, string>> = {
  female: { de: "weiblich", en: "female" },
  male: { de: "männlich", en: "male" },
  diverse: { de: "divers", en: "diverse" },
  unspecified: { de: "keine Angabe", en: "not specified" },
};

const BREATHING: Record<string, Record<Lang, string>> = {
  spontaneous: { de: "spontan / frei", en: "spontaneous / free" },
  respiratory_distress: { de: "Atemnot", en: "respiratory distress" },
  hyperventilation: { de: "Hyperventilation", en: "hyperventilation" },
  apnea: { de: "Atemstillstand", en: "apnoea" },
};

const SKIN_COLORS: Record<string, Record<Lang, string>> = {
  normal: { de: "normal", en: "normal" },
  pale: { de: "blass", en: "pale" },
  flushed: { de: "gerötet", en: "flushed" },
  bluish: { de: "bläulich", en: "bluish" },
};

const PULSE_REGULAR: Record<string, Record<Lang, string>> = {
  regular: { de: "regelmäßig", en: "regular" },
  irregular: { de: "unregelmäßig", en: "irregular" },
};

const ORIENTATIONS: Record<string, Record<Lang, string>> = {
  responsive: { de: "ansprechbar", en: "responsive" },
  person: { de: "zur Person orientiert", en: "oriented to person" },
  place: { de: "örtlich orientiert", en: "oriented to place" },
  time: { de: "zeitlich orientiert", en: "oriented to time" },
};

const PUPIL_SIZES: Record<string, Record<Lang, string>> = {
  constricted: { de: "eng", en: "constricted" },
  normal: { de: "mittel", en: "normal" },
  dilated: { de: "weit", en: "dilated" },
};

const PUPIL_REACTIONS: Record<string, Record<Lang, string>> = {
  normal: { de: "vorhanden", en: "reactive" },
  sluggish: { de: "träge", en: "sluggish" },
  absent: { de: "keine Reaktion", en: "no reaction" },
};

const PROPERTY: Record<string, Record<Lang, string>> = {
  jacket: { de: "Jacke", en: "Jacket" },
  bag: { de: "Tasche", en: "Bag" },
  other: { de: "Sonstiges", en: "Other" },
};

const OUTCOMES: Record<string, Record<Lang, string>> = {
  back_to_class: { de: "Zurück in den Unterricht", en: "Back to class" },
  rest_then_return: { de: "Ausruhen, dann zurück", en: "Rest then return" },
  sent_home: { de: "Nach Hause geschickt", en: "Sent home" },
  picked_up_by_parents: { de: "Von Eltern abgeholt", en: "Picked up by parents" },
  family_doctor: { de: "Zum Arzt", en: "Family doctor" },
  ambulance_112: { de: "Rettungsdienst (112)", en: "Ambulance (112/999)" },
  hospital: { de: "Krankenhaus", en: "Hospital" },
  other: { de: "Sonstiges", en: "Other" },
};

const PAGE_WIDTH = 595.28; // A4
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

function fmtDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(lang === "de" ? "de-DE" : "en-US");
}

function fmtTime(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(lang === "de" ? "de-DE" : "en-US", { hour: "2-digit", minute: "2-digit" });
}

function row(
  doc: PdfKitLike,
  label: string,
  value: string | number | null | undefined,
  x: number,
  y: number,
  font: { name: string; size: number },
): number {
  if (value === null || value === undefined || value === "") return y;
  doc.drawText(`${label}: ${value}`, { x, y, size: font.size, font: font.name, color: rgb(0.2, 0.2, 0.2) });
  return y + 14;
}

interface PdfKitLike {
  drawText(text: string, opts: { x: number; y: number; size: number; font: string; color?: any; lineHeight?: number }): void;
}

export interface DecryptedReport extends IncidentReport {
  // Vom Client nach der Entschluesselung ergaenzt; optional fuer die Ausgabe.
  responderNames?: Record<string, string>;
}

function renderOne(doc: PdfKitLike, report: DecryptedReport, lang: Lang): void {
  const l = LABELS[lang];
  let y = 40;

  doc.drawText(l.title, { x: MARGIN, y, size: 20, font: "Helvetica-Bold", color: rgb(0, 0, 0) });
  y += 30;
  doc.drawText(`${report.id.slice(0, 8).toUpperCase()}  |  ${report.status === "submitted" ? l.submitted : l.draft}`, {
    x: MARGIN, y, size: 10, font: "Helvetica", color: rgb(0.4, 0.4, 0.4),
  });
  y += 24;

  const section = (title: string): void => {
    y += 6;
    doc.drawText(title, { x: MARGIN, y, size: 12, font: "Helvetica-Bold", color: rgb(0.1, 0.1, 0.1) });
    y += 18;
  };

  section(l.incident);
  y = row(doc, l.date, report.incidentAt ? fmtDate(report.incidentAt, lang) : null, MARGIN, y, { name: "Helvetica", size: 10 });
  y = row(doc, l.location, report.location, MARGIN, y, { name: "Helvetica", size: 10 });
  if (report.careStartedAt && report.careEndedAt) {
    y = row(doc, l.careTime, `${fmtTime(report.careStartedAt, lang)} – ${fmtTime(report.careEndedAt, lang)}`, MARGIN, y, { name: "Helvetica", size: 10 });
  }
  y = row(doc, l.category, report.category, MARGIN, y, { name: "Helvetica", size: 10 });
  if (report.description) {
    doc.drawText(l.description + ":", { x: MARGIN, y, size: 10, font: "Helvetica", color: rgb(0.2, 0.2, 0.2) });
    y += 14;
    doc.drawText(report.description, { x: MARGIN + 10, y, size: 10, font: "Helvetica", color: rgb(0.2, 0.2, 0.2) });
    y += 16;
  }
  y = row(doc, l.injurySites, report.injurySites, MARGIN, y, { name: "Helvetica", size: 10 });

  section(l.patient);
  y = row(doc, l.patientType, report.patientType ? (PATIENT_TYPES[report.patientType]?.[lang] ?? report.patientType) : null, MARGIN, y, { name: "Helvetica", size: 10 });
  if (report.patientFirstName || report.patientLastName) {
    y = row(doc, l.patientName, `${report.patientFirstName ?? ""} ${report.patientLastName ?? ""}`.trim(), MARGIN, y, { name: "Helvetica", size: 10 });
  }
  y = row(doc, l.patientClass, report.patientClass, MARGIN, y, { name: "Helvetica", size: 10 });
  y = row(doc, l.patientAge, report.patientAge, MARGIN, y, { name: "Helvetica", size: 10 });
  y = row(doc, l.patientSex, report.patientSex ? (SEXES[report.patientSex]?.[lang] ?? report.patientSex) : null, MARGIN, y, { name: "Helvetica", size: 10 });
  y = row(doc, l.patientBirthDate, report.patientBirthDate, MARGIN, y, { name: "Helvetica", size: 10 });
  y = row(doc, l.teacherName, report.teacherName, MARGIN, y, { name: "Helvetica", size: 10 });
  if (report.emergencyContactName || report.emergencyContactPhone) {
    y = row(doc, l.emergencyContact, [report.emergencyContactName, report.emergencyContactPhone].filter(Boolean).join(" · "), MARGIN, y, { name: "Helvetica", size: 10 });
  }

  const hasAssessment = report.breathing || report.skinColor || report.pulseRegular || report.orientation || report.pupilsLeft || report.pupilsRight || report.pupilReaction;
  if (hasAssessment) {
    section(l.assessment);
    y = row(doc, l.breathing, report.breathing ? (BREATHING[report.breathing]?.[lang] ?? report.breathing) : null, MARGIN, y, { name: "Helvetica", size: 10 });
    y = row(doc, l.skinColor, report.skinColor ? (SKIN_COLORS[report.skinColor]?.[lang] ?? report.skinColor) : null, MARGIN, y, { name: "Helvetica", size: 10 });
    y = row(doc, l.pulseRegularity, report.pulseRegular ? (PULSE_REGULAR[report.pulseRegular]?.[lang] ?? report.pulseRegular) : null, MARGIN, y, { name: "Helvetica", size: 10 });
    y = row(doc, l.orientation, report.orientation ? (ORIENTATIONS[report.orientation]?.[lang] ?? report.orientation) : null, MARGIN, y, { name: "Helvetica", size: 10 });
    const pupils = [
      report.pupilsLeft ? `L: ${PUPIL_SIZES[report.pupilsLeft]?.[lang] ?? report.pupilsLeft}` : null,
      report.pupilsRight ? `R: ${PUPIL_SIZES[report.pupilsRight]?.[lang] ?? report.pupilsRight}` : null,
      report.pupilReaction ? `${l.pupilReaction}: ${PUPIL_REACTIONS[report.pupilReaction]?.[lang] ?? report.pupilReaction}` : null,
    ].filter(Boolean).join(" · ");
    y = row(doc, l.pupils, pupils || null, MARGIN, y, { name: "Helvetica", size: 10 });
  }

  const hasInterview = report.complaintHistory || report.medications || report.allergies;
  if (hasInterview) {
    section(l.interview);
    y = row(doc, l.complaintHistory, report.complaintHistory, MARGIN, y, { name: "Helvetica", size: 10 });
    y = row(doc, l.medications, report.medications, MARGIN, y, { name: "Helvetica", size: 10 });
    y = row(doc, l.allergies, report.allergies, MARGIN, y, { name: "Helvetica", size: 10 });
  }

  const hasProgress = report.recheckTime2 || report.recheckPulse2 || report.recheckRegular2 || report.recheckTime3 || report.recheckPulse3 || report.recheckRegular3 || report.progressNotes;
  if (hasProgress) {
    section(l.progress);
    if (report.recheckTime2 || report.recheckPulse2 || report.recheckRegular2) {
      const parts = [
        report.recheckTime2 ? `${l.recheckTime}: ${report.recheckTime2}` : null,
        report.recheckPulse2 ? `${l.pulse}: ${report.recheckPulse2} bpm` : null,
        report.recheckRegular2 ? `${l.pulseRegularity}: ${PULSE_REGULAR[report.recheckRegular2]?.[lang] ?? report.recheckRegular2}` : null,
      ].filter(Boolean).join(" · ");
      y = row(doc, `${l.recheckMeasurement} 2`, parts || null, MARGIN, y, { name: "Helvetica", size: 10 });
    }
    if (report.recheckTime3 || report.recheckPulse3 || report.recheckRegular3) {
      const parts = [
        report.recheckTime3 ? `${l.recheckTime}: ${report.recheckTime3}` : null,
        report.recheckPulse3 ? `${l.pulse}: ${report.recheckPulse3} bpm` : null,
        report.recheckRegular3 ? `${l.pulseRegularity}: ${PULSE_REGULAR[report.recheckRegular3]?.[lang] ?? report.recheckRegular3}` : null,
      ].filter(Boolean).join(" · ");
      y = row(doc, `${l.recheckMeasurement} 3`, parts || null, MARGIN, y, { name: "Helvetica", size: 10 });
    }
    y = row(doc, l.progressNotes, report.progressNotes, MARGIN, y, { name: "Helvetica", size: 10 });
  }

  const hasVitals = report.pulseBpm || report.spo2 || report.respRate || report.bloodPressure || report.consciousnessAvpu || report.painScore !== null;
  if (hasVitals) {
    section(l.vitals);
    y = row(doc, l.pulse, report.pulseBpm ? `${report.pulseBpm} bpm` : null, MARGIN, y, { name: "Helvetica", size: 10 });
    y = row(doc, "SpO2", report.spo2 ? `${report.spo2}%` : null, MARGIN, y, { name: "Helvetica", size: 10 });
    y = row(doc, l.respRate, report.respRate ? `${report.respRate}/min` : null, MARGIN, y, { name: "Helvetica", size: 10 });
    y = row(doc, l.bloodPressure, report.bloodPressure, MARGIN, y, { name: "Helvetica", size: 10 });
    y = row(doc, "AVPU", report.consciousnessAvpu, MARGIN, y, { name: "Helvetica", size: 10 });
    y = row(doc, l.pain, report.painScore !== null ? `${report.painScore}/10` : null, MARGIN, y, { name: "Helvetica", size: 10 });
  }

  section(l.treatment);
  y = row(doc, l.measures, report.measures, MARGIN, y, { name: "Helvetica", size: 10 });
  y = row(doc, l.treatmentNotes, report.treatmentNotes, MARGIN, y, { name: "Helvetica", size: 10 });

  section(l.outcome);
  y = row(doc, l.outcome, report.outcome ? (OUTCOMES[report.outcome]?.[lang] ?? report.outcome) : null, MARGIN, y, { name: "Helvetica", size: 10 });
  y = row(doc, l.outcomeNotes, report.outcomeNotes, MARGIN, y, { name: "Helvetica", size: 10 });
  y = row(doc, l.leadingSymptom, report.leadingSymptom, MARGIN, y, { name: "Helvetica", size: 10 });
  y = row(doc, l.accompaniedBy, report.accompaniedBy, MARGIN, y, { name: "Helvetica", size: 10 });
  if (report.handoverProperty) {
    const parts = report.handoverProperty.split(",").map((p) => p.trim()).map((p) => PROPERTY[p]?.[lang] ?? p).join(", ");
    y = row(doc, l.handoverProperty, parts, MARGIN, y, { name: "Helvetica", size: 10 });
  }

  if (report.signatures && report.signatures.length > 0) {
    section(l.signatures);
    const names = report.signatures.filter(Boolean).join(", ");
    doc.drawText(names, { x: MARGIN, y, size: 10, font: "Helvetica", color: rgb(0.2, 0.2, 0.2) });
    y += 16;
  }

  const responderIds = report.responderIds ?? [];
  if (responderIds.length > 0) {
    section(l.responders);
    const names = responderIds.map((id) => report.responderNames?.[id] ?? id).join(", ");
    doc.drawText(names, { x: MARGIN, y, size: 10, font: "Helvetica", color: rgb(0.2, 0.2, 0.2) });
    y += 16;
  }
  y = row(doc, l.witnesses, report.witnesses, MARGIN, y, { name: "Helvetica", size: 10 });

  if (report.addenda && report.addenda.length > 0) {
    section(l.addenda);
    for (const a of report.addenda) {
      doc.drawText(`${a.authorName} — ${fmtDate(a.createdAt, lang)}`, { x: MARGIN, y, size: 9, font: "Helvetica-Bold", color: rgb(0.2, 0.2, 0.2) });
      y += 13;
      doc.drawText(a.text, { x: MARGIN + 10, y, size: 10, font: "Helvetica", color: rgb(0.2, 0.2, 0.2) });
      y += 16;
    }
  }

  y += 10;
  doc.drawText(`${l.generated}: ${new Date().toLocaleString(lang === "de" ? "de-DE" : "en-US")}  |  ${l.confidential}`, {
    x: MARGIN, y, size: 8, font: "Helvetica", color: rgb(0.6, 0.6, 0.6),
  });
  y += 12;
  doc.drawText(l.disclaimer, {
    x: MARGIN, y, size: 7, font: "Helvetica", color: rgb(0.55, 0.55, 0.55),
  });
}

/** Einzelnes Protokoll als PDF (Uint8Array fuer pdf-lib). */
export async function renderReportPdf(report: DecryptedReport, lang: Lang): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE_WIDTH, 841.89]);
  const drawText = (text: string, opts: { x: number; y: number; size: number; font: string; color?: any }): void => {
    page.drawText(text, {
      x: opts.x,
      y: 841.89 - opts.y,
      size: opts.size,
      font: opts.font === "Helvetica-Bold" ? helveticaBold : helvetica,
      color: opts.color ?? rgb(0.2, 0.2, 0.2),
    });
  };
  renderOne({ drawText } as PdfKitLike, report, lang);
  return pdf.save();
}

/** Buendel: jedes Protokoll auf einer eigenen Seite. */
export async function renderReportBundlePdf(reports: DecryptedReport[], lang: Lang): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const report of reports) {
    const page = pdf.addPage([PAGE_WIDTH, 841.89]);
    const drawText = (text: string, opts: { x: number; y: number; size: number; font: string; color?: any }): void => {
      page.drawText(text, {
        x: opts.x,
        y: 841.89 - opts.y,
        size: opts.size,
        font: opts.font === "Helvetica-Bold" ? helveticaBold : helvetica,
        color: opts.color ?? rgb(0.2, 0.2, 0.2),
      });
    };
    renderOne({ drawText } as PdfKitLike, report, lang);
  }
  return pdf.save();
}
