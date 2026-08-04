CREATE TABLE "role_change_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text,
	"role_id" text,
	"role_key" text,
	"target_user_id" text,
	"action" text NOT NULL,
	"permissions_before" json,
	"permissions_after" json,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "role_change_log_created_idx" ON "role_change_log" USING btree ("created_at");