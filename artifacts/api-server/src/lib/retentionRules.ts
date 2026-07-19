/**
 * Stichtage fuer die automatisierte Loeschung.
 *
 * Die Werte stammen aus dem Loeschkonzept, das als Anlage 2 Bestandteil des
 * Auftragsverarbeitungsvertrags ist. Aenderungen hier sind Aenderungen an einer
 * vertraglichen Zusage und duerfen nicht ohne Abstimmung erfolgen.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionCutoffs {
  /** Eingereichte Protokolle: 5 Jahre nach Ende des Erfassungsjahres. */
  reportsSubmitted: Date;
  /** Entwuerfe: 30 Tage nach letzter Aenderung. */
  reportsDraft: Date;
  /** Einsaetze ohne zugehoeriges Protokoll: 12 Monate nach Abschluss. */
  missions: Date;
  /** Benachrichtigungen: 90 Tage. */
  notifications: Date;
  /** Abwesenheitsantraege: Schuljahresende + 1 Jahr. */
  loa: Date;
  /** Einsatzhistorie: 2 Schuljahre, danach Anonymisierung. */
  activityLogAnonymize: Date;
  /** Protokolle des Administrationszugangs: 12 Monate. */
  consoleLog: Date;
  /** Zugriffsprotokolle der Anwendung: 12 Monate. */
  accessLog: Date;
}

function minusDays(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

function minusMonths(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

export function computeCutoffs(now: Date): RetentionCutoffs {
  const endOfYearFiveYearsBack = new Date(
    Date.UTC(now.getUTCFullYear() - 6, 11, 31, 23, 59, 59, 999),
  );

  return {
    reportsSubmitted: endOfYearFiveYearsBack,
    reportsDraft: minusDays(now, 30),
    missions: minusMonths(now, 12),
    notifications: minusDays(now, 90),
    // Das Loeschkonzept nennt "Schuljahresende + 1 Jahr" bzw. "2 Schuljahre".
    // Da das Schuljahr am 31. Juli endet, liegt die tatsaechliche Frist je nach
    // Erfassungszeitpunkt zwischen 12 und 24 Monaten. 24 Monate ist die
    // konservative Auslegung: es wird nie zu frueh geloescht.
    loa: minusMonths(now, 24),
    activityLogAnonymize: minusMonths(now, 24),
    consoleLog: minusMonths(now, 12),
    accessLog: minusMonths(now, 12),
  };
}
