import { and, eq, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
  authTokensTable,
  db,
  identityChangeLogTable,
  incidentReportsTable,
  loaTable,
  missionActivityLogTable,
  missionsTable,
  newsTable,
  notificationsTable,
  profileChangeLogTable,
  reportAccessLogTable,
  usersTable,
  roleChangeLogTable,
  sessionsTable,
} from "@workspace/db";
import { computeCutoffs } from "../lib/retentionRules";

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

  const identityChanges = await db
    .delete(identityChangeLogTable)
    .where(lt(identityChangeLogTable.createdAt, cutoffs.identityChangeLog))
    .returning({ id: identityChangeLogTable.id });
  results.push({ table: "identity_change_log", action: "deleted", count: identityChanges.length });

  // Auth-Links: sieben Tage nach Ablauf entfernen (Loeschkonzept). Verbrauchte
  // wie abgelaufene Tokens, sobald der Stichtag passiert ist.
  const authTokens = await db
    .delete(authTokensTable)
    .where(lt(authTokensTable.expiresAt, cutoffs.authTokens))
    .returning({ id: authTokensTable.id });
  results.push({ table: "auth_tokens", action: "deleted", count: authTokens.length });

  // Unbestaetigte lokale Registrierungen: 30 Tage nach Anlage entfernen
  // (Loeschkonzept). Erkennung ueber login_salt/password_hash -- nur lokale
  // Konten tragen beides; OIDC-/Apple-Konten nie. Der Stichtag liegt weit vor
  // der 24-Stunden-Laufzeit eines Bestaetigungslinks, ein versehentliches
  // Loeschen waehrend der Bestaetigung ist damit ausgeschlossen.
  const unverified = await db
    .delete(usersTable)
    .where(and(
      isNull(usersTable.emailVerifiedAt),
      isNotNull(usersTable.loginSalt),
      ne(usersTable.passwordHash, ""),
      lt(usersTable.createdAt, cutoffs.unverifiedAccounts),
    ))
    .returning({ id: usersTable.id });
  results.push({ table: "users (unbestaetigte lokale Konten)", action: "deleted", count: unverified.length });

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

  // Meeting-Anmeldungen (Treffen/Abstimmungen) sind nur fuer die Organisation
  // des Termins noetig. 90 Tage nach Meeting-Ende — ohne Endzeit nach Beginn —
  // werden die Namen entfernt; der Beitrag selbst bleibt als Nachricht stehen.
  const meetingSignups = await db
    .update(newsTable)
    .set({ meetingSignupsJson: null })
    .where(and(
      isNotNull(newsTable.meetingAt),
      or(
        and(isNotNull(newsTable.meetingEndAt), lt(newsTable.meetingEndAt, cutoffs.meetingSignups)),
        and(isNull(newsTable.meetingEndAt), lt(newsTable.meetingAt, cutoffs.meetingSignups)),
      ),
    ))
    .returning({ id: newsTable.id });
  results.push({ table: "news (Meeting-Anmeldungen)", action: "deleted", count: meetingSignups.length });

  // Sitzungen sind reine Betriebsdaten ohne Aufbewahrungspflicht. Entfernt werden
  // sie, sobald sie endgueltig nicht mehr gelten koennen: nach der absoluten
  // Obergrenze, oder 30 Tage nach einem Widerruf. Die Nachlauffrist beim Widerruf
  // laesst Raum, einem gemeldeten Missbrauch nachzugehen.
  const sessions = await db.delete(sessionsTable)
    .where(or(
      lt(sessionsTable.absoluteExpiresAt, now),
      lt(sessionsTable.revokedAt, cutoffs.sessionsRevoked),
    ))
    .returning({ id: sessionsTable.id });
  results.push({ table: "sessions", action: "deleted", count: sessions.length });

  return results;
}
