/**
 * Instanzkonfiguration der App.
 *
 * Die Werte kommen aus artifacts/paramedic-app/.env und werden beim Bauen in
 * das Bundle eingesetzt — zur Laufzeit sind sie nicht mehr aenderbar. Vorlage
 * mit allen Variablen: .env.example.
 *
 * Fehlt ein Pflichtwert, gibt es keinen Rueckfall auf die Werte einer
 * bestimmten Schule: in der Entwicklung bricht es mit einer Meldung ab, im
 * gebauten Stand bleibt der Wert leer und die Ursache steht in der Konsole.
 * Vor einem Web-Export prueft scripts/generate-web-assets.js dieselben
 * Variablen und bricht ab, bevor ueberhaupt gebaut wird.
 *
 * Metro ersetzt process.env["EXPO_PUBLIC_*"] als Text. Die Namen muessen
 * deshalb wortwoertlich dastehen und duerfen nicht berechnet werden.
 */

function pflicht(name: string, wert: string | undefined): string {
  const getrimmt = wert?.trim();
  if (getrimmt) return getrimmt;

  const meldung =
    `Konfiguration fehlt: ${name} ist nicht gesetzt. ` +
    `Wert in artifacts/paramedic-app/.env eintragen (Vorlage: .env.example) und neu bauen.`;
  if (process.env.NODE_ENV !== "production") {
    throw new Error(meldung);
  }
  console.error(meldung);
  return "";
}

/** Name des Sanitaetsdienstes, wie er im Anmeldebildschirm auftaucht. */
export const SCHOOL_NAME = pflicht(
  "EXPO_PUBLIC_SCHOOL_NAME",
  process.env["EXPO_PUBLIC_SCHOOL_NAME"],
);

/** Kurzer Anwendungsname: Startbildschirm, Manifest, Benachrichtigungen. */
export const APP_NAME = pflicht(
  "EXPO_PUBLIC_APP_NAME",
  process.env["EXPO_PUBLIC_APP_NAME"],
);

/** Akzentfarbe der Instanz als Hex-Wert, etwa fuer die Adressleiste im Standalone-Modus. */
export const THEME_COLOR = pflicht(
  "EXPO_PUBLIC_THEME_COLOR",
  process.env["EXPO_PUBLIC_THEME_COLOR"],
);
