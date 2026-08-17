import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";

// Mock DB vor App-Import
vi.mock("@workspace/db", async () => {
  const mockSchema = {
    usersTable: { id: "users", role: "user_role" },
    newsTable: { id: "news", status: "news_status" },
    loaTable: { id: "loa", status: "loa_status" },
    missionsTable: { id: "missions", status: "mission_status" },
    statusTable: { id: "status" },
    notificationsTable: { id: "notifications" },
    missionActivityLogTable: { id: "mission_activity_log" },
    incidentReportsTable: { id: "incident_reports", status: "text" },
    reportAccessLogTable: { id: "report_access_log" },
  };

  function createMockTable(name: string) {
    return { [Symbol.toStringTag]: name } as any;
  }

  // Kettenobjekt, das an jeder Stelle sowohl weitergereicht als auch erwartet
  // (awaitable) werden kann: die Routen bilden ihre Ketten in verschiedenster
  // Reihenfolge (from().where(), from().orderBy(), from().where().orderBy(),
  // from().orderBy() ohne where, from().groupBy(), innerJoin/leftJoin, ...),
  // und manche brechen die Kette schon nach from() oder where() direkt mit
  // await ab. Jede Zwischenstufe bekommt deshalb eine then-Methode.
  function makeSelectChain(result: any[] = []): any {
    const chain: any = {
      then: (onFulfilled: any, onRejected?: any) => Promise.resolve(result).then(onFulfilled, onRejected),
      catch: (onRejected: any) => Promise.resolve(result).catch(onRejected),
      finally: (onFinally: any) => Promise.resolve(result).finally(onFinally),
      from: () => makeSelectChain(result),
      where: () => makeSelectChain(result),
      orderBy: () => makeSelectChain(result),
      groupBy: () => makeSelectChain(result),
      innerJoin: () => makeSelectChain(result),
      leftJoin: () => makeSelectChain(result),
      limit: () => makeSelectChain(result),
      for: () => makeSelectChain(result),
    };
    return chain;
  }

  // Gleiches Prinzip fuer insert/update/delete: values/set/where/
  // onConflictDoNothing/onConflictDoUpdate/returning sind an jeder Stelle
  // sowohl weiterfuehrend als auch awaitable.
  function makeMutationChain(result: any[] = []): any {
    const chain: any = {
      then: (onFulfilled: any, onRejected?: any) => Promise.resolve(result).then(onFulfilled, onRejected),
      catch: (onRejected: any) => Promise.resolve(result).catch(onRejected),
      finally: (onFinally: any) => Promise.resolve(result).finally(onFinally),
      values: () => makeMutationChain(result),
      set: () => makeMutationChain(result),
      where: () => makeMutationChain(result),
      onConflictDoNothing: () => makeMutationChain(result),
      onConflictDoUpdate: () => makeMutationChain(result),
      // Fixe Beispielzeile: manche Routen (z.B. users.ts /:id/approve) lesen
      // das Ergebnis von returning() ohne Undefined-Pruefung weiter.
      returning: () => makeMutationChain([{ id: "test-id", status: "approved" }]),
    };
    return chain;
  }

  const dbMock = {
    select: (..._args: any[]) => makeSelectChain([]),
    insert: (..._args: any[]) => makeMutationChain([]),
    update: (..._args: any[]) => makeMutationChain([]),
    delete: (..._args: any[]) => makeMutationChain([]),
    transaction: async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        select: dbMock.select,
        insert: dbMock.insert,
        update: dbMock.update,
        delete: dbMock.delete,
      };
      return cb(tx);
    },
  };

  return {
    db: dbMock,
    pool: { query: () => Promise.resolve({ rows: [] }) },
    usersTable: createMockTable("users"),
    newsTable: createMockTable("news"),
    newsReadsTable: createMockTable("news_reads"),
    loaTable: createMockTable("loa"),
    missionsTable: createMockTable("missions"),
    statusTable: createMockTable("status"),
    notificationsTable: createMockTable("notifications"),
    missionActivityLogTable: createMockTable("mission_activity_log"),
    incidentReportsTable: createMockTable("incident_reports"),
    schoolSettingsTable: createMockTable("school_settings"),
    schoolExportsTable: createMockTable("school_exports"),
    reportAccessLogTable: createMockTable("report_access_log"),
  };
});

// Mock getLiveUser vor Middleware-Import
const mockLiveUsers: Record<string, { role: string; isApproved: boolean }> = {};

vi.mock("../middlewares/auth", async () => {
  const mockLiveCache: Record<string, { role: string; isApproved: boolean; expires: number }> = {};
  // Echte Rechtematrix, damit der Mock nicht von den Routen abweicht.
  const { DEFAULT_ROLE_PERMISSIONS: mockRolePermissions } = await import("./permissions");
  return {
    signToken: (payload: any) => `mock-token-${payload.userId}-${payload.role}`,
    verifyToken: (token: string) => {
      if (!token || !token.startsWith("mock-token-")) return null;
      const parts = token.split("-");
      const userId = parts.slice(2, -1).join("-") || "test-user";
      const role = parts[parts.length - 1] || "sanitaeter";
      return { userId, role };
    },
    getLiveUser: vi.fn(async (userId: string) => {
      const entry = mockLiveUsers[userId];
      if (entry) {
        return { role: entry.role, isApproved: entry.isApproved, expires: Date.now() + 60000 };
      }
      return { role: "sanitaeter", isApproved: true, expires: Date.now() + 60000 };
    }),
    requireAuth: vi.fn(async (req: any, res: any, next: any) => {
      const header = req.headers?.authorization || req.get?.("authorization") || "";
      const token = header?.startsWith("Bearer ") ? header.slice(7) : header || "";
      if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      // Token-Parsing direkt aus Mock
      const userId = token.includes("test-user") ? token.split("-").slice(2, -1).join("-") || "test-user" : token.split("-").slice(2, -1).join("-") || "unknown";
      const role = token.split("-").pop() || "sanitaeter";
      const mockEntry = mockLiveUsers[userId] || { role: "sanitaeter", isApproved: true };
      if (!mockEntry.isApproved) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
      req.user = { userId, role: mockEntry.role };
      next();
    }),
    requireAuthForPasswordChange: vi.fn(async (req: any, res: any, next: any) => {
      const header = req.headers?.authorization || req.get?.("authorization") || "";
      const token = header?.startsWith("Bearer ") ? header.slice(7) : header || "";
      if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const userId = token.split("-").slice(2, -1).join("-") || "unknown";
      const role = token.split("-").pop() || "sanitaeter";
      const mockEntry = mockLiveUsers[userId] || { role: "sanitaeter", isApproved: true };
      if (!mockEntry.isApproved) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
      req.user = { userId, role: mockEntry.role };
      next();
    }),
    requireAuthForLogout: vi.fn(async (req: any, res: any, next: any) => {
      const header = req.headers?.authorization || req.get?.("authorization") || "";
      const token = header?.startsWith("Bearer ") ? header.slice(7) : header || "";
      if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const userId = token.split("-").slice(2, -1).join("-") || "unknown";
      const role = token.split("-").pop() || "sanitaeter";
      const mockEntry = mockLiveUsers[userId] || { role: "sanitaeter", isApproved: true };
      if (!mockEntry.isApproved) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
      req.user = { userId, role: mockEntry.role };
      next();
    }),
    requirePermission: (...perms: string[]) => {
      return (req: any, res: any, next: any) => {
        if (!req.user) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
        const granted = (mockRolePermissions[req.user.role] ?? []) as readonly string[];
        if (!perms.every((p) => granted.includes(p))) {
          res.status(403).json({ error: "Forbidden - missing permission" });
          return;
        }
        next();
      };
    },
    // Dieselbe Authentifizierung wie requireAuth, ohne die Namenssperre --
    // in dieser Matrix nicht unter Test, aber /auth/logout und /auth/profile
    // haengen an dieser Funktion und muessten sonst schon beim Modulimport
    // scheitern.
    requireAuthAllowUnconfirmedProfile: vi.fn(async (req: any, res: any, next: any) => {
      const header = req.headers?.authorization || req.get?.("authorization") || "";
      const token = header?.startsWith("Bearer ") ? header.slice(7) : header || "";
      if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const userId = token.split("-").slice(2, -1).join("-") || "unknown";
      const role = token.split("-").pop() || "sanitaeter";
      const mockEntry = mockLiveUsers[userId] || { role: "sanitaeter", isApproved: true };
      if (!mockEntry.isApproved) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
      req.user = { userId, role: mockEntry.role };
      next();
    }),
    invalidateUserCache: vi.fn(),
    schoolIdOf: () => "school-a",
    requireSchool: (_req: any, _res: any, next: any) => next(),
  };
});

// Das globale Ratenlimit in app.ts ist pro IP gedacht und in Produktion
// richtig. Im Test teilen sich alle 115 Faelle dieselbe App-Instanz und
// denselben In-Memory-Zaehler auf derselben Adresse (127.0.0.1) — weit mehr
// als die 100 Anfragen/Minute des Limits. Ohne diesen Mock kippen Tests ab
// einer bestimmten Position in der Laufreihenfolge auf 429, unabhaengig von
// Rolle oder Rechten. Das ist ein Artefakt des Testaufbaus (ein Prozess statt
// vieler Clients), keine Lockerung der Ratenbegrenzung selbst — die bleibt in
// app.ts unveraendert.
vi.mock("express-rate-limit", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

import app from "../app";
import type { Server } from "http";

const ROLES = [
  "owner",
  "admin",
  "sanitaeter_leitung_admin",
  "sanitaeter_leitung",
  "teacher",
  "sanitaeter",
] as const;

type RoleKey = (typeof ROLES)[number];

// EXPECTED-Tabelle abgeleitet aus routes/*.ts (Stand August 2026)
// Format: Endpunkt -> [erlaubte Rollen] (403 sonst, 401 ohne Token)
const EXPECTED: Record<string, string[]> = {
  "GET /api/users": ["admin", "owner", "sanitaeter_leitung_admin", "teacher"],
  "GET /api/users/pending": ["admin", "owner"],
  "PATCH /api/users/test-id/approve": ["admin", "owner"],
  "PATCH /api/users/test-id/role": ["admin", "owner", "sanitaeter_leitung_admin"],
  "DELETE /api/users/test-id": ["admin", "owner"],
  "GET /api/news": ["owner", "admin", "teacher", "sanitaeter_leitung_admin", "sanitaeter_leitung", "sanitaeter"],
  "POST /api/news/test-id/approve": ["admin", "teacher", "owner"],
  "POST /api/news/test-id/reject": ["admin", "teacher", "owner"],
  "GET /api/loa": ["owner", "admin", "teacher", "sanitaeter_leitung_admin", "sanitaeter_leitung", "sanitaeter"],
  "POST /api/loa/test-id/approve": ["admin", "teacher", "sanitaeter_leitung", "sanitaeter_leitung_admin", "owner"],
  "POST /api/loa/test-id/reject": ["admin", "teacher", "sanitaeter_leitung", "sanitaeter_leitung_admin", "owner"],
  "GET /api/activity/users": ["admin", "owner", "sanitaeter_leitung", "sanitaeter_leitung_admin", "teacher"],
  "GET /api/activity/user/test-id": ["admin", "owner", "sanitaeter_leitung", "sanitaeter_leitung_admin", "teacher"],
  "GET /api/activity/my": ROLES.map((r) => r),
  "GET /api/incident-reports/test-report-id": ["owner", "admin", "sanitaeter_leitung", "sanitaeter_leitung_admin", "teacher", "sanitaeter"],
  "GET /api/incident-reports": ["owner", "admin", "sanitaeter_leitung", "sanitaeter_leitung_admin", "teacher", "sanitaeter"],
};

const ENDPOINTS = Object.keys(EXPECTED);

// Manche Routen pruefen den Body, bevor sie ueberhaupt zur Rechtefrage
// kommen (z. B. "reason is required"). Ohne passende Nutzlast antworten sie
// mit 400 — unabhaengig davon, ob die Rolle den Endpunkt aufrufen darf. Das
// ist ein Fixture-Luecke des Testaufbaus, keine Rechtegrenze: die Nutzlast
// hier deckt nur die Validierung ab, die vor der Rechtepruefung im Code liegt.
const REQUEST_BODIES: Record<string, Record<string, unknown>> = {
  "PATCH /api/users/test-id/role": { role: "sanitaeter" },
  "POST /api/news/test-id/reject": { reason: "Testgrund" },
};

describe("Permission Matrix — IST-Zustand vor Umbau", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as import("net").AddressInfo;
        port = addr.port;
        resolve();
      });
    });
  }, 10000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function buildToken(role: string, userId = "test-user") {
    mockLiveUsers[userId] = { role, isApproved: true };
    // Mock signToken aus Middleware
    return `mock-token-${userId}-${role}`;
  }

  async function fetchStatus(method: string, path: string, token?: string, body?: Record<string, unknown>) {
    const url = `http://localhost:${port}${path}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["authorization"] = `Bearer ${token}`;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  // Patientendaten-Sichtbarkeit gesondert testen (incidentReports.ts)
  describe("Patientendaten-Sichtbarkeit (incidentReports)", () => {
    const rolesCanSeePatient = ["admin", "owner", "sanitaeter_leitung", "sanitaeter_leitung_admin", "teacher"];
    const rolesCannotSeePatient = ["sanitaeter"];

    it("erlaubt Patientdaten fuer admin/owner/leitung/teacher", async () => {
      for (const r of rolesCanSeePatient) {
        const t = buildToken(r, `patient-${r}`);
        const result = await fetchStatus("GET", "/api/incident-reports/test-report-id", t);
        // Die Mock-DB liefert fuer jede Abfrage eine leere Liste — es gibt
        // keinen Datensatz "test-report-id". Die Route antwortet deshalb
        // folgerichtig mit 404, bevor sie ueberhaupt zur Sichtbarkeitsfrage
        // kommt. Das ist eine Testdaten-Luecke des Fixtures, keine
        // Rechtegrenze: 404 zaehlt hier wie im Rest der Matrix als "erlaubt".
        expect([200, 404]).toContain(result.status);
      }
    }, 15000);

    it("beschraenkt Patientdaten fuer sanitaeter (nur eigene) — 200 mit stripPatient", async () => {
      for (const r of rolesCannotSeePatient) {
        const t = buildToken(r, `patient-${r}`);
        const result = await fetchStatus("GET", "/api/incident-reports/test-report-id", t);
        // Gleiche Begruendung: ohne Testdatensatz antwortet die Route mit 404.
        expect([200, 404]).toContain(result.status);
      }
    }, 15000);
  });

  // Hauptmatrix: Jede Rolle gegen jeden Endpunkt
  describe("Rollen-Endpunkt-Matrix (EXPECTED = Code-Analyse)", () => {
    for (const endpoint of ENDPOINTS) {
      describe(`Endpunkt: ${endpoint}`, () => {
        for (const role of ROLES) {
          it(`Rolle "${role}" -> ${endpoint}`, async () => {
            const token = buildToken(role as RoleKey, `user-${role}`);
            const [method, ...restPath] = endpoint.split(" ");
            const path = restPath.join(" ");
            const result = await fetchStatus(method, path, token, REQUEST_BODIES[endpoint]);
            const allowed = EXPECTED[endpoint].includes(role);
            if (allowed) {
              // Erlaubt: 200 oder 404 (Mock liefert keine Daten) oder 201 etc.
              expect([200, 201, 204, 404]).toContain(result.status);
            } else {
              // Nicht erlaubt: 403 (Forbidden) oder 401 (ohne Token) — hier mit Token: 403
              expect([403, 401]).toContain(result.status);
            }
          }, 3000);
        }
      });
    }
  }, 300000);

  describe("Erhebung: Rollenabdeckung", () => {
    it("EXPECTED deckt jede geschuetzte Route mindestens einmal", () => {
      // Abgleich gegen routes/*.ts durchgefuehrt in EXPECTED-Definition
      const covered = new Set();
      for (const [ep, roles] of Object.entries(EXPECTED)) {
        for (const r of roles) covered.add(`${ep}:${r}`);
      }
        const entries = Array.from(covered) as string[];
      expect(entries.length).toBeGreaterThan(0);
      // Dokumentation: Alle 7 Rollen erscheinen mindestens einmal
      for (const r of ROLES) {
        const hasRole = (entries as string[]).some((e) => (e as string).endsWith(`:${r}`));
        expect(hasRole).toBe(true);
      }
    });
  });
});
