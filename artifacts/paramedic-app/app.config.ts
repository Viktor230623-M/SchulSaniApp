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

function pflicht(name: string): string {
  const wert = process.env[name]?.trim();
  if (!wert) {
    throw new Error(
      `Konfiguration fehlt: ${name} ist nicht gesetzt. ` +
        "Wert in artifacts/paramedic-app/.env eintragen (Vorlage: .env.example) und neu starten/bauen.",
    );
  }
  return wert;
}

const appName = pflicht("EXPO_PUBLIC_APP_NAME");
const themeColor = pflicht("EXPO_PUBLIC_THEME_COLOR");
const domain = pflicht("EXPO_PUBLIC_DOMAIN");
const bundleId = pflicht("APP_BUNDLE_ID");

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

  return {
    ...basis,
    name: appName,
    ios: {
      ...basis.ios,
      bundleIdentifier: bundleId,
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
    plugins: mitRouterOrigin(basis.plugins as PluginEntry[] | undefined),
  };
};
