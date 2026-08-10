CREATE TYPE "public"."export_interval" AS ENUM('semiannual', 'annual', 'five_years');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('ready', 'downloaded');--> statement-breakpoint
CREATE TABLE "school_exports" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"from_at" timestamp,
	"to_at" timestamp NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"status" "export_status" DEFAULT 'ready' NOT NULL,
	"downloaded_at" timestamp,
	"downloaded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_settings" (
	"school_id" text PRIMARY KEY NOT NULL,
	"export_interval" "export_interval" DEFAULT 'semiannual' NOT NULL,
	"last_export_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "school_exports_school_created_idx" ON "school_exports" USING btree ("school_id","created_at");