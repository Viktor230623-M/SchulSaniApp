ALTER TABLE "news" ADD COLUMN "meeting_at" timestamp;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "meeting_end_at" timestamp;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "meeting_location" text;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "meeting_notify_on_signup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "meeting_signups_json" json;