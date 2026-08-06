import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";

// Testzeilen je Nutzer-ID. Die Filterung in select()/update() liest die
// tatsaechliche ID aus dem Drizzle-Vergleichsobjekt (eq(usersTable.id, ...)
// liefert ein SQL-Objekt mit queryChunks, darin ein Param-Chunk mit dem
// Wert) -- so laeuft requireAuth hier mit seiner echten Logik, nicht als
// Attrappe, und die Sperre in der Middleware wird tatsaechlich gepruft.
interface FakeUserRow {
  id: string;
  role: string;
  isApproved: boolean;
  schoolId: string | null;
  profileConfirmedAt: Date | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

let fakeUsers: Record<string, FakeUserRow> = {};
let profileChangeEntries: Array<{ actorId: string; targetUserId: string; field: string; before: unknown; after: unknown }> = [];

function extractEqId(cond: any): string | undefined {
  const chunks = cond?.queryChunks;
  if (!Array.isArray(chunks)) return undefined;
  const param = chunks.find((c: any) => c?.constructor?.name === "Param");
  return param?.value;
}

vi.mock("@workspace/db", async () => {
  function createMockTable(name: string) {
    return { [Symbol.toStringTag]: name } as any;
  }

  function makeSelectChain(): any {
    let table = "";
    let whereId: string | undefined;
    const resolve = () => {
      if (table !== "users") return Promise.resolve([]);
      if (whereId !== undefined) return Promise.resolve(fakeUsers[whereId] ? [fakeUsers[whereId]] : []);
      return Promise.resolve(Object.values(fakeUsers));
    };
    const chain: any = {
      from: (t: any) => { table = t[Symbol.toStringTag]; return chain; },
      innerJoin: () => chain,
      where: (cond: any) => { whereId = extractEqId(cond); return chain; },
      limit: () => chain,
      then: (onFulfilled: any, onRejected?: any) => resolve().then(onFulfilled, onRejected),
      catch: (onRejected: any) => resolve().catch(onRejected),
    };
    return chain;
  }

  function makeUpdateChain(table: string): any {
    let whereId: string | undefined;
    let patch: Record<string, unknown> = {};
    const chain: any = {
      set: (p: Record<string, unknown>) => { patch = p; return chain; },
      where: (cond: any) => { whereId = extractEqId(cond); return chain; },
      returning: () => {
        if (table === "users" && whereId && fakeUsers[whereId]) {
          fakeUsers[whereId] = { ...fakeUsers[whereId], ...patch };
          return Promise.resolve([fakeUsers[whereId]]);
        }
        return Promise.resolve([]);
      },
    };
    return chain;
  }

  const dbMock: any = {
    select: () => makeSelectChain(),
    update: (t: any) => makeUpdateChain(t[Symbol.toStringTag]),
    insert: (t: any) => ({
      values: (v: Record<string, unknown>) => {
        if (t[Symbol.toStringTag] === "profile_change_log") {
          profileChangeEntries.push(v as any);
        }
        return Promise.resolve();
      },
    }),
    delete: () => ({ where: () => Promise.resolve() }),
    transaction: async (cb: (tx: any) => Promise<any>) => cb(dbMock),
  };

  return {
    db: dbMock,
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
    profileChangeLogTable: createMockTable("profile_change_log"),
    userRoleEnum: { enumValues: ["owner", "admin", "sanitaeter_leitung_admin", "sanitaeter_leitung", "teacher", "sanitaeter"] },
  };
});

// Nur fuer den Sitzungswiederherstellungs-Test unten gebraucht: die echte
// Implementierung hasht Token in sessionsTable und braucht eine echte
// Datenbank. Das Cookie "gueltig" loest hier auf die uebergebene Nutzer-ID
// auf, alles andere gilt als abgelaufen.
vi.mock("../lib/sessions", () => ({
  resolveSession: async (raw: string) => (raw.startsWith("gueltig:") ? { userId: raw.slice("gueltig:".length) } : null),
  createSession: async () => "irrelevant",
  revokeSession: async () => {},
}));

import app from "../app";
import type { Server } from "http";
import { signToken, invalidateAllRoleCaches } from "../middlewares/auth";
import { invalidateRolePermissions } from "../lib/rolePermissions";

function makeUser(overrides: Partial<FakeUserRow> = {}): FakeUserRow {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    role: "sanitaeter",
    isApproved: true,
    schoolId: null,
    profileConfirmedAt: null,
    firstName: "Vorschlag",
    lastName: "Nachname",
    email: `${id}@vitest.beispiel.invalid`,
    ...overrides,
  };
}

function tokenFor(user: FakeUserRow): string {
  return signToken({ userId: user.id, role: user.role });
}

describe("Namensbestaetigung -- Sperre, Endpunkt, Verwalter-Korrektur", () => {
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
    fakeUsers = {};
    profileChangeEntries = [];
    invalidateAllRoleCaches();
    invalidateRolePermissions();
  });

  async function call(method: string, path: string, token: string, body?: Record<string, unknown>) {
    const res = await fetch(`http://localhost:${port}${path}`, {
      method,
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  async function callWithSessionCookie(userId: string) {
    const res = await fetch(`http://localhost:${port}/api/auth/session`, {
      headers: { cookie: `sani-session=gueltig:${userId}` },
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  it("sperrt eine beliebige geschuetzte Route, solange der Name nicht bestaetigt ist", async () => {
    const user = makeUser();
    fakeUsers[user.id] = user;

    const result = await call("GET", `/api/users/${user.id}`, tokenFor(user));

    expect(result.status).toBe(403);
    expect(result.body.code).toBe("PROFILE_NOT_CONFIRMED");
  });

  it("laesst PATCH /auth/profile trotz Sperre zu", async () => {
    const user = makeUser();
    fakeUsers[user.id] = user;

    const result = await call("PATCH", "/api/auth/profile", tokenFor(user), { firstName: "Mia", lastName: "Krause" });

    expect(result.status).toBe(200);
    expect(result.body.user.firstName).toBe("Mia");
    expect(result.body.user.lastName).toBe("Krause");
    expect(result.body.user.profileConfirmedAt).not.toBeNull();
  });

  it("hebt die Sperre nach erfolgreicher Bestaetigung sofort auf", async () => {
    const user = makeUser();
    fakeUsers[user.id] = user;
    const token = tokenFor(user);

    const confirm = await call("PATCH", "/api/auth/profile", token, { firstName: "Mia", lastName: "Krause" });
    expect(confirm.status).toBe(200);

    const afterwards = await call("GET", `/api/users/${user.id}`, token);
    expect(afterwards.status).toBe(200);
  });

  it("weist einen leeren Namen mit 400 ab", async () => {
    const user = makeUser();
    fakeUsers[user.id] = user;

    const result = await call("PATCH", "/api/auth/profile", tokenFor(user), { firstName: "", lastName: "Krause" });

    expect(result.status).toBe(400);
  });

  it("weist einen Namen aus nur Leerzeichen mit 400 ab", async () => {
    const user = makeUser();
    fakeUsers[user.id] = user;

    const result = await call("PATCH", "/api/auth/profile", tokenFor(user), { firstName: "   ", lastName: "Krause" });

    expect(result.status).toBe(400);
  });

  it("weist einen Namen ueber 100 Zeichen mit 400 ab", async () => {
    const user = makeUser();
    fakeUsers[user.id] = user;

    const result = await call("PATCH", "/api/auth/profile", tokenFor(user), { firstName: "a".repeat(101), lastName: "Krause" });

    expect(result.status).toBe(400);
  });

  it("weist einen zweiten Aufruf bei bereits bestaetigtem Konto mit 409 ab", async () => {
    const user = makeUser({ profileConfirmedAt: new Date() });
    fakeUsers[user.id] = user;

    const result = await call("PATCH", "/api/auth/profile", tokenFor(user), { firstName: "Mia", lastName: "Krause" });

    expect(result.status).toBe(409);
  });

  it("traegt die Sitzungswiederherstellung das Feld profileConfirmedAt als Zeitstempel", async () => {
    const confirmedAt = new Date("2026-08-01T10:00:00Z");
    const user = makeUser({ profileConfirmedAt: confirmedAt });
    fakeUsers[user.id] = user;

    const result = await callWithSessionCookie(user.id);

    expect(result.status).toBe(200);
    expect(result.body.user.profileConfirmedAt).toBe(confirmedAt.toISOString());
  });

  it("traegt die Sitzungswiederherstellung das Feld profileConfirmedAt als null vor der Bestaetigung", async () => {
    const user = makeUser({ profileConfirmedAt: null });
    fakeUsers[user.id] = user;

    const result = await callWithSessionCookie(user.id);

    expect(result.status).toBe(200);
    expect(result.body.user.profileConfirmedAt).toBeNull();
  });

  describe("Verwalter-Korrekturweg", () => {
    it("verweigert die Korrektur ohne users.correct_profile", async () => {
      const actor = makeUser({ id: "actor-no-perm", role: "sanitaeter", profileConfirmedAt: new Date() });
      const target = makeUser({ id: "target-1", profileConfirmedAt: null });
      fakeUsers[actor.id] = actor;
      fakeUsers[target.id] = target;

      const result = await call("PATCH", `/api/users/${target.id}/profile`, tokenFor(actor), { firstName: "Neu", lastName: "Korrigiert" });

      expect(result.status).toBe(403);
    });

    it("erlaubt die Korrektur mit users.correct_profile und schreibt einen Protokolleintrag", async () => {
      const actor = makeUser({ id: "actor-admin", role: "admin", profileConfirmedAt: new Date() });
      const target = makeUser({ id: "target-2", firstName: "Falsch", lastName: "Geschrieben", profileConfirmedAt: null });
      fakeUsers[actor.id] = actor;
      fakeUsers[target.id] = target;

      const result = await call("PATCH", `/api/users/${target.id}/profile`, tokenFor(actor), { firstName: "Richtig", lastName: "Korrigiert" });

      expect(result.status).toBe(200);
      expect(result.body.firstName).toBe("Richtig");
      expect(result.body.lastName).toBe("Korrigiert");
      expect(fakeUsers[target.id]!.profileConfirmedAt).not.toBeNull();
      expect(profileChangeEntries).toHaveLength(2);
      expect(profileChangeEntries.map((e) => e.field).sort()).toEqual(["first_name", "last_name"]);
      expect(profileChangeEntries[0]!.actorId).toBe(actor.id);
      expect(profileChangeEntries.every((e) => e.targetUserId === target.id)).toBe(true);
    });

    it("weist das eigene Konto als Ziel ab", async () => {
      const actor = makeUser({ id: "actor-self", role: "admin", profileConfirmedAt: new Date() });
      fakeUsers[actor.id] = actor;

      const result = await call("PATCH", `/api/users/${actor.id}/profile`, tokenFor(actor), { firstName: "Neu", lastName: "Selbst" });

      expect(result.status).toBe(403);
      expect(profileChangeEntries).toHaveLength(0);
    });
  });
});
