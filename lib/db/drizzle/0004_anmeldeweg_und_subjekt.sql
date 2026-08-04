ALTER TABLE "users" DROP CONSTRAINT "users_iserv_username_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_provider" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "external_subject" text;--> statement-breakpoint
UPDATE "users" SET "auth_provider" = 'iserv-form', "external_subject" = "iserv_username";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_auth_provider_external_subject_key" UNIQUE("school_id","auth_provider","external_subject");
