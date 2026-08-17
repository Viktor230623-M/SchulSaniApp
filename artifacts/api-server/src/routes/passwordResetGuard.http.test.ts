import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Express } from "express";

// Passwort-Reset nur fuer bestaetigte Adressen: Eine unbestätigte Adresse
// (frisch korrigiert, noch nicht vom Kontoinhaber bestaetigt) darf keinen
// Reset-Token ausloesen. Sonst koennte ein Verwalter die Adresse auf eine
// selbst kontrollierte aendern und ueber den Reset das Konto uebernehmen.
//
// Der Reset verschickt nur dann eine Mail, wenn der Nutzer existiert UND
// emailVerifiedAt gesetzt ist. Die Antwort bleibt in allen Faellen 202, damit
// sich nicht erraten laesst, ob eine Adresse vergeben oder bestaetigt ist.

const hier = dirname(fileURLToPath(import.meta.url));
const { sentMails } = vi.hoisted(() => ({ sentMails: { value: [] as Array<{ to: string; subject: string }> } }));

interface FakeUserRow {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  authProvider: string;
}

let fakeUsers: FakeUserRow[] = [];

vi.mock("@workspace/db", async () => {
  const { pgTable, text } = await import("drizzle-orm/pg-core");
  const usersTableMock = pgTable("users", {
    id: text("id"),
    email: text("email"),
    emailVerifiedAt: text("email_verified_at"),
    authProvider: text("auth_provider"),
  });

  function createMockTable(name: string) {
    return { [Symbol.toStringTag]: name } as any;
  }

  function params(cond: any): unknown[] {
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

  const chain: any = {
    from: () => chain,
    innerJoin: () => chain,
    where: (cond: any) => {
      const email = params(cond).find((p) => typeof p === "string" && p.includes("@"));
      fakeUsers = email !== undefined ? fakeUsers.filter((u) => u.email === email) : fakeUsers;
      return chain;
    },
    limit: () => chain,
    then: (onFulfilled: any, onRejected?: any) => Promise.resolve(fakeUsers).then(onFulfilled, onRejected),
    catch: (onRejected: any) => Promise.resolve(fakeUsers).catch(onRejected),
  };

  // Der Reset vergibt ein Auth-Token; authTokensTable muss deshalb als
  // benannter Export existieren, auch wenn der Test nichts einliest.
  const authTokensTableMock = createMockTable("auth_tokens");

  return {
    db: {
      select: () => chain,
      insert: () => ({ values: () => Promise.resolve() }),
      update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
      delete: () => ({ where: () => Promise.resolve() }),
      transaction: async (cb: (tx: any) => Promise<any>) => cb(chain),
    },
    pool: { query: () => Promise.resolve({ rows: [] }) },
    usersTable: usersTableMock,
    authTokensTable: authTokensTableMock,
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
    userRoleEnum: { enumValues: ["owner", "admin", "sanitaeter_leitung_admin", "sanitaeter_leitung", "teacher", "sanitaeter"] },
  };
});

vi.mock("express-rate-limit", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../services/mailer", () => ({
  assertMailerConfig: () => {},
  verifyMailer: async () => {},
  sendMail: async (mail: { to: string; subject: string; text: string; html: string }) => {
    sentMails.value.push({ to: mail.to, subject: mail.subject });
  },
  authLink: (path: string, token: string) => `https://sani.vitest.beispiel.invalid/${path}?token=${token}`,
}));

let app: Express;
beforeAll(async () => {
  process.env["AUTH_PROVIDERS_PATH"] = resolve(hier, "fixtures", "auth-providers.local-only.json");
  process.env["SCHOOL_ID"] = "school";
  app = (await import("../app")).default;
});

function localUser(overrides: Partial<FakeUserRow> = {}): FakeUserRow {
  return {
    id: "nutzer-lokal-1",
    email: "mmuster@vitest.beispiel.invalid",
    emailVerifiedAt: new Date("2026-08-01T10:00:00Z"),
    authProvider: "local",
    ...overrides,
  };
}

describe("Passwort-Reset -- nur fuer bestaetigte Adressen", () => {
  beforeEach(() => {
    fakeUsers = [];
    sentMails.value = [];
  });

  it("versendet einen Reset an eine bestaetigte Adresse", async () => {
    fakeUsers = [localUser()];

    const res = await request(app).post("/api/auth/local/password/forgot").send({ email: "mmuster@vitest.beispiel.invalid" });

    expect(res.status).toBe(202);
    expect(sentMails.value).toHaveLength(1);
    expect(sentMails.value[0]!.to).toBe("mmuster@vitest.beispiel.invalid");
    expect(sentMails.value[0]!.subject).toBe("Passwort zuruecksetzen");
  });

  it("versendet keinen Reset an eine unbestätigte Adresse", async () => {
    fakeUsers = [localUser({ emailVerifiedAt: null })];

    const res = await request(app).post("/api/auth/local/password/forgot").send({ email: "mmuster@vitest.beispiel.invalid" });

    expect(res.status).toBe(202);
    expect(sentMails.value).toHaveLength(0);
  });

  it("bleibt bei unbekannter Adresse gleich (202, keine Mail)", async () => {
    const res = await request(app).post("/api/auth/local/password/forgot").send({ email: "niemand@vitest.beispiel.invalid" });

    expect(res.status).toBe(202);
    expect(sentMails.value).toHaveLength(0);
  });
});
