import { describe, it, expect, beforeEach, vi } from "vitest";

// CWE-863 — Befund "school-scoped role permissions are ignored after login".
// loadRolePermissions() muss eine schulgebundene Rolle vor der ungebundenen
// bevorzugen; sonst bekaeme ein Nutzer nach dem Anmelden trotz Entzug einer
// Berechtigung fuer seine Schule weiter den globalen Rechtesatz.
//
// Die Datenbank wird gemockt -- was hier zaehlt, ist die Buendelung nach
// Bereich in rolePermissions.ts, nicht die WHERE-Klausel selbst (die bleibt
// Sache von drizzle/Postgres). Die Mock-Zeilen entsprechen bewusst dem, was
// die echte Abfrage fuer den jeweiligen Bereich zurueckgeben wuerde.

let mockRows: Array<{ key: string; permission: string; rowSchoolId: string | null }> = [];

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: async () => mockRows,
        }),
      }),
    }),
  },
  rolesTable: {},
  rolePermissionsTable: {},
  usersTable: {},
}));

import { permissionsForRole, invalidateRolePermissions } from "./rolePermissions";

beforeEach(() => {
  invalidateRolePermissions();
  mockRows = [];
});

describe("permissionsForRole -- Schulbereich", () => {
  it("bevorzugt die schulgebundene Rolle vor der ungebundenen bei gleichem Schluessel", async () => {
    mockRows = [
      { key: "sanitaeter", permission: "patients.view", rowSchoolId: null },
      { key: "sanitaeter", permission: "patients.edit", rowSchoolId: null },
      // gymbla hat patients.edit entzogen -- die eigene Zeile traegt nur noch patients.view.
      { key: "sanitaeter", permission: "patients.view", rowSchoolId: "gymbla" },
    ];

    const permissions = await permissionsForRole("sanitaeter", "gymbla");

    expect(permissions).toEqual(["patients.view"]);
    expect(permissions).not.toContain("patients.edit");
  });

  it("faellt ohne schulgebundene Rolle weiter auf die ungebundene zurueck", async () => {
    mockRows = [
      { key: "sanitaeter", permission: "patients.view", rowSchoolId: null },
      { key: "sanitaeter", permission: "patients.edit", rowSchoolId: null },
    ];

    const permissions = await permissionsForRole("sanitaeter", "gymbla");

    expect(permissions.sort()).toEqual(["patients.edit", "patients.view"]);
  });

  it("laesst andere Rollen der Installation unangetastet", async () => {
    mockRows = [
      { key: "sanitaeter", permission: "patients.view", rowSchoolId: null },
      { key: "sanitaeter", permission: "patients.view", rowSchoolId: "gymbla" },
      { key: "admin", permission: "users.delete", rowSchoolId: null },
    ];

    const permissions = await permissionsForRole("admin", "gymbla");

    expect(permissions).toEqual(["users.delete"]);
  });
});
