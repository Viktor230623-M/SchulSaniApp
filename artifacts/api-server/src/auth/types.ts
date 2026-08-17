/** Gemeinsame Schnittstelle fuer lokale und weiterleitungsbasierte Anmeldewege. */

export interface AuthProfile {
  firstName: string;
  lastName: string;
  email: string;
  /**
   * Nur wahr, wenn der Anbieter die Adresse selbst geprueft hat. Ohne diese
   * Zusage darf die Adresse kein Konto wiedererkennen -- sonst uebernimmt ein
   * fremder Anbieter mit frei gesetztem email-Claim ein bestehendes Konto.
   */
  emailVerified?: boolean;
  phone: string;
  groups?: string[];
}

export interface AuthResult {
  subject: string;
  profile: AuthProfile;
  returnTo?: string;
  handoffChallenge?: string;
  linkUserId?: string;
  mustChangePassword?: boolean;
}

export type AuthProviderType = "local" | "oidc-redirect";

interface AuthProviderBase {
  readonly key: string;
  readonly displayName: string;
  readonly type: AuthProviderType;
  readonly groupToRoleMap?: Record<string, string>;
}

export interface PasswordAuthProvider extends AuthProviderBase {
  readonly type: "local";
  authenticate(credentials: { username: string; password: string }): Promise<AuthResult>;
}

export interface RedirectAuthProvider extends AuthProviderBase {
  readonly type: "oidc-redirect";
  beginRedirect(options?: { returnTo?: string; handoffChallenge?: string; linkUserId?: string }): Promise<{ redirectUrl: string }>;
  completeRedirect(params: Record<string, string>): Promise<AuthResult>;
  /** Nur Apple: verifiziert das Identity-Token des nativen App-Logins. */
  verifyNativeToken?(params: {
    identityToken: string;
    nonce: string;
    fullName?: { givenName?: string; familyName?: string };
    email?: string;
  }): Promise<AuthResult>;
}

export type AuthProvider = PasswordAuthProvider | RedirectAuthProvider;
