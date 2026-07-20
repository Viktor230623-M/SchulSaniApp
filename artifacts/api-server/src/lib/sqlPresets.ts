/**
 * Ready-made statements for the SQL console, so routine cleanup never requires
 * remembering table or column names. Placeholders are written as :name and get
 * replaced in the UI before the statement is sent.
 */

export interface SqlPreset {
  key: string;
  group: string;
  label: string;
  description: string;
  sql: string;
  /** Marks statements that delete data, so the UI can style them as dangerous. */
  destructive: boolean;
}

export const SQL_PRESETS: SqlPreset[] = [
  // ---------- Überblick ----------
  {
    key: "overview_counts",
    group: "Überblick",
    label: "Zeilen pro Tabelle",
    description: "Wie viele Datensätze stecken aktuell in jeder Tabelle?",
    destructive: false,
    sql: `SELECT 'missions' AS tabelle, count(*) FROM missions
UNION ALL SELECT 'incident_reports', count(*) FROM incident_reports_admin
UNION ALL SELECT 'loa', count(*) FROM loa
UNION ALL SELECT 'news', count(*) FROM news
UNION ALL SELECT 'notifications', count(*) FROM notifications
UNION ALL SELECT 'mission_activity_log', count(*) FROM mission_activity_log
UNION ALL SELECT 'mission_dismissals', count(*) FROM mission_dismissals
UNION ALL SELECT 'duty', count(*) FROM duty
UNION ALL SELECT 'device_tokens', count(*) FROM device_tokens
UNION ALL SELECT 'users', count(*) FROM users
ORDER BY 1`,
  },
  {
    key: "overview_recent",
    group: "Überblick",
    label: "Letzte Aktivität",
    description: "Die 20 jüngsten Einträge quer über Einsätze, Protokolle und LOA.",
    destructive: false,
    sql: `SELECT 'Einsatz' AS typ, id, title AS info, requested_at AS zeitpunkt FROM missions
UNION ALL SELECT 'Protokoll', id, coalesce(status, '—'), created_at FROM incident_reports_admin
UNION ALL SELECT 'LOA', id, user_name, created_at FROM loa
ORDER BY zeitpunkt DESC NULLS LAST
LIMIT 20`,
  },

  // ---------- Einsätze ----------
  {
    key: "missions_list",
    group: "Einsätze",
    label: "Alle Einsätze",
    description: "Neueste zuerst, mit Status und Ort.",
    destructive: false,
    sql: `SELECT id, title, location, status, priority, requested_at
FROM missions
ORDER BY requested_at DESC NULLS LAST
LIMIT 100`,
  },
  {
    key: "missions_open",
    group: "Einsätze",
    label: "Offene Einsätze",
    description: "Alles, was noch nicht abgeschlossen ist.",
    destructive: false,
    sql: `SELECT id, title, location, status, requested_at
FROM missions
WHERE status NOT IN ('completed', 'rejected')
ORDER BY requested_at DESC NULLS LAST`,
  },
  {
    key: "missions_delete_one",
    group: "Einsätze",
    label: "Einen Einsatz löschen",
    description: "Löscht nur den Einsatz selbst — Aktivitätslog und Ausblendungen bleiben und müssen separat geräumt werden.",
    destructive: true,
    sql: `DELETE FROM missions WHERE id = ':einsatz_id'`,
  },
  {
    key: "missions_delete_completed",
    group: "Einsätze",
    label: "Abgeschlossene Einsätze löschen",
    description: "Räumt alle Einsätze mit Status 'completed' ab.",
    destructive: true,
    sql: `DELETE FROM missions WHERE status = 'completed'`,
  },
  {
    key: "missions_delete_all",
    group: "Einsätze",
    label: "ALLE Einsätze löschen",
    description: "Leert die komplette Einsatz-Tabelle. Nur für die Testphase.",
    destructive: true,
    sql: `DELETE FROM missions WHERE true`,
  },

  // ---------- Protokolle ----------
  {
    key: "reports_list",
    group: "Protokolle",
    label: "Alle Protokolle",
    description: "Ohne Patientendaten — nur Kategorie, Status und Zeit.",
    destructive: false,
    sql: `SELECT id, status, patient_type, location, incident_at, created_at, submitted_at
FROM incident_reports_admin
ORDER BY created_at DESC
LIMIT 100`,
  },
  {
    key: "reports_drafts",
    group: "Protokolle",
    label: "Nur Entwürfe",
    description: "Protokolle, die nie eingereicht wurden.",
    destructive: false,
    sql: `SELECT id, author_id, created_at, updated_at
FROM incident_reports_admin
WHERE status = 'draft'
ORDER BY created_at DESC`,
  },
  {
    key: "reports_delete_one",
    group: "Protokolle",
    label: "Ein Protokoll löschen",
    description: "Endgültig — auch eingereichte Protokolle.",
    destructive: true,
    sql: `DELETE FROM incident_reports WHERE id = ':protokoll_id'`,
  },
  {
    key: "reports_delete_drafts",
    group: "Protokolle",
    label: "Alle Entwürfe löschen",
    description: "Lässt eingereichte Protokolle unangetastet.",
    destructive: true,
    sql: `DELETE FROM incident_reports WHERE status = 'draft'`,
  },
  {
    key: "reports_delete_all",
    group: "Protokolle",
    label: "ALLE Protokolle löschen",
    description: "Leert die komplette Protokoll-Tabelle. Nur für die Testphase.",
    destructive: true,
    sql: `DELETE FROM incident_reports WHERE true`,
  },

  // ---------- LOA ----------
  {
    key: "loa_list",
    group: "Abwesenheiten",
    label: "Alle Anträge",
    description: "Mit Status und Zeitraum.",
    destructive: false,
    sql: `SELECT id, user_name, from_date, to_date, status, created_at
FROM loa
ORDER BY created_at DESC
LIMIT 100`,
  },
  {
    key: "loa_delete_one",
    group: "Abwesenheiten",
    label: "Einen Antrag löschen",
    description: "Entfernt genau einen LOA-Eintrag.",
    destructive: true,
    sql: `DELETE FROM loa WHERE id = ':loa_id'`,
  },
  {
    key: "loa_delete_all",
    group: "Abwesenheiten",
    label: "ALLE Anträge löschen",
    description: "Leert die LOA-Tabelle.",
    destructive: true,
    sql: `DELETE FROM loa WHERE true`,
  },

  // ---------- News ----------
  {
    key: "news_list",
    group: "News",
    label: "Alle Beiträge",
    description: "Mit Status und Autor.",
    destructive: false,
    sql: `SELECT id, title, status, author, published_at
FROM news
ORDER BY published_at DESC NULLS LAST
LIMIT 100`,
  },
  {
    key: "news_delete_one",
    group: "News",
    label: "Einen Beitrag löschen",
    description: "Entfernt genau einen News-Eintrag.",
    destructive: true,
    sql: `DELETE FROM news WHERE id = ':news_id'`,
  },
  {
    key: "news_delete_rejected",
    group: "News",
    label: "Abgelehnte Beiträge löschen",
    description: "Räumt alles mit Status 'rejected' ab.",
    destructive: true,
    sql: `DELETE FROM news WHERE status = 'rejected'`,
  },

  // ---------- Benachrichtigungen ----------
  {
    key: "notifications_count",
    group: "Benachrichtigungen",
    label: "Anzahl pro Nutzer",
    description: "Wer sammelt die meisten ungelesenen Benachrichtigungen?",
    destructive: false,
    sql: `SELECT user_id, count(*) FILTER (WHERE is_read = false) AS ungelesen, count(*) AS gesamt
FROM notifications
GROUP BY user_id
ORDER BY gesamt DESC`,
  },
  {
    key: "notifications_delete_read",
    group: "Benachrichtigungen",
    label: "Gelesene löschen",
    description: "Behält alles Ungelesene.",
    destructive: true,
    sql: `DELETE FROM notifications WHERE is_read = true`,
  },
  {
    key: "notifications_delete_all",
    group: "Benachrichtigungen",
    label: "ALLE löschen",
    description: "Leert die Benachrichtigungs-Tabelle.",
    destructive: true,
    sql: `DELETE FROM notifications WHERE true`,
  },

  // ---------- Aktivität & Dienst ----------
  {
    key: "activity_list",
    group: "Aktivität & Dienst",
    label: "Aktivitätslog",
    description: "Die letzten 100 Einträge.",
    destructive: false,
    sql: `SELECT id, user_name, mission_title, action, created_at
FROM mission_activity_log
ORDER BY created_at DESC
LIMIT 100`,
  },
  {
    key: "activity_delete_all",
    group: "Aktivität & Dienst",
    label: "Aktivitätslog leeren",
    description: "Löscht die Einsatz-Statistik aller Nutzer.",
    destructive: true,
    sql: `DELETE FROM mission_activity_log WHERE true`,
  },
  {
    key: "duty_list",
    group: "Aktivität & Dienst",
    label: "Dienststatus",
    description: "Wer ist gerade im Dienst?",
    destructive: false,
    sql: `SELECT user_id, status, updated_at FROM duty ORDER BY updated_at DESC`,
  },
  {
    key: "duty_reset",
    group: "Aktivität & Dienst",
    label: "Alle aus dem Dienst nehmen",
    description: "Setzt jeden Nutzer auf 'off_duty'.",
    destructive: false,
    sql: `UPDATE duty SET status = 'off_duty', updated_at = now() WHERE status <> 'off_duty'`,
  },
  {
    key: "dismissals_delete_all",
    group: "Aktivität & Dienst",
    label: "Ausgeblendete Einsätze zurücksetzen",
    description: "Danach sehen alle wieder jeden Einsatz.",
    destructive: true,
    sql: `DELETE FROM mission_dismissals WHERE true`,
  },

  // ---------- Nutzer ----------
  {
    key: "users_list",
    group: "Nutzer",
    label: "Alle Nutzer",
    description: "Mit Rolle und Freigabe-Status.",
    destructive: false,
    sql: `SELECT id, first_name, last_name, email, role, is_approved
FROM users
ORDER BY role, last_name`,
  },
  {
    key: "users_pending",
    group: "Nutzer",
    label: "Wartende Freigaben",
    description: "Wer wartet noch auf Freischaltung?",
    destructive: false,
    sql: `SELECT id, first_name, last_name, email, created_at
FROM users
WHERE is_approved = false
ORDER BY created_at`,
  },
  {
    key: "users_set_role",
    group: "Nutzer",
    label: "Rolle ändern",
    description: "Rollen: student_paramedic, sanitaeter, sanitaeter_leitung, sanitaeter_leitung_admin, teacher, admin, cto.",
    destructive: false,
    sql: `UPDATE users SET role = ':neue_rolle' WHERE email = ':email'`,
  },
  {
    key: "users_approve",
    group: "Nutzer",
    label: "Nutzer freigeben",
    description: "Schaltet einen wartenden Account frei.",
    destructive: false,
    sql: `UPDATE users SET is_approved = true WHERE email = ':email'`,
  },

  // ---------- Protokoll der Konsole ----------
  {
    key: "console_log",
    group: "Konsolen-Protokoll",
    label: "Was wurde hier ausgeführt?",
    description: "Jede Anweisung dieser Konsole wird mitgeschrieben.",
    destructive: false,
    sql: `SELECT created_at, user_name, committed, rows_affected, statement, error
FROM db_console_log
ORDER BY created_at DESC
LIMIT 50`,
  },
];

/** Extracts :placeholder names so the UI can prompt for each one. */
export function placeholdersOf(sql: string): string[] {
  const found = sql.match(/:[a-z_äöü]+/gi) ?? [];
  return [...new Set(found.map((p) => p.slice(1)))];
}
