import * as fs from "node:fs";
import { createOidcRedirectProvider } from "./providers/oidc";
import type { AuthProvider } from "./types";

interface RawOidcRedirectProviderConfig {
  key: string;
  displayName: string;
  type: "oidc-redirect";
  issuerUrl: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes?: string[];
  /** Anspruch im ID-Token mit den Gruppen. Ohne Angabe: "groups". */
  groupsClaim?: string;
  allowedHostedDomains?: string[];
  clientSecretMode?: "static" | "apple-jwt";
  appleTeamId?: string;
  appleKeyId?: string;
  applePrivateKeyPath?: string;
  responseMode?: "query" | "form_post";
  /** Gruppe-zu-Rolle-Abbildung dieses Anbieters. */
  groupToRoleMap?: Record<string, string>;
}

const EXAMPLE_FILE = "ops/install/auth-providers.example.json";

function buildProvider(raw: RawOidcRedirectProviderConfig): AuthProvider {
  if (!raw.key || !raw.displayName || !raw.issuerUrl || !raw.clientId || !raw.redirectUri) {
    throw new Error(
      `Anmeldeweg "${raw.key ?? "?"}" ist unvollstaendig konfiguriert (key, displayName, issuerUrl, clientId, redirectUri erforderlich).`,
    );
  }

  const issuer = raw.issuerUrl.replace(/\/$/, "");
  const isApple = issuer === "https://appleid.apple.com";
  if (isApple && raw.clientSecretMode !== "apple-jwt") {
    throw new Error(`Apple-Anmeldeweg "${raw.key}" braucht clientSecretMode "apple-jwt".`);
  }
  if (raw.clientSecretMode === "apple-jwt") {
    if (!isApple || !raw.appleTeamId || !raw.appleKeyId || !raw.applePrivateKeyPath) {
      throw new Error(`Apple-JWT-Konfiguration fuer "${raw.key}" ist unvollstaendig.`);
    }
    try {
      fs.accessSync(raw.applePrivateKeyPath, fs.constants.R_OK);
      const mode = fs.statSync(raw.applePrivateKeyPath).mode & 0o777;
      if ((mode & 0o077) !== 0) throw new Error("Dateirechte sind fuer andere Benutzer freigegeben");
    } catch {
      throw new Error(`Apple-Schluesseldatei fuer "${raw.key}" ist nicht lesbar oder nicht privat.`);
    }
  }

  return {
    ...createOidcRedirectProvider({
      key: raw.key,
      displayName: raw.displayName,
      issuerUrl: raw.issuerUrl,
      clientId: raw.clientId,
      clientSecret: raw.clientSecret,
      redirectUri: raw.redirectUri,
      scopes: raw.scopes,
      groupsClaim: raw.groupsClaim,
      allowedHostedDomains: raw.allowedHostedDomains,
      clientSecretMode: raw.clientSecretMode,
      appleTeamId: raw.appleTeamId,
      appleKeyId: raw.appleKeyId,
      applePrivateKeyPath: raw.applePrivateKeyPath,
      responseMode: raw.responseMode,
    }),
    groupToRoleMap: raw.groupToRoleMap ?? {},
  };
}

/** Laedt die aktivierten OIDC-Anmeldewege dieser Installation einmalig beim Start. */
export function loadAuthProviders(): AuthProvider[] {
  const providersPath = process.env["AUTH_PROVIDERS_PATH"];
  if (!providersPath) {
    throw new Error(
      `AUTH_PROVIDERS_PATH ist nicht gesetzt. Diese Installation kennt ohne sie keinen Anmeldeweg. ` +
        `Setze die Variable auf den Pfad einer JSON-Datei mit OIDC-Eintraegen ` +
        `(je Eintrag mindestens key, displayName, type, issuerUrl, clientId und redirectUri). ` +
        `Beispielaufbau: ${EXAMPLE_FILE}.`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(providersPath, "utf-8"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Anmeldewege konnten nicht aus "${providersPath}" gelesen werden: ${message}. Beispielaufbau: ${EXAMPLE_FILE}.`,
    );
  }

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      `Anmeldewege in "${providersPath}" sind leer oder kein Feld von Eintraegen. Beispielaufbau: ${EXAMPLE_FILE}.`,
    );
  }

  const active = raw.filter((entry) => (entry as { enabled?: boolean }).enabled !== false);
  if (active.length === 0) {
    throw new Error(
      `Alle Anmeldewege in "${providersPath}" sind auf "enabled": false gesetzt. Mindestens einer muss aktiv sein.`,
    );
  }

  const providers = active.map((entry) => {
    const typed = entry as Partial<RawOidcRedirectProviderConfig>;
    if (typed.type !== "oidc-redirect") {
      throw new Error(`Anmeldeweg "${typed.key ?? "?"}" muss den Typ "oidc-redirect" haben.`);
    }
    return buildProvider(typed as RawOidcRedirectProviderConfig);
  });
  const keys = new Set<string>();
  for (const provider of providers) {
    if (keys.has(provider.key)) throw new Error(`Anmeldeweg-Schluessel "${provider.key}" ist doppelt.`);
    keys.add(provider.key);
  }
  return providers;
}
