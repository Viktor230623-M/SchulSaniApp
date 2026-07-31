/**
 * Fristen fuer Anmeldesitzungen.
 *
 * Zwei Fristen wirken gleichzeitig. Die gleitende Frist verlaengert sich bei jeder
 * Nutzung und sorgt dafuer, dass aktive Nutzer angemeldet bleiben. Die absolute
 * Frist wird beim Login fixiert und nie verlaengert — ohne sie koennte ein
 * entwendetes Cookie sich durch blosse Nutzung unbegrenzt selbst am Leben halten.
 *
 * Seiteneffektfrei und ohne Datenbankbezug, damit die Fristen ohne Infrastruktur
 * testbar bleiben.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Gleitendes Fenster: verlaengert sich bei jeder Wiederherstellung. */
export const SLIDING_WINDOW_MS = 30 * DAY_MS;

/** Obergrenze ab Login. Wird nie verlaengert. */
export const ABSOLUTE_LIFETIME_MS = 180 * DAY_MS;

export interface SessionTimestamps {
  expiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
}

export function computeNewSession(now: Date): { expiresAt: Date; absoluteExpiresAt: Date } {
  return {
    expiresAt: new Date(now.getTime() + SLIDING_WINDOW_MS),
    absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_LIFETIME_MS),
  };
}

export function isSessionValid(s: SessionTimestamps, now: Date): boolean {
  if (s.revokedAt !== null) return false;
  if (now.getTime() >= s.expiresAt.getTime()) return false;
  if (now.getTime() >= s.absoluteExpiresAt.getTime()) return false;
  return true;
}

/**
 * Neues Ablaufdatum nach einer Wiederherstellung — gedeckelt auf die absolute Frist,
 * damit die Verlaengerung die Obergrenze nicht aushebelt.
 */
export function computeSlidingExtension(s: SessionTimestamps, now: Date): Date {
  const extended = now.getTime() + SLIDING_WINDOW_MS;
  return new Date(Math.min(extended, s.absoluteExpiresAt.getTime()));
}
