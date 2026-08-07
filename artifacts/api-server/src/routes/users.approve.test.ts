import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";

// Testzeilen je Nutzer-ID, von den Mock-Handlern unten gelesen und
// geschrieben. Simuliert genau die Felder, die die Route aus der
// Datenbank erwartet.
interface FakeUserRow {
  id: string;
  role: string;
  isApproved: boolean;
  approvedBy: string | null;
  updatedAt: Date | null;
}

let fakeUsers: Record<string, FakeUserRow> = {};

vi.mock("@workspace/db", async () => {
  function makeSelectChain(getResult: () => any[]): any {
    const chain: any = {
      then: (onFulfilled: any, onRejected?: any) => Promise.resolve(getResult()).then(onFulfilled, onRejected),
      catch: (onRejected: any) => Promise.resolve(getResult()).catch(onRejected),
      finally: (onFinally: any) => Promise.resolve(getResult()).finally(onFinally),
      from: () => chain,
      where: () => chain,
      limit: () => chain,
    };
    return chain;
  }

  // Die Route liest die Ziel-ID nur aus req.params, nicht aus dem
  // Drizzle-Filter -- das Test-Double braucht die ID deshalb aus einem
  // aussenliegenden Zustand, den fetchStatus() vor jedem Aufruf setzt.
  let currentTargetId = "";

  function makeMutationChain(): any {
    const chain: any = {
      values: () => chain,
      set: (patch: Record<string, unknown>) => {
        chain.__patch = patch;
        return chain;
      },
      where: () => chain,
      returning: () => {
        const existing = fakeUsers[currentTargetId];
        if (!existing) return Promise.resolve([]);
        const updated: FakeUserRow = { ...existing, ...(chain.__patch ?? {}) };
        fakeUsers[currentTargetId] = updated;
        return Promise.resolve([updated]);
      },
    };
    return chain;
  }

  const dbMock = {
    select: () => makeSelectChain(() => (currentTargetId && fakeUsers[currentTargetId] ? [fakeUsers[currentTargetId]] : [])),
    update: () => makeMutationChain(),
    insert: () => makeMutationChain(),
    delete: () => makeMutationChain(),
    transaction: async (cb: (tx: any) => Promise<any>) => cb(dbMock),
    __setCurrentTargetId: (id: string) => { currentTargetId = id; },
  };

  function createMockTable(name: string) {
    return { [Symbol.toStringTag]: name } as any;
  }

  // Andere Router haengen ueber routes/index.ts mit im Importgraph von
  // ../app, auch wenn ihre Endpunkte in diesem Test nie aufgerufen werden.
  // Ohne diese Platzhalter wuerde schon der Modulimport an fehlenden
  // benannten Exporten scheitern.
  return {
    db: dbMock,
    pool: { query: () => Promise.resolve({ rows: [] }) },
    usersTable: createMockTable("users"),
    userIdentitiesTable: createMockTable("user_identities"),
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

// Wird gebraucht, weil users.ts es importiert -- fuer /approve selbst ohne
// Bedeutung (kein Aufruf), aber ohne Mock schlaegt der Modulimport fehl.
vi.mock("../lib/rolePermissions", () => ({
  assertAdminReachable: vi.fn(async () => {}),
  LockoutError: class LockoutError extends Error {},
}));

vi.mock("../lib/roleChangeLog", () => ({
  logRoleChangeTx: vi.fn(async () => {}),
}));

// Testnutzer je ID: Rolle und Berechtigungen frei waehlbar, unabhaengig von
// DEFAULT_ROLE_PERMISSIONS -- Berechtigungen sind pro Schule in der
// Datenbank konfigurierbar, ein Test muss also auch Kombinationen abbilden
// koennen, die der mitgelieferte Katalog aktuell nicht vergibt.
let actors: Record<string, { role: string; permissions: string[] }> = {};

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
      req.user = { userId, role: actor.role, permissions: actor.permissions };
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

vi.mock("express-rate-limit", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

import app from "../app";
import type { Server } from "http";
import { db } from "@workspace/db";

describe("PATCH /api/users/:id/approve -- Rollenwechsel beim Freischalten", () => {
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
    actors = {};
  });

  async function approve(actorToken: string, targetId: string, body: Record<string, unknown>) {
    (db as any).__setCurrentTargetId(targetId);
    const res = await fetch(`http://localhost:${port}/api/users/${targetId}/approve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${actorToken}` },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  it("verweigert die Selbst-Freischaltung mit Rollenwechsel ueber den eigenen Rang hinaus", async () => {
    // sanitaeter_leitung_admin darf laut allowedTargetRoles() "admin"
    // vergeben (Rang ueber der eigenen Rolle) und canModifyTarget() erlaubt
    // sich selbst als Ziel. /role sperrt das eigene Konto als Ziel explizit,
    // /approve tat das vor der Korrektur nicht -- derselbe Nutzer konnte sich
    // ueber den Freischalt-Weg auf admin befoerdern.
    const actorId = "actor-self";
    actors[actorId] = { role: "sanitaeter_leitung_admin", permissions: ["users.approve", "users.assign_role"] };
    fakeUsers[actorId] = { id: actorId, role: "sanitaeter_leitung_admin", isApproved: true, approvedBy: null, updatedAt: null };

    const result = await approve(actorId, actorId, { role: "admin" });

    expect(result.status).toBe(403);
    expect(fakeUsers[actorId]!.role).toBe("sanitaeter_leitung_admin");
  });

  it("verweigert den Rollenwechsel ohne users.assign_role, auch mit users.approve", async () => {
    // /role verlangt fuer denselben Vorgang (Rolle setzen) die Berechtigung
    // users.assign_role. /approve pruefte vor der Korrektur nur
    // users.approve auf Routenebene und liess jede nach allowedTargetRoles
    // erlaubte Rolle durch -- eine Schule, die "users.approve" ohne
    // "users.assign_role" vergibt (Registrierung freigeben, aber keine
    // Rollen zuweisen duerfen), war davon nicht geschuetzt.
    const actorId = "actor-approve-only";
    actors[actorId] = { role: "admin", permissions: ["users.approve"] };
    const targetId = "target-pending";
    fakeUsers[targetId] = { id: targetId, role: "sanitaeter", isApproved: false, approvedBy: null, updatedAt: null };

    const result = await approve(actorId, targetId, { role: "sanitaeter_leitung" });

    expect(result.status).toBe(403);
    expect(fakeUsers[targetId]!.role).toBe("sanitaeter");
  });

  it("erlaubt weiterhin die einfache Freischaltung ohne Rollenwechsel", async () => {
    const actorId = "actor-approve-plain";
    actors[actorId] = { role: "admin", permissions: ["users.approve"] };
    const targetId = "target-pending-2";
    fakeUsers[targetId] = { id: targetId, role: "sanitaeter", isApproved: false, approvedBy: null, updatedAt: null };

    const result = await approve(actorId, targetId, {});

    expect(result.status).toBe(200);
    expect(fakeUsers[targetId]!.isApproved).toBe(true);
    expect(fakeUsers[targetId]!.role).toBe("sanitaeter");
  });

  it("erlaubt den Rollenwechsel weiterhin mit beiden Berechtigungen", async () => {
    const actorId = "actor-full";
    actors[actorId] = { role: "admin", permissions: ["users.approve", "users.assign_role"] };
    const targetId = "target-pending-3";
    fakeUsers[targetId] = { id: targetId, role: "sanitaeter", isApproved: false, approvedBy: null, updatedAt: null };

    const result = await approve(actorId, targetId, { role: "sanitaeter_leitung" });

    expect(result.status).toBe(200);
    expect(fakeUsers[targetId]!.role).toBe("sanitaeter_leitung");
  });
});
