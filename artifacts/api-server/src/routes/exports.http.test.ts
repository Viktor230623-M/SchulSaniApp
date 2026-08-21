import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";

interface FakeSettingRow { schoolId: string; exportInterval: string; lastExportAt: Date | null; updatedAt: Date; }
interface FakeExportRow {
  id: string; schoolId: string; fromAt: Date | null; toAt: Date;
  reportCount: number; status: string; downloadedAt: Date | null; downloadedBy: string | null;
  createdAt: Date;
}
interface FakeReportRow {
  id: string; schoolId: string; status: string; createdAt: Date;
  missionId: string | null; title: string | null; authorId: string;
  category: string | null; outcome: string | null;
  [k: string]: unknown;
}

let fakeSettings: FakeSettingRow[] = [];
let fakeExports: FakeExportRow[] = [];
let fakeReports: FakeReportRow[] = [];

function makeReport(id: string, schoolId: string, createdAt: Date, status = "submitted"): FakeReportRow {
  return {
    id, schoolId, status, createdAt,
    missionId: null, title: null, authorId: "u1",
    category: null, outcome: null,
    contentEncrypted: "ciphertext", contentKeyVersion: 1,
    incidentAt: createdAt, location: "Aula", description: null, injurySites: null,
    patientType: null, patientFirstName: null, patientLastName: null, patientClass: null,
    patientAge: null, emergencyContactName: null, emergencyContactPhone: null,
    careStartedAt: null, careEndedAt: null, measures: null, treatmentNotes: null,
    pulseBpm: null, spo2: null, respRate: null, bloodPressure: null,
    consciousnessAvpu: null, painScore: null, outcomeNotes: null,
    responderIdsJson: [], witnesses: null, addendaJson: null,
  };
}

vi.mock("@workspace/db", async () => {
  const { pgTable, text, timestamp, integer } = await import("drizzle-orm/pg-core");

  const schoolSettingsTableMock = pgTable("school_settings", {
    schoolId: text("school_id"),
    exportInterval: text("export_interval"),
    lastExportAt: timestamp("last_export_at"),
    updatedAt: timestamp("updated_at"),
  });
  const schoolExportsTableMock = pgTable("school_exports", {
    id: text("id"),
    schoolId: text("school_id"),
    fromAt: timestamp("from_at"),
    toAt: timestamp("to_at"),
    reportCount: integer("report_count"),
    status: text("status"),
    downloadedAt: timestamp("downloaded_at"),
    downloadedBy: text("downloaded_by"),
    createdAt: timestamp("created_at"),
  });
  const incidentReportsTableMock = pgTable("incident_reports", {
    id: text("id"),
    schoolId: text("school_id"),
    status: text("status"),
    createdAt: timestamp("created_at"),
  });
  const usersTableMock = pgTable("users", {
    id: text("id"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    schoolId: text("school_id"),
  });

  function extractConds(cond: any): Array<{ column: string; op: string; value: unknown }> {
    const out: Array<{ column: string; op: string; value: unknown }> = [];
    let pending: { column: string; op: string; values: unknown[] } | null = null;
    const flush = () => {
      if (pending) {
        out.push({ column: pending.column, op: pending.op, value: pending.op === "in" ? pending.values : pending.values[0] });
        pending = null;
      }
    };
    const walk = (x: any) => {
      if (x == null) return;
      if (x.constructor?.name === "Param") {
        if (pending) pending.values.push(x.value);
        return;
      }
      if (x.constructor?.name === "StringChunk") {
        const v = Array.isArray(x.value) ? x.value.join("") : x.value;
        if (pending && typeof v === "string") {
          if (v.includes(" in ")) pending.op = "in";
          if (v.includes(">=")) pending.op = "gte";
          if (v.includes("<=")) pending.op = "lte";
          if (v.includes("<")) pending.op = "lt";
        }
        return;
      }
      if (typeof x?.name === "string" && x?.table && Array.isArray(x?.queryChunks) === false) {
        flush();
        pending = { column: x.name, op: "eq", values: [] };
        return;
      }
      if (Array.isArray(x.queryChunks)) { x.queryChunks.forEach(walk); return; }
      if (Array.isArray(x)) { x.forEach(walk); return; }
    };
    walk(cond);
    flush();
    return out;
  }

  const camel = (s: string) => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

  function matchRows<T>(rows: T[], cond: any): T[] {
    if (!cond) return rows;
    const conds = extractConds(cond);
    return rows.filter((row) =>
      conds.every(({ column, op, value }) => {
        const cell = (row as Record<string, unknown>)[camel(column)];
        if (op === "in") return Array.isArray(value) && value.includes(cell);
        if (op === "gte") return cell != null && (cell as Date).getTime() >= (value as Date).getTime();
        if (op === "lte") return cell != null && (cell as Date).getTime() <= (value as Date).getTime();
        if (op === "lt") return cell != null && (cell as Date).getTime() < (value as Date).getTime();
        return cell === value;
      }),
    );
  }

  function makeSelectChain(): any {
    let source: "users" | "settings" | "exports" | "reports" = "users";
    let cond: any;
    const resolveRows = (): any[] => {
      let rows: any[] =
        source === "users" ? fakeUsers : source === "settings" ? fakeSettings : source === "exports" ? fakeExports : fakeReports;
      rows = matchRows(rows, cond);
      if (source === "exports") rows = [...rows].sort((a, b) => (b as FakeExportRow).createdAt.getTime() - (a as FakeExportRow).createdAt.getTime());
      if (source === "reports") rows = [...rows].sort((a, b) => (a as FakeReportRow).createdAt.getTime() - (b as FakeReportRow).createdAt.getTime());
      return rows;
    };
    const chain: any = {
      from: (t: any) => {
        source = t === schoolSettingsTableMock ? "settings" : t === schoolExportsTableMock ? "exports" : t === incidentReportsTableMock ? "reports" : "users";
        return chain;
      },
      where: (c: any) => { cond = c; return chain; },
      orderBy: () => chain,
      limit: () => chain,
      then: (onFulfilled: any, onRejected?: any) => Promise.resolve(resolveRows()).then(onFulfilled, onRejected),
      catch: (onRejected: any) => Promise.resolve(resolveRows()).catch(onRejected),
    };
    return chain;
  }

  const fakeUsers: { id: string }[] = [];

  const dbMock: any = {
    select: () => makeSelectChain(),
    insert: (t: any) => ({
      values: (v: any) => {
        if (t === schoolExportsTableMock) fakeExports.push(v as FakeExportRow);
        if (t === schoolSettingsTableMock) fakeSettings.push(v as FakeSettingRow);
        return {
          onConflictDoUpdate: () => Promise.resolve(),
          onConflictDoNothing: () => Promise.resolve(),
        };
      },
    }),
    update: (t: any) => ({
      set: (values: any) => ({
        where: (cond: any) => {
          if (t === schoolSettingsTableMock) {
            const rows = matchRows(fakeSettings, cond);
            for (const r of rows) Object.assign(r, values);
            return { returning: () => Promise.resolve(rows) };
          }
          if (t === schoolExportsTableMock) {
            const rows = matchRows(fakeExports, cond);
            for (const r of rows) Object.assign(r, values);
            return { returning: () => Promise.resolve(rows) };
          }
          return { returning: () => Promise.resolve([]) };
        },
      }),
    }),
    delete: (t: any) => ({
      where: (cond: any) => {
        if (t === incidentReportsTableMock) {
          const doomed = matchRows(fakeReports, cond).map((r) => (r as FakeReportRow).id);
          fakeReports = fakeReports.filter((r) => !doomed.includes(r.id));
          return { returning: () => Promise.resolve(doomed.map((id) => ({ id }))) };
        }
        return { returning: () => Promise.resolve([]) };
      },
    }),
    transaction: async (cb: (tx: any) => Promise<any>) => cb(dbMock),
  };

  function createMockTable(name: string) {
    return { [Symbol.toStringTag]: name } as any;
  }

  return {
    db: dbMock,
    pool: { query: () => Promise.resolve({ rows: [] }) },
    usersTable: usersTableMock,
    schoolSettingsTable: schoolSettingsTableMock,
    schoolExportsTable: schoolExportsTableMock,
    incidentReportsTable: incidentReportsTableMock,
    userIdentitiesTable: createMockTable("user_identities"),
    newsTable: createMockTable("news"),
    loaTable: createMockTable("loa"),
    missionsTable: createMockTable("missions"),
    missionActivityLogTable: createMockTable("mission_activity_log"),
    missionDismissalsTable: createMockTable("mission_dismissals"),
    reportAccessLogTable: createMockTable("report_access_log"),
    notificationsTable: createMockTable("notifications"),
    deviceTokensTable: createMockTable("device_tokens"),
    statusTable: createMockTable("status"),
    dutyTable: createMockTable("duty"),
    rolesTable: createMockTable("roles"),
    rolePermissionsTable: createMockTable("role_permissions"),
    sessionsTable: createMockTable("sessions"),
    roleChangeLogTable: createMockTable("role_change_log"),
    identityChangeLogTable: createMockTable("identity_change_log"),
    userRoleEnum: { enumValues: ["owner", "admin", "sanitaeter_leitung_admin", "sanitaeter_leitung", "teacher", "sanitaeter"] },
  };
});

vi.mock("../lib/rolePermissions", () => ({
  assertAdminReachable: vi.fn(async () => {}),
  LockoutError: class LockoutError extends Error {},
  permissionsForRole: vi.fn(async () => ["reports.read_all", "reports.see_patient_info"]),
  loadRolePermissions: vi.fn(async () => ({})),
  getRolePermissions: vi.fn(async () => []),
  roleHasPermission: vi.fn(async () => true),
}));

vi.mock("../lib/reportAccessLog", () => ({ logReportAccess: vi.fn(async () => {}) }));
vi.mock("../services/notifications", () => ({ notifyUser: vi.fn(async () => {}) }));

import app from "../app";

function auth(schoolId = "school-a") {
  return {
    Authorization: "Bearer x",
    "Content-Type": "application/json",
  };
}

vi.mock("../middlewares/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middlewares/auth")>();
  return {
    ...actual,
    requireAuth: vi.fn((_req: any, _res: any, next: any) => {
      _req.user = { userId: "u1", role: "admin", permissions: ["reports.read_all", "reports.see_patient_info"], schoolId: "school-a", passwordVersion: 0 };
      next();
    }),
    schoolIdOf: (_req: any) => "school-a",
    requirePermission: () => (_req: any, _res: any, next: any) => next(),
    requireSchool: (_req: any, _res: any, next: any) => next(),
  };
});

describe("exports route", () => {
  beforeEach(() => {
    fakeSettings = [];
    fakeExports = [];
    fakeReports = [];
  });

  it("PATCH setzt das Intervall und GET liefert es zurueck", async () => {
    const patch = await request(app).patch("/api/exports").set(auth()).send({ interval: "annual" });
    expect(patch.status).toBe(200);
    expect(patch.body.interval).toBe("annual");

    const get = await request(app).get("/api/exports").set(auth());
    expect(get.status).toBe(200);
    expect(get.body.interval).toBe("annual");
  });

  it("PATCH lehnt ungueltige Intervalle ab", async () => {
    const res = await request(app).patch("/api/exports").set(auth()).send({ interval: "monatlich" });
    expect(res.status).toBe(400);
  });

  it("POST ohne eingereichte Protokolle schlaegt fehl", async () => {
    const res = await request(app).post("/api/exports").set(auth());
    expect(res.status).toBe(400);
  });

  it("POST erzeugt ein Export-Buendel und setzt lastExportAt", async () => {
    const base = new Date("2026-01-01T10:00:00Z");
    fakeReports.push(makeReport("r1", "school-a", new Date(base.getTime() - 1000)));
    fakeReports.push(makeReport("r2", "school-a", base));
    fakeReports.push(makeReport("r3", "school-b", base)); // andere Schule

    const res = await request(app).post("/api/exports").set(auth());
    expect(res.status).toBe(201);
    expect(res.body.reportCount).toBe(2);
    expect(fakeExports.length).toBe(1);
    expect(fakeExports[0].fromAt).toBeNull();
    expect(fakeSettings[0].lastExportAt).toBeInstanceOf(Date);
  });

  it("Bundel liefert die Protokolle und erst der bestaetigte Empfang loescht sie", async () => {
    const base = new Date("2026-01-01T10:00:00Z");
    fakeReports.push(makeReport("r1", "school-a", new Date(base.getTime() - 2000)));
    fakeReports.push(makeReport("r2", "school-a", new Date(base.getTime() - 1000)));
    const created = await request(app).post("/api/exports").set(auth());
    expect(created.status).toBe(201);
    const exportId = created.body.id;

    // Das Buendel ist nur das verschluesselte Paket — das PDF entsteht
    // clientseitig. Ein reiner Abruf darf deshalb noch nichts loeschen.
    const bundle = await request(app).get(`/api/exports/${exportId}/bundle`).set(auth());
    expect(bundle.status).toBe(200);
    expect(bundle.body.reports.length).toBe(2);
    expect(fakeReports.length).toBe(2);

    // Erst die Bestaetigung gibt die Loeschung der Protokolle frei.
    const confirm = await request(app).post(`/api/exports/${exportId}/confirm`).set(auth());
    expect(confirm.status).toBe(200);
    expect(fakeReports.length).toBe(0);
    expect(fakeExports[0].status).toBe("downloaded");
    expect(fakeExports[0].downloadedBy).toBe("u1");

    // Ein bereits uebergebener Export ist nicht erneut abrufbar.
    const again = await request(app).get(`/api/exports/${exportId}/bundle`).set(auth());
    expect(again.status).toBe(409);
  });
});
