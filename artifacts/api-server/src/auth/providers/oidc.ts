import { randomBytes, createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { RedirectAuthProvider, AuthResult } from "../types";

/**
 * OIDC-Adapter (Authorization Code mit PKCE).
 *
 * Discovery, State/Nonce und die ID-Token-Pruefung sind die sicherheits-
 * kritischen Teile eines Anmeldewegs per Weiterleitung. Signatur-, JWKS- und
 * Discovery-Verarbeitung sind deshalb nicht selbst gebaut: die Signaturpruefung
 * laeuft ueber `jose` (`createRemoteJWKSet` + `jwtVerify`), Discovery ist ein
 * einfacher JSON-Abruf ohne kryptografischen Anteil.
 *
 * State und Nonce werden serverseitig erzeugt und in `pendingRequests`
 * (In-Memory, pro Adapterinstanz) kurzlebig abgelegt. Ein Eintrag wird beim
 * Rueckweg genau einmal verbraucht (danach geloescht) und laeuft nach
 * `STATE_TTL_MS` von selbst ab. Fehlt der Eintrag oder passt der Nonce-Claim
 * im ID-Token nicht zum gespeicherten Wert, bricht `completeRedirect` ab --
 * es gibt keinen Rueckfall auf einen anderen Anmeldeweg.
 */

const STATE_TTL_MS = 10 * 60 * 1000;

interface PendingRequest {
  nonce: string;
  codeVerifier: string;
  createdAt: number;
}

interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

export interface OidcRedirectProviderConfig {
  key: string;
  displayName: string;
  /** Aussteller-URL des Anbieters, ohne Pfad (z. B. https://login.microsoftonline.com/<tenant>/v2.0). */
  issuerUrl: string;
  clientId: string;
  /** Optional: vertrauliche Clients (z. B. Entra ID, Google) senden ein Client-Secret zusaetzlich zu PKCE. */
  clientSecret?: string;
  /** Genau die Weiterleitungs-URL, die beim Anbieter fuer diesen Client registriert ist. */
  redirectUri: string;
  /** Ohne Angabe: "openid email profile". "openid" wird immer erzwungen. */
  scopes?: string[];
}

function generateCodeVerifier(): string {
  // RFC 7636: 43-128 Zeichen aus [A-Z a-z 0-9 - . _ ~]. base64url liefert
  // genau dieses Alphabet (ohne Padding) und 43 Zeichen aus 32 Byte Entropie.
  return randomBytes(32).toString("base64url");
}

function codeChallengeFromVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * OIDC-Anmeldeweg als Adapter.
 *
 * `beginRedirect` erzeugt State, Nonce und PKCE-Verifier, legt sie kurzlebig
 * ab und liefert die Authorization-URL des Anbieters. `completeRedirect`
 * prueft State gegen den abgelegten Eintrag, tauscht den Code gegen Tokens,
 * prueft das ID-Token gegen JWKS (Signatur, Aussteller, Zielgruppe, Ablauf)
 * und gegen den gespeicherten Nonce, und bildet die Claims auf dieselbe
 * Nutzerprojektion ab, die auch der IServ-Formularweg liefert.
 */
export function createOidcRedirectProvider(cfg: OidcRedirectProviderConfig): RedirectAuthProvider {
  const { key, displayName, issuerUrl, clientId, clientSecret, redirectUri } = cfg;
  const scopes = Array.from(new Set(["openid", ...(cfg.scopes ?? ["email", "profile"])]));

  const pendingRequests = new Map<string, PendingRequest>();

  function pruneExpired(now: number): void {
    for (const [state, entry] of pendingRequests) {
      if (now - entry.createdAt > STATE_TTL_MS) pendingRequests.delete(state);
    }
  }

  let discoveryPromise: Promise<OidcDiscoveryDocument> | undefined;
  let jwksSet: ReturnType<typeof createRemoteJWKSet> | undefined;

  async function discover(): Promise<OidcDiscoveryDocument> {
    if (!discoveryPromise) {
      discoveryPromise = (async () => {
        const discoveryUrl = `${issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
        const resp = await fetch(discoveryUrl, { headers: { Accept: "application/json" } });
        if (!resp.ok) throw new Error(`Discovery fuer Anmeldeweg "${key}" fehlgeschlagen (${resp.status}).`);
        const doc = (await resp.json()) as Partial<OidcDiscoveryDocument>;
        if (!doc.issuer || !doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
          throw new Error(`Discovery-Dokument fuer Anmeldeweg "${key}" ist unvollstaendig.`);
        }
        return doc as OidcDiscoveryDocument;
      })().catch((err) => {
        // Beim naechsten Versuch erneut probieren statt einen fehlgeschlagenen
        // Abruf dauerhaft im Speicher zu behalten.
        discoveryPromise = undefined;
        throw err;
      });
    }
    return discoveryPromise;
  }

  function jwks(doc: OidcDiscoveryDocument): ReturnType<typeof createRemoteJWKSet> {
    if (!jwksSet) {
      jwksSet = createRemoteJWKSet(new URL(doc.jwks_uri));
    }
    return jwksSet;
  }

  return {
    key,
    displayName,
    type: "oidc-redirect",

    async beginRedirect() {
      const doc = await discover();

      const state = generateOpaqueToken();
      const nonce = generateOpaqueToken();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = codeChallengeFromVerifier(codeVerifier);

      pruneExpired(Date.now());
      pendingRequests.set(state, { nonce, codeVerifier, createdAt: Date.now() });

      const url = new URL(doc.authorization_endpoint);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", scopes.join(" "));
      url.searchParams.set("state", state);
      url.searchParams.set("nonce", nonce);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");

      return { redirectUrl: url.toString() };
    },

    async completeRedirect(params: Record<string, string>): Promise<AuthResult> {
      if (params["error"]) {
        throw new Error(`Anbieter meldet Fehler: ${params["error"]}`);
      }

      const state = params["state"];
      const code = params["code"];
      if (!state || !code) {
        throw new Error("State oder Code fehlt in der Rueckantwort.");
      }

      pruneExpired(Date.now());
      const pending = pendingRequests.get(state);
      // Einmalig verbrauchen -- unabhaengig davon, ob der weitere Ablauf
      // gelingt. Ein zweiter Versuch mit demselben State darf nicht greifen.
      pendingRequests.delete(state);
      if (!pending) {
        throw new Error("Unbekannter oder abgelaufener State -- Anmeldung abgebrochen.");
      }

      const doc = await discover();

      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: pending.codeVerifier,
      });

      const tokenHeaders: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      };
      if (clientSecret) {
        tokenHeaders["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
      }

      const tokenResp = await fetch(doc.token_endpoint, {
        method: "POST",
        headers: tokenHeaders,
        body: tokenBody.toString(),
      });
      if (!tokenResp.ok) {
        throw new Error(`Token-Austausch fuer Anmeldeweg "${key}" fehlgeschlagen (${tokenResp.status}).`);
      }
      const tokenSet = (await tokenResp.json()) as { id_token?: string };
      if (!tokenSet.id_token) {
        throw new Error(`Anbieter "${key}" hat kein ID-Token geliefert.`);
      }

      const keySet = jwks(doc);
      const { payload } = await jwtVerify(tokenSet.id_token, keySet, {
        issuer: doc.issuer,
        audience: clientId,
      });

      if (payload["nonce"] !== pending.nonce) {
        throw new Error("Nonce im ID-Token stimmt nicht mit der Anfrage ueberein -- Anmeldung abgebrochen.");
      }

      const sub = payload.sub;
      if (!sub || typeof sub !== "string") {
        throw new Error("ID-Token enthaelt keinen sub-Claim.");
      }

      const email = typeof payload["email"] === "string" ? payload["email"] : "";
      const firstName = typeof payload["given_name"] === "string" ? payload["given_name"] : "";
      const lastName = typeof payload["family_name"] === "string" ? payload["family_name"] : "";

      return {
        subject: sub,
        profile: { firstName, lastName, email, phone: "" },
      };
    },
  };
}
