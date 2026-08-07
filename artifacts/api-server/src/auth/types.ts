/** Adapter-Interface fuer weiterleitungsbasierte OIDC-Anmeldewege. */

export interface AuthProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  groups?: string[];
}

export interface AuthResult {
  subject: string;
  profile: AuthProfile;
  returnTo?: string;
  handoffChallenge?: string;
  linkUserId?: string;
}

export type AuthProviderType = "oidc-redirect";

interface AuthProviderBase {
  readonly key: string;
  readonly displayName: string;
  readonly type: AuthProviderType;
  readonly groupToRoleMap?: Record<string, string>;
}

export interface RedirectAuthProvider extends AuthProviderBase {
  readonly type: "oidc-redirect";
  beginRedirect(options?: { returnTo?: string; handoffChallenge?: string; linkUserId?: string }): Promise<{ redirectUrl: string }>;
  completeRedirect(params: Record<string, string>): Promise<AuthResult>;
}

export type AuthProvider = RedirectAuthProvider;
