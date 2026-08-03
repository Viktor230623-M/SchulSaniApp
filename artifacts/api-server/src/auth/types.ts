/**
 * Adapter-Interface fuer Anmeldewege.
 *
 * Eine Installation kann mehrere Anmeldewege gleichzeitig anbieten (siehe
 * ../registry.ts). Jeder Weg ist entweder passwortbasiert (Zugangsdaten
 * werden entgegengenommen und direkt gegen einen fremden Dienst geprueft,
 * z. B. das IServ-Formular) oder weiterleitungsbasiert (OIDC mit
 * Authorization Code, PKCE, Discovery). Die Sitzungsschicht dahinter
 * (Token, Cookie, Rollen aus der Datenbank) kennt den gewaehlten Weg nicht.
 */

/** Nutzerprofil, wie es ein Anmeldeweg nach erfolgreicher Pruefung liefert. */
export interface AuthProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

/** Ergebnis einer erfolgreichen Anmeldung ueber einen Anbieter. */
export interface AuthResult {
  /** Eindeutige Kennung des Nutzers beim Anbieter (z. B. IServ-Benutzername). */
  subject: string;
  profile: AuthProfile;
  /**
   * Nur beim lokalen Anbieter gesetzt: das gerade gepruefte Passwort war ein
   * Einmal-Passwort (Einladung oder Zuruecksetzen durch einen Verwalter).
   * Der Aufrufer darf daraus keine vollwertige Sitzung ausstellen, bevor ein
   * Passwortwechsel stattgefunden hat.
   */
  mustChangePassword?: boolean;
}

export type AuthProviderType = "iserv-form" | "oidc-redirect" | "local";

interface AuthProviderBase {
  /** Eindeutiger Schluessel des Anmeldewegs innerhalb der Installation. */
  readonly key: string;
  /** Anzeigename, z. B. fuer eine spaetere Auswahl im Anmeldebildschirm. */
  readonly displayName: string;
  readonly type: AuthProviderType;
}

/**
 * Passwortbasierter Anmeldeweg: Zugangsdaten werden entgegengenommen und
 * direkt geprueft -- entweder gegen den fremden Dienst (Bestandsweg
 * "iserv-form") oder gegen den lokalen Passwort-Hash ("local", Rueckfallebene
 * fuer Schulen ohne nutzbaren Identitaetsdienst).
 */
export interface PasswordAuthProvider extends AuthProviderBase {
  readonly type: "iserv-form" | "local";
  authenticate(credentials: { username: string; password: string }): Promise<AuthResult>;
}

/**
 * Weiterleitungsbasierter Anmeldeweg (z. B. OIDC mit PKCE). Nur das
 * Interface ist hier vorgesehen -- fuer neue Schulen der Standardweg, in
 * dieser Installation nicht eingeschaltet. Eine Implementierung (Discovery,
 * State/Nonce, ID-Token-Pruefung gegen JWKS) folgt in einem spaeteren Schritt.
 */
export interface RedirectAuthProvider extends AuthProviderBase {
  readonly type: "oidc-redirect";
  beginRedirect(): Promise<{ redirectUrl: string }>;
  completeRedirect(params: Record<string, string>): Promise<AuthResult>;
}

export type AuthProvider = PasswordAuthProvider | RedirectAuthProvider;
