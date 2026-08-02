/**
 * Instanzkonfiguration des Backends.
 *
 * Alles, was von Schule zu Schule verschieden ist, wird hier aus der Umgebung
 * gelesen — und nur hier. Fehlt ein Pflichtwert, bricht der Start mit einer
 * Meldung ab, statt still auf die Werte einer bestimmten Schule zurueckzufallen.
 * Ein Vorgabewert waere hier gefaehrlich: eine falsch konfigurierte Instanz
 * wuerde Anmeldedaten an eine fremde IServ-Instanz schicken oder CORS fuer eine
 * fremde Domain oeffnen, ohne dass es jemandem auffaellt.
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

/** Basis-URL ohne abschliessenden Schraegstrich, damit `${base}/pfad` stimmt. */
function pflichtUrl(name: string, hinweis: string): string {
  const roh = pflicht(name, hinweis);
  if (roh === "") return "";
  let url: URL;
  try {
    url = new URL(roh);
  } catch {
    fehlend.push(`${name} — keine gueltige URL: "${roh}"`);
    return "";
  }
  if (url.protocol !== "https:") {
    // Ueber diese Verbindung gehen Anmeldedaten. Klartext ist keine Option.
    fehlend.push(`${name} — muss https sein, ist aber "${url.protocol}//"`);
    return "";
  }
  return url.origin;
}

function pflichtDomain(name: string, hinweis: string): string {
  const roh = pflicht(name, hinweis);
  if (roh === "") return "";
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(roh)) {
    fehlend.push(`${name} — keine gueltige Domain: "${roh}"`);
    return "";
  }
  return roh.toLowerCase();
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

export const config = {
  /** Herkuenfte, die die API im Browser aufrufen duerfen. */
  allowedOrigins: pflichtOrigins(
    "ALLOWED_ORIGINS",
    "kommagetrennte Liste der Web-Adressen dieser Instanz",
  ),
  /** Basis-URL der IServ-Instanz der Schule, ohne Pfad. */
  iservBaseUrl: pflichtUrl(
    "ISERV_BASE_URL",
    "Basis-URL der IServ-Instanz der Schule",
  ),
  /** Mail-Domain, die aus dem IServ-Benutzernamen gebildet wird. */
  emailDomain: pflichtDomain(
    "EMAIL_DOMAIN",
    "Mail-Domain der Schule",
  ),
  /** Anzeigename der Instanz, u. a. Rueckfalltitel fuer Benachrichtigungen. */
  appName: pflicht(
    "APP_NAME",
    "Anzeigename der Anwendung dieser Instanz",
  ),
  /**
   * Konto mit Zugriff auf die SQL-Konsole. Bewusst optional: ist nichts
   * gesetzt, bleibt die Konsole fuer alle gesperrt. Ein Vorgabewert waere hier
   * eine fremde Kennung mit Vollzugriff auf die Datenbank.
   */
  ownerUserId: lies("OWNER_USER_ID"),
} as const;

if (fehlend.length > 0) {
  throw new Error(
    "Die Instanzkonfiguration ist unvollstaendig. Fehlende oder ungueltige " +
      "Werte in artifacts/api-server/.env (Vorlage: .env.example):\n" +
      fehlend.map((z) => `  - ${z}`).join("\n"),
  );
}
