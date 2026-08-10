import { randomUUID } from "crypto";
import { Router } from "express";
import { and, desc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { db, incidentReportsTable, schoolExportsTable, schoolSettingsTable, missionsTable } from "@workspace/db";
import { requireAuth, requirePermission, schoolIdOf, type AuthRequest } from "../middlewares/auth";
import { EXPORT_INTERVALS, type ExportInterval } from "../lib/exportIntervals";

// Die PDF-Erzeugung liegt mit der Ende-zu-Ende-Verschluesselung beim Client:
// Der Server kann die Inhalte nicht lesen und liefert deshalb nur das
// verschluesselte Buendel aus. Erst der bestaetigte Download gibt die
// Loeschung der exportierten Protokolle frei (Uebergabe an den
// Verantwortlichen). Abgebrochene Downloads zaehlen nicht: die Protokolle
// bleiben erhalten, der Export bleibt erneut ladbar.

async function withMissionTitles(reports: typeof incidentReportsTable.$inferSelect[]) {
  const missionIds = [...new Set(reports.map((r) => r.missionId).filter((m): m is string => !!m))];
  const byId = new Map<string, string>();
  if (missionIds.length > 0) {
    const missions = await db
      .select({ id: missionsTable.id, title: missionsTable.title })
      .from(missionsTable)
      .where(inArray(missionsTable.id, missionIds));
    for (const m of missions) byId.set(m.id, m.title);
  }
  return reports.map((r) => ({ ...r, missionTitle: r.missionId ? byId.get(r.missionId) ?? null : null }));
}

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

// GET /:id/bundle — verschluesseltes Buendel, ohne Seiteneffekt. Der Client
// entschluesselt lokal und erzeugt das PDF; erst danach bestaetigt er.
router.get("/:id/bundle", requireAuth, EXPORT_PERMS, async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);

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

  res.json({
    id: exp.id,
    fromAt: exp.fromAt?.toISOString() ?? null,
    toAt: exp.toAt.toISOString(),
    reports: await withMissionTitles(reports),
  });
});

// POST /:id/confirm — der Client hat das Buendel entschluesselt und das PDF
// gespeichert. Erst jetzt gilt der Export als uebergeben und die Protokolle
// werden vom Server geloescht.
router.post("/:id/confirm", requireAuth, EXPORT_PERMS, async (req: AuthRequest, res) => {
  const schoolId = schoolIdOf(req);
  const { userId } = req.user!;

  const [exp] = await db
    .select()
    .from(schoolExportsTable)
    .where(and(eq(schoolExportsTable.id, (req.params.id as string)), eq(schoolExportsTable.schoolId, schoolId)));

  if (!exp) { res.status(404).json({ error: "Not found" }); return; }
  if (exp.status === "downloaded") { res.status(409).json({ error: "Export bereits heruntergeladen" }); return; }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(schoolExportsTable)
      .set({ status: "downloaded", downloadedAt: now, downloadedBy: userId })
      .where(eq(schoolExportsTable.id, exp.id));
    const deleted = await tx.delete(incidentReportsTable)
      .where(and(
        eq(incidentReportsTable.schoolId, schoolId),
        eq(incidentReportsTable.status, "submitted"),
        exp.fromAt ? gte(incidentReportsTable.createdAt, exp.fromAt) : undefined,
        lte(incidentReportsTable.createdAt, exp.toAt),
      ))
      .returning({ id: incidentReportsTable.id });
    console.log(`[export] ${schoolId}: ${deleted.length} Protokolle nach bestaetigtem Download uebergeben und geloescht`);
  });

  res.json({ ok: true });
});

export default router;
