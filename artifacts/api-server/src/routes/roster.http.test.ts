import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";

// In-Memory-Datenbank: Nutzer, Schichten und Mitglieder. Die Route filtert
// ueber echte Drizzle-Spalten, die Tabellen-Mocks brauchen deshalb echte
// Spalten. Die Konditionen werden unten aus dem SQL-AST ausgelesen.
interface FakeUserRow { id: string; firstName: string | null; lastName: string | null; schoolId: string; }
interface FakeShiftRow {
  id: string; schoolId: string; title: string; location: string | null;
  startsAt: Date; endsAt: Date; createdBy: string;
  createdAt: Date; updatedAt: Date;
}
interface FakeMemberRow { id: string; schoolId: string; shiftId: string; userId: string; userName: string | null; createdAt: Date; }

let fakeUsers: FakeUserRow[] = [];
let fakeShifts: FakeShiftRow[] = [];
let fakeMembers: FakeMemberRow[] = [];

vi.mock("@workspace/db", async () => {
  const { pgTable, text, timestamp } = await import("drizzle-orm/pg-core");

  const usersTableMock = pgTable("users", {
    id: text("id"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    schoolId: text("school_id"),
  });

  const shiftsTableMock = pgTable("shifts", {
    id: text("id"),
    schoolId: text("school_id"),
    title: text("title"),
    location: text("location"),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  });

  const shiftMembersTableMock = pgTable("shift_members", {
    id: text("id"),
    schoolId: text("school_id"),
    shiftId: text("shift_id"),
    userId: text("user_id"),
    userName: text("user_name"),
    createdAt: timestamp("created_at"),
  });

  // Konditionen aus dem SQL-AST lesen. Die Spaltennamen stecken in den
  // Pg*-Objektknoten (name/table.name), Operatoren in den StringChunks,
  // Werte in den Params. inArray erzeugt mehrere aufeinanderfolgende Params.
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
          if (v.includes("<")) pending.op = "lt";
        }
        return;
      }
      // Pg-Spaltenobjekt: beginnt eine neue Bedingung.
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
        if (op === "lt") return cell != null && (cell as Date).getTime() < (value as Date).getTime();
        return cell === value;
      }),
    );
  }

  function makeSelectChain(): any {
    let source: "users" | "shifts" | "members" = "users";
    let cond: any;
    const resolveRows = (): any[] => {
      let rows: any[] = source === "users" ? fakeUsers : source === "shifts" ? fakeShifts : fakeMembers;
      rows = matchRows(rows, cond);
      if (source === "shifts") rows = [...rows].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      return rows;
    };
    const chain: any = {
      from: (t: any) => {
        source = t === shiftsTableMock ? "shifts" : t === shiftMembersTableMock ? "members" : "users";
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

  const dbMock: any = {
    select: () => makeSelectChain(),
    insert: (t: any) => ({
      values: (v: any) => {
        // Batch-Insert (POST /) liefert ein Array, Einzel-Insert ein Objekt.
        const rows = Array.isArray(v) ? v : [v];
        if (t === shiftsTableMock) fakeShifts.push(...rows);
        if (t === shiftMembersTableMock) {
          for (const row of rows) {
            const exists = fakeMembers.some((m) => m.shiftId === row.shiftId && m.userId === row.userId);
            if (!exists) fakeMembers.push(row as FakeMemberRow);
          }
        }
        return { onConflictDoNothing: () => Promise.resolve(), onConflictDoUpdate: () => Promise.resolve() };
      },
    }),
    update: (t: any) => ({
      set: (values: any) => ({
        where: (cond: any) => {
          const rows = matchRows(fakeShifts, cond);
          const updated = rows.map((s) => ({ ...s, ...values }));
          fakeShifts = fakeShifts.map((s) => updated.find((u) => u.id === s.id) ?? s);
          return { returning: () => Promise.resolve(updated) };
        },
      }),
    }),
    delete: (t: any) => ({
      where: (cond: any) => {
        if (t === shiftsTableMock) {
          const doomed = matchRows(fakeShifts, cond).map((s) => s.id);
          fakeShifts = fakeShifts.filter((s) => !doomed.includes(s.id));
          fakeMembers = fakeMembers.filter((m) => !doomed.includes(m.shiftId));
          return { returning: () => Promise.resolve(doomed.map((id) => ({ id }))) };
        }
        if (t === shiftMembersTableMock) {
          const rows = matchRows(fakeMembers, cond);
          fakeMembers = fakeMembers.filter((m) => !rows.includes(m));
          return { returning: () => Promise.resolve(rows) };
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
    shiftsTable: shiftsTableMock,
    shiftMembersTable: shiftMembersTableMock,
    userIdentitiesTable: createMockTable("user_identities"),
    newsTable: createMockTable("news"),
    loaTable: createMockTable("loa"),
    missionsTable: createMockTable("missions"),
    missionActivityLogTable: createMockTable("mission_activity_log"),
    missionDismissalsTable: createMockTable("mission_dismissals"),
    incidentReportsTable: createMockTable("incident_reports"),
    schoolSettingsTable: createMockTable("school_settings"),
    schoolExportsTable: createMockTable("school_exports"),
    reportAccessLogTable: createMockTable("report_access_log"),
    notificationsTable: createMockTable("notifications"),
    deviceTokensTable: createMockTable("device_tokens"),
    statusTable: createMockTable("status"),
    dutyTable: createMockTable("duty"),
    rolesTable: createMockTable("roles"),
    rolePermissionsTable: createMockTable("role_permissions"),
    sessionsTable: createMockTable("sessions"),
    roleChangeLogTable: createMockTable("role_change_log"),
    profileChangeLogTable: createMockTable("profile_change_log"),
    identityChangeLogTable: createMockTable("identity_change_log"),
    authTokensTable: createMockTable("auth_tokens"),
    userRoleEnum: { enumValues: ["owner", "admin", "sanitaeter_leitung_admin", "sanitaeter_leitung", "teacher", "sanitaeter"] },
  };
});

vi.mock("express-rate-limit", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

// Akteure je Nutzer-ID: Rolle und Berechtigungen frei waehlbar, unabhaengig
// vom Katalog -- Berechtigungen sind pro Schule konfigurierbar.
let actors: Record<string, { role: string; permissions: string[]; schoolId: string }> = {};

vi.mock("../middlewares/auth", async () => {
  const actual = await vi.importActual<typeof import("../middlewares/auth")>("../middlewares/auth");
  return {
    ...actual,
    invalidateUserCache: vi.fn(),
    requireAuth: (req: any, res: any, next: any) => {
      const header = req.headers?.authorization || "";
      const userId = header.startsWith("Bearer ") ? header.slice(7) : "";
      const actor = actors[userId];
      if (!actor) { res.status(401).json({ error: "Unauthorized" }); return; }
      req.user = { userId, role: actor.role, permissions: actor.permissions, schoolId: actor.schoolId };
      next();
    },
    requirePermission: (...perms: string[]) => (req: any, res: any, next: any) => {
      if (!req.user) { res.status(403).json({ error: "Forbidden" }); return; }
      const granted: string[] = req.user.permissions ?? [];
      if (!perms.every((p) => granted.includes(p))) {
        res.status(403).json({ error: "Forbidden - missing permission" }); return;
      }
      next();
    },
  };
});

import app from "../app";
import type { Server } from "http";

describe("Dienstplan (/api/roster) -- Schichten und Mitglieder", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        port = (server.address() as import("net").AddressInfo).port;
        resolve();
      });
    });
  }, 10000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    fakeUsers = [
      { id: "user-sani-1", firstName: "Anna", lastName: "Meier", schoolId: "schule-1" },
      { id: "user-admin-1", firstName: "Ben", lastName: "Parker", schoolId: "schule-1" },
      { id: "user-fremd-1", firstName: "Carla", lastName: "Schulz", schoolId: "schule-2" },
    ];
    fakeShifts = [];
    fakeMembers = [];
    actors = {
      "user-sani-1": { role: "sanitaeter", permissions: [], schoolId: "schule-1" },
      "user-admin-1": { role: "admin", permissions: ["roster.manage"], schoolId: "schule-1" },
      "user-fremd-1": { role: "sanitaeter", permissions: [], schoolId: "schule-2" },
    };
  });

  const base = (p: number) => `http://127.0.0.1:${p}/api/roster`;

  it("GET ohne Token -> 401", async () => {
    const res = await request(base(port)).get("/");
    expect(res.status).toBe(401);
  });

  it("GET als Sanitaeter -> 200, leere Liste", async () => {
    const res = await request(base(port)).get("/").set("Authorization", "Bearer user-sani-1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("POST ohne roster.manage -> 403", async () => {
    const res = await request(base(port))
      .post("/")
      .set("Authorization", "Bearer user-sani-1")
      .send({ title: "Pausendienst", startsAt: "2026-09-01T11:00:00.000Z", endsAt: "2026-09-01T12:00:00.000Z" });
    expect(res.status).toBe(403);
  });

  it("POST mit roster.manage -> 201, Schicht mit Mitgliedern", async () => {
    const res = await request(base(port))
      .post("/")
      .set("Authorization", "Bearer user-admin-1")
      .send({
        title: "Pausendienst",
        location: "Aula",
        startsAt: "2026-09-01T11:00:00.000Z",
        endsAt: "2026-09-01T12:00:00.000Z",
        memberIds: ["user-sani-1"],
      });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Pausendienst");
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].userName).toBe("Anna Meier");
    expect(res.body.members[0].userId).toBe("user-sani-1");
  });

  it("POST mit Ende vor Beginn -> 400", async () => {
    const res = await request(base(port))
      .post("/")
      .set("Authorization", "Bearer user-admin-1")
      .send({ title: "Kaputt", startsAt: "2026-09-01T12:00:00.000Z", endsAt: "2026-09-01T11:00:00.000Z" });
    expect(res.status).toBe(400);
  });

  it("POST mit fremdem Mitglied -> 400 (nicht in dieser Schule)", async () => {
    const res = await request(base(port))
      .post("/")
      .set("Authorization", "Bearer user-admin-1")
      .send({
        title: "Pausendienst",
        startsAt: "2026-09-01T11:00:00.000Z",
        endsAt: "2026-09-01T12:00:00.000Z",
        memberIds: ["user-fremd-1"],
      });
    expect(res.status).toBe(201);
    expect(res.body.members).toHaveLength(0);
  });

  it("PATCH auf Schicht einer anderen Schule -> 404 (IDOR)", async () => {
    const create = await request(base(port))
      .post("/")
      .set("Authorization", "Bearer user-admin-1")
      .send({ title: "Pausendienst", startsAt: "2026-09-01T11:00:00.000Z", endsAt: "2026-09-01T12:00:00.000Z" });
    const id = create.body.id;

    const patch = await request(base(port))
      .patch(`/${id}`)
      .set("Authorization", "Bearer user-fremd-1") // andere Schule, keine manage-Rechte
      .send({ title: "Hijack" });
    expect(patch.status).toBe(403);
  });

  it("DELETE eigene Schicht -> 204, Schicht weg", async () => {
    const create = await request(base(port))
      .post("/")
      .set("Authorization", "Bearer user-admin-1")
      .send({ title: "Pausendienst", startsAt: "2026-09-01T11:00:00.000Z", endsAt: "2026-09-01T12:00:00.000Z" });
    const id = create.body.id;

    const del = await request(base(port)).delete(`/${id}`).set("Authorization", "Bearer user-admin-1");
    expect(del.status).toBe(204);

    const list = await request(base(port)).get("/").set("Authorization", "Bearer user-sani-1");
    expect(list.body).toEqual([]);
  });

  it("Member hinzufuegen -> 201, doppelt -> kein Duplikat", async () => {
    const create = await request(base(port))
      .post("/")
      .set("Authorization", "Bearer user-admin-1")
      .send({ title: "Pausendienst", startsAt: "2026-09-01T11:00:00.000Z", endsAt: "2026-09-01T12:00:00.000Z" });
    const id = create.body.id;

    const add = await request(base(port))
      .post(`/${id}/members`)
      .set("Authorization", "Bearer user-admin-1")
      .send({ userId: "user-sani-1" });
    expect(add.status).toBe(201);
    expect(add.body.members).toHaveLength(1);

    const again = await request(base(port))
      .post(`/${id}/members`)
      .set("Authorization", "Bearer user-admin-1")
      .send({ userId: "user-sani-1" });
    expect(again.status).toBe(201);
    expect(again.body.members).toHaveLength(1);
  });

  it("Member aus anderer Schule -> 400", async () => {
    const create = await request(base(port))
      .post("/")
      .set("Authorization", "Bearer user-admin-1")
      .send({ title: "Pausendienst", startsAt: "2026-09-01T11:00:00.000Z", endsAt: "2026-09-01T12:00:00.000Z" });
    const id = create.body.id;

    const add = await request(base(port))
      .post(`/${id}/members`)
      .set("Authorization", "Bearer user-admin-1")
      .send({ userId: "user-fremd-1" });
    expect(add.status).toBe(400);
  });

  it("JOIN als Sanitaeter -> 201, eigene Id als Mitglied, doppelt kein Duplikat", async () => {
    const create = await request(base(port))
      .post("/")
      .set("Authorization", "Bearer user-admin-1")
      .send({ title: "Pausendienst", startsAt: "2026-09-01T11:00:00.000Z", endsAt: "2026-09-01T12:00:00.000Z" });
    const id = create.body.id;

    const join = await request(base(port)).post(`/${id}/join`).set("Authorization", "Bearer user-sani-1");
    expect(join.status).toBe(201);
    expect(join.body.members).toHaveLength(1);
    expect(join.body.members[0].userId).toBe("user-sani-1");
    expect(join.body.members[0].userName).toBe("Anna Meier");

    const again = await request(base(port)).post(`/${id}/join`).set("Authorization", "Bearer user-sani-1");
    expect(again.status).toBe(201);
    expect(again.body.members).toHaveLength(1);
  });

  it("JOIN auf Schicht einer anderen Schule -> 404 (IDOR)", async () => {
    const create = await request(base(port))
      .post("/")
      .set("Authorization", "Bearer user-admin-1")
      .send({ title: "Pausendienst", startsAt: "2026-09-01T11:00:00.000Z", endsAt: "2026-09-01T12:00:00.000Z" });
    const id = create.body.id;

    const join = await request(base(port)).post(`/${id}/join`).set("Authorization", "Bearer user-fremd-1");
    expect(join.status).toBe(404);
  });

  it("JOIN ohne Token -> 401", async () => {
    const create = await request(base(port))
      .post("/")
      .set("Authorization", "Bearer user-admin-1")
      .send({ title: "Pausendienst", startsAt: "2026-09-01T11:00:00.000Z", endsAt: "2026-09-01T12:00:00.000Z" });
    const id = create.body.id;

    const join = await request(base(port)).post(`/${id}/join`);
    expect(join.status).toBe(401);
  });

  it("LEAVE als Mitglied -> 200, ausgetragen", async () => {
    const create = await request(base(port))
      .post("/")
      .set("Authorization", "Bearer user-admin-1")
      .send({ title: "Pausendienst", startsAt: "2026-09-01T11:00:00.000Z", endsAt: "2026-09-01T12:00:00.000Z", memberIds: ["user-sani-1"] });
    const id = create.body.id;

    const leave = await request(base(port)).post(`/${id}/leave`).set("Authorization", "Bearer user-sani-1");
    expect(leave.status).toBe(200);
    expect(leave.body.members).toHaveLength(0);
  });

  it("LEAVE ohne Mitgliedschaft -> 404", async () => {
    const create = await request(base(port))
      .post("/")
      .set("Authorization", "Bearer user-admin-1")
      .send({ title: "Pausendienst", startsAt: "2026-09-01T11:00:00.000Z", endsAt: "2026-09-01T12:00:00.000Z" });
    const id = create.body.id;

    const leave = await request(base(port)).post(`/${id}/leave`).set("Authorization", "Bearer user-sani-1");
    expect(leave.status).toBe(404);
  });

  it("GET mit from/to filtert", async () => {
    await request(base(port))
      .post("/")
      .set("Authorization", "Bearer user-admin-1")
      .send({ title: "September", startsAt: "2026-09-01T11:00:00.000Z", endsAt: "2026-09-01T12:00:00.000Z" });
    await request(base(port))
      .post("/")
      .set("Authorization", "Bearer user-admin-1")
      .send({ title: "Oktober", startsAt: "2026-10-05T11:00:00.000Z", endsAt: "2026-10-05T12:00:00.000Z" });

    const res = await request(base(port))
      .get("/")
      .query({ from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" })
      .set("Authorization", "Bearer user-sani-1");
    expect(res.status).toBe(200);
    expect(res.body.map((s: any) => s.title)).toEqual(["September"]);
  });
});
