export const PATIENT_INFO_ROLES = ["admin", "cto", "sanitaeter_leitung", "sanitaeter_leitung_admin", "teacher"] as const;

export function canSeePatientInfo(role: string): boolean {
  return PATIENT_INFO_ROLES.includes(role as any);
}
