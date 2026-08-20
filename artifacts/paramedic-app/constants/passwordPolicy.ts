/**
 * Passwortrichtlinie fuer lokale Konten.
 *
 * Wichtig: Der Server sieht das Passwort nie -- der Client leitet daraus lokal
 * den Argon2id-Login-Proof ab (siehe services/crypto/keyManager.ts). Die
 * Richtlinie kann deshalb ausschliesslich hier greifen und muss vor jeder
 * Ableitung geprueft werden (Registrierung, Passwortwechsel, Zuruecksetzen).
 *
 * Die Regeln sind bewusst an einer Stelle definiert, damit alle drei Wege
 * dieselben Anforderungen stellen und die Checkliste in der Oberflaeche nicht
 * von der tatsaechlichen Pruefung abweichen kann.
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

/** Schluessel einer Regel; entspricht einem i18n-Key unter `auth.pwRule*`. */
export type PasswordRuleKey =
  | "length"
  | "lowercase"
  | "uppercase"
  | "digit"
  | "noCommon"
  | "noPersonal";

export const PASSWORD_RULE_ORDER: readonly PasswordRuleKey[] = [
  "length",
  "lowercase",
  "uppercase",
  "digit",
  "noCommon",
  "noPersonal",
];

/** Kontext fuer die "kein Bezug zur Person"-Regel. Alle Felder optional. */
export interface PasswordContext {
  email?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface PasswordCheck {
  /** Regel -> erfuellt. Enthaelt immer alle Regeln aus PASSWORD_RULE_ORDER. */
  rules: Record<PasswordRuleKey, boolean>;
  /** Erste nicht erfuellte Regel, sonst null. */
  firstFailed: PasswordRuleKey | null;
  /** true, wenn jede Regel erfuellt ist. */
  ok: boolean;
}

// Haeufige bzw. offensichtliche Passwoerter. Kleingeschrieben verglichen; die
// Liste bleibt bewusst kurz und schul-/appspezifisch statt einer Massenliste.
const COMMON_PASSWORDS = [
  "password",
  "passwort",
  "passwort1",
  "geheim",
  "qwertz",
  "qwerty",
  "asdfgh",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "schulsani",
  "schulsaniapp",
  "sanitaeter",
  "sanitäter",
  "schule",
  "willkommen",
  "welcome",
  "letmein",
  "iloveyou",
  "admin",
  "test",
];

/** Personenbezogene Teilstrings, die nicht im Passwort vorkommen duerfen. */
function personalTokens(context: PasswordContext): string[] {
  const raw = [
    context.firstName,
    context.lastName,
    context.username,
    // Bei der E-Mail zaehlt der lokale Teil -- "mira" aus "mira@schule.de".
    typeof context.email === "string" ? context.email.split("@")[0] : null,
  ];
  return raw
    .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
    // Sehr kurze Namen wuerden fast jedes Passwort blockieren.
    .filter((value) => value.length >= 3);
}

export function checkPassword(password: string, context: PasswordContext = {}): PasswordCheck {
  const lower = password.toLowerCase();

  const rules: Record<PasswordRuleKey, boolean> = {
    length: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    lowercase: /\p{Ll}/u.test(password),
    uppercase: /\p{Lu}/u.test(password),
    digit: /\d/.test(password),
    // Ein Passwort, das ein Allerweltswort nur umschliesst ("meinpasswort1"),
    // ist genauso schwach wie das Wort selbst -- daher Teilstring-Vergleich.
    noCommon: password.length > 0 && !COMMON_PASSWORDS.some((entry) => lower.includes(entry)),
    noPersonal: password.length > 0 && !personalTokens(context).some((token) => lower.includes(token)),
  };

  const firstFailed = PASSWORD_RULE_ORDER.find((key) => !rules[key]) ?? null;
  return { rules, firstFailed, ok: firstFailed === null };
}

/** i18n-Key der Fehlermeldung zu einer Regel. */
export function passwordRuleMessageKey(rule: PasswordRuleKey): string {
  return `auth.pwRule.${rule}`;
}
