import { randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
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
  returnTo?: string;
  handoffChallenge?: string;
  linkUserId?: string;
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
  /**
   * Zentrale Callback-Domain im Relay-Modus: Die bei Apple/Google/Microsoft
   * registrierte URL zeigt auf die gemeinsame Domain, nicht auf diese Instanz.
   * Der state-Parameter traegt dann die Instanz-Herkunft als Praefix, damit
   * der Relay den Ruecksprung zurueckschicken kann.
   */
  relay?: { baseUrl: string; instanceOrigin: string };
  /** Ohne Angabe: "openid email profile". "openid" wird immer erzwungen. */
  scopes?: string[];
  /** Anspruch im ID-Token, der die Gruppen traegt. Ohne Angabe: "groups". */
  groupsClaim?: string;
  /** Fuer Google: nur bestaetigte Workspace-Domaenen zulassen. */
  allowedHostedDomains?: string[];
  /** Apple erzeugt das kurzlebige client_secret aus einer .p8-Datei. */
  clientSecretMode?: "static" | "apple-jwt";
  appleTeamId?: string;
  appleKeyId?: string;
  applePrivateKeyPath?: string;
  /** Bundle-ID des nativen iOS-Clients; dessen Identity-Token nennt sie als audience. */
  appleNativeClientId?: string;
  /** Apple kann den Ruecksprung als application/x-www-form-urlencoded senden. */
  responseMode?: "query" | "form_post";
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
  const { key, displayName, issuerUrl, clientId, clientSecret, redirectUri, relay } = cfg;
  const scopes = Array.from(new Set(["openid", ...(cfg.scopes ?? ["email", "profile"])]));
  // Im Relay-Modus laeuft der komplette Weiterlauf ueber die zentrale Domain:
  // die beim Anbieter registrierte redirect_uri zeigt dorthin, der state
  // traegt die Herkunft dieser Instanz als Praefix vor dem eigentlichen Token.
  const relayCallbackUri = relay ? `${relay.baseUrl.replace(/\/$/, "")}/api/auth/${key}/callback` : undefined;
  const callbackUri = relayCallbackUri ?? redirectUri;
  const normalizedIssuer = issuerUrl.replace(/\/$/, "");
  const isGoogle = normalizedIssuer === "https://accounts.google.com";
  const isApple = normalizedIssuer === "https://appleid.apple.com";
  const usesAppleJwt = cfg.clientSecretMode === "apple-jwt";
  if (isApple && cfg.clientSecretMode !== "apple-jwt") {
    throw new Error(`Apple-Anmeldeweg "${key}" braucht clientSecretMode "apple-jwt".`);
  }
  if (usesAppleJwt && (!cfg.appleTeamId || !cfg.appleKeyId || !cfg.applePrivateKeyPath)) {
    throw new Error(`Apple-JWT-Konfiguration fuer "${key}" ist unvollstaendig.`);
  }

  const pendingRequests = new Map<string, PendingRequest>();
  let appleSecret: { value: string; expiresAt: number } | undefined;

  function pruneExpired(now: number): void {
    for (const [state, entry] of pendingRequests) {
      if (now - entry.createdAt > STATE_TTL_MS) pendingRequests.delete(state);
    }
  }

  let discoveryPromise: Promise<OidcDiscoveryDocument> | undefined;
  let jwksSet: ReturnType<typeof createRemoteJWKSet> | undefined;
  let appleNativeJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

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

  async function resolveClientSecret(): Promise<string | undefined> {
    if (!usesAppleJwt) return clientSecret;
    if (appleSecret && appleSecret.expiresAt > Date.now() + 60_000) return appleSecret.value;

    const privateKey = await readFile(cfg.applePrivateKeyPath!, "utf8");
    const signingKey = await importPKCS8(privateKey, "ES256");
    const now = Math.floor(Date.now() / 1000);
    const value = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: cfg.appleKeyId! })
      .setIssuedAt(now)
      .setIssuer(cfg.appleTeamId!)
      .setAudience("https://appleid.apple.com")
      .setSubject(clientId)
      .setExpirationTime(now + 60 * 60)
      .sign(signingKey);
    appleSecret = { value, expiresAt: (now + 60 * 60) * 1000 };
    return value;
  }

  return {
    key,
    displayName,
    type: "oidc-redirect",

    async beginRedirect(options = {}) {
      const doc = await discover();

      const opaque = generateOpaqueToken();
      const nonce = generateOpaqueToken();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = codeChallengeFromVerifier(codeVerifier);

      pruneExpired(Date.now());
      // Der Praefix steht vor dem eigentlichen Token, damit der Relay den
      // Ruecksprung ohne eigene Zustaende weiterleiten kann. Beim Zurueckkommen
      // wird er wieder abgetrennt, bevor der Token im pendingRequests nach-
      // geschlagen wird.
      const state = relay ? `${relay.instanceOrigin}|${opaque}` : opaque;
      pendingRequests.set(opaque, {
        nonce,
        codeVerifier,
        returnTo: options.returnTo,
        handoffChallenge: options.handoffChallenge,
        linkUserId: options.linkUserId,
        createdAt: Date.now(),
      });

      const url = new URL(doc.authorization_endpoint);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", callbackUri);
      url.searchParams.set("scope", scopes.join(" "));
      url.searchParams.set("state", state);
      url.searchParams.set("nonce", nonce);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      if (cfg.responseMode === "form_post") url.searchParams.set("response_mode", "form_post");

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

      // Im Relay-Modus muss der Praefix die eigene Herkunft tragen. Ein State
      // mit fremdem Praefix ist kein echter Ruecksprung, sondern ein Versuch,
      // die Anmeldung einer anderen Instanz hier zu verarbeiten -- abgebrochen
      // wird mit demselben Fehler wie ein unbekannter State, ohne zu verraten,
      // woran es lag.
      if (relay && !state.startsWith(`${relay.instanceOrigin}|`)) {
        throw new Error("Unbekannter oder abgelaufener State -- Anmeldung abgebrochen.");
      }
      const opaque = relay ? state.slice(state.indexOf("|") + 1) : state;

      pruneExpired(Date.now());
      const pending = pendingRequests.get(opaque);
      // Einmalig verbrauchen -- unabhaengig davon, ob der weitere Ablauf
      // gelingt. Ein zweiter Versuch mit demselben State darf nicht greifen.
      pendingRequests.delete(opaque);
      if (!pending) {
        throw new Error("Unbekannter oder abgelaufener State -- Anmeldung abgebrochen.");
      }

      const doc = await discover();

      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUri,
        client_id: clientId,
        code_verifier: pending.codeVerifier,
      });

      const tokenHeaders: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      };
      const resolvedClientSecret = await resolveClientSecret();
      if (isApple && resolvedClientSecret) {
        tokenBody.set("client_secret", resolvedClientSecret);
      } else if (resolvedClientSecret) {
        tokenHeaders["Authorization"] = `Basic ${Buffer.from(`${clientId}:${resolvedClientSecret}`).toString("base64")}`;
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

      const verifiedEmail = payload["email_verified"] === true;
      const hostedDomain = typeof payload["hd"] === "string" ? payload["hd"].trim().toLowerCase() : "";
      const allowedHostedDomains = (cfg.allowedHostedDomains ?? []).map((domain) => domain.trim().toLowerCase()).filter(Boolean);
      if (isGoogle && allowedHostedDomains.length > 0 && !allowedHostedDomains.includes(hostedDomain)) {
        throw new Error("Google-Konto gehoert nicht zu einer erlaubten Workspace-Domaene.");
      }

      let email = typeof payload["email"] === "string" && (!isGoogle || verifiedEmail) ? payload["email"] : "";
      let firstName = typeof payload["given_name"] === "string" ? payload["given_name"] : "";
      let lastName = typeof payload["family_name"] === "string" ? payload["family_name"] : "";

      // Apple liefert den Namen nur beim ersten Login als JSON im Ruecksprung.
      // Der ID-Token bleibt die autoritative Quelle fuer die Identitaet.
      if (isApple && params["user"]) {
        try {
          const appleUser = JSON.parse(params["user"]) as {
            email?: unknown;
            name?: { firstName?: unknown; lastName?: unknown };
          };
          if (!email && typeof appleUser.email === "string") email = appleUser.email;
          if (!firstName && typeof appleUser.name?.firstName === "string") firstName = appleUser.name.firstName;
          if (!lastName && typeof appleUser.name?.lastName === "string") lastName = appleUser.name.lastName;
        } catch {
          // Ein unlesbarer Namensrumpf darf die bereits verifizierte Anmeldung nicht brechen.
        }
      }

      // Anbieter liefern den Anspruch entweder als Liste oder, seltener, als
      // einzelnen Wert. Alles andere zaehlt als keine Gruppe.
      const rawGroups = payload[cfg.groupsClaim ?? "groups"];
      const groups = Array.isArray(rawGroups)
        ? rawGroups.filter((g): g is string => typeof g === "string")
        : typeof rawGroups === "string"
          ? [rawGroups]
          : [];

      return {
        subject: sub,
        profile: { firstName, lastName, email, phone: "", groups },
        returnTo: pending.returnTo,
        handoffChallenge: pending.handoffChallenge,
        linkUserId: pending.linkUserId,
      };
    },

    // Der native App-Login kennt keinen Redirect: Die App bekommt das
    // Identity-Token direkt von Apple und schickt es hierher. Verifiziert wird
    // gegen dieselben Apple-JWKS, aber mit der Bundle-ID des Apps als
    // Zielgruppe statt der Services-ID des Web-Clients.
    async verifyNativeToken({ identityToken, nonce, fullName, email: claimedEmail }) {
      if (!cfg.appleNativeClientId) {
        throw new Error(`Apple-Anmeldeweg "${key}" hat keine appleNativeClientId.`);
      }
      if (!appleNativeJwks) {
        appleNativeJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
      }
      const { payload } = await jwtVerify(identityToken, appleNativeJwks, {
        issuer: "https://appleid.apple.com",
        audience: cfg.appleNativeClientId,
      });
      if (payload["nonce"] !== nonce) {
        throw new Error("Nonce im Apple-Token stimmt nicht ueberein -- Anmeldung abgebrochen.");
      }
      const sub = payload.sub;
      if (!sub || typeof sub !== "string") {
        throw new Error("Apple-Token enthaelt keinen sub-Claim.");
      }
      // Die Adresse kommt aus dem verifizierten Token, nicht aus dem Client:
      // der schickt sie nur mit, weil Apple sie beim Erst-Login ausserhalb des
      // Tokens zurueckgibt. Ein manipulierter Client darf sie nicht setzen.
      let email = typeof payload["email"] === "string" ? payload["email"] : "";
      if (!email && typeof claimedEmail === "string") email = claimedEmail;
      return {
        subject: sub,
        profile: {
          firstName: fullName?.givenName ?? "",
          lastName: fullName?.familyName ?? "",
          email,
          phone: "",
        },
      };
    },
  };
}
