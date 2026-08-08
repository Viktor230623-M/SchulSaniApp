/**
 * Normalisiert eine E-Mail-Adresse: kleingeschrieben, ohne Rand-Leerzeichen,
 * hoechstens 254 Zeichen und mit einer simplen Formpruefung. Alles andere
 * liefert null. Eine Stelle fuer alle Wege, an denen Adressen eingehen
 * (Registrierung, Wiederherstellung, Verwalter-Korrektur), damit ueberall
 * dieselbe Form in der Datenbank landet.
 */
export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
