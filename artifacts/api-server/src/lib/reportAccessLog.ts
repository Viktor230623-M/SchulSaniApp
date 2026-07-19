import { randomUUID } from "crypto";
import { db, reportAccessLogTable } from "@workspace/db";

export type ReportAccessAction = "list" | "detail" | "pdf";

/**
 * Haelt fest, wer ein Einsatzprotokoll gelesen hat.
 *
 * Bewusst ohne await aufgerufen: ein Fehler beim Protokollieren darf den
 * Lesevorgang nicht scheitern lassen. Fehler landen im Serverlog.
 */
export function logReportAccess(input: {
  userId: string;
  userName?: string | null;
  reportId?: string | null;
  action: ReportAccessAction;
  patientVisible: boolean;
  count?: number;
}): void {
  void db
    .insert(reportAccessLogTable)
    .values({
      id: randomUUID(),
      userId: input.userId,
      userName: input.userName ?? null,
      reportId: input.reportId ?? null,
      action: input.action,
      patientVisible: input.patientVisible,
      resultCount: input.count ?? null,
    })
    .catch((err) => console.error("[access-log] Eintrag fehlgeschlagen:", err));
}
