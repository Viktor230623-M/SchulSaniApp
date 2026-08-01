CREATE TYPE "public"."duty_status" AS ENUM('on_duty', 'off_duty');--> statement-breakpoint
CREATE TYPE "public"."loa_status" AS ENUM('pending', 'approved', 'rejected', 'appealed');--> statement-breakpoint
CREATE TYPE "public"."mission_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."mission_status" AS ENUM('pending', 'accepted', 'rejected', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."news_category" AS ENUM('announcement', 'training', 'update', 'alert');--> statement-breakpoint
CREATE TYPE "public"."news_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('mission_assigned', 'mission_cancelled', 'status_changed', 'news', 'loa_update', 'reminder', 'high_priority_alert', 'mission_completed', 'mission_created');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('cto', 'student_paramedic', 'sanitaeter_leitung', 'admin', 'teacher', 'sanitaeter_leitung_admin', 'sanitaeter', 'owner');--> statement-breakpoint
CREATE TABLE "db_console_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text,
	"statement" text NOT NULL,
	"preset_key" text,
	"committed" boolean DEFAULT false NOT NULL,
	"rows_affected" integer,
	"error" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"device_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "duty" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" "duty_status" DEFAULT 'off_duty' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text,
	"mission_id" text,
	"author_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"patient_type" text,
	"patient_first_name" text,
	"patient_last_name" text,
	"patient_class" text,
	"patient_age" integer,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"incident_at" timestamp,
	"location" text,
	"care_started_at" timestamp,
	"care_ended_at" timestamp,
	"category" text,
	"description" text,
	"injury_sites" text,
	"measures" text,
	"treatment_notes" text,
	"pulse_bpm" integer,
	"spo2" integer,
	"resp_rate" integer,
	"blood_pressure" text,
	"consciousness_avpu" text,
	"pain_score" integer,
	"outcome" text,
	"outcome_notes" text,
	"responder_ids_json" json,
	"witnesses" text,
	"addenda_json" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"submitted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "loa" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"from_date" text NOT NULL,
	"to_date" text NOT NULL,
	"reason" text NOT NULL,
	"status" "loa_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"admin_note" text,
	"appeal_note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"translations_json" text
);
--> statement-breakpoint
CREATE TABLE "mission_activity_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text,
	"mission_id" text,
	"mission_title" text,
	"action" text NOT NULL,
	"week_key" text,
	"day_key" text,
	"created_at" timestamp DEFAULT now(),
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "mission_dismissals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mission_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mission_dismissals_user_id_mission_id_key" UNIQUE("user_id","mission_id")
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"location" text NOT NULL,
	"priority" "mission_priority" DEFAULT 'medium' NOT NULL,
	"status" "mission_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"requested_by" text,
	"scheduled_for" timestamp DEFAULT now() NOT NULL,
	"patient_info" text,
	"assigned_paramedic_id" text,
	"notes" text,
	"translations_json" text
);
--> statement-breakpoint
CREATE TABLE "news" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"content" text NOT NULL,
	"category" "news_category" DEFAULT 'announcement' NOT NULL,
	"status" "news_status" NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"author" text NOT NULL,
	"author_id" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"rejection_reason" text,
	"translations_json" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"related_id" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_access_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text,
	"report_id" text,
	"action" text NOT NULL,
	"patient_visible" boolean DEFAULT false NOT NULL,
	"result_count" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"last_used_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	"absolute_expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"iserv_username" text,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text DEFAULT '',
	"role" "user_role" DEFAULT 'sanitaeter' NOT NULL,
	"school_id" text,
	"password_hash" text DEFAULT '',
	"is_approved" boolean DEFAULT false NOT NULL,
	"approved_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_iserv_username_unique" UNIQUE("iserv_username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_mission_activity_user_created" ON "mission_activity_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_mission_activity_user_week" ON "mission_activity_log" USING btree ("user_id","week_key");--> statement-breakpoint
CREATE INDEX "report_access_log_created_idx" ON "report_access_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");