/**
 * Instanzkonfiguration des Backends.
 *
 * Alles, was von Schule zu Schule verschieden ist, wird hier aus der Umgebung
 * gelesen — und nur hier. Fehlt ein Pflichtwert, bricht der Start mit einer
 * Meldung ab, statt still auf die Werte einer bestimmten Schule zurueckzufallen.
 * Ein Vorgabewert waere hier gefaehrlich: eine falsch konfigurierte Instanz
 * koennte CORS fuer eine fremde Domain oeffnen, ohne dass es jemandem auffaellt.
 *
 * Vorlage mit allen Variablen: artifacts/api-server/.env.example
 */

const fehlend: string[] = [];

function lies(name: string): string | undefined {
  const wert = process.env[name];
  if (wert === undefined) return undefined;
  const getrimmt = wert.trim();
  return getrimmt === "" ? undefined : getrimmt;
}

function pflicht(name: string, hinweis: string): string {
  const wert = lies(name);
  if (wert === undefined) {
    fehlend.push(`${name} — ${hinweis}`);
    return "";
  }
  return wert;
}

/**
 * Erlaubte CORS-Herkuenfte. Kommagetrennt, jeweils Schema plus Host.
 * `*` ist ausgeschlossen: die API arbeitet mit Cookies, ein Platzhalter waere
 * hier gleichbedeutend mit offenem Zugriff aus jeder fremden Seite heraus.
 */
function pflichtOrigins(name: string, hinweis: string): string[] {
  const roh = pflicht(name, hinweis);
  if (roh === "") return [];
  const teile = roh.split(",").map((o) => o.trim()).filter((o) => o !== "");
  if (teile.length === 0) {
    fehlend.push(`${name} — Liste ist leer`);
    return [];
  }
  const origins: string[] = [];
  for (const teil of teile) {
    if (teil === "*") {
      fehlend.push(`${name} — "*" ist nicht zulaessig, die API nutzt Cookies`);
      continue;
    }
    let url: URL;
    try {
      url = new URL(teil);
    } catch {
      fehlend.push(`${name} — "${teil}" ist keine gueltige Herkunft (erwartet z. B. https://sani.beispielschule.de)`);
      continue;
    }
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      fehlend.push(`${name} — "${teil}" muss https sein (Ausnahme nur localhost)`);
      continue;
    }
    origins.push(url.origin);
  }
  return origins;
}

const allowedOrigins = pflichtOrigins(
  "ALLOWED_ORIGINS",
  "kommagetrennte Liste der Web-Adressen dieser Instanz",
);

// Zentrale Callback-Domain fuer OIDC-Anmeldewege. Apple, Google und Microsoft
// akzeptieren nur exakt registrierte Redirect-URIs; statt pro Instanz eine
// eigene Registrierung zu pflegen, zeigen Instanzen im Relay-Modus auf eine
// gemeinsame Domain, deren Callback-Pfad den Ruecksprung ueber den state-
// Parameter zur richtigen Instanz weiterleitet. Ohne Angabe bleibt jede
// Instanz bei ihren eigenen registrierten URIs.
const authRelayBaseUrl = lies("AUTH_RELAY_BASE_URL");
if (authRelayBaseUrl !== undefined) {
  try {
    const url = new URL(authRelayBaseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      fehlend.push("AUTH_RELAY_BASE_URL — muss eine HTTPS-URL ohne Pfad sein (z. B. https://auth.schulsani.app)");
    }
  } catch {
    fehlend.push("AUTH_RELAY_BASE_URL — keine gueltige URL (z. B. https://auth.schulsani.app)");
  }
}

export const config = {
  /**
   * Cloud-Betrieb: Eine Instanz bedient viele Schulen (schools-Tabelle),
   * die Schul-Kennung kommt aus jeder Anfrage statt aus der Umgebung.
   * Selbsthosting bleibt der Standard: SCHOOL_ID aus der Umgebung, die
   * schools-Tabelle kann leer bleiben.
   */
  multiTenant: process.env["MULTI_TENANT"]?.trim() === "true",
  /** Herkuenfte, die die API im Browser aufrufen duerfen. */
  allowedOrigins,
  /** Anzeigename der Instanz, u. a. Rueckfalltitel fuer Benachrichtigungen. */
  appName: pflicht(
    "APP_NAME",
    "Anzeigename der Anwendung dieser Instanz",
  ),
  /**
   * Gemeinsames Eintrittskarte der Schule. Ist sie gesetzt, braucht jedes
   * neue Konto (E-Mail-Registrierung und OIDC-Erst-Login) diesen Code —
   * verhindert, dass sich Fremde auf einer fremden Instanz anmelden.
   */
  joinCode: lies("SCHOOL_JOIN_CODE"),
  /**
   * Zentrale Callback-Domain im Relay-Modus. Der Ruecksprung des Anbieters
   * landet dann nicht hier, sondern auf dieser Domain; der state-Parameter
   * traegt die Herkunft dieser Instanz, ueber die der Relay zurueckleitet.
   */
  authRelayBaseUrl,
  /**
   * Host, fuer den die Session-Cookies im Relay-Modus gelten. Der Browser
   * steht waehrend des Ruecksprungs auf der zentralen Domain; ohne Domain-
   * Attribut wuerde das Cookie dort haengen bleiben und nie bei der Instanz
   * ankommen. Abgeleitet aus der ersten erlaubten Herkunft, damit beides nie
   * auseinanderlaufen kann.
   */
  cookieDomain: authRelayBaseUrl && allowedOrigins[0]
    ? new URL(allowedOrigins[0]).hostname
    : undefined,
} as const;

if (fehlend.length > 0) {
  throw new Error(
    "Die Instanzkonfiguration ist unvollstaendig. Fehlende oder ungueltige " +
      "Werte in artifacts/api-server/.env (Vorlage: .env.example):\n" +
      fehlend.map((z) => `  - ${z}`).join("\n"),
  );
}
