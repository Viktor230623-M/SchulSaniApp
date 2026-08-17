import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";

interface FakeUserRow {
  id: string;
  role: string;
  isApproved: boolean;
  schoolId: string | null;
  profileConfirmedAt: Date | null;
  authProvider: string;
  passwordVersion: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

let fakeUsers: Record<string, FakeUserRow> = {};
let profileChangeEntries: Array<{ actorId: string; targetUserId: string; field: string; before: unknown; after: unknown }> = [];

function extractEqId(cond: any): string | undefined {
  return extractParams(cond).find((value) => typeof value === "string" && Boolean(fakeUsers[value])) as string | undefined;
}

function extractParams(cond: any): unknown[] {
  const out: unknown[] = [];
  const collect = (c: any) => {
    if (c?.constructor?.name === "Param") {
      out.push(c.value);
      return;
    }
    const chunks = c?.queryChunks;
    if (Array.isArray(chunks)) chunks.forEach(collect);
  };
  collect(cond);
  return out;
}

vi.mock("@workspace/db", async () => {
  // usersTable braucht echte Drizzle-Spalten, sonst liefert eq(usersTable.id,
  // ...) im Routencode kein auswertbares SQL-Objekt (usersTable.id waere
  // schlicht undefined) -- Symbol.toStringTag-Attrappen wie bei den uebrigen
  // Tabellen reichen hier nicht, weil requireAuth und die Korrekturroute
  // echt nach ID filtern muessen, nicht nur "irgendeine Zeile" bekommen.
  const { pgTable, text } = await import("drizzle-orm/pg-core");
  const usersTableMock = pgTable("users", {
    id: text("id"),
    role: text("role"),
    isApproved: text("is_approved"),
    schoolId: text("school_id"),
    profileConfirmedAt: text("profile_confirmed_at"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    passwordVersion: text("password_version"),
    username: text("username"),
  });

  function createMockTable(name: string) {
    return { [Symbol.toStringTag]: name } as any;
  }
  const profileChangeLogTableMock = createMockTable("profile_change_log");

  function makeSelectChain(): any {
    let isUsers = false;
    let whereId: string | undefined;
    let whereSchool: string | undefined;
    const resolve = () => {
      if (!isUsers) return Promise.resolve([]);
      const row = whereId !== undefined ? fakeUsers[whereId] : undefined;
      if (row && whereSchool !== undefined && row.schoolId !== whereSchool) return Promise.resolve([]);
      if (whereId !== undefined) return Promise.resolve(row ? [row] : []);
      return Promise.resolve(Object.values(fakeUsers).filter((user) => whereSchool === undefined || user.schoolId === whereSchool));
    };
    const chain: any = {
      from: (t: any) => { isUsers = t === usersTableMock; return chain; },
      innerJoin: () => chain,
      where: (cond: any) => {
        const params = extractParams(cond);
        const idParam = params.find((p) => typeof p === "string" && !p.includes("@") && fakeUsers[p]);
        if (typeof idParam === "string") whereId = idParam;
        const schoolParam = params.find((p) => typeof p === "string" && Object.values(fakeUsers).some((user) => user.schoolId === p));
        if (typeof schoolParam === "string") whereSchool = schoolParam;
        return chain;
      },
      limit: () => chain,
      for: () => chain,
      then: (onFulfilled: any, onRejected?: any) => resolve().then(onFulfilled, onRejected),
      catch: (onRejected: any) => resolve().catch(onRejected),
    };
    return chain;
  }

  function makeUpdateChain(isUsers: boolean): any {
    let whereId: string | undefined;
    let changes: Record<string, unknown> = {};
    const chain: any = {
      set: (values: Record<string, unknown>) => { changes = values; return chain; },
      where: (cond: any) => {
        whereId = extractEqId(cond);
        if (isUsers && whereId && fakeUsers[whereId]) {
          fakeUsers[whereId] = { ...fakeUsers[whereId], ...changes } as FakeUserRow;
        }
        return chain;
      },
      returning: () => isUsers && whereId && fakeUsers[whereId] ? Promise.resolve([fakeUsers[whereId]]) : Promise.resolve([]),
    };
    return chain;
  }

  const dbMock: any = {
    select: () => makeSelectChain(),
    update: (t: any) => makeUpdateChain(t === usersTableMock),
    insert: (t: any) => ({
      values: (v: Record<string, unknown>) => {
        if (t === profileChangeLogTableMock) {
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
    usersTable: usersTableMock,
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
    profileChangeLogTable: profileChangeLogTableMock,
    identityChangeLogTable: createMockTable("identity_change_log"),
    userRoleEnum: { enumValues: ["owner", "admin", "sanitaeter_leitung_admin", "sanitaeter_leitung", "teacher", "sanitaeter"] },
  };
});

// Nur fuer den Sitzungswiederherstellungs-Test unten gebraucht: die echte
// Implementierung hasht Token in sessionsTable und braucht eine echte
// Datenbank. Das Cookie "gueltig" loest hier auf die uebergebene Nutzer-ID
// auf, alles andere gilt als abgelaufen.
vi.mock("../lib/sessions", () => ({
  resolveSession: async (raw: string) => (raw.startsWith("gueltig:") ? { userId: raw.slice("gueltig:".length), authenticatedAt: new Date("2026-08-01T10:00:00Z") } : null),
  createSession: async () => "irrelevant",
  revokeSession: async () => {},
}));

import app from "../app";
import { signToken, invalidateAllRoleCaches } from "../middlewares/auth";
import { invalidateRolePermissions } from "../lib/rolePermissions";

function makeUser(overrides: Partial<FakeUserRow> = {}): FakeUserRow {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    role: "sanitaeter",
    isApproved: true,
    schoolId: "school",
    profileConfirmedAt: null,
    authProvider: "oidc-beispiel",
    passwordVersion: 0,
    firstName: "Vorschlag",
    lastName: "Nachname",
    email: `${id}@vitest.beispiel.invalid`,
    ...overrides,
  };
}

function tokenFor(user: FakeUserRow): string {
  return signToken({ userId: user.id, role: user.role, passwordVersion: user.passwordVersion });
}

describe("Namensbestaetigung -- Sperre, Endpunkt, Verwalter-Korrektur", () => {
  beforeEach(() => {
    fakeUsers = {};
    profileChangeEntries = [];
    invalidateAllRoleCaches();
    invalidateRolePermissions();
  });

  async function call(method: "GET" | "PATCH", path: string, token: string, body?: Record<string, unknown>) {
    const req = request(app)
      [method === "GET" ? "get" : "patch"](path)
      .set("authorization", `Bearer ${token}`);
    const res = body !== undefined ? await req.send(body) : await req;
    return { status: res.status, body: res.body };
  }

  async function callWithSessionCookie(userId: string) {
    const res = await request(app).get("/api/auth/session").set("Cookie", `sani-session=gueltig:${userId}`);
    return { status: res.status, body: res.body };
  }

  it("sperrt eine beliebige geschuetzte Route, solange der Name nicht bestaetigt ist", async () => {
    const user = makeUser();
    fakeUsers[user.id] = user;

    const result = await call("GET", `/api/users/${user.id}`, tokenFor(user));

    expect(result.status).toBe(403);
    expect(result.body.code).toBe("PROFILE_NOT_CONFIRMED");
  });

  it("laesst ein bestaetigtes OIDC-Konto geschuetzte Routen zu", async () => {
    const user = makeUser({ profileConfirmedAt: new Date() });
    fakeUsers[user.id] = user;

    const result = await call("GET", `/api/users/${user.id}`, tokenFor(user));

    expect(result.status).toBe(200);
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

  it("weist einen Passwortwechsel ohne Authentifizierung ab", async () => {
    const result = await request(app).post("/api/auth/password/change").send({ currentPassword: "alt", newPassword: "neu" });

    expect(result.status).toBe(401);
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

    it("verweigert die Korrektur eines Kontos aus einer anderen Schule", async () => {
      const actor = makeUser({ id: "actor-school-a", role: "admin", profileConfirmedAt: new Date(), schoolId: "school-a" });
      const target = makeUser({ id: "target-school-b", schoolId: "school-b", profileConfirmedAt: null });
      fakeUsers[actor.id] = actor;
      fakeUsers[target.id] = target;

      const result = await call("PATCH", `/api/users/${target.id}/profile`, tokenFor(actor), { firstName: "Neu", lastName: "Fremd" });

      expect(result.status).toBe(404);
      expect(fakeUsers[target.id]!.firstName).toBe("Vorschlag");
      expect(profileChangeEntries).toHaveLength(0);
    });

    it("weist das eigene Konto als Ziel ab", async () => {
      const actor = makeUser({ id: "actor-self", role: "admin", profileConfirmedAt: new Date() });
      fakeUsers[actor.id] = actor;

      const result = await call("PATCH", `/api/users/${actor.id}/profile`, tokenFor(actor), { firstName: "Neu", lastName: "Selbst" });

      expect(result.status).toBe(403);
      expect(profileChangeEntries).toHaveLength(0);
    });

    it("korrigiert nur den Namen und schreibt zwei Protokolleintraege", async () => {
      const actor = makeUser({ id: "actor-admin-name", role: "admin", profileConfirmedAt: new Date() });
      const target = makeUser({ id: "target-name", firstName: "Falsch", lastName: "Geschrieben", profileConfirmedAt: null });
      fakeUsers[actor.id] = actor;
      fakeUsers[target.id] = target;

      const result = await call("PATCH", `/api/users/${target.id}/profile`, tokenFor(actor), {
        firstName: "Richtig",
        lastName: "Korrigiert",
      });

      expect(result.status).toBe(200);
      expect(fakeUsers[target.id]!.firstName).toBe("Richtig");
      expect(fakeUsers[target.id]!.lastName).toBe("Korrigiert");
      expect(profileChangeEntries.map((e) => e.field).sort()).toEqual(["first_name", "last_name"]);
    });

    it("laesst den Zeitstempel eines bestaetigten Namens bei unveraendertem Namen stehen", async () => {
      const confirmedAt = new Date("2026-07-01T10:00:00Z");
      const actor = makeUser({ id: "actor-admin-ts", role: "admin", profileConfirmedAt: new Date() });
      const target = makeUser({ id: "target-ts", profileConfirmedAt: confirmedAt });
      fakeUsers[actor.id] = actor;
      fakeUsers[target.id] = target;

      const result = await call("PATCH", `/api/users/${target.id}/profile`, tokenFor(actor), {
        firstName: target.firstName,
        lastName: target.lastName,
      });

      expect(result.status).toBe(200);
      expect(fakeUsers[target.id]!.profileConfirmedAt).toBe(confirmedAt);
    });

    it("weist E-Mail-Korrekturen mit 400 ab", async () => {
      const actor = makeUser({ id: "actor-admin-mail", role: "admin", profileConfirmedAt: new Date() });
      const target = makeUser({ id: "target-mail" });
      fakeUsers[actor.id] = actor;
      fakeUsers[target.id] = target;

      const result = await call("PATCH", `/api/users/${target.id}/profile`, tokenFor(actor), {
        firstName: target.firstName,
        lastName: target.lastName,
        email: "neu@vitest.beispiel.invalid",
      });

      expect(result.status).toBe(400);
      expect(profileChangeEntries).toHaveLength(0);
    });
  });
});
