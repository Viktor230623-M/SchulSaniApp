CREATE TYPE "public"."duty_status" AS ENUM('on_duty', 'off_duty');--> statement-breakpoint
CREATE TYPE "public"."loa_status" AS ENUM('pending', 'approved', 'rejected', 'appealed');--> statement-breakpoint
CREATE TYPE "public"."mission_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."mission_status" AS ENUM('pending', 'accepted', 'rejected', 'completed');--> statement-breakpoint
CREATE TYPE "public"."news_category" AS ENUM('announcement', 'training', 'update', 'alert');--> statement-breakpoint
CREATE TYPE "public"."news_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('mission_assigned', 'mission_cancelled', 'status_changed', 'news', 'loa_update', 'reminder', 'high_priority_alert');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('cto', 'student_paramedic', 'sanitaeter_leitung', 'admin', 'teacher');--> statement-breakpoint
CREATE TABLE "duty_entries" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" "duty_status" DEFAULT 'off_duty' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loa_requests" (
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
	"reviewed_at" timestamp
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
	"scheduled_for" timestamp DEFAULT now() NOT NULL,
	"assigned_paramedic_id" text,
	"patient_info" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "news" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"content" text NOT NULL,
	"category" "news_category" DEFAULT 'announcement' NOT NULL,
	"status" "news_status" DEFAULT 'pending' NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"author" text NOT NULL,
	"author_id" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"rejection_reason" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"related_id" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"role" "user_role" DEFAULT 'student_paramedic' NOT NULL,
	"school_id" text NOT NULL,
	"password_hash" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
