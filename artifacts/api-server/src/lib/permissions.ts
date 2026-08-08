export interface PermissionDef {
  key: string;
  description: string;
  essential: boolean;
  hiddenFromUi: boolean;
}

// Keine Typangabe an dieser Stelle: `readonly PermissionDef[]` wuerde die
// Literale zu `string` verbreitern, PermissionKey saehe damit jede Zeichenkette
// als gueltig an und isValidPermission waere als Type Guard wirkungslos. Das
// `satisfies` unten prueft die Form, ohne die Schluessel zu verlieren.
export const PERMISSIONS = [
  { key: "users.read_all", description: "Alle Nutzerkonten der Schule einsehen", essential: false, hiddenFromUi: false },
  { key: "users.read_pending", description: "Warteliste noch nicht freigeschalteter Konten einsehen", essential: false, hiddenFromUi: false },
  { key: "users.approve", description: "Neue Nutzer freischalten", essential: false, hiddenFromUi: false },
  { key: "users.assign_role", description: "Nutzern eine Rolle zuweisen", essential: true, hiddenFromUi: false },
  { key: "users.delete", description: "Nutzerkonten loeschen", essential: false, hiddenFromUi: false },
  { key: "users.correct_profile", description: "Einen falsch eingegebenen Namen oder eine falsche E-Mail-Adresse korrigieren", essential: false, hiddenFromUi: false },
  { key: "news.moderate", description: "Nachrichten freigeben oder ablehnen", essential: false, hiddenFromUi: false },
  { key: "news.publish_direct", description: "Nachrichten ohne Freigabe direkt veroeffentlichen", essential: false, hiddenFromUi: false },
  { key: "loa.create", description: "Einen eigenen Abwesenheitsantrag stellen", essential: false, hiddenFromUi: false },
  { key: "loa.moderate", description: "Abwesenheitsantraege genehmigen oder ablehnen", essential: false, hiddenFromUi: false },
  { key: "loa.self_approve", description: "Den eigenen Abwesenheitsantrag selbst genehmigen", essential: false, hiddenFromUi: false },
  { key: "missions.create", description: "Einen Einsatz anlegen", essential: false, hiddenFromUi: false },
  { key: "missions.moderate", description: "Einsaetze ablehnen oder abschliessen", essential: false, hiddenFromUi: false },
  { key: "missions.view_all", description: "Alle Einsaetze sehen, nicht nur zugewiesene", essential: false, hiddenFromUi: false },
  { key: "missions.receive_alerts", description: "Einsatzbenachrichtigungen per Push empfangen", essential: false, hiddenFromUi: false },
  { key: "activity.view", description: "Einsatzhistorie anderer Nutzer einsehen", essential: false, hiddenFromUi: false },
  { key: "notifications.view_all", description: "Alle Benachrichtigungen sehen, nicht nur eigene", essential: false, hiddenFromUi: false },
  { key: "reports.read_all", description: "Alle Einsatzprotokolle lesen, nicht nur eigene", essential: false, hiddenFromUi: false },
  { key: "reports.see_patient_info", description: "Patientendaten in Einsatzprotokollen sehen", essential: false, hiddenFromUi: false },
  { key: "roles.manage", description: "Rollen anlegen, umbenennen, loeschen und ihre Berechtigungen setzen", essential: true, hiddenFromUi: true },
] as const satisfies readonly PermissionDef[];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export function isValidPermission(key: string): key is PermissionKey {
  return PERMISSIONS.some((p) => p.key === key);
}

export const ESSENTIAL_PERMISSIONS: readonly PermissionKey[] =
  PERMISSIONS.filter((p) => p.essential).map((p) => p.key);

export const DEFAULT_ROLE_PERMISSIONS: Record<string, readonly PermissionKey[]> = {
  owner: PERMISSIONS.map((p) => p.key),
  admin: [
    "users.read_all", "users.read_pending", "users.approve", "users.assign_role", "users.delete", "users.correct_profile",
    "news.moderate", "news.publish_direct", "loa.create", "loa.moderate",
    "missions.create", "missions.moderate", "missions.view_all",
    "activity.view", "notifications.view_all",
    "reports.read_all", "reports.see_patient_info",
  ],
  sanitaeter_leitung_admin: [
    "users.read_all", "users.assign_role",
    "loa.create", "loa.moderate",
    "missions.create", "missions.moderate", "missions.view_all", "missions.receive_alerts",
    "activity.view", "notifications.view_all",
    "reports.read_all", "reports.see_patient_info",
  ],
  sanitaeter_leitung: [
    "loa.create", "loa.moderate",
    "missions.create", "missions.moderate", "missions.view_all", "missions.receive_alerts",
    "activity.view", "notifications.view_all",
    "reports.read_all", "reports.see_patient_info",
  ],
  teacher: [
    "users.read_all",
    "news.moderate",
    "loa.create", "loa.moderate",
    "missions.create", "missions.moderate", "missions.view_all",
    "activity.view",
    "reports.see_patient_info",
  ],
  sanitaeter: ["loa.create", "missions.receive_alerts"],
};
export function hasPermission(role: string, perm: string): boolean { return (DEFAULT_ROLE_PERMISSIONS[role] ?? []).includes(perm as any); }
