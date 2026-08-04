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
  /** Anspruch im ID-Token mit den Gruppen. Ohne Angabe: "groups". */
  groupsClaim?: string;
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

const EXAMPLE_FILE = "ops/install/auth-providers.example.json";

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
        groupsClaim: raw.groupsClaim,
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
 * Laedt die Anmeldewege dieser Installation aus der Datei unter
 * AUTH_PROVIDERS_PATH, einmalig beim Start (nicht bei jeder Anmeldung).
 *
 * Kein Anmeldeweg ist mehr still voreingestellt: fehlt die Umgebungsvariable,
 * ist die Datei leer, kein JSON-Feld oder unlesbar, oder ist ein Eintrag
 * unvollstaendig (siehe buildProvider), bricht der Start mit einer erklaerenden
 * Meldung ab -- ein Server ohne Anmeldeweg darf nicht stillschweigend starten.
 */
export function loadAuthProviders(): AuthProvider[] {
  const providersPath = process.env["AUTH_PROVIDERS_PATH"];
  if (!providersPath) {
    throw new Error(
      `AUTH_PROVIDERS_PATH ist nicht gesetzt. Diese Installation kennt ohne sie keinen Anmeldeweg. ` +
        `Setze die Variable auf den Pfad einer JSON-Datei mit einem Feld von Anmeldeweg-Eintraegen ` +
        `(je Eintrag mindestens key, displayName, type, dazu die typspezifischen Felder wie iservBaseUrl/emailDomain ` +
        `bei "iserv-form" oder issuerUrl/clientId/redirectUri bei "oidc-redirect"). ` +
        `Beispielaufbau: ${EXAMPLE_FILE}.`,
    );
  }

  let raw: unknown;
  try {
    const content = fs.readFileSync(providersPath, "utf-8");
    raw = JSON.parse(content);
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

  // "enabled": false laesst einen Eintrag als Vorlage in der Datei stehen, ohne
  // ihn zu bauen. Fehlt das Feld, gilt der Eintrag als aktiv.
  const active = raw.filter((entry) => (entry as { enabled?: boolean }).enabled !== false);
  if (active.length === 0) {
    throw new Error(
      `Alle Anmeldewege in "${providersPath}" sind auf "enabled": false gesetzt. Mindestens einer muss aktiv sein.`,
    );
  }

  return active.map((entry) => buildProvider(entry as RawProviderConfig));
}
