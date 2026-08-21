import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  userCryptoKeysTable: {},
  schoolDeksTable: {},
  schoolDekWrapsTable: {},
  usersTable: {},
}));

vi.mock("../middlewares/auth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuthAllowUnconfirmedProfile: (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  schoolIdOf: () => "school-a",
}));

vi.mock("../lib/userCrypto", () => ({
  isValidCryptoBlob: () => true,
  isValidKeyVersion: () => true,
  isValidSalt: () => true,
  logCryptoGrant: vi.fn(),
  schoolUserOrNull: vi.fn(),
  upsertDekWrap: vi.fn(),
  upsertUserCryptoKey: vi.fn(),
}));

import cryptoRouter from "./crypto";

const app = express();
app.use(express.json());
app.use("/api/crypto", cryptoRouter);

describe("legacy plaintext report endpoints", () => {
  it.each([
    ["GET", "/api/crypto/legacy-reports"],
    ["GET", "/api/crypto/legacy-reports/legacy-1"],
    ["PUT", "/api/crypto/legacy-reports/legacy-1"],
  ])("returns 404 for %s %s", async (method, path) => {
    const response = await request(app)[method.toLowerCase() as "get" | "put"](path).send({});
    expect(response.status).toBe(404);
    expect(response.text).toContain(`Cannot ${method} ${path}`);
  });
});
