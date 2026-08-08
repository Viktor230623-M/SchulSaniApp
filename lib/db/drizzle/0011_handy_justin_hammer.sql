ALTER TABLE "device_tokens" ADD COLUMN "school_id" text;--> statement-breakpoint
ALTER TABLE "duty" ADD COLUMN "school_id" text;--> statement-breakpoint
ALTER TABLE "loa" ADD COLUMN "school_id" text;--> statement-breakpoint
ALTER TABLE "mission_activity_log" ADD COLUMN "school_id" text;--> statement-breakpoint
ALTER TABLE "mission_dismissals" ADD COLUMN "school_id" text;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "school_id" text;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "school_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "school_id" text;--> statement-breakpoint
UPDATE "device_tokens" AS t SET "school_id" = u."school_id" FROM "users" AS u WHERE u."id" = t."user_id" AND t."school_id" IS NULL;--> statement-breakpoint
UPDATE "duty" AS t SET "school_id" = u."school_id" FROM "users" AS u WHERE u."id" = t."user_id" AND t."school_id" IS NULL;--> statement-breakpoint
UPDATE "loa" AS t SET "school_id" = u."school_id" FROM "users" AS u WHERE u."id" = t."user_id" AND t."school_id" IS NULL;--> statement-breakpoint
UPDATE "mission_activity_log" AS t SET "school_id" = u."school_id" FROM "users" AS u WHERE u."id" = t."user_id" AND t."school_id" IS NULL;--> statement-breakpoint
UPDATE "mission_dismissals" AS t SET "school_id" = u."school_id" FROM "users" AS u WHERE u."id" = t."user_id" AND t."school_id" IS NULL;--> statement-breakpoint
UPDATE "missions" AS t SET "school_id" = u."school_id" FROM "users" AS u WHERE u."id" = t."requested_by" AND t."school_id" IS NULL;--> statement-breakpoint
UPDATE "news" AS t SET "school_id" = u."school_id" FROM "users" AS u WHERE u."id" = t."author_id" AND t."school_id" IS NULL;--> statement-breakpoint
UPDATE "notifications" AS t SET "school_id" = u."school_id" FROM "users" AS u WHERE u."id" = t."user_id" AND t."school_id" IS NULL;--> statement-breakpoint
UPDATE "incident_reports" AS t SET "school_id" = u."school_id" FROM "users" AS u WHERE u."id" = t."author_id" AND t."school_id" IS NULL;--> statement-breakpoint
UPDATE "incident_reports" AS r SET "school_id" = m."school_id" FROM "missions" AS m WHERE m."id" = r."mission_id" AND r."school_id" IS NULL;