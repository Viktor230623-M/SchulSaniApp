CREATE TYPE "auth_token_kind" AS ENUM ('email_verify', 'password_reset');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "users" SET "email_verified_at" = now() WHERE "auth_provider" IS NULL OR "auth_provider" <> 'local';--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "auth_token_kind" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
CREATE UNIQUE INDEX "users_school_id_username_key" ON "users" USING btree ("school_id", "username");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_kind_idx" ON "auth_tokens" USING btree ("user_id", "kind");
