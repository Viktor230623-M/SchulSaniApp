/**
 * Strukturierte Ausgabe als JSON-Zeilen auf stdout/stderr. Eine Zeile je
 * Ereignis, damit Log-Aggregatoren (Journald, Loki, Papertrail) sie ohne
 * Parser-Aufwand aufnehmen. Personenbezug gehoert nie hierher — wer eine
 * Message mit Nutzerdaten loggt, bricht diesen Vertrag.
 */
export function log(
  level: "info" | "warn" | "error",
  msg: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  (level === "error" ? process.stderr : process.stdout).write(line + "\n");
}
