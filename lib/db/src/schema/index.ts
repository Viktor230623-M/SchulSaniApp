import { pgTable, pgEnum, index, unique, text, timestamp, json, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Aufzaehlungstypen. Die Wertereihenfolge ist Teil der Typdefinition und
// entspricht dem Stand der Produktionsdatenbank.
export const exportIntervalEnum = pgEnum("export_interval", ["semiannual", "annual", "five_years"]);
export const exportStatusEnum = pgEnum("export_status", ["ready", "downloaded"]);
export const dutyStatusEnum = pgEnum("duty_status", ["on_duty", "off_duty"]);
export const loaStatusEnum = pgEnum("loa_status", ["pending", "approved", "rejected", "appealed"]);
export const missionPriorityEnum = pgEnum("mission_priority", ["high", "medium", "low"]);
export const missionStatusEnum = pgEnum("mission_status", ["pending", "accepted", "rejected", "completed", "archived"]);
export const newsCategoryEnum = pgEnum("news_category", ["announcement", "training", "update", "alert"]);
export const newsStatusEnum = pgEnum("news_status", ["pending", "approved", "rejected"]);
export const authTokenKindEnum = pgEnum("auth_token_kind", ["email_verify", "password_reset"]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "mission_assigned", "mission_cancelled", "status_changed", "news", "loa_update",
  "reminder", "high_priority_alert", "mission_completed", "mission_created",
]);
// "cto" und "student_paramedic" sind entfallen. Beide trugen keine Zeile mehr:
// "cto" war laengst durch "owner" ersetzt, "student_paramedic" hatte dieselben
// Berechtigungen und denselben Anzeigenamen wie "sanitaeter" und war damit ein
// Duplikat.
export const userRoleEnum = pgEnum("user_role", [
  "sanitaeter", "sanitaeter_leitung", "sanitaeter_leitung_admin",
  "teacher", "admin", "owner",
]);

// Users table
//
// authProvider/externalSubject bilden den Anmeldeweg ab (R6): woher ein Konto
// stammt (z. B. "iserv-form", spaeter "oidc") und das Merkmal, mit dem der
// Anbieter den Menschen wiedererkennt (bei IServ der Benutzername, bei OIDC
// der sub-Claim). Eindeutig ist nur das Tripel aus Schule, Anbieter und
// Subjekt — derselbe Benutzername kann in zwei Schulen unabhaengig vergeben
// sein, deshalb kein globaler Unique-Index mehr auf iserv_username allein.
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  iservUsername: text("iserv_username"),
  authProvider: text("auth_provider"),
  externalSubject: text("external_subject"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email").unique(),
  emailVerifiedAt: timestamp("email_verified_at"),
  username: text("username"),
  phone: text("phone").default(""),
  role: userRoleEnum("role").default("sanitaeter").notNull(),
  schoolId: text("school_id"),
  passwordHash: text("password_hash").default(""),
  passwordVersion: integer("password_version").default(0).notNull(),
  // Lokale Konten (R6, Schritt 6): erzwingt einen Passwortwechsel, solange das
  // aktuelle Passwort ein von einem Verwalter vergebenes Einmal-Passwort ist
  // (Einladung oder Zuruecksetzen). Bleibt fuer alle anderen Anmeldewege false.
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  // Ablauf des Einmal-Passworts. Nur gesetzt, waehrend mustChangePassword
  // greift; danach (nach erfolgreichem Wechsel) wieder null.
  oneTimePasswordExpiresAt: timestamp("one_time_password_expires_at"),
  isApproved: boolean("is_approved").default(false).notNull(),
  approvedBy: text("approved_by"),
  // Leer heisst "Name nie bestaetigt" -- der Anbieterwert ist nur ein
  // Vorschlag, verbindlich wird er erst durch die Bestaetigung des Nutzers.
  // Ein Zeitstempel statt eines Wahrheitswerts, weil er zusaetzlich belegt,
  // wann es geschah.
  profileConfirmedAt: timestamp("profile_confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  unique("users_school_id_username_key").on(t.schoolId, t.username),
]);

// Zweite und weitere Anmeldewege eines Kontos. Die primaere Identitaet bleibt
// vorerst zusaetzlich auf users erhalten, damit die Umstellung in kleinen,
// pruefbaren Schritten erfolgen kann.
export const userIdentitiesTable = pgTable("user_identities", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  schoolId: text("school_id"),
  authProvider: text("auth_provider").notNull(),
  externalSubject: text("external_subject").notNull(),
  emailAtLink: text("email_at_link"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
}, (t) => [
  unique("user_identities_school_provider_subject_key").on(t.schoolId, t.authProvider, t.externalSubject),
  index("user_identities_user_id_idx").on(t.userId),
]);

export const authTokensTable = pgTable("auth_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  kind: authTokenKindEnum("kind").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("auth_tokens_user_kind_idx").on(t.userId, t.kind),
]);

// News table
export const newsTable = pgTable("news", {
  id: text("id").primaryKey(),
  schoolId: text("school_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  content: text("content").notNull(),
  category: newsCategoryEnum("category").default("announcement").notNull(),
  status: newsStatusEnum("status").default("pending").notNull(),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
  author: text("author").notNull(),
  authorId: text("author_id").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  rejectionReason: text("rejection_reason"),
  translationsJson: text("translations_json"),
});

// Missions table
export const missionsTable = pgTable("missions", {
  id: text("id").primaryKey(),
  schoolId: text("school_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  priority: missionPriorityEnum("priority").default("medium").notNull(),
  status: missionStatusEnum("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  requestedBy: text("requested_by"),
  scheduledFor: timestamp("scheduled_for").defaultNow().notNull(),
  patientInfo: text("patient_info"),
  assignedParamedicId: text("assigned_paramedic_id"),
  notes: text("notes"),
  translationsJson: text("translations_json"),
});

// Notifications table
export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey(),
  schoolId: text("school_id").notNull(),
  userId: text("user_id").notNull(),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  relatedId: text("related_id"),
  priority: text("priority").default("normal").notNull(), // normal, high
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Duty status table
export const dutyTable = pgTable("duty", {
  schoolId: text("school_id").notNull(),
  userId: text("user_id").notNull().primaryKey(),
  status: dutyStatusEnum("status").notNull().default("off_duty"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Leave of absence table
export const loaTable = pgTable("loa", {
  id: text("id").primaryKey(),
  schoolId: text("school_id").notNull(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date").notNull(),
  reason: text("reason").notNull(),
  status: loaStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  adminNote: text("admin_note"),
  appealNote: text("appeal_note"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  translationsJson: text("translations_json"),
});

// Dienstplan (Schichten). Eine Schicht ist ein Zeitfenster (z. B. Pausen- oder
// Nachmittagsdienst), dem Verantwortliche ein oder mehrere Mitglieder zuordnen.
// Reine Planungsdaten ohne Gesundheitsbezug, trotzdem schulgebunden wie alle
// anderen Tabellen.
export const shiftsTable = pgTable("shifts", {
  id: text("id").primaryKey(),
  schoolId: text("school_id").notNull(),
  title: text("title").notNull(),
  location: text("location"),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("shifts_school_starts_idx").on(t.schoolId, t.startsAt),
]);

// Zuordnung Mitglied -> Schicht. Der Anzeigename wird beim Anlegen
// denormalisiert abgelegt (wie loa.user_name), damit die Liste ohne Join auf
// users auskommt und Umbenennungen den Plan nicht zerlegen.
export const shiftMembersTable = pgTable("shift_members", {
  id: text("id").primaryKey(),
  schoolId: text("school_id").notNull(),
  shiftId: text("shift_id").notNull().references(() => shiftsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  userName: text("user_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  unique("shift_members_shift_user_key").on(t.shiftId, t.userId),
  index("shift_members_user_idx").on(t.userId),
]);

// Mission activity log table (from BLOCK 2)
export const missionActivityLogTable = pgTable("mission_activity_log", {
  id: text("id").primaryKey(),
  schoolId: text("school_id").notNull(),
  userId: text("user_id").notNull(),
  userName: text("user_name"),
  missionId: text("mission_id"),
  missionTitle: text("mission_title"),
  action: text("action").notNull(), // accepted, dismissed, unanswered, completed
  weekKey: text("week_key"), // YYYY-Www
  dayKey: text("day_key"), // YYYY-MM-DD
  createdAt: timestamp("created_at").defaultNow(),
  metadata: json("metadata"),
}, (t) => [
  index("idx_mission_activity_user_created").on(t.userId, t.createdAt),
  index("idx_mission_activity_user_week").on(t.userId, t.weekKey),
]);

// Mission dismissals (replaces dismissed-missions.json)
export const missionDismissalsTable = pgTable("mission_dismissals", {
  id: text("id").primaryKey(),
  schoolId: text("school_id").notNull(),
  userId: text("user_id").notNull(),
  missionId: text("mission_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique("mission_dismissals_user_id_mission_id_key").on(t.userId, t.missionId)]);

// Incident reports (Einsatzprotokoll)
export const incidentReportsTable = pgTable("incident_reports", {
  id: text("id").primaryKey(),
  schoolId: text("school_id").notNull(),
  missionId: text("mission_id"), // null = walk-in
  // Eigener Name fuer Protokolle ohne Einsatz; bei Missions-Protokollen bleibt
  // er leer, dort zaehlt der Missionstitel.
  title: text("title"),
  authorId: text("author_id").notNull(),
  status: text("status").notNull().default("draft"), // draft | submitted
  // Patient (access-restricted)
  patientType: text("patient_type"), // student | teacher | visitor | other
  patientFirstName: text("patient_first_name"),
  patientLastName: text("patient_last_name"),
  patientClass: text("patient_class"),
  patientAge: integer("patient_age"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  // Incident details
  incidentAt: timestamp("incident_at"),
  location: text("location"),
  careStartedAt: timestamp("care_started_at"),
  careEndedAt: timestamp("care_ended_at"),
  category: text("category"), // free text, comma-separated
  description: text("description"),
  injurySites: text("injury_sites"), // free text, comma-separated body regions
  // Treatment
  measures: text("measures"), // free text, comma-separated
  treatmentNotes: text("treatment_notes"),
  // Vitals (all optional)
  pulseBpm: integer("pulse_bpm"),
  spo2: integer("spo2"),
  respRate: integer("resp_rate"),
  bloodPressure: text("blood_pressure"),
  consciousnessAvpu: text("consciousness_avpu"), // A | V | P | U
  painScore: integer("pain_score"), // 0-10
  // Outcome
  outcome: text("outcome"),
  outcomeNotes: text("outcome_notes"),
  // People
  responderIdsJson: json("responder_ids_json"), // string[]
  witnesses: text("witnesses"),
  // Record-keeping
  addendaJson: json("addenda_json"), // {authorId, authorName, text, createdAt}[]
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  submittedAt: timestamp("submitted_at"),
});

// Device tokens for push notifications
export const deviceTokensTable = pgTable("device_tokens", {
  id: text("id").primaryKey(),
  schoolId: text("school_id").notNull(),
  userId: text("user_id").notNull(),
  token: text("token").notNull(),
  platform: text("platform").notNull(), // 'ios' | 'android' | 'web'
  deviceId: text("device_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [index("device_tokens_user_id_idx").on(t.userId)]);

// Audit trail for the owner-only SQL console. Every statement lands here,
// successful or not, and rows are never deleted by the console itself.
export const dbConsoleLogTable = pgTable("db_console_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  userName: text("user_name"),
  statement: text("statement").notNull(),
  presetKey: text("preset_key"),
  committed: boolean("committed").notNull().default(false),
  rowsAffected: integer("rows_affected"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Wer hat wann welche Rolle oder welche Rollenberechtigung geaendert.
// Erforderlich fuer den Rechenschaftsnachweis nach Art. 5 Abs. 2 DSGVO: eine
// solche Aenderung steuert faktisch den Zugriff auf Gesundheitsdaten.
// Aufbewahrung 12 Monate, wie report_access_log.
export const roleChangeLogTable = pgTable("role_change_log", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name"),
  roleId: text("role_id"),
  roleKey: text("role_key"),
  targetUserId: text("target_user_id"),
  action: text("action").notNull(), // create | rename | delete | set_permissions | assign_role | delete_user
  permissionsBefore: json("permissions_before"),
  permissionsAfter: json("permissions_after"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [index("role_change_log_created_idx").on(t.createdAt)]);

// Korrekturen an bestaetigten Namen durch einen Verwalter -- der Nutzer selbst
// kann seinen Namen nur einmal setzen (PATCH /auth/profile), danach nur noch
// ueber diesen Weg. Aufbewahrung 12 Monate, wie role_change_log: alte Namen
// sind personenbezogene Daten.
export const profileChangeLogTable = pgTable("profile_change_log", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  targetUserId: text("target_user_id").notNull(),
  field: text("field").notNull(), // first_name | last_name | email
  before: text("before"),
  after: text("after"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [index("profile_change_log_created_idx").on(t.createdAt)]);

// Wer hat wann welchen Anmeldeweg hinzugefuegt oder entfernt. Selbstbedienung:
// der Kontoinhaber ist Handelnder und Betroffener zugleich, deshalb eine
// userId statt actorId/targetUserId wie bei role_change_log. Aufbewahrung 12
// Monate wie role_change_log -- eine Kontoverknuepfung steuert den Zugriff auf
// Gesundheitsdaten.
export const identityChangeLogTable = pgTable("identity_change_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  providerKey: text("provider_key").notNull(),
  action: text("action").notNull(), // link | unlink
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [index("identity_change_log_created_idx").on(t.createdAt)]);

// Wer hat wann welches Einsatzprotokoll gelesen. Erforderlich fuer den
// Rechenschaftsnachweis nach Art. 5 Abs. 2 DSGVO. Aufbewahrung 12 Monate.
export const reportAccessLogTable = pgTable("report_access_log", {
  id: text("id").primaryKey(),
  schoolId: text("school_id").notNull(),
  userId: text("user_id").notNull(),
  userName: text("user_name"),
  reportId: text("report_id"),
  action: text("action").notNull(), // list | detail | pdf
  patientVisible: boolean("patient_visible").notNull().default(false),
  resultCount: integer("result_count"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [index("report_access_log_created_idx").on(t.createdAt)]);

// Anmeldesitzungen fuer die Wiederherstellung nach einem Reload.
//
// Gespeichert wird ausschliesslich der SHA-256-Hash des Sitzungstokens, nie das
// Token selbst — ein Datenbankleck gibt damit keine gueltigen Sitzungen preis.
// Bewusst nicht erfasst: IP-Adresse und User-Agent. Beides ist personenbezogen
// und fuer die Funktion entbehrlich.
export const sessionsTable = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  absoluteExpiresAt: timestamp("absolute_expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
}, (t) => [index("sessions_user_id_idx").on(t.userId)]);

// Vorgaben fuer den Datenexport der Schule. Eine Zeile je Schule, im
// Installationsschritt oder ueber die Verwaltung angelegt. Das Intervall legt
// fest, wie oft die Schule ihre abgeschlossenen Protokolle als PDF-Buendel
// bezieht; nach dem bestaetigten Download werden die exportierten Protokolle
// auf dem Server geloescht (Uebergabe an den Verantwortlichen).
export const schoolSettingsTable = pgTable("school_settings", {
  schoolId: text("school_id").primaryKey(),
  exportInterval: exportIntervalEnum("export_interval").notNull().default("semiannual"),
  // Zeitpunkt des letzten erzeugten Exports. Vor dem ersten Export null;
  // faellig wird der naechste, sobald die Frist seit diesem Zeitpunkt
  // abgelaufen ist.
  lastExportAt: timestamp("last_export_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Ein erzeugtes, noch nicht heruntergeladenes PDF-Buendel. Der Zeitraum
// fromAt..toAt markiert die enthaltenen Protokolle; erst der bestaetigte
// Download gibt die Loeschung auf dem Server frei.
export const schoolExportsTable = pgTable("school_exports", {
  id: text("id").primaryKey(),
  schoolId: text("school_id").notNull(),
  fromAt: timestamp("from_at"),
  toAt: timestamp("to_at").notNull(),
  reportCount: integer("report_count").notNull().default(0),
  status: exportStatusEnum("status").notNull().default("ready"),
  downloadedAt: timestamp("downloaded_at"),
  downloadedBy: text("downloaded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("school_exports_school_created_idx").on(t.schoolId, t.createdAt),
]);

// Export types
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type UserIdentity = typeof userIdentitiesTable.$inferSelect;
export type NewUserIdentity = typeof userIdentitiesTable.$inferInsert;
export type AuthTokenKind = (typeof authTokenKindEnum.enumValues)[number];
export type AuthToken = typeof authTokensTable.$inferSelect;
export type NewAuthToken = typeof authTokensTable.$inferInsert;
export type News = typeof newsTable.$inferSelect;
export type NewNews = typeof newsTable.$inferInsert;
export type Mission = typeof missionsTable.$inferSelect;
export type NewMission = typeof missionsTable.$inferInsert;
export type Notification = typeof notificationsTable.$inferSelect;
export type NewNotification = typeof notificationsTable.$inferInsert;
export type MissionActivityLog = typeof missionActivityLogTable.$inferSelect;
export type NewMissionActivityLog = typeof missionActivityLogTable.$inferInsert;
export type DeviceToken = typeof deviceTokensTable.$inferSelect;
export type NewDeviceToken = typeof deviceTokensTable.$inferInsert;
export type MissionDismissal = typeof missionDismissalsTable.$inferSelect;
export type NewMissionDismissal = typeof missionDismissalsTable.$inferInsert;
export type IncidentReport = typeof incidentReportsTable.$inferSelect;
export type NewIncidentReport = typeof incidentReportsTable.$inferInsert;
export type DbConsoleLog = typeof dbConsoleLogTable.$inferSelect;
export type NewDbConsoleLog = typeof dbConsoleLogTable.$inferInsert;
export type ReportAccessLog = typeof reportAccessLogTable.$inferSelect;
export type NewReportAccessLog = typeof reportAccessLogTable.$inferInsert;
export type ProfileChangeLog = typeof profileChangeLogTable.$inferSelect;
export type NewProfileChangeLog = typeof profileChangeLogTable.$inferInsert;
export type IdentityChangeLog = typeof identityChangeLogTable.$inferSelect;
export type NewIdentityChangeLog = typeof identityChangeLogTable.$inferInsert;
export const rolesTable = pgTable("roles", {
  id: text("id").primaryKey(),
  schoolId: text("school_id"),
  key: text("key").notNull(),
  displayName: text("display_name").notNull(),
  displayNameEn: text("display_name_en"),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique("roles_school_id_key_key").on(t.schoolId, t.key)]);

export const rolePermissionsTable = pgTable("role_permissions", {
  id: text("id").primaryKey(),
  roleId: text("role_id").notNull().references(() => rolesTable.id, { onDelete: "cascade" }),
  permission: text("permission").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique("role_permissions_role_id_permission_key").on(t.roleId, t.permission)]);

export type Role = typeof rolesTable.$inferSelect;
export type NewRole = typeof rolesTable.$inferInsert;
export type RolePermission = typeof rolePermissionsTable.$inferSelect;

export type Session = typeof sessionsTable.$inferSelect;
export type NewSession = typeof sessionsTable.$inferInsert;
export type Shift = typeof shiftsTable.$inferSelect;
export type NewShift = typeof shiftsTable.$inferInsert;
export type ShiftMember = typeof shiftMembersTable.$inferSelect;
export type NewShiftMember = typeof shiftMembersTable.$inferInsert;
export type SchoolSetting = typeof schoolSettingsTable.$inferSelect;
export type NewSchoolSetting = typeof schoolSettingsTable.$inferInsert;
export type SchoolExport = typeof schoolExportsTable.$inferSelect;
export type NewSchoolExport = typeof schoolExportsTable.$inferInsert;
