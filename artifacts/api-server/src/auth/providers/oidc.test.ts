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

  it("traegt den serverseitigen Link-Nutzer durch den OIDC-Ablauf", async () => {
    const provider = buildProvider();
    const { redirectUrl } = await provider.beginRedirect({ linkUserId: "konto-1" });
    const url = new URL(redirectUrl);
    const state = url.searchParams.get("state");
    const nonce = url.searchParams.get("nonce");
    if (!state || !nonce) throw new Error("Testaufbau: state oder nonce fehlt");
    jwtVerifyMock.mockResolvedValueOnce({ payload: { sub: "user-1", nonce } } as never);

    const result = await provider.completeRedirect({ state, code: "abc" });

    expect(result.linkUserId).toBe("konto-1");
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

  it.each(["common", "organizations"])("akzeptiert Microsoft %s mit konkretern Mandanten-Issuer", async (authority) => {
    // Die uebergreifenden Authorities liefern im Discovery-Dokument den Issuer
    // als {tenantid}-Platzhalter; das ID-Token nennt den echten Mandanten.
    // Der Adapter prueft deshalb gegen das Mandanten-Muster statt gegen
    // doc.issuer -- und haelt dabei die Zielgruppen-Pruefung aufrecht.
    const provider = createOidcRedirectProvider({
      key: "microsoft",
      displayName: "Microsoft",
      issuerUrl: `https://login.microsoftonline.com/${authority}/v2.0`,
      clientId: "microsoft-client",
      clientSecret: "geheim",
      redirectUri: "https://app.example.test/api/auth/microsoft/callback",
    });
    const { state, nonce } = await redirectParams(provider);
    jwtVerifyMock.mockResolvedValueOnce({
      payload: {
        sub: "microsoft-user",
        nonce,
        iss: "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
        email: "person@example.test",
        email_verified: true,
      },
    } as never);
    const result = await provider.completeRedirect({ state, code: "abc" });
    expect(result.subject).toBe("microsoft-user");
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ audience: "microsoft-client" }),
    );
  });

  it("lehnt Microsoft common mit fremdem Aussteller ab", async () => {
    const provider = createOidcRedirectProvider({
      key: "microsoft",
      displayName: "Microsoft",
      issuerUrl: "https://login.microsoftonline.com/common/v2.0",
      clientId: "microsoft-client",
      clientSecret: "geheim",
      redirectUri: "https://app.example.test/api/auth/microsoft/callback",
    });
    const { state, nonce } = await redirectParams(provider);
    jwtVerifyMock.mockResolvedValueOnce({
      payload: { sub: "microsoft-user", nonce, iss: "https://evil.example/issuer" },
    } as never);
    await expect(provider.completeRedirect({ state, code: "abc" })).rejects.toThrow(/Aussteller/);
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

  describe("Relay-Modus (zentrale Callback-Domain)", () => {
    function relayProvider() {
      return createOidcRedirectProvider({
        key: "apple",
        displayName: "Apple",
        issuerUrl: "https://appleid.apple.com",
        clientId: "com.example.service",
        redirectUri: "https://app.example.test/api/auth/apple/callback",
        clientSecretMode: "apple-jwt",
        appleTeamId: "TEAMID1234",
        appleKeyId: "KEYID12345",
        applePrivateKeyPath: "/tmp/apple-signin-test.p8",
        relay: { baseUrl: "https://auth.schulsani.test", instanceOrigin: "https://app.example.test" },
      });
    }

    it("stellt den Anbieter-Aufruf auf die zentrale Redirect-URI um", async () => {
      const { redirectUrl } = await relayProvider().beginRedirect();
      const url = new URL(redirectUrl);
      expect(url.searchParams.get("redirect_uri")).toBe("https://auth.schulsani.test/api/auth/apple/callback");
    });

    it("traegt die Instanz-Herkunft als state-Praefix", async () => {
      const { redirectUrl } = await relayProvider().beginRedirect();
      const state = new URL(redirectUrl).searchParams.get("state") ?? "";
      expect(state.startsWith("https://app.example.test|")).toBe(true);
      expect(state.length).toBeGreaterThan("https://app.example.test|".length);
    });

    it("akzeptiert den eigenen Praefix und tauscht gegen die zentrale URL", async () => {
      const provider = relayProvider();
      const { state, nonce } = await redirectParams(provider);
      jwtVerifyMock.mockResolvedValueOnce({
        payload: { sub: "apple-user", nonce, email: "a@example.test" },
      } as never);
      const result = await provider.completeRedirect({ state, code: "abc" });
      expect(result.subject).toBe("apple-user");
      const tokenRequest = fetchMock.mock.calls.find(([url]) => String(url).includes("/token"));
      expect(tokenRequest).toBeDefined();
      const body = new URLSearchParams(String(tokenRequest![1]?.body));
      expect(body.get("redirect_uri")).toBe("https://auth.schulsani.test/api/auth/apple/callback");
    });

    it("lehnt einen fremden state-Praefix ab", async () => {
      const provider = relayProvider();
      await expect(provider.completeRedirect({
        state: "https://fremde-schule.test|opaque",
        code: "abc",
      })).rejects.toThrow(/State/);
    });

    it("lehnt einen state ohne Praefix ab", async () => {
      const provider = relayProvider();
      await expect(provider.completeRedirect({ state: "opaque-ohne-praefix", code: "abc" })).rejects.toThrow(/State/);
    });
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
