import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Express } from "express";

const hier = dirname(fileURLToPath(import.meta.url));
const { activeUserId } = vi.hoisted(() => ({ activeUserId: { value: "nutzer-local-1" } }));

interface FakeUserRow {
  id: string;
  role: string;
  isApproved: boolean;
  schoolId: string | null;
  profileConfirmedAt: Date | null;
  mustChangePassword: boolean;
  oneTimePasswordExpiresAt: Date | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  username: string | null;
  passwordVersion: number;
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
    passwordHash: text("password_hash"),
    authProvider: text("auth_provider"),
    externalSubject: text("external_subject"),
    emailVerifiedAt: text("email_verified_at"),
    username: text("username"),
    passwordVersion: text("password_version"),
    mustChangePassword: text("must_change_password"),
    oneTimePasswordExpiresAt: text("one_time_password_expires_at"),
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

  const authTokensTableMock = pgTable("auth_tokens", {
    id: text("id"),
    userId: text("user_id"),
    kind: text("kind"),
    tokenHash: text("token_hash"),
    expiresAt: text("expires_at"),
    usedAt: text("used_at"),
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
    authTokensTable: authTokensTableMock,
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

// createSession/resolveSession greifen auf eine echte Datenbank zu; der
// Formular-Login nutzt sie hier nie (kein rememberMe), aber die Routen
// importieren das Modul.
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
      const userId = token.startsWith("user:") ? token.slice(5) : "nutzer-local-1";
      activeUserId.value = userId;
      req.user = { userId, role: "sanitaeter", permissions: [] };
      next();
    },
  };
});

// Die Anmeldewege werden beim Import aus AUTH_PROVIDERS_PATH geladen. Die
// Fixture hat nur lokale und OIDC-Wege -- laedt die App, beweist das schon:
// ein Start ohne IServ bricht nicht mehr ab.
let app: Express;
beforeAll(async () => {
  process.env["AUTH_PROVIDERS_PATH"] = resolve(hier, "fixtures", "auth-providers.local-only.json");
  process.env["SCHOOL_ID"] = "school";
  app = (await import("../app")).default;
});

// Niedrige Kostenstufe nur fuer den Fixture-Hash; der Adapter vergleicht mit
// derselben Funktion, egal mit welcher Kostenstufe der Hash erzeugt wurde.
const existingUserHash = bcrypt.hashSync("das-richtige-passwort", 4);

function localUser(overrides: Partial<FakeUserRow> = {}): FakeUserRow {
  return {
    id: "nutzer-local-1",
    role: "sanitaeter",
    isApproved: true,
    schoolId: "school",
    profileConfirmedAt: null,
    mustChangePassword: false,
    oneTimePasswordExpiresAt: null,
    firstName: "Max",
    lastName: "Muster",
    email: "mmuster@vitest.beispiel.invalid",
    emailVerifiedAt: new Date(),
    username: null,
    passwordVersion: 0,
    passwordHash: existingUserHash,
    authProvider: "local",
    externalSubject: "mmuster",
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    lastUsedAt: new Date("2026-08-07T10:00:00.000Z"),
    ...overrides,
  };
}

async function postLogin(body: Record<string, unknown>) {
  const res = await request(app).post("/api/auth/login").send(body);
  return { status: res.status, body: res.body };
}

describe("Anbieterbewusster Formular-Login", () => {
  beforeEach(() => {
    fakeUsers = [];
    fakeIdentities = [];
  });

  it("startet ohne iserv-form und listet die konfigurierten Wege", async () => {
    const res = await request(app).get("/api/auth/providers");

    expect(res.status).toBe(200);
    expect(res.body.providers.map((p: { key: string }) => p.key).sort()).toEqual(["local", "oidc-beispiel"]);
  });

  it("listet nur die Identitäten des angemeldeten Kontos", async () => {
    fakeUsers = [localUser()];
    fakeIdentities = [
      {
        id: "primary-nutzer-local-1",
        userId: "nutzer-local-1",
        authProvider: "local",
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
        lastUsedAt: new Date("2026-08-07T10:00:00.000Z"),
      },
      {
        id: "fremde-identitaet",
        userId: "anderes-konto",
        authProvider: "local",
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
        lastUsedAt: null,
      },
    ];

    const res = await request(app)
      .get("/api/auth/identities")
      .set("authorization", "Bearer user:nutzer-local-1");

    expect(res.status).toBe(200);
    expect(res.body.identities).toEqual([
      expect.objectContaining({
        id: "primary-nutzer-local-1",
        providerKey: "local",
        displayName: "Schul-Konto",
        type: "local",
      }),
    ]);
  });

  it("verweigert die Identitätenliste ohne Bearer-Token", async () => {
    const res = await request(app).get("/api/auth/identities");

    expect(res.status).toBe(401);
  });

  it("meldet ein lokales Konto ueber den providerKey an", async () => {
    fakeUsers = [localUser()];

    const result = await postLogin({ providerKey: "local", username: "mmuster", password: "das-richtige-passwort" });

    expect(result.status).toBe(200);
    expect(result.body.token).toBeTruthy();
    expect(result.body.user.id).toBe("nutzer-local-1");
    expect(result.body.user.profileConfirmedAt).toBeNull();
    expect(result.body.user.mustChangePassword).toBe(false);
  });

  it("lehnt ein falsches Passwort mit der generischen Meldung ab", async () => {
    fakeUsers = [localUser()];

    const result = await postLogin({ providerKey: "local", username: "mmuster", password: "falsch" });

    expect(result.status).toBe(401);
    expect(result.body.error).toBe("Ungültige Zugangsdaten");
  });

  it("sperrt ein Konto, das noch auf Freischaltung wartet", async () => {
    fakeUsers = [localUser({ isApproved: false })];

    const result = await postLogin({ providerKey: "local", username: "mmuster", password: "das-richtige-passwort" });

    expect(result.status).toBe(403);
  });

  it("weist einen unbekannten Anbieter mit 404 ab", async () => {
    fakeUsers = [localUser()];

    const result = await postLogin({ providerKey: "gibtsnicht", username: "mmuster", password: "das-richtige-passwort" });

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
