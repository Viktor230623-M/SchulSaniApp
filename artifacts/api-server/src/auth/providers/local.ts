import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, or, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import type { PasswordAuthProvider } from "../types";

/**
 * Lokale Konten als Rueckfallebene (R6, Schritt 6).
 *
 * Der Server sieht das Passwort nie. Der Client leitet daraus lokal zwei
 * unabhaengige Argon2id-Keys ab (verschiedene Salts): einen Login-Proof, der
 * an den Server geht, und einen Verschluesselungs-Key, der auf dem Geraet
 * bleibt. password_hash speichert nur noch SHA-256 des Login-Proofs, login_salt
 * den dazugehoerigen Ableitungs-Salt. Aus dem Hash kann der Server weder das
 * Passwort noch den Verschluesselungs-Key ableiten.
 *
 * Kontoaufzaehlung: eine unbekannte Kennung und ein falscher Proof liefern
 * dieselbe Fehlermeldung ("Ungültige Zugangsdaten") und durchlaufen beide
 * genau einen Hash-Vergleich, damit die Laufzeit nicht verraet, ob die
 * Kennung existiert.
 */

// Opslimit/Memlimit der Argon2id-Ableitung (libsodium-Konstanten). Muessen
// exakt den Werten des Clients entsprechen.
export const ARGON2_OPSLIMIT = 3; // crypto_pwhash_OPSLIMIT_MODERATE
export const ARGON2_MEMLIMIT = 268435456; // 256 MiB, crypto_pwhash_MEMLIMIT_MODERATE

// Fixer Vergleichs-Hash fuer den Fall "Konto existiert nicht": der Vergleich
// laeuft trotzdem, damit ein fehlendes Konto keine kuerzere Laufzeit hat als
// ein falscher Proof.
const DUMMY_HASH = hashLoginProof(randomBytes(32).toString("base64url"));

const GENERIC_AUTH_ERROR = "Ungültige Zugangsdaten";

/** SHA-256 des Login-Proofs; der Server speichert nur diesen Wert. */
export function hashLoginProof(proof: string): string {
  return createHash("sha256").update(proof).digest("hex");
}

export function verifyLoginProof(proof: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashLoginProof(proof), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/** Erzeugt ein zufaelliges Einmal-Passwort (Einladung oder Zuruecksetzen). */
export function createOneTimePassword(): string {
  // 24 Byte Entropie, base64url -- ausreichend lang, um es einmalig per Hand
  // oder Kopieren an eine neue Nutzerin weiterzugeben.
  return randomBytes(24).toString("base64url");
}

export interface LocalProviderConfig {
  key: string;
  displayName: string;
  /**
   * Schule, der diese Installation zugeordnet ist (Selbsthosting). Im
   * Cloud-Betrieb wird die Schule je Anfrage uebergeben und dieser Wert
   * ignoriert.
   */
  schoolId?: string;
}

/**
 * Lokaler Anmeldeweg als Adapter.
 *
 * `authenticate` sucht das Konto ueber (Schule, Anbieterschluessel, Subjekt),
 * prueft den Login-Proof (Vergleich gegen den gespeicherten Hash) und meldet
 * ueber `mustChangePassword`, ob der gerade gepruefte Proof zu einem noch
 * nicht gewechselten Einmal-Passwort gehoert. Ein abgelaufenes
 * Einmal-Passwort gilt als ungueltig -- die Anmeldung schlaegt mit derselben
 * generischen Meldung fehl.
 *
 * Bestandskonten, deren Hash noch bcrypt ist, schlagen hier bewusst fehl:
 * Nach diesem Umbau ist ein Passwort-Reset der einzige Weg hinein (der
 * Server kann einen bcrypt-Hash nicht gegen einen Proof pruefen).
 */
export function createLocalProvider(cfg: LocalProviderConfig): PasswordAuthProvider {
  const { key, displayName, schoolId: defaultSchoolId } = cfg;

  return {
    key,
    displayName,
    type: "local",

    async authenticate(credentials) {
      // Der Benutzername muss exakt stimmen (1:1, inklusive Gross-/
      // Kleinschreibung). E-Mail und Subjekt werden kleingeschrieben
      // verglichen, weil sie kanonisch klein gespeichert werden.
      const identifier = credentials.username.trim();
      const identifierLower = identifier.toLowerCase();
      const schoolId = credentials.schoolId ?? defaultSchoolId;
      if (!schoolId) throw new Error(GENERIC_AUTH_ERROR);

      const rows = await db
        .select()
        .from(usersTable)
        .where(
          and(
            eq(usersTable.schoolId, schoolId),
            eq(usersTable.authProvider, key),
            // Muss exakt der Suche in routes/auth.ts (/params) entsprechen.
            or(
              sql`lower(${usersTable.externalSubject}) = ${identifierLower}`,
              sql`lower(${usersTable.email}) = ${identifierLower}`,
              eq(usersTable.username, identifier),
            ),
          ),
        )
        .limit(1);

      const user = rows[0];
      const hashToCheck = user?.passwordHash && user.passwordHash.length > 0 ? user.passwordHash : DUMMY_HASH;

      // Immer genau ein Vergleich, unabhaengig davon, ob das Konto existiert
      // und ob sein Hash noch bcrypt ist -- siehe Modulkommentar.
      const passwordMatches = verifyLoginProof(credentials.password, hashToCheck);

      const otpExpired =
        !!user?.mustChangePassword &&
        !!user.oneTimePasswordExpiresAt &&
        user.oneTimePasswordExpiresAt.getTime() <= Date.now();

      if (!user || !passwordMatches || otpExpired) {
        throw new Error(GENERIC_AUTH_ERROR);
      }

      return {
        // Kleingeschrieben: Der Aufrufer sucht das Konto damit erneut ueber
        // external_subject, und das wird kanonisch klein gespeichert.
        subject: user.externalSubject ?? identifierLower,
        profile: {
          firstName: user.firstName ?? "",
          lastName: user.lastName ?? "",
          email: user.email ?? "",
          phone: user.phone ?? "",
        },
        mustChangePassword: user.mustChangePassword,
      };
    },
  };
}
