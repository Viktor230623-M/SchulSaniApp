CREATE TABLE "crypto_grant_log" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text,
	"target_user_id" text,
	"action" text NOT NULL,
	"dek_version" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_dek_wraps" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"dek_version" integer NOT NULL,
	"user_id" text NOT NULL,
	"wrapped_dek" text NOT NULL,
	"granted_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "school_dek_wraps_school_user_version_key" UNIQUE("school_id","user_id","dek_version")
);
--> statement-breakpoint
CREATE TABLE "school_deks" (
	"school_id" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "school_deks_school_id_version_pk" PRIMARY KEY("school_id","version")
);
--> statement-breakpoint
CREATE TABLE "user_crypto_keys" (
	"user_id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"salt_enc" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incident_reports" ADD COLUMN "content_encrypted" text;--> statement-breakpoint
ALTER TABLE "incident_reports" ADD COLUMN "content_key_version" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "login_salt" text;--> statement-breakpoint
ALTER TABLE "user_crypto_keys" ADD CONSTRAINT "user_crypto_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crypto_grant_log_created_idx" ON "crypto_grant_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "school_dek_wraps_user_idx" ON "school_dek_wraps" USING btree ("user_id");