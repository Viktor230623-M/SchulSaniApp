import { pgTable, text, timestamp, json, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Users table
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone").default(""),
  role: text("role").default("student_paramedic"),
  schoolId: text("school_id"),
  passwordHash: text("password_hash").default(""),
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
  scheduledFor: timestamp("scheduled_for"),
  patientInfo: text("patient_info"),
  assignedParamedicId: text("assigned_paramedic_id"),
  notes: text("notes"),
});

// Notifications table
export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(), // status_changed, mission_assigned, news
  body: text("body").notNull(),
  relatedId: text("related_id"),
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
