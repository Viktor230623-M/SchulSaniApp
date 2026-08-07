CREATE TABLE "user_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"school_id" text,
	"auth_provider" text NOT NULL,
	"external_subject" text NOT NULL,
	"email_at_link" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	CONSTRAINT "user_identities_school_provider_subject_key" UNIQUE("school_id","auth_provider","external_subject")
);
--> statement-breakpoint
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    WHERE "auth_provider" IS NOT NULL AND "external_subject" IS NOT NULL
    GROUP BY "school_id", "auth_provider", "external_subject"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'users contains duplicate primary identities';
  END IF;
END $$;--> statement-breakpoint
INSERT INTO "user_identities" ("id", "user_id", "school_id", "auth_provider", "external_subject", "email_at_link", "created_at")
SELECT
  'primary-' || "id",
  "id",
  "school_id",
  "auth_provider",
  "external_subject",
  "email",
  "created_at"
FROM "users"
WHERE "auth_provider" IS NOT NULL AND "external_subject" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "user_identities_user_id_idx" ON "user_identities" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_school_id_auth_provider_external_subject_key";