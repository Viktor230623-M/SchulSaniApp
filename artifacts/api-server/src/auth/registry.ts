import * as fs from "node:fs";
import { config } from "../config";
import { createIservFormProvider } from "./providers/iservForm";
import { createOidcRedirectProvider } from "./providers/oidc";
import type { AuthProvider } from "./types";

interface RawIservFormProviderConfig {
  key: string;
  displayName: string;
  type: "iserv-form";
  iservBaseUrl: string;
  emailDomain: string;
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
}

type RawProviderConfig = RawIservFormProviderConfig | RawOidcRedirectProviderConfig;

/**
 * Rueckfallweg dieser Installation ohne gesetzte AUTH_PROVIDERS_PATH:
 * genau ein Eintrag, der dem heutigen Verhalten entspricht.
 */
function defaultProviders(): AuthProvider[] {
  return [
    createIservFormProvider({
      key: "iserv-form",
      displayName: "IServ",
      iservBaseUrl: config.iservBaseUrl,
      emailDomain: config.emailDomain,
    }),
  ];
}

function buildProvider(raw: RawProviderConfig): AuthProvider {
  if (raw.type === "iserv-form") {
    if (!raw.key || !raw.displayName || !raw.iservBaseUrl || !raw.emailDomain) {
      throw new Error(
        `Anmeldeweg "${raw.key ?? "?"}" ist unvollstaendig konfiguriert (key, displayName, iservBaseUrl, emailDomain erforderlich).`,
      );
    }
    return createIservFormProvider({
      key: raw.key,
      displayName: raw.displayName,
      iservBaseUrl: raw.iservBaseUrl,
      emailDomain: raw.emailDomain,
    });
  }

  if (raw.type === "oidc-redirect") {
    if (!raw.key || !raw.displayName || !raw.issuerUrl || !raw.clientId || !raw.redirectUri) {
      throw new Error(
        `Anmeldeweg "${raw.key ?? "?"}" ist unvollstaendig konfiguriert (key, displayName, issuerUrl, clientId, redirectUri erforderlich).`,
      );
    }
    return createOidcRedirectProvider({
      key: raw.key,
      displayName: raw.displayName,
      issuerUrl: raw.issuerUrl,
      clientId: raw.clientId,
      clientSecret: raw.clientSecret,
      redirectUri: raw.redirectUri,
      scopes: raw.scopes,
    });
  }

  throw new Error(
    `Anmeldeweg "${(raw as { key?: string }).key ?? "?"}" hat einen unbekannten Typ.`,
  );
}

/**
 * Laedt die Anmeldewege dieser Installation.
 *
 * Fehlt AUTH_PROVIDERS_PATH, faellt die Installation auf genau einen Eintrag
 * zurueck, der dem heutigen Verhalten entspricht (iserv-form mit den Werten
 * aus der bestehenden Konfiguration). Ist die Variable gesetzt, aber die
 * Datei leer, kein JSON-Feld oder unlesbar, bricht der Start mit einer
 * klaren Meldung ab -- ein Server ohne Anmeldeweg darf nicht stillschweigend
 * starten. Nach dem Muster von ROLE_MAP_PATH (siehe routes/auth.ts).
 */
export function loadAuthProviders(): AuthProvider[] {
  const providersPath = process.env["AUTH_PROVIDERS_PATH"];
  if (!providersPath) return defaultProviders();

  let raw: unknown;
  try {
    const content = fs.readFileSync(providersPath, "utf-8");
    raw = JSON.parse(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Anmeldewege konnten nicht aus "${providersPath}" gelesen werden: ${message}`);
  }

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`Anmeldewege in "${providersPath}" sind leer oder kein Feld von Eintraegen.`);
  }

  return raw.map((entry) => buildProvider(entry as RawProviderConfig));
}
