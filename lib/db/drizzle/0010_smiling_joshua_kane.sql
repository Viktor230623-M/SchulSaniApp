CREATE TABLE "identity_change_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_key" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "identity_change_log_created_idx" ON "identity_change_log" USING btree ("created_at");