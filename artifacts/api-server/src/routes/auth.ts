import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { eq, and, or, isNull, isNotNull, gt, sql } from "drizzle-orm";
import { db, authTokensTable, userIdentitiesTable, usersTable, rolesTable, sessionsTable, userRoleEnum, userCryptoKeysTable, type UserRole } from "@workspace/db";
import { permissionsForRole } from "../lib/rolePermissions";
import {
  requireAuth,
  requireAuthAllowUnconfirmedProfile,
  requireAuthForPasswordChange,
  requireAuthForLogout,
  invalidateUserCache,
  type AuthRequest,
} from "../middlewares/auth";
import { createSession, resolveSession, revokeSession, revokeAllSessionsForUser } from "../lib/sessions";
import { config } from "../config";
import { loadAuthProviders } from "../auth/registry";
import type { AuthProfile, AuthProvider, AuthResult, PasswordAuthProvider, RedirectAuthProvider } from "../auth/types";
import { hashLoginProof, verifyLoginProof } from "../auth/providers/local";
import { upsertUserCryptoKey } from "../lib/userCrypto";
import { issueAuthToken, hashAuthToken } from "../lib/authTokens";
import { assertMailerConfig, authLink, sendMail, verifyMailer } from "../services/mailer";
import { validateProfileName } from "../lib/profileName";
import { normaliseEmail } from "../lib/email";
import { logIdentityChangeTx } from "../lib/identityChangeLog";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts, please try again later." },
});

// Bewusst lockerer als authLimiter: Die Wiederherstellung laeuft bei jedem
// Seitenstart, mit mehreren Tabs auch mehrfach. Fuenf pro Minute wuerden
// legitime Nutzer aussperren. Das Raten eines Tokens mit 256 Bit Entropie
// verhindert nicht der Limiter, sondern die Entropie.
const sessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Zu viele Anfragen, bitte kurz warten." },
});

// Lockerer als authLimiter: der Bestaetigungsbildschirm ruft einmal auf, ein
// Tippfehler kostet einen zweiten -- fuenf pro Minute waeren hier zu knapp.
const profileLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Zu viele Anfragen, bitte kurz warten." },
});

const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Zu viele Anfragen, bitte kurz warten." },
});

const localAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Zu viele Anfragen, bitte spaeter erneut versuchen." },
});

const resetIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: "Zu viele Anfragen, bitte spaeter erneut versuchen." },
});

const resetEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => normaliseEmail(req.body?.email) ?? "ungueltige-adresse",
  message: { error: "Zu viele Anfragen, bitte spaeter erneut versuchen." },
});

const EMAIL_RESPONSE = "Wenn die Adresse genutzt werden kann, liegt gleich eine E-Mail im Postfach.";
const AUTH_RESPONSE_FLOOR_MS = 400;

const SESSION_COOKIE = "sani-session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const LINK_SESSION_FRESHNESS_MS = 15 * 60 * 1000;

// Der Server sieht das Passwort nie -- nur den daraus abgeleiteten Proof und
// den Ableitungs-Salt. Die Mindestlaenge des Passworts prueft der Client.
function validProof(value: unknown): value is string {
  return typeof value === "string" && value.length >= 20 && value.length <= 500;
}

function validLoginSalt(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 200 && /^[A-Za-z0-9+/=_-]+$/.test(value);
}

function normaliseUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase();
  return username.length >= 3 && username.length <= 100 && /^[a-z0-9][a-z0-9._-]*$/.test(username) ? username : null;
}

function htmlMailText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

async function waitForAuthResponse(startedAt: number): Promise<void> {
  const remaining = AUTH_RESPONSE_FLOOR_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

function currentAuthTime(): number {
  return Math.floor(Date.now() / 1000);
}
const NATIVE_HANDOFF_TTL_MS = 2 * 60 * 1000;
const nativeHandoffs = new Map<string, { sessionToken: string; verifierHash: string; expiresAt: number }>();

// Web-Handoff im Relay-Modus: Die OIDC-Callback-Antwort geht durch den Relay
// an einen Browser, der auf der zentralen Domain steht. Ein dort gesetztes
// Session-Cookie waere third-party (Domain der Instanz, Top-Level-Domain der
// zentralen Domain) und wuerde von modernen Browsern verworfen. Stattdessen
// bekommt der Browser einen einmaligen Code und navigiert damit first-party
// zur Instanz; /api/auth/handoff setzt die Sitzung dort.
const WEB_HANDOFF_TTL_MS = 2 * 60 * 1000;
const webHandoffs = new Map<string, { sessionToken: string; expiresAt: number }>();

function createWebHandoff(sessionToken: string): string {
  const now = Date.now();
  for (const [code, handoff] of webHandoffs) {
    if (handoff.expiresAt <= now) webHandoffs.delete(code);
  }
  const code = randomUUID();
  webHandoffs.set(code, {
    sessionToken,
    expiresAt: now + WEB_HANDOFF_TTL_MS,
  });
  return code;
}

// Schul-Zugangscode als Eintrittskarte fuer neue Konten. Ist einer gesetzt,
// muss jedes frisch angelegte Konto ihn nachweisen — fuer lokale Registrierung
// direkt im Formular, fuer den OIDC-Erst-Login ueber einen Zwischen-Screen,
// dessen einmaliges Token hier haengt. Bestehende, auf Freischaltung wartende
// Konten bleiben beim bisherigen Verwalter-Flow.
const JOIN_CODE_TTL_MS = 15 * 60 * 1000;
const joinCodeHandoffs = new Map<string, { userId: string; expiresAt: number }>();
const joinCodeRequired = config.joinCode !== undefined;

function joinCodeMatches(candidate: unknown): boolean {
  if (!joinCodeRequired || typeof candidate !== "string" || !config.joinCode) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(config.joinCode);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Nonces fuer den nativen Apple-Login: kurzlebig, einmalig verbrauchbar.
// Der Client reicht den Nonce an Apple weiter, Apple spiegelt ihn ins
// Identity-Token; ohne passenden Eintrag wird die Anmeldung nicht akzeptiert.
const APPLE_NONCE_TTL_MS = 10 * 60 * 1000;
const appleNativeNonces = new Map<string, { expiresAt: number }>();

function createNativeHandoff(sessionToken: string, challenge: string): string {
  const now = Date.now();
  for (const [code, handoff] of nativeHandoffs) {
    if (handoff.expiresAt <= now) nativeHandoffs.delete(code);
  }
  const code = randomUUID();
  nativeHandoffs.set(code, {
    sessionToken,
    verifierHash: challenge,
    expiresAt: now + NATIVE_HANDOFF_TTL_MS,
  });
  return code;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_MS,
    // Relay-Modus: der Browser steht waehrend des Ruecksprungs auf der
    // zentralen Domain. Ohne Domain-Attribut haengt das Cookie dort fest;
    // mit ihm wird es fuer die Herkunft dieser Instanz gesetzt.
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  };
}

function clearSessionCookie(res: import("express").Response): void {
  res.clearCookie(SESSION_COOKIE, {
    path: "/",
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  });
}

function requiredSchoolId(): string {
  const schoolId = process.env["SCHOOL_ID"]?.trim();
  if (!schoolId) throw new Error("SCHOOL_ID ist nicht gesetzt.");
  return schoolId;
}

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
if (JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}

// Im Relay-Modus tragen die OIDC-Starts die Herkunft dieser Instanz im
// state-Praefix, damit der zentrale Callback sie zurueckleiten kann. Ohne
// AUTH_RELAY_BASE_URL bleibt alles beim bisherigen Ablauf.
const relaySettings = config.authRelayBaseUrl && config.allowedOrigins[0]
  ? { baseUrl: config.authRelayBaseUrl, instanceOrigin: config.allowedOrigins[0] }
  : undefined;
const authProviders = loadAuthProviders(relaySettings);
const localProvider = authProviders.find((provider): provider is PasswordAuthProvider => provider.type === "local");
if (localProvider) {
  assertMailerConfig();
}

export function getLocalProvider(): PasswordAuthProvider {
  if (!localProvider) throw new Error("Lokale Konten sind in dieser Installation nicht aktiviert.");
  return localProvider;
}

function isUserRole(value: string): value is UserRole {
  return (userRoleEnum.enumValues as readonly string[]).includes(value);
}

// Gruppe-zu-Rolle-Abbildung kommt je Anbieter aus der Provider-Konfiguration
// (groupToRoleMap, siehe ../auth/registry), einmalig beim Start geladen und an
// jedem Provider-Objekt haengend -- keine zentrale Datei, kein erneutes Lesen
// bei jeder Anmeldung.
//
// Unbekannte oder fehlende Gruppe fuehrt zu keiner Rolle (kein Ruckfall mehr
// auf "sanitaeter"). Der zugeordnete Rollenschluessel muss ausserdem als Rolle
// in der roles-Tabelle existieren (schulweit oder global) -- ein Schluessel,
// der nur im Postgres-Enum, aber nicht in der Tabelle steht, zaehlt nicht.
async function getRoleForUser(groups: string[], providerKey: string, schoolId: string): Promise<UserRole | undefined> {
  const provider = authProviders.find((p) => p.key === providerKey);
  const roleMap = provider?.groupToRoleMap ?? {};

  for (const group of groups) {
    const mapped = roleMap[group];
    if (mapped === undefined || !isUserRole(mapped)) continue;

    const roleRows = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      // "schulweit oder global": eine Rolle mit school_id der Installation
      // zaehlt, eine ungebundene (school_id IS NULL) ebenso. Der Bestand liegt
      // ungebunden vor, eine Abfrage nur auf die Schul-Kennung faende ihn nicht.
      .where(and(eq(rolesTable.key, mapped), or(eq(rolesTable.schoolId, schoolId), isNull(rolesTable.schoolId))))
      .limit(1);
    if (roleRows.length > 0) return mapped;
  }

  return undefined;
}

// Baut die Nutzerprojektion, wie sie sowohl Login als auch Sitzungswiederherstellung
// in der Antwort zurueckgeben. Die Rolle wird hier nicht vorbelegt — das bleibt
// Sache der Aufrufer, da Login und Session unterschiedliche Standardwerte nutzen.
async function buildUserResponse(user: { id: string; firstName: string | null; lastName: string | null; email: string | null; username?: string | null; role: string; schoolId: string | null; profileConfirmedAt: Date | null; mustChangePassword?: boolean }) {
  // Die Rechte kommen mit der Anmeldeantwort, damit der Client nicht mehr aus
  // dem Rollennamen ableiten muss, was sichtbar ist. Bereich ist die Schule
  // der Nutzerzeile, nicht der globale Bereich -- sonst ueberschreibt eine
  // entzogene, schulgebundene Berechtigung nie die globale Voreinstellung.
  const permissions = await permissionsForRole(user.role, user.schoolId);
  return {
    user: {
      id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, username: user.username ?? null, role: user.role,
      profileConfirmedAt: user.profileConfirmedAt ? user.profileConfirmedAt.toISOString() : null,
      mustChangePassword: user.mustChangePassword ?? false,
    },
    permissions,
    isTealUnlocked: user.role === "owner",
  };
}

/**
 * Ableitungs-Salts fuer die lokale Anmeldung, oeffentlich -- Salts sind keine
 * Geheimnisse. Ein unbekannter Nutzername liefert dieselbe Antwort wie ein
 * bekannter ohne Kryptoeintrag (Zufalls-Salts), damit die Route keine
 * Konten verraet. Bestandskonten ohne login_salt (bcrypt-Altbestaende) fallen
 * bewusst durch: fuer sie gilt der Passwort-Reset als einziger Weg.
 */
router.get("/params", authLimiter, async (req, res) => {
  const providerKey = typeof req.query["providerKey"] === "string" ? req.query["providerKey"] : "";
  const provider = authProviders.find((candidate) => candidate.key === providerKey);
  if (!provider || provider.type !== "local") {
    res.status(404).json({ error: "Anmeldeweg nicht gefunden." });
    return;
  }

  const username = typeof req.query["username"] === "string" ? req.query["username"].trim().toLowerCase() : "";
  const randomSalt = () => randomBytes(16).toString("base64");
  let saltLogin = randomSalt();
  let saltEnc = randomSalt();
  let hasKeypair = false;

  if (username && username.length <= 254) {
    const [user] = await db
      .select({ loginSalt: usersTable.loginSalt, id: usersTable.id })
      .from(usersTable)
      .where(and(
        eq(usersTable.schoolId, requiredSchoolId()),
        eq(usersTable.authProvider, provider.key),
        or(
          eq(usersTable.externalSubject, username),
          eq(usersTable.email, username),
          eq(usersTable.username, username),
        ),
      ))
      .limit(1);
    if (user) {
      if (user.loginSalt) saltLogin = user.loginSalt;
      const [cryptoKey] = await db
        .select({ saltEnc: userCryptoKeysTable.saltEnc })
        .from(userCryptoKeysTable)
        .where(eq(userCryptoKeysTable.userId, user.id))
        .limit(1);
      if (cryptoKey) {
        saltEnc = cryptoKey.saltEnc;
        hasKeypair = true;
      }
    }
  }

  res.json({ saltLogin, saltEnc, hasKeypair });
});

router.post("/login", authLimiter, async (req, res) => {
  const providerKey = typeof req.body?.providerKey === "string" ? req.body.providerKey : "";
  const provider = authProviders.find((candidate) => candidate.key === providerKey);
  if (!provider || provider.type !== "local") {
    res.status(404).json({ error: "Anmeldeweg nicht gefunden." });
    return;
  }

  const username = typeof req.body?.username === "string" ? req.body.username : "";
  // Der Login-Proof ist der Argon2id-abgeleitete Wert, nie das Passwort.
  const proof = typeof req.body?.proof === "string" ? req.body.proof : "";
  if (!username || !validProof(proof) || username.length > 254) {
    res.status(400).json({ error: "Anmeldedaten sind ungueltig." });
    return;
  }

  try {
    const result = await provider.authenticate({ username, password: proof });
    const schoolId = requiredSchoolId();
    const [user] = await db.select().from(usersTable).where(and(
        eq(usersTable.schoolId, schoolId),
        eq(usersTable.authProvider, provider.key),
        eq(usersTable.externalSubject, result.subject),
      )).limit(1);
    if (!user || !user.isApproved) {
      res.status(403).json({ error: "Dein Account wartet auf Freischaltung durch einen Administrator." });
      return;
    }
    if (!user.emailVerifiedAt) {
      res.status(403).json({ error: "Bitte bestaetige zuerst deine E-Mail-Adresse.", code: "EMAIL_NOT_VERIFIED" });
      return;
    }

    const sessionToken = await createSession(user.id);
    res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    const token = jwt.sign({
      userId: user.id,
      role: user.role,
      passwordVersion: user.passwordVersion,
      authTime: currentAuthTime(),
    }, JWT_SECRET, { expiresIn: "2h" });
    res.json({
      token,
      ...(await buildUserResponse({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        role: user.role,
        schoolId: user.schoolId,
        profileConfirmedAt: user.profileConfirmedAt,
        mustChangePassword: result.mustChangePassword,
      })),
    });
  } catch {
    res.status(401).json({ error: "Anmeldung fehlgeschlagen." });
  }
});

function localAccountUnavailable(res: import("express").Response): boolean {
  if (localProvider) return false;
  res.status(404).json({ error: "Lokale Konten sind in dieser Installation nicht aktiviert." });
  return true;
}

router.post("/local/register", localAccountLimiter, async (req, res) => {
  if (localAccountUnavailable(res)) return;
  const email = normaliseEmail(req.body?.email);
  const proof = req.body?.proof;
  const loginSalt = req.body?.loginSalt;
  const rawUsername = req.body?.username;
  const username = rawUsername === undefined || rawUsername === "" ? null : normaliseUsername(rawUsername);
  const firstName = typeof req.body?.firstName === "string" ? req.body.firstName.trim() : "";
  const lastName = typeof req.body?.lastName === "string" ? req.body.lastName.trim() : "";
  if (!email || !validProof(proof) || !validLoginSalt(loginSalt) || (rawUsername !== undefined && rawUsername !== "" && !username) || firstName.length > 100 || lastName.length > 100) {
    res.status(400).json({ error: "E-Mail und Passwort sind ungueltig." });
    return;
  }

  // Eintrittskarte der Schule: Ist ein Schul-Zugangscode konfiguriert, kommt
  // ein Konto nur mit dem richtigen Code zustande. Die Registrierung verraet
  // dabei nicht, ob der Code fehlt oder falsch ist — beides heisst 403.
  if (joinCodeRequired && !joinCodeMatches(req.body?.joinCode)) {
    res.status(403).json({ error: "Der Schul-Zugangscode fehlt oder ist falsch." });
    return;
  }

  try {
    assertMailerConfig();
  } catch {
    res.status(503).json({ error: "E-Mail-Versand ist derzeit nicht konfiguriert." });
    return;
  }

  const startedAt = Date.now();
  try {
    await verifyMailer();
  } catch {
    res.status(503).json({ error: "E-Mail-Versand ist derzeit nicht erreichbar." });
    return;
  }

  const schoolId = requiredSchoolId();
  const [account] = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    authProvider: usersTable.authProvider,
    emailVerifiedAt: usersTable.emailVerifiedAt,
    username: usersTable.username,
  }).from(usersTable).where(and(eq(usersTable.email, email), eq(usersTable.schoolId, schoolId))).limit(1);
  const [usernameAccount] = username ? await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.schoolId, schoolId), eq(usersTable.username, username))).limit(1) : [];

  let mail: { to: string; subject: string; text: string; html: string } | undefined;
  let pendingRegistration: {
    userId: string;
    token: string;
    passwordHash: string;
    loginSalt: string;
    email: string;
    username: string | null;
    firstName: string;
    lastName: string;
    schoolId: string;
  } | undefined;
  try {
    if (usernameAccount && usernameAccount.id !== account?.id) {
      // E-Mail und Passwort bleiben absichtlich ohne Seiteneffekt: Der
      // Registrierungsversuch darf keine bestehende Kennung verraten.
    } else if (account?.authProvider === getLocalProvider().key && !account.emailVerifiedAt) {
      const token = await issueAuthToken(account.id, "email_verify", new Date(Date.now() + 24 * 60 * 60 * 1000));
      const text = `Bestaetige deine E-Mail-Adresse innerhalb von 24 Stunden:\n\n${authLink("email-bestaetigen", token)}\n\nWenn du diese Registrierung nicht gestartet hast, ignoriere diese E-Mail.`;
      mail = { to: account.email ?? email, subject: "E-Mail-Adresse bestaetigen", text, html: htmlMailText(text) };
    } else if (account) {
      const text = "Es wurde versucht, mit dieser E-Mail-Adresse ein Konto anzulegen. Wenn du das nicht warst, musst du nichts tun.";
      mail = { to: account.email ?? email, subject: "Registrierungsversuch mit deiner E-Mail-Adresse", text, html: htmlMailText(text) };
    } else {
      const userId = randomUUID();
      const token = randomBytes(32).toString("base64url");
      const passwordHash = await hashLoginProof(proof);
      pendingRegistration = { userId, token, passwordHash, loginSalt, email, username, firstName, lastName, schoolId };
      const text = `Bestaetige deine E-Mail-Adresse innerhalb von 24 Stunden:\n\n${authLink("email-bestaetigen", token)}\n\nWenn du diese Registrierung nicht gestartet hast, ignoriere diese E-Mail.`;
      mail = { to: email, subject: "E-Mail-Adresse bestaetigen", text, html: htmlMailText(text) };
    }
  } catch (err) {
    console.error("Lokale Registrierung konnte nicht abgeschlossen werden:", err instanceof Error ? err.message : "unbekannter Fehler");
    await waitForAuthResponse(startedAt);
    res.status(503).json({ error: "Registrierung konnte nicht abgeschlossen werden." });
    return;
  }

  if (pendingRegistration) {
    const { userId, token, passwordHash, loginSalt, email: registrationEmail, username: registrationUsername, firstName: registrationFirstName, lastName: registrationLastName, schoolId: registrationSchoolId } = pendingRegistration;
    await db.transaction(async (tx) => {
      await tx.insert(usersTable).values({
        id: userId,
        authProvider: getLocalProvider().key,
        externalSubject: registrationEmail,
        email: registrationEmail,
        emailVerifiedAt: null,
        username: registrationUsername,
        firstName: registrationFirstName,
        lastName: registrationLastName,
        passwordHash,
        loginSalt,
        role: "sanitaeter",
        schoolId: registrationSchoolId,
        // Mit Schul-Zugangscode ist die Registrierung die Eintrittskarte: das
        // Konto ist sofort nutzbar (E-Mail-Bestaetigung kommt trotzdem).
        isApproved: joinCodeRequired,
        profileConfirmedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await tx.insert(authTokensTable).values({
        id: randomUUID(),
        userId,
        kind: "email_verify",
        tokenHash: hashAuthToken(token),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      // Jedes Konto hat eine primaere Identitaet (Spec Schritt 1) -- das
      // lokale Konto genauso wie die OIDC-Konten aus reconcileAccount. Sonst
      // zeigte die Anmeldeliste bei frischen lokalen Konten nichts an.
      await tx.insert(userIdentitiesTable).values({
        id: `primary-${userId}`,
        userId,
        schoolId: registrationSchoolId,
        authProvider: getLocalProvider().key,
        externalSubject: registrationEmail,
        emailAtLink: registrationEmail,
      });
    });
  }

  if (mail) {
    try {
      await sendMail(mail);
    } catch (err) {
      // Die Antwort bleibt absichtlich identisch. Die bestehende Adresse kann
      // die Nachricht über den erneuten Versand wieder anfordern.
      console.error("Registrierungs-Mail konnte nicht versendet werden:", err instanceof Error ? err.message : "unbekannter Fehler");
    }
  }

  await waitForAuthResponse(startedAt);
  res.status(202).json({ message: EMAIL_RESPONSE });
});

router.post("/local/verify", localAccountLimiter, async (req, res) => {
  if (localAccountUnavailable(res)) return;
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!token || token.length > 200) {
    res.status(400).json({ error: "Bestaetigungslink ist ungueltig oder abgelaufen." });
    return;
  }
  const verifiedUserId = await db.transaction(async (tx) => {
    const [candidate] = await tx.select({ id: authTokensTable.id, userId: authTokensTable.userId }).from(authTokensTable).innerJoin(usersTable, eq(usersTable.id, authTokensTable.userId)).where(and(eq(authTokensTable.tokenHash, hashAuthToken(token)), eq(authTokensTable.kind, "email_verify"), isNull(authTokensTable.usedAt), gt(authTokensTable.expiresAt, new Date()), eq(usersTable.authProvider, getLocalProvider().key))).limit(1);
    if (!candidate) return null;
    const [consumed] = await tx.update(authTokensTable).set({ usedAt: new Date() }).where(and(eq(authTokensTable.id, candidate.id), isNull(authTokensTable.usedAt))).returning({ id: authTokensTable.id });
    if (!consumed) return null;
    const [updated] = await tx.update(usersTable).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(and(eq(usersTable.id, candidate.userId), eq(usersTable.authProvider, getLocalProvider().key))).returning({ id: usersTable.id, isApproved: usersTable.isApproved });
    return updated ? { userId: candidate.userId, isApproved: updated.isApproved } : null;
  });
  if (!verifiedUserId) {
    res.status(400).json({ error: "Bestaetigungslink ist ungueltig oder abgelaufen." });
    return;
  }
  invalidateUserCache(verifiedUserId.userId);
  res.json({
    ok: true,
    isApproved: verifiedUserId.isApproved,
    message: verifiedUserId.isApproved
      ? "E-Mail-Adresse bestaetigt. Du kannst dich jetzt anmelden."
      : "E-Mail-Adresse bestaetigt. Ein Verwalter muss dein Konto noch freischalten.",
  });
});

router.post("/local/verify/resend", localAccountLimiter, async (req, res) => {
  if (localAccountUnavailable(res)) return;
  const email = normaliseEmail(req.body?.email);
  if (!email) {
    res.status(400).json({ error: "E-Mail ist ungueltig." });
    return;
  }
  try {
    assertMailerConfig();
  } catch {
    res.status(503).json({ error: "E-Mail-Versand ist derzeit nicht konfiguriert." });
    return;
  }    const startedAt = Date.now();
    try {
      await verifyMailer();
    } catch {
      res.status(503).json({ error: "E-Mail-Versand ist derzeit nicht erreichbar." });
      return;
    }
    const [user] = await db.select({ id: usersTable.id, email: usersTable.email, emailVerifiedAt: usersTable.emailVerifiedAt }).from(usersTable).where(and(eq(usersTable.email, email), eq(usersTable.authProvider, getLocalProvider().key), eq(usersTable.schoolId, requiredSchoolId()))).limit(1);
  let mail: { to: string; subject: string; text: string; html: string } | undefined;
  if (user && !user.emailVerifiedAt) {
    const token = await issueAuthToken(user.id, "email_verify", new Date(Date.now() + 24 * 60 * 60 * 1000));
    const text = `Bestaetige deine E-Mail-Adresse innerhalb von 24 Stunden:\n\n${authLink("email-bestaetigen", token)}`;
    mail = { to: user.email ?? email, subject: "E-Mail-Adresse bestaetigen", text, html: htmlMailText(text) };
  }
  await waitForAuthResponse(startedAt);
  if (mail) void sendMail(mail).catch((err) => console.error("Bestaetigungs-Mail konnte nicht versendet werden:", err instanceof Error ? err.message : "unbekannter Fehler"));
  res.status(202).json({ message: EMAIL_RESPONSE });
});

router.post("/local/password/forgot", resetIpLimiter, resetEmailLimiter, async (req, res) => {
  if (localAccountUnavailable(res)) return;
  const email = normaliseEmail(req.body?.email);
  if (!email) {
    res.status(400).json({ error: "E-Mail ist ungueltig." });
    return;
  }
  try {
    assertMailerConfig();
  } catch {
    res.status(503).json({ error: "E-Mail-Versand ist derzeit nicht konfiguriert." });
    return;
  }

  const startedAt = Date.now();
  try {
    await verifyMailer();
  } catch {
    res.status(503).json({ error: "E-Mail-Versand ist derzeit nicht erreichbar." });
    return;
  }
  await hashLoginProof(email);
  // Reset nur fuer bestaetigte Adressen. Eine unbestaetigte Adresse gehoert
  // moeglicherweise gar nicht dem Kontoinhaber (Verwalter-Korrektur, noch
  // nicht bestaetigt); eine Reset-Mail dorthin waere eine Uebernahmekette.
  const [user] = await db.select({ id: usersTable.id, email: usersTable.email, emailVerifiedAt: usersTable.emailVerifiedAt }).from(usersTable).where(and(eq(usersTable.email, email), eq(usersTable.authProvider, getLocalProvider().key), eq(usersTable.schoolId, requiredSchoolId()))).limit(1);
  let mail: { to: string; subject: string; text: string; html: string } | undefined;
  if (user && user.emailVerifiedAt) {
    const token = await issueAuthToken(user.id, "password_reset", new Date(Date.now() + 60 * 60 * 1000));
    const text = `Setze dein Passwort innerhalb von 60 Minuten neu:\n\n${authLink("passwort-zuruecksetzen", token)}`;
    mail = { to: email, subject: "Passwort zuruecksetzen", text, html: htmlMailText(text) };
  }
  await waitForAuthResponse(startedAt);
  if (mail) void sendMail(mail).catch((err) => console.error("Passwort-Reset-Mail konnte nicht versendet werden:", err instanceof Error ? err.message : "unbekannter Fehler"));
  res.status(202).json({ message: EMAIL_RESPONSE });
});

router.post("/local/password/reset", localAccountLimiter, async (req, res) => {
  if (localAccountUnavailable(res)) return;
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const proof = req.body?.proof;
  const loginSalt = req.body?.loginSalt;
  if (!token || token.length > 200 || !validProof(proof) || !validLoginSalt(loginSalt)) {
    res.status(400).json({ error: "Link oder Passwort ist ungueltig." });
    return;
  }
  const updated = await db.transaction(async (tx) => {
    const [candidate] = await tx.select({ id: authTokensTable.id, userId: authTokensTable.userId }).from(authTokensTable).innerJoin(usersTable, eq(usersTable.id, authTokensTable.userId)).where(and(eq(authTokensTable.tokenHash, hashAuthToken(token)), eq(authTokensTable.kind, "password_reset"), isNull(authTokensTable.usedAt), gt(authTokensTable.expiresAt, new Date()), eq(usersTable.authProvider, getLocalProvider().key))).limit(1);
    if (!candidate) return false;
    const [consumed] = await tx.update(authTokensTable).set({ usedAt: new Date() }).where(and(eq(authTokensTable.id, candidate.id), isNull(authTokensTable.usedAt))).returning({ id: authTokensTable.id });
    if (!consumed) return false;
    const passwordHash = await hashLoginProof(proof);
    const [changed] = await tx.update(usersTable).set({ passwordHash, loginSalt, passwordVersion: sql`${usersTable.passwordVersion} + 1`, mustChangePassword: false, oneTimePasswordExpiresAt: null, updatedAt: new Date() }).where(and(eq(usersTable.id, candidate.userId), eq(usersTable.authProvider, getLocalProvider().key))).returning({ id: usersTable.id });
    if (!changed) return false;
    await tx.update(authTokensTable).set({ usedAt: new Date() }).where(and(eq(authTokensTable.userId, candidate.userId), eq(authTokensTable.kind, "password_reset"), isNull(authTokensTable.usedAt)));
    await tx.update(sessionsTable).set({ revokedAt: new Date() }).where(and(eq(sessionsTable.userId, candidate.userId), isNull(sessionsTable.revokedAt)));
    return candidate.userId;
  });
  if (!updated) {
    res.status(400).json({ error: "Link ist ungueltig oder abgelaufen." });
    return;
  }
  invalidateUserCache(updated);
  res.json({ ok: true });
});

router.post("/password/change", passwordChangeLimiter, requireAuthForPasswordChange, async (req: AuthRequest, res) => {
  const { currentProof, newProof, newLoginSalt, crypto } = req.body as {
    currentProof?: unknown; newProof?: unknown; newLoginSalt?: unknown;
    crypto?: { encryptedPrivateKey?: unknown; saltEnc?: unknown } | null;
  };
  if (!validProof(currentProof) || !validProof(newProof) || !validLoginSalt(newLoginSalt) || currentProof === newProof) {
    res.status(400).json({ error: "Aktueller und neuer Proof sind ungueltig." });
    return;
  }
  const cryptoValid =
    !crypto ||
    (typeof crypto.encryptedPrivateKey === "string" && crypto.encryptedPrivateKey.length > 0 && crypto.encryptedPrivateKey.length <= 8192 &&
     typeof crypto.saltEnc === "string" && crypto.saltEnc.length >= 8 && crypto.saltEnc.length <= 8192);
  if (!cryptoValid) {
    res.status(400).json({ error: "Schluesselmaterial ist ungueltig." });
    return;
  }
  const [user] = await db.select({ passwordHash: usersTable.passwordHash, passwordVersion: usersTable.passwordVersion, role: usersTable.role, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email, username: usersTable.username, schoolId: usersTable.schoolId, profileConfirmedAt: usersTable.profileConfirmedAt }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!user?.passwordHash || !verifyLoginProof(currentProof, user.passwordHash)) {
    res.status(401).json({ error: "Ungültige Zugangsdaten" });
    return;
  }
  const passwordHash = await hashLoginProof(newProof);
  const [updated] = await db.update(usersTable).set({ passwordHash, loginSalt: newLoginSalt, passwordVersion: sql`${usersTable.passwordVersion} + 1`, mustChangePassword: false, oneTimePasswordExpiresAt: null, updatedAt: new Date() }).where(eq(usersTable.id, req.user!.userId)).returning();
  if (crypto) {
    // Der oeffentliche Schluessel bleibt beim Passwortwechsel unveraendert;
    // neu verschluesselt wird nur der private Teil (mit dem neuen KEK).
    const [existing] = await db
      .select({ publicKey: userCryptoKeysTable.publicKey })
      .from(userCryptoKeysTable)
      .where(eq(userCryptoKeysTable.userId, req.user!.userId))
      .limit(1);
    if (existing) {
      await upsertUserCryptoKey(db, req.user!.userId, {
        publicKey: existing.publicKey,
        encryptedPrivateKey: crypto.encryptedPrivateKey as string,
        saltEnc: crypto.saltEnc as string,
      });
    }
  }
  await revokeAllSessionsForUser(req.user!.userId);
  const sessionToken = await createSession(req.user!.userId);
  res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
  invalidateUserCache(req.user!.userId);
  const token = jwt.sign({ userId: req.user!.userId, role: user.role, passwordVersion: user.passwordVersion + 1, authTime: currentAuthTime() }, JWT_SECRET, { expiresIn: "2h" });
  res.json({ token, ...(await buildUserResponse({ id: req.user!.userId, ...user, profileConfirmedAt: user.profileConfirmedAt, mustChangePassword: false })) });
});

router.post("/native-session", sessionLimiter, async (req, res) => {
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  if (!code || code.length > 100) {
    res.status(400).json({ error: "Uebergabecode ist ungueltig." });
    return;
  }

  const verifier = typeof req.body?.verifier === "string" ? req.body.verifier : "";
  const handoff = nativeHandoffs.get(code);
  if (!handoff || !verifier) {
    res.status(401).json({ error: "Uebergabecode ist abgelaufen." });
    return;
  }
  if (handoff.expiresAt <= Date.now()) {
    nativeHandoffs.delete(code);
    res.status(401).json({ error: "Uebergabecode ist abgelaufen." });
    return;
  }

  const sessionToken = handoff.sessionToken;
  const actualVerifierHash = createHash("sha256").update(verifier).digest();
  const expectedVerifierHash = Buffer.from(handoff.verifierHash, "hex");
  if (
    expectedVerifierHash.length !== actualVerifierHash.length ||
    !timingSafeEqual(actualVerifierHash, expectedVerifierHash)
  ) {
    res.status(401).json({ error: "Uebergabecode ist ungueltig." });
    return;
  }
  nativeHandoffs.delete(code);

  const resolved = await resolveSession(sessionToken);
  if (!resolved) {
    res.status(401).json({ error: "Sitzung ist abgelaufen." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, resolved.userId)).limit(1);
  if (!user || !user.isApproved) {
    await revokeSession(sessionToken);
    res.status(401).json({ error: "Sitzung ist abgelaufen." });
    return;
  }

  const role = user.role ?? "sanitaeter";
  const token = jwt.sign({
    userId: user.id,
    role,
    passwordVersion: user.passwordVersion,
    authTime: Math.floor(resolved.authenticatedAt.getTime() / 1000),
  }, JWT_SECRET, { expiresIn: "2h" });
  res.json({
    token,
    ...(await buildUserResponse({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      role,
      schoolId: user.schoolId,
      profileConfirmedAt: user.profileConfirmedAt,
      mustChangePassword: user.mustChangePassword,
    })),
  });
});

router.get("/handoff", sessionLimiter, async (req, res) => {
  const code = typeof req.query["code"] === "string" ? req.query["code"] : "";
  if (!code || code.length > 100) {
    res.status(400).json({ error: "Uebergabecode ist ungueltig." });
    return;
  }
  const handoff = webHandoffs.get(code);
  if (!handoff || handoff.expiresAt <= Date.now()) {
    webHandoffs.delete(code);
    res.status(401).json({ error: "Uebergabecode ist abgelaufen." });
    return;
  }
  webHandoffs.delete(code);
  const resolved = await resolveSession(handoff.sessionToken);
  if (!resolved) {
    res.status(401).json({ error: "Sitzung ist abgelaufen." });
    return;
  }
  // First-party auf der Instanz: der Browser ist jetzt auf der eigenen
  // Domain, das Cookie landet dort und nicht auf der zentralen.
  res.cookie(SESSION_COOKIE, handoff.sessionToken, sessionCookieOptions());
  res.redirect(config.allowedOrigins[0] ?? "/");
});

router.post("/logout", requireAuthForLogout, async (req, res) => {
  const rawToken = req.cookies?.[SESSION_COOKIE];
  if (rawToken) await revokeSession(rawToken);
  clearSessionCookie(res);
  res.clearCookie("sani-token");
  res.json({ message: "Logged out" });
});

/**
 * Bestaetigt den einmal vom Nutzer gesetzten Namen. Kein Ziel im Rumpf --
 * die Sitzung bestimmt allein, wessen Konto betroffen ist. Ein zweiter Aufruf
 * durch ein bereits bestaetigtes Konto ist kein Erfolg mehr, sondern 409: der
 * Name ist danach nur noch ueber die Verwalter-Korrektur aenderbar (PATCH
 * /users/:id/profile), damit sich die Zuordnung an Einsatzprotokollen nicht
 * nachtraeglich verwischen laesst.
 */
router.patch("/profile", profileLimiter, requireAuthAllowUnconfirmedProfile, async (req: AuthRequest, res) => {
  const { firstName, lastName } = req.body as { firstName?: unknown; lastName?: unknown };
  const cleanFirstName = validateProfileName(firstName);
  const cleanLastName = validateProfileName(lastName);
  if (!cleanFirstName || !cleanLastName) {
    res.status(400).json({ error: "Vor- und Nachname erforderlich, bis zu 100 Zeichen, ohne Steuerzeichen oder reine Ziffern." });
    return;
  }

  const userId = req.user!.userId;
  const [existing] = await db
    .select({ role: usersTable.role, schoolId: usersTable.schoolId, profileConfirmedAt: usersTable.profileConfirmedAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Konto nicht gefunden" });
    return;
  }
  if (existing.profileConfirmedAt) {
    res.status(409).json({ error: "Name bereits bestaetigt" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ firstName: cleanFirstName, lastName: cleanLastName, profileConfirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(usersTable.id, userId))
    .returning();
  invalidateUserCache(userId);

  res.json(
    await buildUserResponse({
      id: userId, firstName: updated!.firstName, lastName: updated!.lastName, email: updated!.email,
      username: updated!.username,
      role: updated!.role,
      schoolId: updated!.schoolId,
      profileConfirmedAt: updated!.profileConfirmedAt,

    }),
  );
});

router.get("/me", requireAuth, (req: AuthRequest, res) => {
  res.json({ userId: req.user!.userId, role: req.user!.role, permissions: req.user!.permissions ?? [] });
});

/**
 * Stellt eine Sitzung aus dem httpOnly-Cookie wieder her.
 *
 * Einziger Endpunkt, der das Sitzungscookie auswertet. Er tauscht es gegen ein
 * frisches, kurzlebiges Bearer-Token; alle Datenrouten akzeptieren ausschliesslich
 * dieses Token. Der Nutzerzustand wird dabei neu geladen, damit eine entzogene
 * Freischaltung sofort wirkt und nicht erst nach Ablauf des Bearer-Tokens.
 */
router.get("/session", sessionLimiter, async (req, res) => {
  const rawToken = req.cookies?.[SESSION_COOKIE];
  if (!rawToken) {
    res.status(401).json({ error: "Keine Sitzung" });
    return;
  }

  const resolved = await resolveSession(rawToken);
  if (!resolved) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Sitzung abgelaufen" });
    return;
  }

  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, resolved.userId))
    .limit(1);

  const user = rows[0];
  if (!user || !user.isApproved) {
    await revokeSession(rawToken);
    clearSessionCookie(res);
    res.status(401).json({ error: "Sitzung abgelaufen" });
    return;
  }

  const role = user.role ?? "sanitaeter";
  const token = jwt.sign({
    userId: user.id,
    role,
    passwordVersion: user.passwordVersion,
    authTime: Math.floor(resolved.authenticatedAt.getTime() / 1000),
  }, JWT_SECRET, { expiresIn: "2h" });

  res.json({
    token,
    ...(await buildUserResponse({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      role,
      schoolId: user.schoolId,
      profileConfirmedAt: user.profileConfirmedAt,
      mustChangePassword: user.mustChangePassword,
    })),
  });
});

/**
 * Anmeldewege dieser Installation, oeffentlich abrufbar -- ohne Geheimnisse,
 * ohne Client-Secret, ohne interne URLs. Kein Anmeldezwang auf dieser Route:
 * ein Anmeldebildschirm muss wissen koennen, welche Wege es ueberhaupt gibt,
 * bevor sich jemand angemeldet hat.
 */
router.get("/providers", (_req, res) => {
  res.json({
    providers: authProviders.map((p) => ({ key: p.key, displayName: p.displayName, type: p.type })),
    // Der Client zeigt den Schul-Code-Screen nur, wenn die Instanz einen
    // verlangt. Ob einer gesetzt ist, verraet nichts ueber seinen Wert.
    joinCodeRequired,
  });
});

router.get("/identities", requireAuth, async (req: AuthRequest, res) => {
  const rows = await db
    .select({
      id: userIdentitiesTable.id,
      providerKey: userIdentitiesTable.authProvider,
      createdAt: userIdentitiesTable.createdAt,
      lastUsedAt: userIdentitiesTable.lastUsedAt,
    })
    .from(userIdentitiesTable)
    .where(eq(userIdentitiesTable.userId, req.user!.userId));

  const providerByKey = new Map(authProviders.map((provider) => [provider.key, provider]));
  res.json({
    identities: rows.map((row) => {
      const provider = providerByKey.get(row.providerKey);
      return {
        id: row.id,
        providerKey: row.providerKey,
        displayName: provider?.displayName ?? "Nicht mehr verfügbar",
        type: provider?.type ?? "unknown",
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      };
    }),
  });
});

/**
 * Entfernt einen verknuepften Anmeldeweg. Nur eigene Identitaeten sind
 * erreichbar, und die letzte bleibt stehen -- ohne diesen Weg waere das Konto
 * ohne Zugang, die Aussperrsicherung wie bei den Rollen aus R5. Verknuepfen
 * und Entfernen stehen deshalb unter derselben Frischeregel wie das
 * Hinzufuegen: ein unbeaufsichtigtes, angemeldetes Geraet soll nicht
 * ausreichen, einen Zugang lautlos zu kappen.
 */
router.delete("/identities/:id", authLimiter, requireAuth, async (req: AuthRequest, res) => {
  const authTime = req.user?.authTime ?? req.user?.iat;
  if (!authTime || Date.now() - authTime * 1000 > LINK_SESSION_FRESHNESS_MS) {
    res.status(403).json({ error: "Bitte melde dich erneut an, bevor du einen Anmeldeweg entfernst.", code: "LINK_SESSION_STALE" });
    return;
  }

  const identityId = req.params["id"] as string;
  const outcome = await db.transaction(async (tx) => {
    // Nutzerzeile sperren: zwei gleichzeitige Entfernungen muessen nacheinander
    // zaehlen, sonst raeumt die zweite die letzte Identitaet weg, die die erste
    // noch gesehen hat -- Konto ohne Zugang.
    await tx.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).for("update");
    const [identity] = await tx
      .select({ id: userIdentitiesTable.id, providerKey: userIdentitiesTable.authProvider })
      .from(userIdentitiesTable)
      .where(and(
        eq(userIdentitiesTable.id, identityId),
        eq(userIdentitiesTable.userId, req.user!.userId),
      ))
      .limit(1);
    if (!identity) return "not_found" as const;

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(userIdentitiesTable)
      .where(eq(userIdentitiesTable.userId, req.user!.userId));
    if (count <= 1) return "last_identity" as const;

    await tx.delete(userIdentitiesTable).where(eq(userIdentitiesTable.id, identityId));
    // Die Identitaet ist ein Zugangsschluessel: alte Bearer-Tokens und
    // Sitzungen duerfen nach dem Entfernen nicht weiter gelten.
    await tx.update(usersTable)
      .set({ passwordVersion: sql`${usersTable.passwordVersion} + 1`, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));
    await tx.update(sessionsTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessionsTable.userId, req.user!.userId), isNull(sessionsTable.revokedAt)));
    await logIdentityChangeTx(tx, {
      userId: req.user!.userId,
      providerKey: identity.providerKey,
      action: "unlink",
    });
    return "ok" as const;
  });

  if (outcome === "not_found") {
    res.status(404).json({ error: "Anmeldeweg nicht gefunden." });
    return;
  }
  if (outcome === "last_identity") {
    res.status(409).json({ error: "Der letzte Anmeldeweg kann nicht entfernt werden." });
    return;
  }
  invalidateUserCache(req.user!.userId);
  res.status(204).send();
});

router.post("/link/:provider/start", authLimiter, requireAuth, async (req: AuthRequest, res) => {
  const provider = authProviders.find((p) => p.key === req.params["provider"]);
  if (!provider || provider.type !== "oidc-redirect") {
    res.status(404).json({ error: "Anmeldeweg nicht gefunden." });
    return;
  }

  const authTime = req.user?.authTime ?? req.user?.iat;
  if (!authTime || Date.now() - authTime * 1000 > LINK_SESSION_FRESHNESS_MS) {
    res.status(403).json({ error: "Bitte melde dich erneut an, bevor du einen Anmeldeweg verknuepfst.", code: "LINK_SESSION_STALE" });
    return;
  }

  const returnTo = typeof req.body?.returnTo === "string" ? req.body.returnTo : undefined;
  if (returnTo && !isAllowedLinkReturnUrl(returnTo)) {
    res.status(400).json({ error: "Ruecksprungziel ist nicht zulaessig." });
    return;
  }

  try {
    const linkUserId = req.user!.userId;
    const sessionToken = await createSession(linkUserId, new Date(), {
      lifetimeMs: LINK_SESSION_FRESHNESS_MS,
      absoluteLifetimeMs: LINK_SESSION_FRESHNESS_MS,
    });
    res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    const { redirectUrl } = await provider.beginRedirect({ returnTo, linkUserId });
    res.json({ redirectUrl });
  } catch (err) {
    console.error("OIDC-Verknuepfung konnte nicht gestartet werden:", err);
    res.status(503).json({ error: "Anmeldedienst nicht erreichbar. Bitte später erneut versuchen." });
  }
});

/**
 * Startet den Weiterleitungs-Ablauf eines OIDC-Anmeldewegs. Ein unbekannter
 * oder nicht-weiterleitungsbasierter Schluessel liefert 404 -- ohne Hinweis
 * darauf, ob der Schluessel grundsaetzlich existiert oder falsch konfiguriert
 * ist, damit sich daraus kein Rateraum fuer Konfigurationsdetails ergibt.
 */
router.get("/:provider/start", authLimiter, async (req, res) => {
  const provider = authProviders.find((p) => p.key === req.params["provider"]);
  if (!provider || provider.type !== "oidc-redirect") {
    res.status(404).json({ error: "Anmeldeweg nicht gefunden." });
    return;
  }

  try {
    const returnTo = typeof req.query["returnTo"] === "string" ? req.query["returnTo"] : undefined;
    const handoffChallenge = typeof req.query["handoffChallenge"] === "string" ? req.query["handoffChallenge"] : undefined;
    if (returnTo && (!isAllowedNativeReturnUrl(returnTo) || !handoffChallenge || !/^[a-f0-9]{64}$/i.test(handoffChallenge))) {
      res.status(400).json({ error: "Ruecksprungziel ist nicht zulaessig." });
      return;
    }
    const { redirectUrl } = await provider.beginRedirect({ returnTo, handoffChallenge });
    res.redirect(redirectUrl);
  } catch (err) {
    console.error("OIDC-Weiterleitung konnte nicht gestartet werden:", err);
    res.status(503).json({ error: "Anmeldedienst nicht erreichbar. Bitte später erneut versuchen." });
  }
});

/**
 * Rueckweg eines OIDC-Anmeldewegs. `completeRedirect` prueft State, Nonce und
 * ID-Token (Signatur, Aussteller, Zielgruppe, Ablauf ueber JWKS); schlaegt das
 * fehl, bricht die Anmeldung ab -- kein Rueckfall auf einen anderen Weg.
 *
 * Kontowiedererkennung laeuft ueber das Tripel (Schule, Anbieter, Subjekt),
 * nie ueber die E-Mail-Adresse: eine fremde Identitaet mit zufaellig gleicher
 * Mailadresse darf sich nicht an ein bestehendes Konto haengen.
 *
 * Am Ende wird eine httpOnly-
 * Sitzungscookie (`createSession`, unveraendert), das der Client anschliessend
 * ueber GET /auth/session gegen Token und Nutzerprojektion eintauscht.
 */
function isAllowedLinkReturnUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return false;
    if (url.protocol === "paramedic-app:" && url.hostname === "settings" && ["", "/"].includes(url.pathname)) return true;
    if (url.protocol === "exp:" && /^\/(--\/)?settings\/?$/.test(url.pathname)) {
      const host = url.hostname.toLowerCase();
      return host === "localhost" || host === "127.0.0.1" || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith(".exp.direct") || host.endsWith(".exp.host");
    }
    return config.allowedOrigins.includes(url.origin) && url.pathname === "/settings";
  } catch {
    return false;
  }
}

function isAllowedNativeReturnUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "paramedic-app:" && url.hostname === "login" && ["", "/"].includes(url.pathname) && !url.username && !url.password && !url.search && !url.hash) {
      return true;
    }
    if (url.protocol !== "exp:" || !/^\/(--\/)?login\/?$/.test(url.pathname) || url.username || url.password || url.search || url.hash) {
      return false;
    }
    const host = url.hostname.toLowerCase();
    const privateHost = host === "localhost" || host === "127.0.0.1" || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    return privateHost || host.endsWith(".exp.direct") || host.endsWith(".exp.host");
  } catch {
    return false;
  }
}

/**
 * Ein Konto mit derselben Adresse besteht, taugt aber nicht zur Verknuepfung:
 * die Adresse ist dort nie bestaetigt worden. Zwei Konten mit einer Adresse
 * legt die Datenbank nicht an, also endet die Anmeldung hier.
 */
class EmailBelongsToOtherAccount extends Error {}

/** Kennung dieses Falls im Ruecksprung; der Anmeldebildschirm textet ihn aus. */
const EMAIL_CONFLICT_PARAM = "email-konflikt";
const EMAIL_CONFLICT_MESSAGE =
  "Zu dieser E-Mail-Adresse gibt es bereits ein Konto, dessen Adresse nie bestaetigt wurde. Bestaetige sie zuerst ueber den Link in der Registrierungsmail oder wende dich an die Betreuung.";

/**
 * Findet oder legt das Konto fuer eine verifizierte externe Identitaet an.
 *
 * Wiedererkennung zuerst ueber das Tripel (Schule, Anbieter, Subjekt). Greift
 * das nicht, zaehlt die E-Mail-Adresse -- aber nur, wenn beide Seiten sie
 * bestaetigt haben: der Anbieter im Token und das bestehende Konto in
 * email_verified_at. Sonst genuegte ein Konto mit fremder Adresse, um deren
 * naechste Anmeldung ueber einen anderen Weg abzufangen.
 *
 * Derselbe Ablauf dient dem OIDC-Rueckweg und dem nativen Apple-Login; beide
 * liefern eine verifizierte Identitaet, die sich nur im Weg unterscheidet.
 */
async function reconcileAccount(
  providerKey: string,
  subject: string,
  profile: AuthProfile,
  schoolId: string,
): Promise<{ userId: string; role: UserRole; isApproved: boolean; firstName: string; lastName: string; email: string | null }> {
  const kontoSpalten = {
    id: usersTable.id,
    role: usersTable.role,
    isApproved: usersTable.isApproved,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    email: usersTable.email,
    emailVerifiedAt: usersTable.emailVerifiedAt,
  };

  const [existing] = await db
    .select({ identityId: userIdentitiesTable.id, ...kontoSpalten })
    .from(userIdentitiesTable)
    .innerJoin(usersTable, eq(usersTable.id, userIdentitiesTable.userId))
    .where(
      and(
        eq(userIdentitiesTable.schoolId, schoolId),
        eq(userIdentitiesTable.authProvider, providerKey),
        eq(userIdentitiesTable.externalSubject, subject),
      ),
    )
    .limit(1);

  const claimEmail = normaliseEmail(profile.email);
  // Bestandskonten tragen die Adresse teils in der Schreibweise des Anbieters;
  // verglichen wird deshalb kleingeschrieben, geschrieben normalisiert.
  const [sameEmail] = existing || !claimEmail
    ? []
    : await db
        .select(kontoSpalten)
        .from(usersTable)
        .where(and(eq(usersTable.schoolId, schoolId), sql`lower(${usersTable.email}) = ${claimEmail}`))
        .limit(1);

  if (sameEmail && !(profile.emailVerified === true && sameEmail.emailVerifiedAt)) {
    throw new EmailBelongsToOtherAccount(sameEmail.id);
  }

  const account = existing ?? sameEmail;
  const userId = account?.id ?? crypto.randomUUID();

  // Erster Login ohne freigeschalteten Eigentuemer: die Installation ist frisch
  // und der Anmeldende ist der Eigentuemer. Der Web-Installer legt den
  // Eigentuemer zwar selbst an, aber ein manuell aufgesetzter Server ohne
  // Installer-Schritt kommt hierher. Nur ein verifizierter externer Login
  // zaehlt; reconcileAccount laeuft ausschliesslich fuer OIDC und den nativen
  // Apple-Login, nie fuer ein ungeprueftes lokales Konto.
  let role: UserRole;
  let isApproved: boolean;
  if (account) {
    role = account.role;
    isApproved = account.isApproved;
  } else {
    const [approvedOwner] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.schoolId, schoolId), eq(usersTable.role, "owner"), eq(usersTable.isApproved, true)))
      .limit(1);
    if (approvedOwner) {
      role = (await getRoleForUser(profile.groups ?? [], providerKey, schoolId)) ?? "sanitaeter";
      isApproved = false;
    } else {
      role = "owner";
      isApproved = true;
    }
  }

  // Apple liefert den Namen nur beim ersten Login. Vorhandene Profildaten
  // duerfen bei einem spaeteren Ruecksprung nicht durch leere Claims ersetzt
  // werden. Beim Verknuepfen zaehlt der Name des bestehenden Kontos zuerst --
  // der ist unter Umstaenden schon bestaetigt worden.
  let firstName: string;
  let lastName: string;
  if (sameEmail) {
    firstName = sameEmail.firstName || profile.firstName || subject;
    lastName = sameEmail.lastName || profile.lastName || "";
  } else {
    firstName = profile.firstName || existing?.firstName || subject;
    lastName = profile.lastName || existing?.lastName || "";
  }
  // Unbestaetigte Google-Adressen bleiben leer. Eine bestehende Adresse bleibt
  // erhalten, wenn ein spaeterer Ruecksprung keinen verifizierten Claim liefert.
  const email = claimEmail ?? account?.email ?? null;
  const emailVerifiedAt =
    claimEmail && profile.emailVerified === true ? new Date() : account?.emailVerifiedAt ?? null;
  const phone = profile.phone;

  await db.transaction(async (tx) => {
    await tx.insert(usersTable).values({
      id: userId,
      authProvider: providerKey,
      externalSubject: subject,
      firstName,
      lastName,
      email,
      emailVerifiedAt,
      phone,
      role,
      isApproved,
      schoolId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: { firstName, lastName, email, emailVerifiedAt, updatedAt: new Date() },
    });

    if (existing?.identityId) {
      await tx.update(userIdentitiesTable)
        .set({ lastUsedAt: new Date() })
        .where(eq(userIdentitiesTable.id, existing.identityId));
      return;
    }

    await tx.insert(userIdentitiesTable).values({
      // Das verknuepfte Konto hat seine primaere Identitaet schon; die zweite
      // braucht einen eigenen Schluessel.
      id: sameEmail ? `identity-${crypto.randomUUID()}` : `primary-${userId}`,
      userId,
      schoolId,
      authProvider: providerKey,
      externalSubject: subject,
      emailAtLink: email,
      lastUsedAt: new Date(),
    });
    if (sameEmail) {
      await logIdentityChangeTx(tx, { userId, providerKey, action: "link" });
    }
  });

  return { userId, role, isApproved, firstName, lastName, email };
}

async function completeOidcCallback(req: import("express").Request, res: import("express").Response): Promise<void> {
  const provider = authProviders.find((p) => p.key === req.params["provider"]);
  if (!provider || provider.type !== "oidc-redirect") {
    res.status(404).json({ error: "Anmeldeweg nicht gefunden." });
    return;
  }

  const query: Record<string, string> = {};
  const callbackValues = req.method === "POST" ? req.body : req.query;
  for (const [key, value] of Object.entries(callbackValues ?? {})) {
    if (typeof value === "string") query[key] = value;
  }

  let authResult: AuthResult;
  try {
    authResult = await provider.completeRedirect(query);
  } catch (err) {
    console.error("OIDC-Anmeldung abgebrochen:", err);
    res.status(401).json({ error: "Anmeldung fehlgeschlagen." });
    return;
  }

  const { subject, profile } = authResult;
  const schoolId = requiredSchoolId();

  if (authResult.returnTo && !authResult.handoffChallenge) {
    res.status(400).json({ error: "Native Weiterleitung ist unvollstaendig." });
    return;
  }  try {
    if (authResult.linkUserId) {
      const linkResult = await db.transaction(async (tx) => {
        const linkUserId = authResult.linkUserId!;
        const [target] = await tx
          .select({ id: usersTable.id, isApproved: usersTable.isApproved })
          .from(usersTable)
          .where(eq(usersTable.id, linkUserId))
          .limit(1);
        if (!target || !target.isApproved) return "missing-target" as const;

        const [identity] = await tx
          .select({ id: userIdentitiesTable.id, userId: userIdentitiesTable.userId })
          .from(userIdentitiesTable)
          .where(and(
            eq(userIdentitiesTable.schoolId, schoolId),
            eq(userIdentitiesTable.authProvider, provider.key),
            eq(userIdentitiesTable.externalSubject, subject),
          ))
          .limit(1);
        if (identity && identity.userId !== linkUserId) return "collision" as const;

        if (identity) {
          await tx.update(userIdentitiesTable)
            .set({ lastUsedAt: new Date() })
            .where(eq(userIdentitiesTable.id, identity.id));
          return "success" as const;
        }

        const inserted = await tx.insert(userIdentitiesTable).values({
          id: `identity-${crypto.randomUUID()}`,
          userId: linkUserId,
          schoolId,
          authProvider: provider.key,
          externalSubject: subject,
          emailAtLink: profile.email || null,
          lastUsedAt: new Date(),
        }).onConflictDoNothing().returning({ id: userIdentitiesTable.id });
        if (inserted.length > 0) {
          // Nur der Neu-Eintrag zaehlt: eine bereits verknuepfte Identitaet,
          // die nur lastUsedAt aktualisiert, ist keine Aenderung.
          await logIdentityChangeTx(tx, {
            userId: linkUserId,
            providerKey: provider.key,
            action: "link",
          });
          return "success" as const;
        }
        return "collision" as const;
      });

      if (linkResult === "missing-target") {
        res.status(401).json({ error: "Verknuepfung ist nicht mehr gueltig." });
        return;
      }
      if (linkResult === "collision") {
        if (authResult.returnTo) {
          const landingUrl = new URL(authResult.returnTo);
          landingUrl.searchParams.set("link", "collision");
          res.redirect(landingUrl.toString());
        } else {
          res.status(409).json({ error: "Dieser Anmeldeweg gehoert bereits zu einem anderen Konto. Wende dich an die Betreuung." });
        }
        return;
      }

      if (authResult.returnTo) {
        const landingUrl = new URL(authResult.returnTo);
        landingUrl.searchParams.set("link", "success");
        res.redirect(landingUrl.toString());
      } else {
        res.json({ ok: true });
      }
      return;
    }    const account = await reconcileAccount(provider.key, subject, profile, schoolId);

    // Instanz mit Schul-Zugangscode: ein nicht freigeschaltetes Konto wartet
    // auf den Code, nicht auf einen Verwalter — auch ein Konto aus einem
    // abgebrochenen frueheren Versuch. Ein frisches einmaliges Token verweist
    // auf den Schul-Code-Screen, dort wird das Konto erst freigeschaltet. Im
    // nativen Ablauf reist der Handoff als Query-Parameter zurueck in die App.
    if (joinCodeRequired && !account.isApproved) {
      const token = randomBytes(32).toString("base64url");
      joinCodeHandoffs.set(token, { userId: account.userId, expiresAt: Date.now() + JOIN_CODE_TTL_MS });
      if (authResult.returnTo) {
        const landingUrl = new URL(authResult.returnTo);
        landingUrl.searchParams.set("joinCode", "1");
        landingUrl.searchParams.set("handoff", token);
        res.redirect(landingUrl.toString());
        return;
      }
      const landing = new URL("/schul-code?handoff=" + encodeURIComponent(token), config.allowedOrigins[0] ?? "http://localhost");
      res.redirect(landing.toString());
      return;
    }

    if (!account.isApproved) {
      // Web-Flow: kein rohes JSON im Redirect-Rueckweg, sondern der
      // Freischaltungs-Screen der App. Der native Handoff (returnTo) bleibt
      // bei JSON: er endet in der App, die den Zustand selbst anzeigt.
      if (!authResult.returnTo) {
        const landing = new URL("/freischaltung-warten?via=oidc", config.allowedOrigins[0] ?? "http://localhost");
        res.redirect(landing.toString());
        return;
      }
      res.status(403).json({ error: "Dein Account wartet auf Freischaltung durch einen Administrator." });
      return;
    }

    const sessionToken = await createSession(account.userId);
    if (authResult.returnTo) {
      const handoffCode = createNativeHandoff(sessionToken, authResult.handoffChallenge!);
      const landingUrl = new URL(authResult.returnTo);
      landingUrl.searchParams.set("code", handoffCode);
      res.redirect(landingUrl.toString());
      return;
    }

    if (relaySettings) {
      // Kein Cookie durch den Relay (third-party, wird verworfen): einmaliger
      // Code, den der Browser first-party bei der Instanz einloest.
      const handoffCode = createWebHandoff(sessionToken);
      res.redirect(`${config.allowedOrigins[0]}/api/auth/handoff?code=${handoffCode}`);
      return;
    }

    res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    res.redirect(config.allowedOrigins[0] ?? "/");
  } catch (err) {
    if (err instanceof EmailBelongsToOtherAccount) {
      if (authResult.returnTo) {
        const landingUrl = new URL(authResult.returnTo);
        landingUrl.searchParams.set("fehler", EMAIL_CONFLICT_PARAM);
        res.redirect(landingUrl.toString());
        return;
      }
      const landing = new URL(`/login?fehler=${EMAIL_CONFLICT_PARAM}`, config.allowedOrigins[0] ?? "http://localhost");
      res.redirect(landing.toString());
      return;
    }
    console.error("OIDC-Anmeldung: Kontoabgleich fehlgeschlagen:", err);
    res.status(500).json({ error: "Anmeldung fehlgeschlagen." });
  }
}

router.get("/:provider/callback", authLimiter, completeOidcCallback);
router.post("/:provider/callback", authLimiter, completeOidcCallback);

/**
 * Nativer Apple-Login: Die App fragt zuerst einen Nonce an, reicht ihn an
 * Apple weiter und schickt das zurueckkommende Identity-Token hierher.
 */
router.post("/apple/native/start", authLimiter, (_req, res) => {
  const now = Date.now();
  for (const [nonce, entry] of appleNativeNonces) {
    if (entry.expiresAt <= now) appleNativeNonces.delete(nonce);
  }
  const nonce = randomBytes(24).toString("base64url");
  appleNativeNonces.set(nonce, { expiresAt: now + APPLE_NONCE_TTL_MS });
  res.json({ nonce });
});

router.post("/apple/native/complete", authLimiter, async (req, res) => {
  const identityToken = typeof req.body?.identityToken === "string" ? req.body.identityToken : "";
  const nonce = typeof req.body?.nonce === "string" ? req.body.nonce : "";
  if (!identityToken || identityToken.length > 10_000 || !nonce || nonce.length > 200) {
    res.status(400).json({ error: "Anmeldung fehlgeschlagen." });
    return;
  }

  const entry = appleNativeNonces.get(nonce);
  // Einmalig verbrauchen -- ein zweiter Versuch mit demselben Nonce darf
  // nicht greifen, unabhaengig davon, ob die Verifikation gelingt.
  appleNativeNonces.delete(nonce);
  if (!entry || entry.expiresAt <= Date.now()) {
    res.status(401).json({ error: "Anmeldung fehlgeschlagen." });
    return;
  }

  const provider = authProviders.find(
    (candidate): candidate is RedirectAuthProvider =>
      candidate.type === "oidc-redirect" && Boolean(candidate.verifyNativeToken),
  );
  const verifyNativeToken = provider?.verifyNativeToken;
  if (!provider || !verifyNativeToken) {
    res.status(404).json({ error: "Anmeldeweg nicht gefunden." });
    return;
  }

  const rawFullName = req.body?.fullName;
  const fullName =
    rawFullName && typeof rawFullName === "object"
      ? {
          givenName: typeof rawFullName["givenName"] === "string" ? rawFullName["givenName"] : undefined,
          familyName: typeof rawFullName["familyName"] === "string" ? rawFullName["familyName"] : undefined,
        }
      : undefined;
  const email = typeof req.body?.email === "string" ? req.body.email : undefined;

  let authResult: AuthResult;
  try {
    authResult = await verifyNativeToken({ identityToken, nonce, fullName, email });
  } catch (err) {
    console.error("Apple-Anmeldung abgebrochen:", err);
    res.status(401).json({ error: "Anmeldung fehlgeschlagen." });
    return;
  }

  try {
    const schoolId = requiredSchoolId();
    const account = await reconcileAccount(provider.key, authResult.subject, authResult.profile, schoolId);

    // Instanz mit Schul-Zugangscode: die App wechselt auf den Schul-Code-Screen,
    // der das einmalige Handoff-Token einloest — auch bei einem Konto aus einem
    // abgebrochenen frueheren Versuch.
    if (joinCodeRequired && !account.isApproved) {
      const token = randomBytes(32).toString("base64url");
      joinCodeHandoffs.set(token, { userId: account.userId, expiresAt: Date.now() + JOIN_CODE_TTL_MS });
      res.status(403).json({ error: "Der Schul-Zugangscode fehlt.", code: "JOIN_CODE_REQUIRED", handoff: token });
      return;
    }

    if (!account.isApproved) {
      res.status(403).json({ error: "Dein Account wartet auf Freischaltung durch einen Administrator." });
      return;
    }

    const [user] = await db.select({
      passwordVersion: usersTable.passwordVersion,
      profileConfirmedAt: usersTable.profileConfirmedAt,
      mustChangePassword: usersTable.mustChangePassword,
    }).from(usersTable).where(eq(usersTable.id, account.userId)).limit(1);
    if (!user) {
      res.status(500).json({ error: "Anmeldung fehlgeschlagen." });
      return;
    }

    const sessionToken = await createSession(account.userId);
    res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    const token = jwt.sign({
      userId: account.userId,
      role: account.role,
      passwordVersion: user.passwordVersion,
      authTime: currentAuthTime(),
    }, JWT_SECRET, { expiresIn: "2h" });
    res.json({
      token,
      ...(await buildUserResponse({
        id: account.userId,
        firstName: account.firstName,
        lastName: account.lastName,
        email: account.email,
        username: null,
        role: account.role,
        schoolId,
        profileConfirmedAt: user.profileConfirmedAt,
        mustChangePassword: user.mustChangePassword,
      })),
    });
  } catch (err) {
    if (err instanceof EmailBelongsToOtherAccount) {
      res.status(409).json({ error: EMAIL_CONFLICT_MESSAGE, code: "EMAIL_IN_USE" });
      return;
    }
    console.error("Apple-Anmeldung: Kontoabgleich fehlgeschlagen:", err);
    res.status(500).json({ error: "Anmeldung fehlgeschlagen." });
  }
});

/**
 * Loest das Schul-Zugangscode-Handoff ein: Der OIDC- oder Apple-Login hat ein
 * frisches Konto angelegt, das auf die Eintrittskarte der Schule wartet. Mit
 * dem richtigen Code wird es freigeschaltet und bekommt wie bei jedem anderen
 * Login eine Sitzung; ohne oder mit falschem Code bleibt es gesperrt.
 *
 * Das Token ist einmalig und haengt an genau dem Konto, das der Anmeldeweg
 * gerade angelegt hat — es ist nicht uebertragbar und nach Ablauf wertlos.
 */
router.post("/join-code", authLimiter, async (req, res) => {
  const handoff = typeof req.body?.handoff === "string" ? req.body.handoff : "";
  if (!handoff || handoff.length > 200) {
    res.status(400).json({ error: "Der Schul-Zugangscode fehlt." });
    return;
  }

  const entry = joinCodeHandoffs.get(handoff);
  if (!entry || entry.expiresAt <= Date.now()) {
    joinCodeHandoffs.delete(handoff);
    res.status(401).json({ error: "Der Schul-Zugangscode ist abgelaufen. Bitte melde dich erneut an." });
    return;
  }

  if (!joinCodeMatches(req.body?.joinCode)) {
    // Falscher Code kostet den Vorgang nicht: Das Handoff bleibt erhalten,
    // damit ein Tippfehler nicht den ganzen Login ruiniert. Der Limiter deckt
    // Versuche ab.
    res.status(403).json({ error: "Der Schul-Zugangscode ist falsch." });
    return;
  }
  joinCodeHandoffs.delete(handoff);

  const [approved] = await db
    .update(usersTable)
    .set({ isApproved: true, updatedAt: new Date() })
    .where(and(eq(usersTable.id, entry.userId), eq(usersTable.isApproved, false)))
    .returning({ id: usersTable.id });
  if (!approved) {
    res.status(401).json({ error: "Der Schul-Zugangscode ist abgelaufen. Bitte melde dich erneut an." });
    return;
  }
  invalidateUserCache(entry.userId);

  const sessionToken = await createSession(entry.userId);
  res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());

  const [user] = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      username: usersTable.username,
      role: usersTable.role,
      schoolId: usersTable.schoolId,
      profileConfirmedAt: usersTable.profileConfirmedAt,
      mustChangePassword: usersTable.mustChangePassword,
      passwordVersion: usersTable.passwordVersion,
    })
    .from(usersTable)
    .where(eq(usersTable.id, entry.userId))
    .limit(1);
  if (!user) {
    res.status(500).json({ error: "Anmeldung fehlgeschlagen." });
    return;
  }

  const role = user.role ?? "sanitaeter";
  const token = jwt.sign({
    userId: user.id,
    role,
    passwordVersion: user.passwordVersion,
    authTime: currentAuthTime(),
  }, JWT_SECRET, { expiresIn: "2h" });
  res.json({
    token,
    ...(await buildUserResponse({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      role,
      schoolId: user.schoolId,
      profileConfirmedAt: user.profileConfirmedAt,
      mustChangePassword: user.mustChangePassword,
    })),
  });
});


export default router;
