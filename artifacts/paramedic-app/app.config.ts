import type { ExpoConfig } from "expo/config";

import appJson from "./app.json";

/**
 * Ergaenzt app.json um die Werte, die von Schule zu Schule verschieden sind.
 *
 * app.json bleibt bestehen und traegt weiterhin die Felder, die
 * scripts/release.mjs automatisiert schreibt (version, buildNumber,
 * versionCode) — die werden hier unveraendert uebernommen. Alles, was eine
 * bestimmte Instanz identifiziert (Anzeigename, Bundle-ID, Themefarbe,
 * Web-Origin), kommt stattdessen aus der Umgebung.
 *
 * Fehlt ein Pflichtwert, bricht `expo start`/`expo export` sofort ab statt
 * still auf die Werte einer bestimmten Schule zurueckzufallen.
 *
 * Vorlage mit allen Variablen: .env.example
 */

function pflicht(name: string, fallback?: string): string {
  const wert = process.env[name]?.trim();
  if (wert) return wert;
  // eas-cli ruft `expo config` mit EXPO_NO_DOTENV=1 auf, um das Projekt zu
  // registrieren — dabei ist .env absichtlich nicht geladen. In diesem
  // Probe-Fall auf Defaults zurueckfallen statt abbrechen; der echte Build
  // bekommt die Werte aus eas.json/build.*.env.
  if (process.env.EXPO_NO_DOTENV === "1" && fallback) return fallback;
  throw new Error(
    `Konfiguration fehlt: ${name} ist nicht gesetzt. ` +
      "Wert in artifacts/paramedic-app/.env eintragen (Vorlage: .env.example) und neu starten/bauen.",
  );
}

const appName = pflicht("EXPO_PUBLIC_APP_NAME", "SchulSani");
const themeColor = pflicht("EXPO_PUBLIC_THEME_COLOR", "#22C55E");
const domain = pflicht("EXPO_PUBLIC_DOMAIN", "schulsaniapp.com");
const bundleId = pflicht("APP_BUNDLE_ID", "com.schulsani.app");
// Web-Pfad unterm die App ausgeliefert wird (z.B. "/app" fuer die Demo unter
// demo.schulsaniapp.com/app). Leer = Wurzel (Produktion).
const webBaseUrl = process.env.EXPO_BASE_URL?.trim() ?? "";

type PluginEntry = string | [string, unknown];

function mitRouterOrigin(plugins: PluginEntry[] | undefined): PluginEntry[] {
  return (plugins ?? []).map((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    if (name !== "expo-router") return plugin;
    const bestehend = Array.isArray(plugin) && typeof plugin[1] === "object" ? plugin[1] : {};
    return ["expo-router", { ...bestehend, origin: `https://${domain}` }];
  });
}

export default (): ExpoConfig => {
  const basis = appJson.expo as unknown as ExpoConfig;

  // aps-environment gehoert zum Build-Profil, nicht fest verdrahtet: Ein
  // Store-/TestFlight-Build mit "development" bekäme tote Push-Zustellung.
  // EAS setzt die Variable je Profil; lokal (Expo Go / prebuild) bleibt development.
  const pushProfile =
    process.env["EAS_BUILD_PROFILE"] === "production" ? "production" : "development";

  return {
    ...basis,
    name: appName,
    ios: {
      ...basis.ios,
      bundleIdentifier: bundleId,
      entitlements: {
        ...basis.ios?.entitlements,
        "aps-environment": pushProfile,
      },
    },
    android: {
      ...basis.android,
      package: bundleId,
    },
    web: {
      ...basis.web,
      name: appName,
      shortName: appName,
      themeColor,
    },
    experiments: {
      ...basis.experiments,
      ...(webBaseUrl ? { baseUrl: webBaseUrl } : {}),
    },
    plugins: mitRouterOrigin(basis.plugins as PluginEntry[] | undefined),
  };
};
