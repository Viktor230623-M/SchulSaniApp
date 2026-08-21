const PLAINTEXT_REPORT_FIELDS = [
  "title",
  "patientType",
  "patientFirstName",
  "patientLastName",
  "patientClass",
  "patientAge",
  "emergencyContactName",
  "emergencyContactPhone",
  "category",
  "description",
  "injurySites",
  "careStartedAt",
  "careEndedAt",
  "measures",
  "treatmentNotes",
  "pulseBpm",
  "spo2",
  "respRate",
  "bloodPressure",
  "consciousnessAvpu",
  "painScore",
  "outcome",
  "outcomeNotes",
  "witnesses",
  "addendaJson",
] as const;

export function withoutReportPlaintext(report: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...report };
  for (const field of PLAINTEXT_REPORT_FIELDS) delete safe[field];
  return safe;
}

export function hasReportPlaintext(report: Record<string, unknown>): boolean {
  return PLAINTEXT_REPORT_FIELDS.some((field) => report[field] !== null && report[field] !== undefined);
}
