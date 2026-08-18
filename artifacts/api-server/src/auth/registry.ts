import * as fs from "node:fs";
import { createLocalProvider } from "./providers/local";
import { createOidcRedirectProvider } from "./providers/oidc";
import type { AuthProvider } from "./types";

/** Zentrale Callback-Domain im Relay-Modus, siehe oidc.ts. */
export interface AuthRelaySettings {
  baseUrl: string;
  instanceOrigin: string;
}

interface RawLocalProviderConfig {
  key: string;
  displayName: string;
  type: "local";
  schoolId?: string;
  groupToRoleMap?: Record<string, string>;
}

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
  /** Bundle-ID des nativen iOS-Clients (audience des nativen Identity-Tokens). */
  appleNativeClientId?: string;
  responseMode?: "query" | "form_post";
  /** Aussteller ohne email_verified, dessen Adressen aus dem eigenen Verzeichnis stammen. */
  emailsAreVerified?: boolean;
  /** Gruppe-zu-Rolle-Abbildung dieses Anbieters. */
  groupToRoleMap?: Record<string, string>;
}

const EXAMPLE_FILE = "ops/install/auth-providers.example.json";

function defaultSchoolId(): string | undefined {
  return process.env["SCHOOL_ID"]?.trim() || (process.env["MULTI_TENANT"]?.trim() === "true" ? undefined : "school");
}

function buildProvider(raw: RawLocalProviderConfig | RawOidcRedirectProviderConfig, relay?: AuthRelaySettings): AuthProvider {
  if (raw.type === "local") {
    if (!raw.key || !raw.displayName) {
      throw new Error(`Anmeldeweg "${raw.key ?? "?"}" ist unvollstaendig konfiguriert (key und displayName erforderlich).`);
    }
    return {
      ...createLocalProvider({
        key: raw.key,
        displayName: raw.displayName,
        // Im Cloud-Betrieb kommt die Schule je Anfrage (schoolId in der
        // Anfrage); der Konfigurationswert ist dann nur ein Rueckfall.
        schoolId: raw.schoolId ?? defaultSchoolId(),
      }),
      groupToRoleMap: raw.groupToRoleMap ?? {},
    };
  }

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
      relay,
      scopes: raw.scopes,
      groupsClaim: raw.groupsClaim,
      allowedHostedDomains: raw.allowedHostedDomains,
      clientSecretMode: raw.clientSecretMode,
      appleTeamId: raw.appleTeamId,
      appleKeyId: raw.appleKeyId,
      applePrivateKeyPath: raw.applePrivateKeyPath,
      appleNativeClientId: raw.appleNativeClientId,
      responseMode: raw.responseMode,
      emailsAreVerified: raw.emailsAreVerified,
    }),
    groupToRoleMap: raw.groupToRoleMap ?? {},
  };
}

/** Laedt die aktivierten OIDC-Anmeldewege dieser Installation einmalig beim Start. */
export function loadAuthProviders(relay?: AuthRelaySettings): AuthProvider[] {
  const providersPath = process.env["AUTH_PROVIDERS_PATH"];
  if (!providersPath) {
    throw new Error(
      `AUTH_PROVIDERS_PATH ist nicht gesetzt. Diese Installation kennt ohne sie keinen Anmeldeweg. ` +
        `Setze die Variable auf den Pfad einer JSON-Datei mit lokalen oder OIDC-Eintraegen ` +
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

  // Veraltete Formularanbieter bleiben in alten Dateien harmlos, werden aber
  // nicht mehr gebaut. Aktiv sind nur lokale Konten und OIDC.
  const active = raw.filter((entry) => {
    const typed = entry as { enabled?: boolean; type?: string };
    return typed.enabled !== false && (typed.type === "local" || typed.type === "oidc-redirect");
  });

  if (active.length === 0) {
    throw new Error(`Keine lokalen oder OIDC-Anmeldewege in "${providersPath}" aktiviert.`);
  }

  const providers = active.map((entry) => buildProvider(entry as RawLocalProviderConfig | RawOidcRedirectProviderConfig, relay));
  if (providers.filter((provider) => provider.type === "local").length > 1) {
    throw new Error("Es darf nur ein lokaler Anmeldeweg aktiviert sein.");
  }
  const keys = new Set<string>();
  for (const provider of providers) {
    if (keys.has(provider.key)) throw new Error(`Anmeldeweg-Schluessel "${provider.key}" ist doppelt.`);
    keys.add(provider.key);
  }
  return providers;
}
