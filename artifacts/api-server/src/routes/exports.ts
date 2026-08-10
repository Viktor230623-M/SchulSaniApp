import { randomUUID } from "crypto";
import { Router } from "express";
import { and, desc, eq, gte, lt, lte } from "drizzle-orm";
import { db, incidentReportsTable, schoolExportsTable, schoolSettingsTable } from "@workspace/db";
import { requireAuth, requirePermission, schoolIdOf, type AuthRequest } from "../middlewares/auth";
import { renderReportBundlePdf } from "../lib/reportPdf";
import { EXPORT_INTERVALS, type ExportInterval } from "../lib/exportIntervals";

const router = Router();
const INTERVALS = EXPORT_INTERVALS;

/** Nur Rollen mit voller Protokoll-Einsicht duerfen den Export verwalten. */
const EXPORT_PERMS = requirePermission("reports.read_all", "reports.see_patient_info");

async function getSettings(schoolId: string) {
  const [row] = await db
    .select()
    .from(schoolSettingsTable)
    .where(eq(schoolSettingsTable.schoolId, schoolId));
  return row;
}

// GET / — Einstellungen + Export-Historie
router.get("/", requireAuth, EXPORT_PERMS, async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);

  const settings = await getSettings(schoolId);
  const exports = await db
    .select()
    .from(schoolExportsTable)
    .where(eq(schoolExportsTable.schoolId, schoolId))
    .orderBy(desc(schoolExportsTable.createdAt));

  res.json({
    interval: settings?.exportInterval ?? "semiannual",
    lastExportAt: settings?.lastExportAt ?? null,
    exports,
  });
});

// PATCH / — Intervall setzen
router.patch("/", requireAuth, EXPORT_PERMS, async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const interval = req.body?.["interval"] as string;

  if (!INTERVALS.includes(interval as ExportInterval)) {
    res.status(400).json({ error: "interval muss semiannual, annual oder five_years sein" });
    return;
  }

  await db
    .insert(schoolSettingsTable)
    .values({ schoolId, exportInterval: interval as ExportInterval })
    .onConflictDoUpdate({
      target: schoolSettingsTable.schoolId,
      set: { exportInterval: interval as ExportInterval, updatedAt: new Date() },
    });

  res.json({ interval: interval as ExportInterval });
});

// POST / — Export jetzt erzeugen (manuell, unabhängig vom Intervall)
router.post("/", requireAuth, EXPORT_PERMS, async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const now = new Date();

  const settings = await getSettings(schoolId);
  const fromAt = settings?.lastExportAt ?? null;

  const reports = await db
    .select({ id: incidentReportsTable.id })
    .from(incidentReportsTable)
    .where(and(
      eq(incidentReportsTable.schoolId, schoolId),
      eq(incidentReportsTable.status, "submitted"),
      fromAt ? gte(incidentReportsTable.createdAt, fromAt) : undefined,
      lt(incidentReportsTable.createdAt, now),
    ));

  if (reports.length === 0) {
    res.status(400).json({ error: "Keine eingereichten Protokolle seit dem letzten Export" });
    return;
  }

  const id = randomUUID();
  await db.insert(schoolExportsTable).values({
    id,
    schoolId,
    fromAt,
    toAt: now,
    reportCount: reports.length,
    status: "ready",
  });
  await db
    .insert(schoolSettingsTable)
    .values({ schoolId, lastExportAt: now })
    .onConflictDoUpdate({
      target: schoolSettingsTable.schoolId,
      set: { lastExportAt: now, updatedAt: new Date() },
    });

  res.status(201).json({ id, reportCount: reports.length, status: "ready" });
});

// GET /:id/download — PDF-Buendel herunterladen.
// Erst der bestaetigte Download gibt die Loeschung der exportierten Protokolle
// frei (Uebergabe an den Verantwortlichen). Abgebrochene Downloads zaehlen
// nicht: die Protokolle bleiben erhalten, der Export bleibt erneut ladbar.
router.get("/:id/download", requireAuth, EXPORT_PERMS, async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const { userId } = req.user!;
  const lang = (req.query["lang"] === "en" ? "en" : "de") as "de" | "en";

  const [exp] = await db
    .select()
    .from(schoolExportsTable)
    .where(and(eq(schoolExportsTable.id, (req.params.id as string)), eq(schoolExportsTable.schoolId, schoolId)));

  if (!exp) { res.status(404).json({ error: "Not found" }); return; }
  if (exp.status === "downloaded") { res.status(409).json({ error: "Export bereits heruntergeladen" }); return; }

  const reports = await db
    .select()
    .from(incidentReportsTable)
    .where(and(
      eq(incidentReportsTable.schoolId, schoolId),
      eq(incidentReportsTable.status, "submitted"),
      exp.fromAt ? gte(incidentReportsTable.createdAt, exp.fromAt) : undefined,
      lte(incidentReportsTable.createdAt, exp.toAt),
    ))
    .orderBy(incidentReportsTable.createdAt);

  if (reports.length === 0) {
    res.status(409).json({ error: "Keine Protokolle in diesem Export" });
    return;
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="schulsani-export-${exp.id.slice(0, 8)}.pdf"`);

  const doc = await renderReportBundlePdf(reports, { lang, showPatient: true, schoolId });
  doc.pipe(res);

  // Erst nachdem die Response vollstaendig gesendet wurde, gilt der Export als
  // uebergeben: Download bestaetigen und die Protokolle vom Server loeschen.
  res.on("finish", () => {
    void (async () => {
      const now = new Date();
      await db
        .update(schoolExportsTable)
        .set({ status: "downloaded", downloadedAt: now, downloadedBy: userId })
        .where(eq(schoolExportsTable.id, exp.id));
      await db
        .delete(incidentReportsTable)
        .where(and(
          eq(incidentReportsTable.schoolId, schoolId),
          eq(incidentReportsTable.status, "submitted"),
          exp.fromAt ? gte(incidentReportsTable.createdAt, exp.fromAt) : undefined,
          lte(incidentReportsTable.createdAt, exp.toAt),
        ));
      console.log(`[export] ${schoolId}: ${reports.length} Protokolle nach Download uebergeben und geloescht`);
    })().catch((err) => {
      console.error("[export] Nachbearbeitung nach Download fehlgeschlagen:", err instanceof Error ? err.message : err);
    });
  });
});

export default router;
