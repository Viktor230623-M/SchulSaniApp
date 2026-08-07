import { describe, it, expect, vi, beforeEach } from "vitest";

// R6 — Testset Anmeldewege (OIDC)
// Mindestens: state-Mismatch, nonce-Mismatch, abgelaufenes Token, unbekannter JWKS-Schluessel
//
// Netzwerk (Discovery, Token-Endpunkt) und die JWT-Pruefung ueber jose werden
// gemockt -- der Adapter (state/nonce-Verwaltung, Fehlerpfade) laeuft echt.

const { jwtVerifyMock, importPKCS8Mock, fetchMock, signJwtCalls } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn(),
  importPKCS8Mock: vi.fn(async () => ({})),
  fetchMock: vi.fn(),
  signJwtCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => "-----BEGIN PRIVATE KEY-----\\nexample\\n-----END PRIVATE KEY-----"),
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: jwtVerifyMock,
  importPKCS8: importPKCS8Mock,
  SignJWT: class {
    private readonly claims: Record<string, unknown> = {};
    constructor() { signJwtCalls.push(this.claims); }
    setProtectedHeader(value: unknown) { this.claims.header = value; return this; }
    setIssuedAt(value: unknown) { this.claims.iat = value; return this; }
    setIssuer(value: unknown) { this.claims.iss = value; return this; }
    setAudience(value: unknown) { this.claims.aud = value; return this; }
    setSubject(value: unknown) { this.claims.sub = value; return this; }
    setExpirationTime(value: unknown) { this.claims.exp = value; return this; }
    async sign() { return "apple-client-secret"; }
  },
}));

import { createOidcRedirectProvider } from "./oidc";

const discoveryDoc = {
  issuer: "https://idp.example.test",
  authorization_endpoint: "https://idp.example.test/authorize",
  token_endpoint: "https://idp.example.test/token",
  jwks_uri: "https://idp.example.test/jwks",
};

function buildProvider() {
  return createOidcRedirectProvider({
    key: "oidc-test",
    displayName: "Test-IdP",
    issuerUrl: "https://idp.example.test",
    clientId: "test-client",
    redirectUri: "https://app.example.test/auth/callback",
  });
}

async function stateFromBeginRedirect(provider: ReturnType<typeof buildProvider>): Promise<string> {
  return (await redirectParams(provider)).state;
}

async function redirectParams(provider: ReturnType<typeof buildProvider>): Promise<{ state: string; nonce: string }> {
  const { redirectUrl } = await provider.beginRedirect();
  const url = new URL(redirectUrl);
  const state = url.searchParams.get("state");
  const nonce = url.searchParams.get("nonce");
  if (!state || !nonce) throw new Error("Testaufbau: state oder nonce fehlt in redirectUrl");
  return { state, nonce };
}

describe("oidc-provider-tests", () => {
  beforeEach(() => {
    jwtVerifyMock.mockReset();
    importPKCS8Mock.mockClear();
    fetchMock.mockReset();
    signJwtCalls.length = 0;
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("/.well-known/openid-configuration")) {
        return new Response(JSON.stringify(discoveryDoc), { status: 200 });
      }
      if (u.includes("/token")) {
        return new Response(JSON.stringify({ id_token: "fake-id-token" }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("lehnt falschen state ab", async () => {
    const provider = buildProvider();
    await expect(provider.completeRedirect({ state: "unbekannter-state", code: "abc" })).rejects.toThrow(/State/);
  });

  it("lehnt falsche nonce ab", async () => {
    const provider = buildProvider();
    const state = await stateFromBeginRedirect(provider);
    jwtVerifyMock.mockResolvedValueOnce({
      payload: { sub: "user-1", nonce: "nicht-die-erwartete-nonce" },
    } as never);
    await expect(provider.completeRedirect({ state, code: "abc" })).rejects.toThrow(/Nonce/);
  });

  it("traegt das sichere native Ruecksprungziel durch den OIDC-Ablauf", async () => {
    const provider = buildProvider();
    const returnTo = "paramedic-app://login";
    const returnChallenge = "a".repeat(64);
    const { redirectUrl } = await provider.beginRedirect({ returnTo, handoffChallenge: returnChallenge });
    const url = new URL(redirectUrl);
    const state = url.searchParams.get("state");
    const nonce = url.searchParams.get("nonce");
    if (!state || !nonce) throw new Error("Testaufbau: state oder nonce fehlt");
    jwtVerifyMock.mockResolvedValueOnce({ payload: { sub: "user-1", nonce } } as never);
    const result = await provider.completeRedirect({ state, code: "abc" });
    expect(result.returnTo).toBe(returnTo);
    expect(result.handoffChallenge).toBe(returnChallenge);
  });

  it("lehnt abgelaufenes Token ab", async () => {
    const provider = buildProvider();
    const state = await stateFromBeginRedirect(provider);
    // jose wirft bei einem abgelaufenen Token selbst (JWTExpired) -- der
    // Adapter faengt das nicht ab, sondern reicht es weiter.
    jwtVerifyMock.mockRejectedValueOnce(new Error("JWTExpired: exp claim timestamp check failed"));
    await expect(provider.completeRedirect({ state, code: "abc" })).rejects.toThrow(/JWTExpired/);
  });

  it("lehnt unbekannten JWKS-Schluessel ab", async () => {
    const provider = buildProvider();
    const state = await stateFromBeginRedirect(provider);
    // jose wirft bei einem kid ohne passenden Schluessel im JWKS selbst
    // (JWKSNoMatchingKey) -- ebenfalls unveraendert durchgereicht.
    jwtVerifyMock.mockRejectedValueOnce(new Error("JWKSNoMatchingKey: no applicable key found in the JSON Web Key Set"));
    await expect(provider.completeRedirect({ state, code: "abc" })).rejects.toThrow(/JWKSNoMatchingKey/);
  });

  it("uebernimmt Google-Mail nur bei bestaetigtem Claim", async () => {
    const provider = createOidcRedirectProvider({
      key: "google",
      displayName: "Google",
      issuerUrl: "https://accounts.google.com",
      clientId: "google-client",
      redirectUri: "https://app.example.test/auth/google/callback",
    });
    const { state, nonce } = await redirectParams(provider);
    jwtVerifyMock.mockResolvedValueOnce({
      payload: { sub: "google-user", nonce, email: "person@example.test", email_verified: false },
    } as never);
    const result = await provider.completeRedirect({ state, code: "abc" });
    expect(result.profile.email).toBe("");
  });

  it("lehnt Google ausserhalb der erlaubten Workspace-Domaene ab", async () => {
    const provider = createOidcRedirectProvider({
      key: "google",
      displayName: "Google",
      issuerUrl: "https://accounts.google.com",
      clientId: "google-client",
      redirectUri: "https://app.example.test/auth/google/callback",
      allowedHostedDomains: ["schule.example"],
    });
    const { state, nonce } = await redirectParams(provider);
    jwtVerifyMock.mockResolvedValueOnce({
      payload: { sub: "google-user", nonce, email: "person@fremd.example", email_verified: true, hd: "fremd.example" },
    } as never);
    await expect(provider.completeRedirect({ state, code: "abc" })).rejects.toThrow(/Workspace-Domaene/);
  });

  it("lehnt Apple mit statischem Client-Secret ab", () => {
    expect(() => createOidcRedirectProvider({
      key: "apple",
      displayName: "Apple",
      issuerUrl: "https://appleid.apple.com",
      clientId: "com.example.service",
      clientSecret: "statisch",
      redirectUri: "https://app.example.test/auth/apple/callback",
    })).toThrow(/clientSecretMode/);
  });

  it("erzeugt Apple-Client-Secret nur einmal pro Cachezeitraum", async () => {
    const provider = createOidcRedirectProvider({
      key: "apple",
      displayName: "Apple",
      issuerUrl: "https://appleid.apple.com",
      clientId: "com.example.service",
      redirectUri: "https://app.example.test/auth/apple/callback",
      clientSecretMode: "apple-jwt",
      appleTeamId: "TEAMID1234",
      appleKeyId: "KEYID12345",
      applePrivateKeyPath: "/tmp/apple-signin-test.p8",
    });
    const first = await redirectParams(provider);
    jwtVerifyMock.mockResolvedValue({ payload: { sub: "apple-user", nonce: first.nonce, email: "a@example.test" } } as never);
    await provider.completeRedirect({ state: first.state, code: "abc" });
    const second = await redirectParams(provider);
    jwtVerifyMock.mockResolvedValue({ payload: { sub: "apple-user", nonce: second.nonce, email: "a@example.test" } } as never);
    await provider.completeRedirect({ state: second.state, code: "abc" });
    expect(importPKCS8Mock).toHaveBeenCalledTimes(1);
    expect(signJwtCalls).toHaveLength(1);
    expect(signJwtCalls[0]).toMatchObject({
      header: { alg: "ES256", kid: "KEYID12345" },
      iss: "TEAMID1234",
      aud: "https://appleid.apple.com",
      sub: "com.example.service",
    });
    expect(signJwtCalls[0].exp).toBeGreaterThan(Number(signJwtCalls[0].iat));
    expect(Number(signJwtCalls[0].exp) - Number(signJwtCalls[0].iat)).toBe(60 * 60);
    const tokenRequest = fetchMock.mock.calls.find(([url]) => String(url).includes("/token"));
    expect(tokenRequest).toBeDefined();
    const body = new URLSearchParams(String(tokenRequest![1]?.body));
    expect(body.get("client_secret")).toBe("apple-client-secret");
  });

  it("liest Apples einmaligen Namensrumpf aus dem Ruecksprung", async () => {
    const provider = createOidcRedirectProvider({
      key: "apple",
      displayName: "Apple",
      issuerUrl: "https://appleid.apple.com",
      clientId: "com.example.service",
      redirectUri: "https://app.example.test/auth/apple/callback",
      clientSecretMode: "apple-jwt",
      appleTeamId: "TEAMID1234",
      appleKeyId: "KEYID12345",
      applePrivateKeyPath: "/tmp/apple-signin-test.p8",
      responseMode: "form_post",
    });
    const { redirectUrl } = await provider.beginRedirect();
    const redirect = new URL(redirectUrl);
    const state = redirect.searchParams.get("state");
    const nonce = redirect.searchParams.get("nonce");
    expect(redirect.searchParams.get("response_mode")).toBe("form_post");
    if (!state || !nonce) throw new Error("Testaufbau: Apple state oder nonce fehlt");
    jwtVerifyMock.mockResolvedValueOnce({
      payload: { sub: "apple-user", nonce, email: "relay@privaterelay.appleid.com" },
    } as never);
    const result = await provider.completeRedirect({
      state,
      code: "abc",
      user: JSON.stringify({ name: { firstName: "Ada", lastName: "Lovelace" } }),
    });
    expect(result.profile.firstName).toBe("Ada");
    expect(result.profile.lastName).toBe("Lovelace");
  });
});
