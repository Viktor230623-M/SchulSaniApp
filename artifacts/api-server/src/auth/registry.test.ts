import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
vi.mock("@workspace/db", () => ({
  db: {},
  usersTable: {},
  userIdentitiesTable: {},
}));

import { loadAuthProviders } from "./registry";

let tempDir: string;
const previousPath = process.env["AUTH_PROVIDERS_PATH"];

async function configFile(value: unknown): Promise<string> {
  const path = join(tempDir, "auth-providers.json");
  await writeFile(path, JSON.stringify(value), { mode: 0o600 });
  return path;
}

function appleConfig(overrides: Record<string, unknown> = {}) {
  return {
    key: "apple",
    displayName: "Apple",
    type: "oidc-redirect",
    issuerUrl: "https://appleid.apple.com",
    clientId: "com.example.service",
    redirectUri: "https://app.example.test/api/auth/apple/callback",
    ...overrides,
  };
}

describe("Auth-Provider-Registry", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "schulsani-auth-"));
  });

  afterEach(async () => {
    if (previousPath === undefined) delete process.env["AUTH_PROVIDERS_PATH"];
    else process.env["AUTH_PROVIDERS_PATH"] = previousPath;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("ignoriert alte Formular- und deaktivierte Eintraege", async () => {
    process.env["AUTH_PROVIDERS_PATH"] = await configFile([
      { key: "iserv-form", displayName: "IServ", type: "iserv-form" },
      { ...appleConfig(), enabled: false },
    ]);

    expect(loadAuthProviders()).toEqual([]);
  });

  it("verlangt fuer Apple das dynamische JWT-Secret", async () => {
    process.env["AUTH_PROVIDERS_PATH"] = await configFile([appleConfig({ clientSecret: "statischer-wert" })]);

    expect(() => loadAuthProviders()).toThrow(/clientSecretMode/);
  });

  it("weist eine nicht private Apple-Schluesseldatei ab", async () => {
    const keyPath = join(tempDir, "apple-signin.p8");
    await writeFile(keyPath, "fixture-key", { mode: 0o644 });
    process.env["AUTH_PROVIDERS_PATH"] = await configFile([appleConfig({
      clientSecretMode: "apple-jwt",
      appleTeamId: "TEAMID1234",
      appleKeyId: "KEYID12345",
      applePrivateKeyPath: keyPath,
    })]);

    expect(() => loadAuthProviders()).toThrow(/nicht lesbar oder nicht privat/);
  });

  it("laedt eine private Apple-Schluesseldatei", async () => {
    const keyPath = join(tempDir, "apple-signin.p8");
    await writeFile(keyPath, "fixture-key", { mode: 0o600 });
    await chmod(keyPath, 0o600);
    process.env["AUTH_PROVIDERS_PATH"] = await configFile([appleConfig({
      clientSecretMode: "apple-jwt",
      appleTeamId: "TEAMID1234",
      appleKeyId: "KEYID12345",
      applePrivateKeyPath: keyPath,
      responseMode: "form_post",
    })]);

    expect(loadAuthProviders()).toHaveLength(1);
  });
});
