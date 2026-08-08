DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "device_tokens" AS t WHERE NOT EXISTS (SELECT 1 FROM "users" AS u WHERE u."id" = t."user_id"))
    OR EXISTS (SELECT 1 FROM "duty" AS t WHERE NOT EXISTS (SELECT 1 FROM "users" AS u WHERE u."id" = t."user_id"))
    OR EXISTS (SELECT 1 FROM "loa" AS t WHERE NOT EXISTS (SELECT 1 FROM "users" AS u WHERE u."id" = t."user_id"))
    OR EXISTS (SELECT 1 FROM "mission_activity_log" AS t WHERE NOT EXISTS (SELECT 1 FROM "users" AS u WHERE u."id" = t."user_id"))
    OR EXISTS (SELECT 1 FROM "mission_dismissals" AS t WHERE NOT EXISTS (SELECT 1 FROM "users" AS u WHERE u."id" = t."user_id"))
    OR EXISTS (SELECT 1 FROM "missions" AS t WHERE t."requested_by" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "users" AS u WHERE u."id" = t."requested_by"))
    OR EXISTS (SELECT 1 FROM "news" AS t WHERE NOT EXISTS (SELECT 1 FROM "users" AS u WHERE u."id" = t."author_id"))
    OR EXISTS (SELECT 1 FROM "notifications" AS t WHERE NOT EXISTS (SELECT 1 FROM "users" AS u WHERE u."id" = t."user_id"))
    OR EXISTS (SELECT 1 FROM "incident_reports" AS t WHERE NOT EXISTS (SELECT 1 FROM "users" AS u WHERE u."id" = t."author_id"))
    OR EXISTS (SELECT 1 FROM "report_access_log" AS t WHERE NOT EXISTS (SELECT 1 FROM "users" AS u WHERE u."id" = t."user_id"))
    OR EXISTS (SELECT 1 FROM "device_tokens" WHERE "school_id" IS NOT NULL AND "user_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "duty" WHERE "school_id" IS NOT NULL AND "user_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "loa" WHERE "school_id" IS NOT NULL AND "user_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "mission_activity_log" WHERE "school_id" IS NOT NULL AND "user_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "mission_dismissals" WHERE "school_id" IS NOT NULL AND "user_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "missions" WHERE "school_id" IS NOT NULL AND "requested_by" IS NULL)
    OR EXISTS (SELECT 1 FROM "news" WHERE "school_id" IS NOT NULL AND "author_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "notifications" WHERE "school_id" IS NOT NULL AND "user_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "incident_reports" WHERE "school_id" IS NOT NULL AND "author_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "report_access_log" WHERE "school_id" IS NOT NULL AND "user_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "device_tokens" AS t JOIN "users" AS u ON u."id" = t."user_id" WHERE t."school_id" IS DISTINCT FROM u."school_id")
    OR EXISTS (SELECT 1 FROM "duty" AS t JOIN "users" AS u ON u."id" = t."user_id" WHERE t."school_id" IS DISTINCT FROM u."school_id")
    OR EXISTS (SELECT 1 FROM "loa" AS t JOIN "users" AS u ON u."id" = t."user_id" WHERE t."school_id" IS DISTINCT FROM u."school_id")
    OR EXISTS (SELECT 1 FROM "mission_activity_log" AS t JOIN "users" AS u ON u."id" = t."user_id" WHERE t."school_id" IS DISTINCT FROM u."school_id")
    OR EXISTS (SELECT 1 FROM "mission_dismissals" AS t JOIN "users" AS u ON u."id" = t."user_id" WHERE t."school_id" IS DISTINCT FROM u."school_id")
    OR EXISTS (SELECT 1 FROM "missions" AS t JOIN "users" AS u ON u."id" = t."requested_by" WHERE t."school_id" IS DISTINCT FROM u."school_id")
    OR EXISTS (SELECT 1 FROM "news" AS t JOIN "users" AS u ON u."id" = t."author_id" WHERE t."school_id" IS DISTINCT FROM u."school_id")
    OR EXISTS (SELECT 1 FROM "notifications" AS t JOIN "users" AS u ON u."id" = t."user_id" WHERE t."school_id" IS DISTINCT FROM u."school_id")
    OR EXISTS (SELECT 1 FROM "incident_reports" AS t JOIN "users" AS u ON u."id" = t."author_id" WHERE t."school_id" IS DISTINCT FROM u."school_id")
    OR EXISTS (SELECT 1 FROM "incident_reports" AS r WHERE r."mission_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "missions" AS m WHERE m."id" = r."mission_id"))
    OR EXISTS (SELECT 1 FROM "incident_reports" AS r JOIN "missions" AS m ON m."id" = r."mission_id" WHERE r."school_id" IS DISTINCT FROM m."school_id")
    OR EXISTS (SELECT 1 FROM "report_access_log" AS t JOIN "users" AS u ON u."id" = t."user_id" WHERE t."school_id" IS DISTINCT FROM u."school_id")
    OR EXISTS (SELECT 1 FROM "device_tokens" WHERE "school_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "duty" WHERE "school_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "incident_reports" WHERE "school_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "loa" WHERE "school_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "mission_activity_log" WHERE "school_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "mission_dismissals" WHERE "school_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "missions" WHERE "school_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "news" WHERE "school_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "notifications" WHERE "school_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "report_access_log" WHERE "school_id" IS NULL)
  THEN
    RAISE EXCEPTION 'Tenant backfill incomplete: school_id is NULL';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "device_tokens" ALTER COLUMN "school_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "duty" ALTER COLUMN "school_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "incident_reports" ALTER COLUMN "school_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "loa" ALTER COLUMN "school_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mission_activity_log" ALTER COLUMN "school_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mission_dismissals" ALTER COLUMN "school_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ALTER COLUMN "school_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "news" ALTER COLUMN "school_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "school_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "report_access_log" ALTER COLUMN "school_id" SET NOT NULL;