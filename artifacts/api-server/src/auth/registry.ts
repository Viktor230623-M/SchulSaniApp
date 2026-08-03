import * as fs from "node:fs";
import { config } from "../config";
import { createIservFormProvider } from "./providers/iservForm";
import { createOidcRedirectProvider } from "./providers/oidc";
import { createLocalProvider } from "./providers/local";
import type { AuthProvider } from "./types";

interface RawIservFormProviderConfig {
  key: string;
  displayName: string;
  type: "iserv-form";
  iservBaseUrl: string;
  emailDomain: string;
  /** Gruppe-zu-Rolle-Abbildung dieses Anbieters, siehe ../types.ts (AuthProviderBase). */
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
  /** Gruppe-zu-Rolle-Abbildung dieses Anbieters, siehe ../types.ts (AuthProviderBase). */
  groupToRoleMap?: Record<string, string>;
}

interface RawLocalProviderConfig {
  key: string;
  displayName: string;
  type: "local";
  /** Ohne Angabe: process.env.SCHOOL_ID, sonst "school" -- wie die uebrigen Anmeldewege. */
  schoolId?: string;
  /** Gruppe-zu-Rolle-Abbildung dieses Anbieters, siehe ../types.ts (AuthProviderBase). */
  groupToRoleMap?: Record<string, string>;
}

type RawProviderConfig = RawIservFormProviderConfig | RawOidcRedirectProviderConfig | RawLocalProviderConfig;

/**
 * Rueckfallweg nur, wenn AUTH_PROVIDERS_PATH explizit gesetzt ist und iserv-form
 * als Konfiguration enthalten ist. Ohne Datei: kein Anbieter registriert; Start
 * scheitert oder bietet nur lokale Konten (siehe auth.ts).
 */
function defaultProviders(): AuthProvider[] {
  const authProvidersPath = process.env["AUTH_PROVIDERS_PATH"];
  if (!authProvidersPath) {
    return [];
  }
  try {
    const rawConfigs: RawProviderConfig[] = JSON.parse(
      fs.readFileSync(authProvidersPath, "utf-8"),
    ) as RawProviderConfig[];
    return rawConfigs
      .map((raw) => {
        if (raw.type === "iserv-form") {
          return createIservFormProvider({
            key: raw.key,
            displayName: raw.displayName,
            iservBaseUrl: raw.iservBaseUrl,
            emailDomain: raw.emailDomain,
          });
        }
        if (raw.type === "oidc-redirect") {
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
        if (raw.type === "local") {
          return createLocalProvider({
            key: raw.key,
            displayName: raw.displayName,
            schoolId: raw.schoolId,
          });
        }
        throw new Error(`Unbekannter Anbietertyp: ${(raw as any).type}`);
      })
      .filter((p) => p !== null && p !== undefined);
  } catch (err) {
    console.error("AUTH_PROVIDERS_PATH kann nicht gelesen werden:", err);
    throw new Error(
      "AUTH_PROVIDERS_PATH fehlt oder ist ungueltig. Ohne explizite Konfiguration ist kein Anmeldeweg aktiv.",
    );
  }
}

function buildProvider(raw: RawProviderConfig): AuthProvider {
  const groupToRoleMap = raw.groupToRoleMap ?? {};

  if (raw.type === "iserv-form") {
    if (!raw.key || !raw.displayName || !raw.iservBaseUrl || !raw.emailDomain) {
      throw new Error(
        `Anmeldeweg "${raw.key ?? "?"}" ist unvollstaendig konfiguriert (key, displayName, iservBaseUrl, emailDomain erforderlich).`,
      );
    }
    return {
      ...createIservFormProvider({
        key: raw.key,
        displayName: raw.displayName,
        iservBaseUrl: raw.iservBaseUrl,
        emailDomain: raw.emailDomain,
      }),
      groupToRoleMap,
    };
  }

  if (raw.type === "oidc-redirect") {
    if (!raw.key || !raw.displayName || !raw.issuerUrl || !raw.clientId || !raw.redirectUri) {
      throw new Error(
        `Anmeldeweg "${raw.key ?? "?"}" ist unvollstaendig konfiguriert (key, displayName, issuerUrl, clientId, redirectUri erforderlich).`,
      );
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
      }),
      groupToRoleMap,
    };
  }

  if (raw.type === "local") {
    if (!raw.key || !raw.displayName) {
      throw new Error(
        `Anmeldeweg "${raw.key ?? "?"}" ist unvollstaendig konfiguriert (key, displayName erforderlich).`,
      );
    }
    return {
      ...createLocalProvider({
        key: raw.key,
        displayName: raw.displayName,
        schoolId: raw.schoolId ?? process.env["SCHOOL_ID"] ?? "school",
      }),
      groupToRoleMap,
    };
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
