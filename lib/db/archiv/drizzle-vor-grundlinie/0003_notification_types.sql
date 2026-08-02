-- Fehlende Werte im Enum notification_type nachtragen.
--
-- Der Enum kannte urspruenglich nur sieben Werte, waehrend der Code
-- (services/notifications.ts) neun Werte verschickt: "mission_created"
-- (Einsatzanlage, routes/missions.ts) und "mission_completed" (zwei Stellen)
-- fehlten. Postgres lehnte den Insert mit 22P02 "invalid input value for
-- enum notification_type" ab. Da der Aufruf ueber ein blosses
-- .catch(console.error) abgesichert ist, wurde der Einsatz trotzdem
-- angelegt und der Fehlschlag verschwand still im Log - deshalb ist es nie
-- aufgefallen.
--
-- ALTER TYPE ... ADD VALUE laesst sich nicht zurueckrollen; IF NOT EXISTS
-- sorgt dafuer, dass die Migration mehrfach ausgefuehrt werden kann, ohne
-- an einem bereits vorhandenen Wert zu scheitern.

ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'mission_completed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'mission_created';
