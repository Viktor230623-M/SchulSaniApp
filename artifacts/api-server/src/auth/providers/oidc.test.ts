import { describe, it, expect, vi, beforeEach } from "vitest";

// R6 — Testset Anmeldewege (OIDC)
// Mindestens: state-Mismatch, nonce-Mismatch, abgelaufenes Token, unbekannter JWKS-Schluessel
//
// Netzwerk (Discovery, Token-Endpunkt) und die JWT-Pruefung ueber jose werden
// gemockt -- der Adapter (state/nonce-Verwaltung, Fehlerpfade) laeuft echt.

const { jwtVerifyMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn(),
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: jwtVerifyMock,
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
  const { redirectUrl } = await provider.beginRedirect();
  const state = new URL(redirectUrl).searchParams.get("state");
  if (!state) throw new Error("Testaufbau: kein state in redirectUrl");
  return state;
}

describe("oidc-provider-tests", () => {
  beforeEach(() => {
    jwtVerifyMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = url.toString();
        if (u.includes("/.well-known/openid-configuration")) {
          return new Response(JSON.stringify(discoveryDoc), { status: 200 });
        }
        if (u.includes("/token")) {
          return new Response(JSON.stringify({ id_token: "fake-id-token" }), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );
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
});
