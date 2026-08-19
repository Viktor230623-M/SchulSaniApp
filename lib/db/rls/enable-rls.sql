-- RLS-Fundament für die SchulSaniApp (Phase A).
--
-- Legt die Helfer-Funktion und je Tenant-Tabelle eine Policy an und schaltet
-- ENABLE ROW LEVEL SECURITY ein. Bewusst OHNE `FORCE` und ohne gesetzten
-- Kontext: Die Policies sind permissiv, solange `app.current_school_id` nicht
-- gesetzt ist, und der Tabellen-Eigentümer umgeht RLS ohne FORCE ohnehin.
-- Dadurch ändert sich am Verhalten nichts — es wird keine Zeile ausgeblendet.
--
-- Anwendung: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/rls/enable-rls.sql
--
-- Phase B (Enforcement) ist separat: eigene app_role, SET LOCAL je Anfrage,
-- Backfill der nullable school_id-Spalten. Siehe README.md.

BEGIN;

-- Liefert den Schulkontext des aktuellen Requests, falls gesetzt.
-- Unset = NULL => Policies lassen alles durch (Foundation-Modus).
CREATE OR REPLACE FUNCTION public.app_current_school_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.current_school_id', true);
$$;

-- Strikte Tenant-Tabellen (school_id NOT NULL): nur die eigene Schule.
ALTER TABLE "news"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "missions"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "duty"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loa"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shifts"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_members"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mission_activity_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "news_reads"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mission_dismissals"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "incident_reports"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "device_tokens"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_access_log"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_deks"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_dek_wraps"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crypto_grant_log"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_settings"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_exports"      ENABLE ROW LEVEL SECURITY;

-- Nullable school_id: users, user_identities und die drei Audit-Logs.
ALTER TABLE "users"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_identities"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_change_log"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profile_change_log"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identity_change_log" ENABLE ROW LEVEL SECURITY;

-- roles: zusätzlich globale (school_id IS NULL) Rollen sichtbar lassen.
ALTER TABLE "roles"               ENABLE ROW LEVEL SECURITY;

-- Policies für strikte Tenant-Tabellen.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'news','missions','notifications','duty','loa','shifts','shift_members',
    'mission_activity_log','news_reads','mission_dismissals','incident_reports',
    'device_tokens','report_access_log','school_deks','school_dek_wraps',
    'crypto_grant_log','school_settings','school_exports'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I USING (public.app_current_school_id() IS NULL OR school_id = public.app_current_school_id()) WITH CHECK (public.app_current_school_id() IS NULL OR school_id = public.app_current_school_id())',
      t, t
    );
  END LOOP;
END $$;

-- Nullable-Tabellen: eigene Schule, aber ohne Schulzuordnung weiter sichtbar,
-- solange kein Kontext gesetzt ist (Foundation-Modus: alles sichtbar).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','user_identities','role_change_log','profile_change_log','identity_change_log'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I USING (public.app_current_school_id() IS NULL OR school_id IS NULL OR school_id = public.app_current_school_id()) WITH CHECK (public.app_current_school_id() IS NULL OR school_id = public.app_current_school_id())',
      t, t
    );
  END LOOP;
END $$;

-- roles: globale Rollen (school_id IS NULL) bleiben zusätzlich lesbar.
CREATE POLICY tenant_isolation_roles ON "roles"
  USING (public.app_current_school_id() IS NULL OR school_id IS NULL OR school_id = public.app_current_school_id())
  WITH CHECK (public.app_current_school_id() IS NULL OR school_id = public.app_current_school_id());

COMMIT;
