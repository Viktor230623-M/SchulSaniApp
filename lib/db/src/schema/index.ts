import { pgTable, text, timestamp, json, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Users table
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  iservUsername: text("iserv_username").unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone").default(""),
  role: text("role").default("student_paramedic"),
  schoolId: text("school_id"),
  passwordHash: text("password_hash").default(""),
  isApproved: boolean("is_approved").default(false).notNull(),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// News table
export const newsTable = pgTable("news", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary"),
  content: text("content").notNull(),
  category: text("category").default("announcement"),
  status: text("status").notNull(), // pending, approved, rejected
  publishedAt: timestamp("published_at").defaultNow(),
  author: text("author"),
  authorId: text("author_id"),
  isRead: boolean("is_read").default(false),
  rejectionReason: text("rejection_reason"),
  translationsJson: text("translations_json"),
});

// Missions table
export const missionsTable = pgTable("missions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location").notNull(),
  priority: text("priority").default("medium"), // low, medium, high
  status: text("status").notNull().default("pending"), // pending, accepted, completed, rejected
  requestedAt: timestamp("requested_at").defaultNow(),
  requestedBy: text("requested_by"),
  scheduledFor: timestamp("scheduled_for"),
  patientInfo: text("patient_info"),
  assignedParamedicId: text("assigned_paramedic_id"),
  notes: text("notes"),
  translationsJson: text("translations_json"),
});

// Notifications table
export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(), // status_changed, mission_assigned, news
  title: text("title"),
  body: text("body").notNull(),
  relatedId: text("related_id"),
  priority: text("priority").default("normal"), // normal, high
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Duty status table
export const dutyTable = pgTable("duty", {
  userId: text("user_id").notNull().primaryKey(),
  status: text("status").notNull().default("off_duty"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Leave of absence table
export const loaTable = pgTable("loa", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  adminNote: text("admin_note"),
  appealNote: text("appeal_note"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  translationsJson: text("translations_json"),
});

// Mission activity log table (from BLOCK 2)
export const missionActivityLogTable = pgTable("mission_activity_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  userName: text("user_name"),
  missionId: text("mission_id"),
  missionTitle: text("mission_title"),
  action: text("action").notNull(), // accepted, dismissed, unanswered, completed
  weekKey: text("week_key"), // YYYY-Www
  dayKey: text("day_key"), // YYYY-MM-DD
  createdAt: timestamp("created_at").defaultNow(),
  metadata: json("metadata"),
});

// Mission dismissals (replaces dismissed-missions.json)
export const missionDismissalsTable = pgTable("mission_dismissals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  missionId: text("mission_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("mission_dismissals_user_mission_idx").on(t.userId, t.missionId)]);

// Incident reports (Einsatzprotokoll)
export const incidentReportsTable = pgTable("incident_reports", {
  id: text("id").primaryKey(),
  schoolId: text("school_id"),
  missionId: text("mission_id"), // null = walk-in
  authorId: text("author_id").notNull(),
  status: text("status").notNull().default("draft"), // draft | submitted
  // Patient (access-restricted)
  patientType: text("patient_type"), // student | staff | visitor | other
  patientFirstName: text("patient_first_name"),
  patientLastName: text("patient_last_name"),
  patientClass: text("patient_class"),
  // Incident details
  incidentAt: timestamp("incident_at"),
  location: text("location"),
  careStartedAt: timestamp("care_started_at"),
  careEndedAt: timestamp("care_ended_at"),
  category: text("category"),
  description: text("description"),
  // Treatment
  measuresJson: json("measures_json"), // string[] of TreatmentMeasure keys
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
  userId: text("user_id").notNull(),
  token: text("token").notNull(),
  platform: text("platform").notNull(), // 'ios' | 'android' | 'web'
  deviceId: text("device_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Export types
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
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
