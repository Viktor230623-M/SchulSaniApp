import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schoolsTable } from "@workspace/db";
import { config } from "../config";

/**
 * Schulkontext einer Anfrage.
 *
 * Zwei Betriebsmodi:
 *
 * - Selbsthosting (MULTI_TENANT nicht gesetzt): Die Instanz gehoert genau
 *   einer Schule; der Schulkontext ist die SCHOOL_ID aus der Umgebung und
 *   laesst sich nicht von aussen beeinflussen. `resolveSchoolId` ignoriert
 *   deshalb jeden Request-Wert.
 *
 * - Cloud-Betrieb (MULTI_TENANT=true): Eine Instanz bedient viele Schulen.
 *   Die Schule kommt aus der Anfrage (Body-Feld `schoolId` bzw. Query-
 *   Parameter `schoolId`) und muss in der schools-Tabelle existieren und
 *   aktiv sein. Der Schul-Zugangscode liegt je Schule vor.
 *
 * Der Schul-Zugangscode wird als SHA-256-Hash gespeichert (wie Sitzungs- und
 * Auth-Tokens); ein Datenbankleck gibt damit keine Codes preis.
 */

/** Zeigt nur id und name -- der Anmeldebildschirm braucht nicht mehr. */
export interface PublicSchool {
  id: string;
  name: string;
  /** true, wenn diese Schule einen Zugangscode verlangt (Anzeige im Formular). */
  joinCodeRequired: boolean;
}

export function hashJoinCode(joinCode: string): string {
  return createHash("sha256").update(joinCode).digest("hex");
}

function joinCodeMatches(candidate: string, storedHash: string): boolean {
  const a = Buffer.from(hashJoinCode(candidate), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Die Schule dieser Anfrage. Wirft, wenn sie fehlt oder (im Cloud-Betrieb)
 * unbekannt oder deaktiviert ist.
 */
export async function resolveSchoolId(
  requestSchoolId: string | undefined,
): Promise<string> {
  if (!config.multiTenant) {
    const schoolId = process.env["SCHOOL_ID"]?.trim() || "school";
    return schoolId;
  }

  const schoolId = requestSchoolId?.trim();
  if (!schoolId) {
    throw new Error("Schulkontext fehlt");
  }
  const [school] = await db
    .select({ id: schoolsTable.id, isActive: schoolsTable.isActive })
    .from(schoolsTable)
    .where(eq(schoolsTable.id, schoolId))
    .limit(1);
  if (!school || school.isActive !== true) {
    throw new Error("Schule ist nicht aktiv");
  }
  return schoolId;
}

/**
 * Zugangscode-Check fuer eine Schule. Ohne gespeicherten Hash ist die Schule
 * offen (immer true); mit Hash zaehlt nur der passende Code.
 */
export async function schoolJoinCodeMatches(
  schoolId: string,
  candidate: unknown,
): Promise<boolean> {
  if (typeof candidate !== "string" || candidate.length > 500) return false;
  const [school] = await db
    .select({ joinCodeHash: schoolsTable.joinCodeHash })
    .from(schoolsTable)
    .where(eq(schoolsTable.id, schoolId))
    .limit(1);
  if (!school?.joinCodeHash) return true; // keine Eintrittskarte verlangt
  return joinCodeMatches(candidate, school.joinCodeHash);
}

/** true, wenn diese Schule eine Eintrittskarte (Zugangscode) verlangt. */
export async function schoolRequiresJoinCode(schoolId: string): Promise<boolean> {
  const [school] = await db
    .select({ joinCodeHash: schoolsTable.joinCodeHash })
    .from(schoolsTable)
    .where(eq(schoolsTable.id, schoolId))
    .limit(1);
  return school?.joinCodeHash !== null && school?.joinCodeHash !== undefined && school.joinCodeHash !== "";
}

/** Schulen fuer den Schul-Waehler (nur aktive). */
export async function listPublicSchools(): Promise<PublicSchool[]> {
  const rows = await db
    .select({
      id: schoolsTable.id,
      name: schoolsTable.name,
      joinCodeHash: schoolsTable.joinCodeHash,
      isActive: schoolsTable.isActive,
    })
    .from(schoolsTable)
    .where(eq(schoolsTable.isActive, true));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    joinCodeRequired: row.joinCodeHash !== null && row.joinCodeHash !== "",
  }));
}
