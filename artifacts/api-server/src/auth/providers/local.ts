import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import type { PasswordAuthProvider } from "../types";

/**
 * Lokale Konten als Rueckfallebene (R6, Schritt 6).
 *
 * Anders als die weiterleitungsbasierten und externen passwortbasierten Wege
 * ist die Datenbank hier selbst die Quelle der Wahrheit fuer den Passwort-Hash
 * -- es gibt keinen fremden Dienst, der geprueft wird. Konten entstehen nicht
 * durch Selbstregistrierung: ein Verwalter legt sie mit einem Einmal-Passwort
 * an (siehe createOneTimePassword/hashPassword, verwendet von den Routen fuer
 * Einladung und Zuruecksetzen in routes/auth.ts).
 *
 * Kontoaufzaehlung: eine unbekannte Kennung und ein falsches Passwort liefern
 * dieselbe Fehlermeldung ("Ungültige Zugangsdaten", identisch zum
 * IServ-Adapter, damit die vorhandene Fehlerbehandlung in routes/auth.ts sie
 * gleich behandelt) und durchlaufen beide genau einen bcrypt-Vergleich, damit
 * die Laufzeit nicht verraet, ob die Kennung existiert.
 */

export const LOCAL_PASSWORD_BCRYPT_COST = 12;

// Fixer Vergleichs-Hash fuer den Fall "Konto existiert nicht": bcrypt.compare
// laeuft trotzdem, mit derselben Kostenstufe wie ein echter Hash, damit ein
// fehlendes Konto keine kuerzere Laufzeit hat als ein falsches Passwort.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(24).toString("base64url"), LOCAL_PASSWORD_BCRYPT_COST);

const GENERIC_AUTH_ERROR = "Ungültige Zugangsdaten";

/** Erzeugt ein zufaelliges Einmal-Passwort (Einladung oder Zuruecksetzen). */
export function createOneTimePassword(): string {
  // 24 Byte Entropie, base64url -- ausreichend lang, um es einmalig per Hand
  // oder Kopieren an eine neue Nutzerin weiterzugeben.
  return randomBytes(24).toString("base64url");
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, LOCAL_PASSWORD_BCRYPT_COST);
}

export interface LocalProviderConfig {
  key: string;
  displayName: string;
  /** Schule, der diese Installation zugeordnet ist (Mehrmandantenfall aus R4). */
  schoolId: string;
}

/**
 * Lokaler Anmeldeweg als Adapter.
 *
 * `authenticate` sucht das Konto ueber (Schule, Anbieter="local", Subjekt),
 * prueft das Passwort per bcrypt und meldet ueber `mustChangePassword`, ob das
 * gerade gepruefte Passwort ein noch nicht gewechseltes Einmal-Passwort ist.
 * Ein abgelaufenes Einmal-Passwort gilt als ungueltiges Passwort -- die
 * Anmeldung schlaegt mit derselben generischen Meldung fehl.
 */
export function createLocalProvider(cfg: LocalProviderConfig): PasswordAuthProvider {
  const { key, displayName, schoolId } = cfg;

  return {
    key,
    displayName,
    type: "local",

    async authenticate(credentials) {
      const username = credentials.username.toLowerCase().trim();

      const rows = await db
        .select()
        .from(usersTable)
        .where(
          and(
            eq(usersTable.schoolId, schoolId),
            eq(usersTable.authProvider, "local"),
            eq(usersTable.externalSubject, username),
          ),
        )
        .limit(1);

      const user = rows[0];
      const hashToCheck = user?.passwordHash && user.passwordHash.length > 0 ? user.passwordHash : DUMMY_HASH;

      // Immer genau ein bcrypt-Vergleich, unabhaengig davon, ob das Konto
      // existiert -- siehe Modulkommentar.
      const passwordMatches = await bcrypt.compare(credentials.password, hashToCheck);

      const otpExpired =
        !!user?.mustChangePassword &&
        !!user.oneTimePasswordExpiresAt &&
        user.oneTimePasswordExpiresAt.getTime() <= Date.now();

      if (!user || !passwordMatches || otpExpired) {
        throw new Error(GENERIC_AUTH_ERROR);
      }

      return {
        subject: username,
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
