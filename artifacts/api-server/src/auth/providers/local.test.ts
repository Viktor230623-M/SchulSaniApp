import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";

// R6 — Testset Anmeldewege (local)
// Mindestens: falsches Passwort, unbekannter Nutzer
//
// Die Datenbank wird gemockt -- der Adapter (Suche, bcrypt-Vergleich,
// generische Fehlermeldung) laeuft echt.

let mockRows: Array<Record<string, unknown>> = [];

vi.mock("@workspace/db", () => ({
  db: {
    select: () => {
      const chain: any = {
        from: () => chain,
        innerJoin: () => chain,
        where: () => chain,
        limit: async () => mockRows.length > 0 ? [{ user: mockRows[0], identity: { externalSubject: mockRows[0]?.externalSubject } }] : [],
      };
      return chain;
    },
  },
  usersTable: {},
  userIdentitiesTable: {},
}));

import { createLocalProvider } from "./local";

// Niedrige Kostenstufe fuer den Testdaten-Hash -- der Adapter selbst hasht
// weiterhin mit LOCAL_PASSWORD_BCRYPT_COST, das betrifft hier nur die
// Fixture-Erzeugung.
const existingUserHash = bcrypt.hashSync("das-richtige-passwort", 4);

const existingUser = {
  schoolId: "school-1",
  authProvider: "local",
  externalSubject: "mmuster",
  passwordHash: existingUserHash,
  firstName: "Max",
  lastName: "Muster",
  email: "max@example.test",
  phone: "",
  mustChangePassword: false,
  oneTimePasswordExpiresAt: null,
};

describe("local-provider-tests", () => {
  const provider = createLocalProvider({ key: "local", displayName: "Lokal", schoolId: "school-1" });

  it("lehnt falsches Passwort ab", async () => {
    mockRows = [existingUser];
    await expect(provider.authenticate({ username: "mmuster", password: "falsches-passwort" })).rejects.toThrow(
      "Ungültige Zugangsdaten",
    );
  });

  it("gibt das Subjekt der gefundenen Identitaet zurueck", async () => {
    mockRows = [existingUser];
    const result = await provider.authenticate({ username: "mmuster", password: "das-richtige-passwort" });
    expect(result.subject).toBe("mmuster");
  });

  it("lehnt unbekannten Nutzer ab", async () => {
    mockRows = [];
    await expect(provider.authenticate({ username: "unbekannt", password: "irgendein-passwort" })).rejects.toThrow(
      "Ungültige Zugangsdaten",
    );
  });
});
