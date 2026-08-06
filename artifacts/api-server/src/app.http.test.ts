import { describe, expect, it } from "vitest";
import request from "supertest";
import { vi } from "vitest";

// Der komplette Router-Baum (routes/index.ts) haengt beim Import von "../app"
// mit im Graph, auch wenn ein einzelner Testfall nur eine Route anspricht --
// ohne diese Platzhalter wuerde schon der Modulimport an fehlenden benannten
// Exporten scheitern. Gleiche Auswahl wie in users.approve.test.ts.
vi.mock("@workspace/db", async () => {
  function selectChain(): any {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve([]),
    };
    return chain;
  }

  function createMockTable(name: string) {
    return { [Symbol.toStringTag]: name } as any;
  }

  return {
    db: {
      select: () => selectChain(),
      insert: () => ({ values: () => ({ onConflictDoUpdate: () => Promise.resolve() }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
      delete: () => ({ where: () => Promise.resolve() }),
    },
    pool: { query: () => Promise.resolve({ rows: [] }) },
    usersTable: createMockTable("users"),
    newsTable: createMockTable("news"),
    loaTable: createMockTable("loa"),
    missionsTable: createMockTable("missions"),
    missionActivityLogTable: createMockTable("mission_activity_log"),
    missionDismissalsTable: createMockTable("mission_dismissals"),
    incidentReportsTable: createMockTable("incident_reports"),
    reportAccessLogTable: createMockTable("report_access_log"),
    notificationsTable: createMockTable("notifications"),
    deviceTokensTable: createMockTable("device_tokens"),
    statusTable: createMockTable("status"),
    dutyTable: createMockTable("duty"),
    dbConsoleLogTable: createMockTable("db_console_log"),
    rolesTable: createMockTable("roles"),
    rolePermissionsTable: createMockTable("role_permissions"),
    sessionsTable: createMockTable("sessions"),
    roleChangeLogTable: createMockTable("role_change_log"),
    userRoleEnum: { enumValues: ["owner", "admin", "sanitaeter_leitung_admin", "sanitaeter_leitung", "teacher", "sanitaeter"] },
  };
});

import app from "./app";

describe("HTTP-Grundgeruest", () => {
  it("GET /api/healthz meldet ok, wenn die Datenbankabfrage durchgeht", async () => {
    const res = await request(app).get("/api/healthz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /api/auth/providers listet nur den aktivierten Anmeldeweg, ohne Geheimnisse", async () => {
    const res = await request(app).get("/api/auth/providers");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      providers: [{ key: "iserv-form", displayName: "IServ", type: "iserv-form" }],
    });
  });

  it("verweigert eine geschuetzte Route ohne Token", async () => {
    const res = await request(app).get("/api/users");

    expect(res.status).toBe(401);
  });

  it("lehnt fehlerhaftes JSON im Body ab, ueber den Fehlerhandler aus app.ts", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{das ist kein json");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid JSON in request body" });
  });
});
