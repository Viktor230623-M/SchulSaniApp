export const PATIENT_INFO_ROLES = ["admin", "cto", "sanitaeter_leitung", "sanitaeter_leitung_admin", "teacher"] as const;
export const REPORT_READ_ROLES = ["admin", "cto", "sanitaeter_leitung", "sanitaeter_leitung_admin"] as const;

export function canSeePatientInfo(role: string): boolean {
  return PATIENT_INFO_ROLES.includes(role as any);
}

export function canReadAllReports(role: string): boolean {
  return REPORT_READ_ROLES.includes(role as any);
}
