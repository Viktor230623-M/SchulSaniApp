import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requests: Record<string, unknown>[] = [];

vi.mock("@workspace/db", async () => {
  const { pgTable, text, timestamp } = await import("drizzle-orm/pg-core");
  const privacyRequestsTable = pgTable("privacy_requests", {
    id: text("id"),
    schoolId: text("school_id"),
    requesterId: text("requester_id"),
    requesterEmail: text("requester_email"),
    requestType: text("request_type"),
    subjectName: text("subject_name"),
    subjectRelation: text("subject_relation"),
    status: text("status"),
    handledBy: text("handled_by"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    resolvedAt: timestamp("resolved_at"),
  });
  const usersTable = pgTable("users", {
    id: text("id"),
    schoolId: text("school_id"),
    email: text("email"),
  });

  function selectChain() {
    let table: unknown;
    const chain: any = {
      from(value: unknown) { table = value; return chain; },
      where() { return chain; },
      orderBy() { return chain; },
      limit() { return chain; },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        const rows = table === usersTable ? [{ email: "pupil@example.test" }] : requests;
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return chain;
  }

  const db = {
    select: () => selectChain(),
    insert: () => ({
      values(value: Record<string, unknown>) {
        requests.unshift(value);
        return { returning: () => Promise.resolve([value]) };
      },
    }),
    update: () => ({
      set(values: Record<string, unknown>) {
        return {
          where: () => ({
            returning: () => {
              const row = requests[0];
              if (!row) return Promise.resolve([]);
              Object.assign(row, values);
              return Promise.resolve([row]);
            },
          }),
        };
      },
    }),
  };

  return { db, privacyRequestsTable, usersTable };
});

vi.mock("../middlewares/auth", () => ({
  requireAuth: (req: any, _res: unknown, next: () => void) => {
    req.user = { userId: "u1", permissions: ["users.read_all"], schoolId: "school-a" };
    next();
  },
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  schoolIdOf: () => "school-a",
}));

import privacyRequestsRouter from "./privacyRequests";

const app = express();
app.use(express.json());
app.use("/api/privacy/requests", privacyRequestsRouter);

describe("privacy request route", () => {
  beforeEach(() => {
    requests.splice(0);
  });

  it("stores only request metadata and returns a tracking id", async () => {
    const response = await request(app).post("/api/privacy/requests").send({
      requestType: "access",
      subjectName: "Mira Beispiel",
      subjectRelation: "Elternteil",
      healthDetails: "not stored",
    });

    expect(response.status).toBe(201);
    expect(response.body.id).toEqual(expect.any(String));
    expect(response.body.subjectName).toBe("Mira Beispiel");
    expect(response.body).not.toHaveProperty("healthDetails");
    expect(response.body.status).toBe("pending");
  });

  it("rejects unknown request types", async () => {
    const response = await request(app).post("/api/privacy/requests").send({
      requestType: "export_everything",
      subjectName: "Mira Beispiel",
    });

    expect(response.status).toBe(400);
    expect(requests).toHaveLength(0);
  });

  it("lets a school manager update the request status", async () => {
    const created = await request(app).post("/api/privacy/requests").send({
      requestType: "rectification",
      subjectName: "Mira Beispiel",
    });
    const response = await request(app)
      .patch(`/api/privacy/requests/${created.body.id}`)
      .send({ status: "fulfilled" });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("fulfilled");
    expect(response.body.resolvedAt).toEqual(expect.any(String));
  });
});
