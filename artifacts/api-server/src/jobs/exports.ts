import { randomUUID } from "crypto";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, incidentReportsTable, schoolExportsTable, schoolSettingsTable } from "@workspace/db";
import { EXPORT_INTERVAL_MS, type ExportInterval } from "../lib/exportIntervals";

export interface ExportJobResult {
  schoolId: string;
  reportCount: number;
}

/**
 * Erzeugt fuer jede Schule mit abgelaufenem Export-Intervall ein neues
 * Export-Buendel ueber alle seit dem letzten Export eingereichten Protokolle.
 * Das Buendel enthaelt nur Metadaten und Chiffrat; das PDF baut der Client
 * nach der lokalen Entschluesselung (GET /exports/:id/bundle).
 *
 * Fristbeginn ist der Zeitpunkt des letzten erzeugten Exports; ist noch keiner
 * erfolgt, sind alle eingereichten Protokolle faellig. Der Scheduler laeuft
 * taeglich, deshalb springt die Frist hier erst nach Ablauf des Intervalls —
 * ein manueller Export ueber POST /exports bleibt davon unberuehrt.
 */
export async function runSchoolExports(now: Date = new Date()): Promise<ExportJobResult[]> {
  const settingsRows = await db
    .select({
      schoolId: schoolSettingsTable.schoolId,
      exportInterval: schoolSettingsTable.exportInterval,
      lastExportAt: schoolSettingsTable.lastExportAt,
    })
    .from(schoolSettingsTable);

  const results: ExportJobResult[] = [];

  for (const setting of settingsRows) {
    const interval = setting.exportInterval as ExportInterval;
    const intervalMs = EXPORT_INTERVAL_MS[interval];
    const fromAt = setting.lastExportAt;

    // Vor dem ersten Export faellig; danach erst nach Ablauf des Intervalls.
    if (fromAt && fromAt.getTime() + intervalMs > now.getTime()) continue;

    const reports = await db
      .select({ id: incidentReportsTable.id })
      .from(incidentReportsTable)
      .where(and(
        eq(incidentReportsTable.schoolId, setting.schoolId),
        eq(incidentReportsTable.status, "submitted"),
        fromAt ? gte(incidentReportsTable.createdAt, fromAt) : undefined,
        lt(incidentReportsTable.createdAt, now),
      ))
      .limit(5000);

    if (reports.length === 0) continue;

    await db.insert(schoolExportsTable).values({
      id: randomUUID(),
      schoolId: setting.schoolId,
      fromAt,
      toAt: now,
      reportCount: reports.length,
      status: "ready",
    });
    await db
      .update(schoolSettingsTable)
      .set({ lastExportAt: now, updatedAt: now })
      .where(eq(schoolSettingsTable.schoolId, setting.schoolId));

    results.push({ schoolId: setting.schoolId, reportCount: reports.length });
  }

  return results;
}

/** Faellige Exporte koennen nur entstehen, wenn mindestens eine Schule existiert. */
export async function anySettings(): Promise<boolean> {
  const rows = await db
    .select({ id: sql`1` })
    .from(schoolSettingsTable)
    .limit(1);
  return rows.length > 0;
}
