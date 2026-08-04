-- Zeilen umhaengen, bevor der Aufzaehlungstyp die alten Werte verliert. In der
-- Produktion traegt sie niemand, eine andere Installation kann sie aber haben --
-- ohne diesen Schritt bricht die Umwandlung unten mit "invalid input value" ab.
UPDATE "users" SET "role" = 'owner' WHERE "role" = 'cto';--> statement-breakpoint
UPDATE "users" SET "role" = 'sanitaeter' WHERE "role" = 'student_paramedic';--> statement-breakpoint
DELETE FROM "role_permissions" WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "key" IN ('cto', 'student_paramedic'));--> statement-breakpoint
DELETE FROM "roles" WHERE "key" IN ('cto', 'student_paramedic');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'sanitaeter'::text;--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('sanitaeter', 'sanitaeter_leitung', 'sanitaeter_leitung_admin', 'teacher', 'admin', 'owner');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'sanitaeter'::"public"."user_role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";
