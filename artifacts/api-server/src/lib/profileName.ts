// Gemeinsame Pruefung fuer Vor- und Nachname, gebraucht sowohl von der
// Selbstbestaetigung (PATCH /auth/profile) als auch von der Korrektur durch
// einen Verwalter (PATCH /users/:id/profile) -- dieselben Regeln, derselbe Ort.
const PROFILE_NAME_MAX_LENGTH = 100;
const CONTROL_CHARS = /[\x00-\x1F\x7F]/;
const DIGITS_ONLY = /^\d+$/;

/** Liefert den getrimmten Namen bei gueltiger Eingabe, sonst null. */
export function validateProfileName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > PROFILE_NAME_MAX_LENGTH) return null;
  if (CONTROL_CHARS.test(trimmed)) return null;
  if (DIGITS_ONLY.test(trimmed)) return null;
  return trimmed;
}
