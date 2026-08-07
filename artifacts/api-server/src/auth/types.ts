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
  /**
   * Gruppen aus dem Anmeldeprofil, Grundlage der Gruppe-zu-Rolle-Abbildung
   * (groupToRoleMap, siehe unten). Woher sie kommen, ist Sache des jeweiligen
   * Adapters -- bei OIDC der konfigurierte groups-Claim, beim IServ-Formular
   * und beim lokalen Anbieter bislang keine Quelle (leer). Ohne Eintrag oder
   * ohne passende Abbildung ergibt sich keine Rolle.
   */
  groups?: string[];
}

/** Ergebnis einer erfolgreichen Anmeldung ueber einen Anbieter. */
export interface AuthResult {
  /** Eindeutige Kennung des Nutzers beim Anbieter (z. B. IServ-Benutzername). */
  subject: string;
  profile: AuthProfile;
  /** Ziel fuer den Ruecksprung nach einer nativen Weiterleitung. */
  returnTo?: string;
  /** Gehashter Nachweis fuer den nativen Sitzungsuebergang. */
  handoffChallenge?: string;
  /** Nutzerkonto, an das dieser OIDC-Weg gebunden werden soll. */
  linkUserId?: string;
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
  /**
   * Gruppe-zu-Rolle-Abbildung dieses Anbieters, aus der Providers-Konfiguration
   * (siehe ../registry.ts), einmalig beim Start geladen. Schluessel ist der
   * Gruppenname aus dem Anmeldeprofil, Wert ein Rollenschluessel. Ohne Eintrag:
   * leere Abbildung, keine Rolle wird automatisch vergeben.
   */
  readonly groupToRoleMap?: Record<string, string>;
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

/** Weiterleitungsbasierter Anmeldeweg mit OIDC Authorization Code und PKCE. */
export interface RedirectAuthProvider extends AuthProviderBase {
  readonly type: "oidc-redirect";
  beginRedirect(options?: { returnTo?: string; handoffChallenge?: string; linkUserId?: string }): Promise<{ redirectUrl: string }>;
  completeRedirect(params: Record<string, string>): Promise<AuthResult>;
}

export type AuthProvider = PasswordAuthProvider | RedirectAuthProvider;
