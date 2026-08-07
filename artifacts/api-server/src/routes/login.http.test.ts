import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Express } from "express";

const hier = dirname(fileURLToPath(import.meta.url));
const { activeUserId } = vi.hoisted(() => ({ activeUserId: { value: "nutzer-oidc-1" } }));

interface FakeUserRow {
  id: string;
  role: string;
  isApproved: boolean;
  schoolId: string | null;
  profileConfirmedAt: Date | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  emailVerifiedAt: Date | null;
  username: string | null;
  authProvider: string;
  externalSubject: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

interface FakeIdentityRow {
  id: string;
  userId: string;
  authProvider: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

let fakeUsers: FakeUserRow[] = [];
let fakeIdentities: FakeIdentityRow[] = [];

vi.mock("@workspace/db", async () => {
  // Der Login liest und schreibt Nutzerzeilen, und die Suche filtert echt
  // ueber Drizzle-Spalten -- usersTable braucht deshalb echte Spalten, keine
  // Symbol-Attrappen. Alle anderen Tabellen muessen nur als benannte Exporte
  // existieren, damit der Importgraph von ../app steht.
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
    authProvider: text("auth_provider"),
    externalSubject: text("external_subject"),
    emailVerifiedAt: text("email_verified_at"),
    username: text("username"),
  });

  const userIdentitiesTableMock = pgTable("user_identities", {
    id: text("id"),
    userId: text("user_id"),
    schoolId: text("school_id"),
    authProvider: text("auth_provider"),
    externalSubject: text("external_subject"),
    emailAtLink: text("email_at_link"),
    createdAt: text("created_at"),
    lastUsedAt: text("last_used_at"),
  });

  function createMockTable(name: string) {
    return { [Symbol.toStringTag]: name } as any;
  }

  function makeSelectChain(projection: any): any {
    let source: "users" | "identities" | "other" = "other";
    const chain: any = {
      from: (t: any) => {
        source = t === userIdentitiesTableMock ? "identities" : t === usersTableMock ? "users" : "other";
        return chain;
      },
      innerJoin: () => chain,
      where: () => chain,
      limit: () => chain,
      then: (onFulfilled: any, onRejected?: any) =>
        Promise.resolve(source === "identities" && projection?.providerKey ? fakeIdentities.filter((identity) => identity.userId === activeUserId.value).map((identity) => ({ ...identity, providerKey: identity.authProvider })) : source === "users" || source === "identities" ? fakeUsers.map((user) => ({
          ...user,
          identityId: `primary-${user.id}`,
          providerKey: user.authProvider,
          createdAt: user.createdAt,
          lastUsedAt: user.lastUsedAt,
          user,
          identity: { externalSubject: user.externalSubject },
        })) : []).then(onFulfilled, onRejected),
      catch: (onRejected: any) =>
        Promise.resolve(source === "identities" && projection?.providerKey ? fakeIdentities.filter((identity) => identity.userId === activeUserId.value).map((identity) => ({ ...identity, providerKey: identity.authProvider })) : source === "users" || source === "identities" ? fakeUsers.map((user) => ({
          ...user,
          identityId: `primary-${user.id}`,
          providerKey: user.authProvider,
          createdAt: user.createdAt,
          lastUsedAt: user.lastUsedAt,
          user,
          identity: { externalSubject: user.externalSubject },
        })) : []).catch(onRejected),
    };
    return chain;
  }

  const dbMock: any = {
    select: (projection: any) => makeSelectChain(projection),
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => Promise.resolve(), onConflictDoNothing: () => Promise.resolve() }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
    delete: () => ({ where: () => Promise.resolve() }),
    transaction: async (cb: (tx: any) => Promise<any>) => cb(dbMock),
  };

  return {
    db: dbMock,
    pool: { query: () => Promise.resolve({ rows: [] }) },
    usersTable: usersTableMock,
    userIdentitiesTable: userIdentitiesTableMock,
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

// Die Auth-Routen importieren Sitzungsfunktionen; der Test braucht nur
// einen deterministischen, nicht persistenten Ersatz.
vi.mock("../lib/sessions", () => ({
  resolveSession: async () => null,
  createSession: async () => "irrelevant",
  revokeSession: async () => {},
  revokeAllSessionsForUser: async () => {},
}));

vi.mock("express-rate-limit", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../middlewares/auth", async () => {
  const actual = await vi.importActual<typeof import("../middlewares/auth")>("../middlewares/auth");
  return {
    ...actual,
    requireAuth: (req: any, res: any, next: any) => {
      const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
      if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const userId = token.startsWith("user:") ? token.slice(5) : "nutzer-oidc-1";
      activeUserId.value = userId;
      req.user = { userId, role: "sanitaeter", permissions: [] };
      next();
    },
  };
});

// Die App wird mit einem OIDC-only Anbieter geladen.
let app: Express;
beforeAll(async () => {
  process.env["AUTH_PROVIDERS_PATH"] = resolve(hier, "fixtures", "auth-providers.oidc-only.json");
  process.env["SCHOOL_ID"] = "school";
  app = (await import("../app")).default;
});

function oidcUser(overrides: Partial<FakeUserRow> = {}): FakeUserRow {
  return {
    id: "nutzer-oidc-1",
    role: "sanitaeter",
    isApproved: true,
    schoolId: "school",
    profileConfirmedAt: null,
    firstName: "Max",
    lastName: "Muster",
    email: "mmuster@vitest.beispiel.invalid",
    emailVerifiedAt: new Date(),
    username: null,
    authProvider: "oidc-beispiel",
    externalSubject: "oidc-subjekt",
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    lastUsedAt: new Date("2026-08-07T10:00:00.000Z"),
    ...overrides,
  };
}

async function postLogin(body: Record<string, unknown>) {
  const res = await request(app).post("/api/auth/login").send(body);
  return { status: res.status, body: res.body };
}

describe("OIDC-only Authentifizierung", () => {
  beforeEach(() => {
    fakeUsers = [];
    fakeIdentities = [];
  });

  it("listet den aktivierten OIDC-Anmeldeweg", async () => {
    const res = await request(app).get("/api/auth/providers");

    expect(res.status).toBe(200);
    expect(res.body.providers).toEqual([
      { key: "oidc-beispiel", displayName: "Schul-Login (OIDC)", type: "oidc-redirect" },
    ]);
  });

  it("listet nur die Identitaeten des angemeldeten Kontos", async () => {
    fakeUsers = [oidcUser()];
    fakeIdentities = [
      {
        id: "primary-nutzer-oidc-1",
        userId: "nutzer-oidc-1",
        authProvider: "oidc-beispiel",
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
        lastUsedAt: new Date("2026-08-07T10:00:00.000Z"),
      },
      {
        id: "fremde-identitaet",
        userId: "anderes-konto",
        authProvider: "oidc-beispiel",
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
        lastUsedAt: null,
      },
    ];

    const res = await request(app)
      .get("/api/auth/identities")
      .set("authorization", "Bearer user:nutzer-oidc-1");

    expect(res.status).toBe(200);
    expect(res.body.identities).toEqual([
      expect.objectContaining({
        id: "primary-nutzer-oidc-1",
        providerKey: "oidc-beispiel",
        displayName: "Schul-Login (OIDC)",
        type: "oidc-redirect",
      }),
    ]);
  });

  it("verweigert die Identitätenliste ohne Bearer-Token", async () => {
    const res = await request(app).get("/api/auth/identities");

    expect(res.status).toBe(401);
  });

  it("weist den entfernten Formular-Login mit 404 ab", async () => {
    const result = await postLogin({ providerKey: "entfernter-formularweg", username: "mmuster", password: "nicht-verarbeiten" });

    expect(result.status).toBe(404);
    expect(result.body.error).toBe("Anmeldeweg nicht gefunden.");
  });

  it("weist einen unbekannten Anbieter mit 404 ab", async () => {
    const result = await postLogin({ providerKey: "gibtsnicht", username: "mmuster", password: "nicht-verarbeiten" });

    expect(result.status).toBe(404);
    expect(result.body.error).toBe("Anmeldeweg nicht gefunden.");
  });

  it("weist einen Weiterleitungsweg im Formular-Login mit 404 ab", async () => {
    const result = await postLogin({ providerKey: "oidc-beispiel", username: "mmuster", password: "egal" });

    expect(result.status).toBe(404);
    expect(result.body.error).toBe("Anmeldeweg nicht gefunden.");
  });

  it("weist einen Login ohne providerKey mit 404 ab", async () => {
    const result = await postLogin({ username: "mmuster", password: "egal" });

    expect(result.status).toBe(404);
  });

  it("verweigert das Verknuepfen ohne frisches Bearer-Token", async () => {
    const res = await request(app)
      .post("/api/auth/link/oidc-beispiel/start")
      .send({ returnTo: "https://sani.vitest.beispiel.invalid/settings" });

    expect(res.status).toBe(401);
  });
});
