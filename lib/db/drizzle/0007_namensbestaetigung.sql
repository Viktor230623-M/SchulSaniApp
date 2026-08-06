CREATE TABLE "profile_change_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"field" text NOT NULL,
	"before" text,
	"after" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_confirmed_at" timestamp;--> statement-breakpoint
CREATE INDEX "profile_change_log_created_idx" ON "profile_change_log" USING btree ("created_at");--> statement-breakpoint
UPDATE "users" SET "profile_confirmed_at" = now() WHERE trim(coalesce("first_name", '')) <> '' AND trim(coalesce("last_name", '')) <> '' AND "profile_confirmed_at" IS NULL;
