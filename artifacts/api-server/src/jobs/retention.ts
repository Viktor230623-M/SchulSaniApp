import { and, eq, lt, or, sql, isNull } from "drizzle-orm";
import {
  db,
  authTokensTable,
  dbConsoleLogTable,
  incidentReportsTable,
  loaTable,
  missionActivityLogTable,
  missionsTable,
  notificationsTable,
  profileChangeLogTable,
  reportAccessLogTable,
  usersTable,
  roleChangeLogTable,
  sessionsTable,
} from "@workspace/db";
import { computeCutoffs } from "../lib/retentionRules";
import { loadAuthProviders } from "../auth/registry";

export interface RetentionResult {
  table: string;
  action: "deleted" | "anonymized";
  count: number;
}

/**
 * Loescht abgelaufene Datenbestaende nach dem Loeschkonzept.
 *
 * Protokolliert ausschliesslich Tabellenname und Anzahl — niemals Inhalte.
 * Der Vorgang ist idempotent und kann gefahrlos mehrfach laufen.
 */
export async function runRetention(now: Date = new Date()): Promise<RetentionResult[]> {
  const cutoffs = computeCutoffs(now);
  const results: RetentionResult[] = [];
  const localProviderKey = loadAuthProviders().find((provider) => provider.type === "local")?.key;

  const submitted = await db
    .delete(incidentReportsTable)
    .where(and(
      eq(incidentReportsTable.status, "submitted"),
      lt(incidentReportsTable.createdAt, cutoffs.reportsSubmitted),
    ))
    .returning({ id: incidentReportsTable.id });
  results.push({ table: "incident_reports (eingereicht)", action: "deleted", count: submitted.length });

  const drafts = await db
    .delete(incidentReportsTable)
    .where(and(
      eq(incidentReportsTable.status, "draft"),
      lt(incidentReportsTable.updatedAt, cutoffs.reportsDraft),
    ))
    .returning({ id: incidentReportsTable.id });
  results.push({ table: "incident_reports (Entwuerfe)", action: "deleted", count: drafts.length });

  // Nur Einsaetze ohne zugehoeriges Protokoll. Es gibt keinen Fremdschluessel,
  // deshalb wird die Zuordnung ueber eine Unterabfrage geprueft.
  const missions = await db
    .delete(missionsTable)
    .where(and(
      lt(missionsTable.requestedAt, cutoffs.missions),
      sql`not exists (select 1 from incident_reports r where r.mission_id = ${missionsTable.id})`,
    ))
    .returning({ id: missionsTable.id });
  results.push({ table: "missions (ohne Protokoll)", action: "deleted", count: missions.length });

  const notifications = await db
    .delete(notificationsTable)
    .where(lt(notificationsTable.createdAt, cutoffs.notifications))
    .returning({ id: notificationsTable.id });
  results.push({ table: "notifications", action: "deleted", count: notifications.length });

  const loa = await db
    .delete(loaTable)
    .where(lt(loaTable.createdAt, cutoffs.loa))
    .returning({ id: loaTable.id });
  results.push({ table: "loa", action: "deleted", count: loa.length });

  const consoleLog = await db
    .delete(dbConsoleLogTable)
    .where(lt(dbConsoleLogTable.createdAt, cutoffs.consoleLog))
    .returning({ id: dbConsoleLogTable.id });
  results.push({ table: "db_console_log", action: "deleted", count: consoleLog.length });

  const accessLog = await db
    .delete(reportAccessLogTable)
    .where(lt(reportAccessLogTable.createdAt, cutoffs.accessLog))
    .returning({ id: reportAccessLogTable.id });
  results.push({ table: "report_access_log", action: "deleted", count: accessLog.length });

  const roleChanges = await db
    .delete(roleChangeLogTable)
    .where(lt(roleChangeLogTable.createdAt, cutoffs.roleChangeLog))
    .returning({ id: roleChangeLogTable.id });
  results.push({ table: "role_change_log", action: "deleted", count: roleChanges.length });

  const profileChanges = await db
    .delete(profileChangeLogTable)
    .where(lt(profileChangeLogTable.createdAt, cutoffs.profileChangeLog))
    .returning({ id: profileChangeLogTable.id });
  results.push({ table: "profile_change_log", action: "deleted", count: profileChanges.length });

  // Einsatzhistorie wird anonymisiert, nicht geloescht: die Statistik bleibt
  // erhalten, der Personenbezug entfaellt.
  const anonymized = await db
    .update(missionActivityLogTable)
    .set({ userId: "anonymisiert", userName: null, metadata: null })
    .where(and(
      lt(missionActivityLogTable.createdAt, cutoffs.activityLogAnonymize),
      sql`${missionActivityLogTable.userId} <> 'anonymisiert'`,
    ))
    .returning({ id: missionActivityLogTable.id });
  results.push({ table: "mission_activity_log", action: "anonymized", count: anonymized.length });

  // Sitzungen sind reine Betriebsdaten ohne Aufbewahrungspflicht. Entfernt werden
  // sie, sobald sie endgueltig nicht mehr gelten koennen: nach der absoluten
  // Obergrenze, oder 30 Tage nach einem Widerruf. Die Nachlauffrist beim Widerruf
  // laesst Raum, einem gemeldeten Missbrauch nachzugehen.
  const authTokens = await db
    .delete(authTokensTable)
    .where(lt(authTokensTable.expiresAt, cutoffs.authTokens))
    .returning({ id: authTokensTable.id });
  results.push({ table: "auth_tokens", action: "deleted", count: authTokens.length });

  const unverifiedAccounts = await db
    .delete(usersTable)
    .where(and(
      eq(usersTable.authProvider, localProviderKey ?? "__local_provider_disabled__"),
      isNull(usersTable.emailVerifiedAt),
      lt(usersTable.createdAt, cutoffs.unverifiedAccounts),
    ))
    .returning({ id: usersTable.id });
  results.push({ table: "users (unbestaetigt)", action: "deleted", count: unverifiedAccounts.length });

  const sessions = await db.delete(sessionsTable)
    .where(or(
      lt(sessionsTable.absoluteExpiresAt, now),
      lt(sessionsTable.revokedAt, cutoffs.sessionsRevoked),
    ))
    .returning({ id: sessionsTable.id });
  results.push({ table: "sessions", action: "deleted", count: sessions.length });

  return results;
}
