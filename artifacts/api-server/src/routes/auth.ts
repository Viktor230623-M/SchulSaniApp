import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { eq, and, or, isNull, gt, sql } from "drizzle-orm";
import { db, authTokensTable, usersTable, rolesTable, sessionsTable, userRoleEnum, type UserRole } from "@workspace/db";
import { permissionsForRole } from "../lib/rolePermissions";
import {
  requireAuth,
  requireAuthAllowUnconfirmedProfile,
  requireAuthForPasswordChange,
  requireAuthForLogout,
  invalidateUserCache,
  type AuthRequest,
} from "../middlewares/auth";
import { createSession, resolveSession, revokeSession } from "../lib/sessions";
import { config } from "../config";
import { loadAuthProviders } from "../auth/registry";
import type { AuthResult } from "../auth/types";
import { validateProfileName } from "../lib/profileName";
import { hashPassword } from "../auth/providers/local";
import { issueAuthToken, hashAuthToken } from "../lib/authTokens";
import { authLink, assertMailerConfig, sendMail } from "../services/mailer";

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

const SESSION_COOKIE = "sani-session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const NATIVE_HANDOFF_TTL_MS = 2 * 60 * 1000;
const nativeHandoffs = new Map<string, { sessionToken: string; verifierHash: string; expiresAt: number }>();

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
  };
}

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
if (JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}

// Anmeldewege dieser Installation, siehe ../auth/registry. Der Start bricht
// nur ab, wenn gar keiner konfiguriert ist -- ob ein passwortbasierter Weg
// existiert, entscheidet der Login, nicht der Start: der waehlt den Anbieter
// ueber den providerKey aus dem Rumpf. Ein stiller Vorgabeweg wuerde
// Anmeldedaten an den falschen Dienst schicken, sobald eine Installation
// mehrere Wege kennt.
const authProviders = loadAuthProviders();
const localProvider = authProviders.find((provider) => provider.type === "local");
if (localProvider) assertMailerConfig();

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
async function buildUserResponse(user: { id: string; firstName: string | null; lastName: string | null; email: string | null; username?: string | null; role: string; schoolId: string | null; profileConfirmedAt: Date | null; mustChangePassword: boolean }) {
  // Die Rechte kommen mit der Anmeldeantwort, damit der Client nicht mehr aus
  // dem Rollennamen ableiten muss, was sichtbar ist. Bereich ist die Schule
  // der Nutzerzeile, nicht der globale Bereich -- sonst ueberschreibt eine
  // entzogene, schulgebundene Berechtigung nie die globale Voreinstellung.
  const permissions = await permissionsForRole(user.role, user.schoolId);
  const isOwnerAccount = config.ownerUserId !== undefined && user.id === config.ownerUserId;
  return {
    user: {
      id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, username: user.username ?? null, role: user.role, isOwnerAccount,
      profileConfirmedAt: user.profileConfirmedAt ? user.profileConfirmedAt.toISOString() : null,
      mustChangePassword: user.mustChangePassword,
    },
    permissions,
    isTealUnlocked: user.role === "owner",
  };
}

router.post("/login", authLimiter, async (req, res) => {
  const { providerKey, username, password, rememberMe } = req.body as { providerKey?: string; username: string; password: string; rememberMe?: boolean };
  const provider = authProviders.find((p) => p.key === providerKey);
  if (!provider || provider.type === "oidc-redirect") {
    // Wie bei den Weiterleitungs-Routen: 404 ohne Hinweis, ob der Schluessel
    // existiert. Der Formular-Login gehoert nur zu einem passwortbasierten
    // Weg -- ein unbekannter Schluessel darf die Eingabe nicht an einen
    // anderen Anbieter weiterreichen.
    res.status(404).json({ error: "Anmeldeweg nicht gefunden." });
    return;
  }

  if (!username?.trim() || !password?.trim()) {
    res.status(400).json({ error: "Benutzername und Passwort erforderlich" });
    return;
  }

  if (username.length > 100 || password.length > 500) {
    res.status(400).json({ error: "Ungültige Eingabelänge" });
    return;
  }

  const cleanUsername = username.toLowerCase().trim();

  let firstName = cleanUsername.split(".")[0] || cleanUsername;
  let lastName = cleanUsername.split(".").slice(1).join(" ") || "";
  let email = `${cleanUsername}@${config.emailDomain}`;
  let phone = "";
  let groups: string[] = [];

  let subject = cleanUsername;

  let mustChangePassword = false;
  try {
    const authResult = await provider.authenticate({ username: cleanUsername, password });
    const { profile, subject: providerSubject } = authResult;
    mustChangePassword = authResult.mustChangePassword ?? false;
    subject = providerSubject;
    if (profile.firstName) firstName = profile.firstName;
    if (profile.lastName) lastName = profile.lastName;
    if (profile.email) email = profile.email;
    if (profile.phone) phone = profile.phone;
    if (profile.groups) groups = profile.groups;
  } catch (err: unknown) {
    const msg: string = err instanceof Error ? err.message : "";
    if (msg.includes("Ungültige Zugangsdaten")) {
      res.status(401).json({ error: "Ungültige Zugangsdaten" });
      return;
    }
    console.error(`Anmeldeweg "${provider.key}" nicht erreichbar -- Anmeldung abgelehnt`);
    res.status(503).json({ error: "Anmeldedienst nicht erreichbar. Bitte später erneut versuchen." });
    return;
  }

  try {
    const schoolId = process.env["SCHOOL_ID"] ?? "school";

    // Wie im OIDC-Rueckweg: Konto ueber Schule, Anmeldeweg und Subjekt suchen,
    // nicht ueber den global eindeutigen iserv_username. Sonst bindet eine
    // gueltige Anmeldung an der einen Schule an die Zeile der anderen, sobald
    // beide dieselbe Datenbank teilen und denselben Benutzernamen kennen.
    const existing = await db
      .select({
        id: usersTable.id,
        role: usersTable.role,
        isApproved: usersTable.isApproved,
        mustChangePassword: usersTable.mustChangePassword,
        oneTimePasswordExpiresAt: usersTable.oneTimePasswordExpiresAt,
        profileConfirmedAt: usersTable.profileConfirmedAt,
        emailVerifiedAt: usersTable.emailVerifiedAt,
        username: usersTable.username,
        authProvider: usersTable.authProvider,
        passwordVersion: usersTable.passwordVersion,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.schoolId, schoolId),
          eq(usersTable.authProvider, provider.key),
          eq(usersTable.externalSubject, subject),
        ),
      )
      .limit(1);
    const userId: string = existing[0]?.id ?? crypto.randomUUID();
    // Ohne passende Gruppe (neues Konto) bleibt "sanitaeter" nur ein Platzhalter
    // fuer die NOT-NULL-Spalte -- er entfaltet keine Wirkung, solange isApproved
    // weiter unten false bleibt und die Anmeldung blockiert. Ein Verwalter muss
    // Rolle und Freischaltung explizit setzen.
    const resolvedRole = existing[0]?.role ?? (await getRoleForUser(groups, provider.key, schoolId));
    const role: UserRole = resolvedRole ?? "sanitaeter";
    const isApproved: boolean = existing[0]?.isApproved ?? false;

    const userValues = {
      id: userId,
      iservUsername: cleanUsername,
      authProvider: provider.key,
      externalSubject: subject,
      firstName,
      lastName,
      email,
      phone,
      role,
      isApproved,
      schoolId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(usersTable).values(userValues).onConflictDoUpdate({
      target: usersTable.id,
      set: { firstName, lastName, email, updatedAt: new Date() },
    });

    if (!isApproved) {
      res.status(403).json({ error: "Dein Account wartet auf Freischaltung durch einen Administrator." });
      return;
    }
    if (provider.type === "local" && !existing[0]?.emailVerifiedAt) {
      res.status(403).json({ error: "E-Mail-Adresse noch nicht bestaetigt", code: "EMAIL_NOT_VERIFIED" });
      return;
    }

    const token = jwt.sign({ userId, role, passwordVersion: existing[0]?.passwordVersion ?? 0 }, JWT_SECRET, { expiresIn: "2h" });

    // Das alte Cookie trug ein Bearer-Token direkt und wird nicht mehr
    // ausgewertet. Aktiv loeschen, damit kein toter Wert im Browser zurueckbleibt.
    res.clearCookie("sani-token");

    const isWeb = req.headers["user-agent"]?.includes("Mozilla") || req.headers["sec-fetch-dest"] === "document";
    if (rememberMe && isWeb) {
      const sessionToken = await createSession(userId);
      res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    }

    const { role: userRole, id: userId2 } = userValues;
    res.json({
      token,
      ...(await buildUserResponse({
        id: userId2,
        firstName,
        lastName,
        email,
        username: existing[0]?.username ?? null,
        role: userRole,
        schoolId,
        profileConfirmedAt: existing[0]?.profileConfirmedAt ?? null,
        mustChangePassword: existing[0]?.mustChangePassword ?? mustChangePassword,
      })),
    });
  } catch (err: unknown) {
    console.error("Login error");
    res.status(401).json({ error: "Anmeldung fehlgeschlagen" });
  }
});

function localAccountUnavailable(res: import("express").Response): boolean {
  if (localProvider) return false;
  res.status(404).json({ error: "Lokale Konten sind in dieser Installation nicht aktiviert." });
  return true;
}

function normaliseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 10 && value.length <= 200;
}

function normaliseUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase();
  if (username.length < 3 || username.length > 100 || !/^[a-z0-9][a-z0-9._-]*$/.test(username)) return null;
  return username;
}

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

function htmlMailText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

async function waitForAuthResponse(startedAt: number): Promise<void> {
  const remaining = AUTH_RESPONSE_FLOOR_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

router.post("/local/register", localAccountLimiter, async (req, res) => {
  if (localAccountUnavailable(res)) return;
  const email = normaliseEmail(req.body?.email);
  const password = req.body?.password;
  const rawUsername = req.body?.username;
  const username = rawUsername === undefined || rawUsername === "" ? null : normaliseUsername(rawUsername);
  const firstName = typeof req.body?.firstName === "string" ? req.body.firstName.trim() : "";
  const lastName = typeof req.body?.lastName === "string" ? req.body.lastName.trim() : "";
  if (
    !email ||
    !validPassword(password) ||
    (rawUsername !== undefined && rawUsername !== "" && !username) ||
    firstName.length > 100 ||
    lastName.length > 100
  ) {
    res.status(400).json({ error: "E-Mail und Passwort sind ungueltig." });
    return;
  }

  const startedAt = Date.now();
  const schoolId = process.env["SCHOOL_ID"] ?? "school";
  const existing = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    authProvider: usersTable.authProvider,
    emailVerifiedAt: usersTable.emailVerifiedAt,
    username: usersTable.username,
  })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  const usernameAccount = username
    ? (await db.select({ id: usersTable.id, email: usersTable.email, authProvider: usersTable.authProvider })
      .from(usersTable)
      .where(and(eq(usersTable.schoolId, schoolId), eq(usersTable.username, username)))
      .limit(1))[0]
    : undefined;

  const passwordHash = await hashPassword(password);
  let mail: { to: string; subject: string; text: string; html: string } | undefined;
  try {
    const account = existing[0];
    const usernameTaken = Boolean(usernameAccount && usernameAccount.id !== account?.id);
    if (usernameTaken) {
      // Einen fremden Benutzernamen nicht als Mailziel verwenden: sonst kann
      // jeder mit einer bekannten Kennung deren Postfach fluten.
    } else if (account?.authProvider === localProvider!.key && !account.emailVerifiedAt) {
      const token = await issueAuthToken(account.id, "email_verify", new Date(Date.now() + 24 * 60 * 60 * 1000));
      mail = {
        to: account.email ?? email,
        subject: "E-Mail-Adresse bestaetigen",
        text: `Bestaetige deine E-Mail-Adresse innerhalb von 24 Stunden:\n\n${authLink("email-bestaetigen", token)}\n\nWenn du diese Registrierung nicht gestartet hast, ignoriere diese E-Mail.`,
        html: htmlMailText(`Bestaetige deine E-Mail-Adresse innerhalb von 24 Stunden:\n\n${authLink("email-bestaetigen", token)}\n\nWenn du diese Registrierung nicht gestartet hast, ignoriere diese E-Mail.`),
      };
    } else if (account) {
      mail = {
        to: account.email ?? email,
        subject: "Registrierungsversuch mit deiner E-Mail-Adresse",
        text: "Es wurde versucht, mit dieser E-Mail-Adresse ein Konto anzulegen. Wenn du das nicht warst, musst du nichts tun.",
        html: htmlMailText("Es wurde versucht, mit dieser E-Mail-Adresse ein Konto anzulegen. Wenn du das nicht warst, musst du nichts tun."),
      };
    } else {
      const userId = crypto.randomUUID();
      await db.insert(usersTable).values({
        id: userId,
        authProvider: localProvider!.key,
        externalSubject: email,
        email,
        emailVerifiedAt: null,
        username,
        firstName,
        lastName,
        passwordHash,
        role: "sanitaeter",
        schoolId,
        isApproved: false,
        profileConfirmedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = await issueAuthToken(userId, "email_verify", new Date(Date.now() + 24 * 60 * 60 * 1000));
      mail = {
        to: email,
        subject: "E-Mail-Adresse bestaetigen",
        text: `Bestaetige deine E-Mail-Adresse innerhalb von 24 Stunden:\n\n${authLink("email-bestaetigen", token)}\n\nWenn du diese Registrierung nicht gestartet hast, ignoriere diese E-Mail.`,
        html: htmlMailText(`Bestaetige deine E-Mail-Adresse innerhalb von 24 Stunden:\n\n${authLink("email-bestaetigen", token)}\n\nWenn du diese Registrierung nicht gestartet hast, ignoriere diese E-Mail.`),
      };
    }
  } catch (err) {
    console.error("Lokale Registrierung konnte nicht abgeschlossen werden:", err instanceof Error ? err.message : "unbekannter Fehler");
  }
  await waitForAuthResponse(startedAt);
  if (mail) void sendMail(mail).catch((err) => console.error("Registrierungs-Mail konnte nicht versendet werden:", err instanceof Error ? err.message : "unbekannter Fehler"));
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
    const [candidate] = await tx.select({ id: authTokensTable.id, userId: authTokensTable.userId })
      .from(authTokensTable)
      .innerJoin(usersTable, eq(usersTable.id, authTokensTable.userId))
      .where(and(
        eq(authTokensTable.tokenHash, hashAuthToken(token)),
        eq(authTokensTable.kind, "email_verify"),
        isNull(authTokensTable.usedAt),
        gt(authTokensTable.expiresAt, new Date()),
        eq(usersTable.authProvider, localProvider!.key),
      ))
      .limit(1);
    if (!candidate) return null;

    const [consumed] = await tx.update(authTokensTable)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokensTable.id, candidate.id), isNull(authTokensTable.usedAt)))
      .returning({ id: authTokensTable.id });
    if (!consumed) return null;

    const [updated] = await tx.update(usersTable)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(usersTable.id, candidate.userId), eq(usersTable.authProvider, localProvider!.key)))
      .returning({ id: usersTable.id });
    return updated ? candidate.userId : null;
  });
  if (!verifiedUserId) {
    res.status(400).json({ error: "Bestaetigungslink ist ungueltig oder abgelaufen." });
    return;
  }
  invalidateUserCache(verifiedUserId);
  res.json({ ok: true, message: "E-Mail-Adresse bestaetigt. Ein Verwalter muss dein Konto noch freischalten." });
});

router.post("/local/verify/resend", localAccountLimiter, async (req, res) => {
  if (localAccountUnavailable(res)) return;
  const email = normaliseEmail(req.body?.email);
  if (!email) {
    res.status(400).json({ error: "E-Mail ist ungueltig." });
    return;
  }
  const startedAt = Date.now();
  const [user] = await db.select({ id: usersTable.id, email: usersTable.email, emailVerifiedAt: usersTable.emailVerifiedAt })
    .from(usersTable)
    .where(and(eq(usersTable.email, email), eq(usersTable.authProvider, localProvider!.key)))
    .limit(1);
  let mail: { to: string; subject: string; text: string; html: string } | undefined;
  if (user && !user.emailVerifiedAt) {
    try {
      const token = await issueAuthToken(user.id, "email_verify", new Date(Date.now() + 24 * 60 * 60 * 1000));
      mail = {
        to: user.email ?? email,
        subject: "E-Mail-Adresse bestaetigen",
        text: `Bestaetige deine E-Mail-Adresse innerhalb von 24 Stunden:\n\n${authLink("email-bestaetigen", token)}\n\nWenn du diese Registrierung nicht gestartet hast, ignoriere diese E-Mail.`,
        html: htmlMailText(`Bestaetige deine E-Mail-Adresse innerhalb von 24 Stunden:\n\n${authLink("email-bestaetigen", token)}\n\nWenn du diese Registrierung nicht gestartet hast, ignoriere diese E-Mail.`),
      };
    } catch (err) {
      console.error("Bestaetigungs-Mail konnte nicht versendet werden:", err instanceof Error ? err.message : "unbekannter Fehler");
    }
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
  const startedAt = Date.now();
  await hashPassword(email);
  const [user] = await db.select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.email, email), eq(usersTable.authProvider, localProvider!.key)))
    .limit(1);
  let mail: { to: string; subject: string; text: string; html: string } | undefined;
  if (user) {
    try {
      const token = await issueAuthToken(user.id, "password_reset", new Date(Date.now() + 60 * 60 * 1000));
      mail = {
        to: email,
        subject: "Passwort zuruecksetzen",
        text: `Setze dein Passwort innerhalb von 60 Minuten neu:\n\n${authLink("passwort-zuruecksetzen", token)}\n\nWenn du dies nicht angefordert hast, ignoriere diese E-Mail.`,
        html: htmlMailText(`Setze dein Passwort innerhalb von 60 Minuten neu:\n\n${authLink("passwort-zuruecksetzen", token)}\n\nWenn du dies nicht angefordert hast, ignoriere diese E-Mail.`),
      };
    } catch (err) {
      console.error("Passwort-Reset-Mail konnte nicht versendet werden:", err instanceof Error ? err.message : "unbekannter Fehler");
    }
  }
  await waitForAuthResponse(startedAt);
  if (mail) void sendMail(mail).catch((err) => console.error("Passwort-Reset-Mail konnte nicht versendet werden:", err instanceof Error ? err.message : "unbekannter Fehler"));
  res.status(202).json({ message: EMAIL_RESPONSE });
});

router.post("/local/password/reset", localAccountLimiter, async (req, res) => {
  if (localAccountUnavailable(res)) return;
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const password = req.body?.password;
  if (!token || token.length > 200 || !validPassword(password)) {
    res.status(400).json({ error: "Link oder Passwort ist ungueltig." });
    return;
  }
  const updated = await db.transaction(async (tx) => {
    const [candidate] = await tx.select({ id: authTokensTable.id, userId: authTokensTable.userId })
      .from(authTokensTable)
      .innerJoin(usersTable, eq(usersTable.id, authTokensTable.userId))
      .where(and(
        eq(authTokensTable.tokenHash, hashAuthToken(token)),
        eq(authTokensTable.kind, "password_reset"),
        isNull(authTokensTable.usedAt),
        gt(authTokensTable.expiresAt, new Date()),
        eq(usersTable.authProvider, localProvider!.key),
      ))
      .limit(1);
    if (!candidate) return false;

    const [consumed] = await tx.update(authTokensTable)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokensTable.id, candidate.id), isNull(authTokensTable.usedAt)))
      .returning({ id: authTokensTable.id });
    if (!consumed) return false;

    const passwordHash = await hashPassword(password);
    const [changed] = await tx.update(usersTable)
      .set({ passwordHash, passwordVersion: sql`${usersTable.passwordVersion} + 1`, mustChangePassword: false, oneTimePasswordExpiresAt: null, updatedAt: new Date() })
      .where(and(eq(usersTable.id, candidate.userId), eq(usersTable.authProvider, localProvider!.key)))
      .returning({ id: usersTable.id });
    if (!changed) return false;

    await tx.update(authTokensTable)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokensTable.userId, candidate.userId), eq(authTokensTable.kind, "password_reset"), isNull(authTokensTable.usedAt)));
    await tx.update(sessionsTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessionsTable.userId, candidate.userId), isNull(sessionsTable.revokedAt)));
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
  const { currentPassword, newPassword } = req.body as { currentPassword?: unknown; newPassword?: unknown };
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "Aktuelles und neues Passwort erforderlich" });
    return;
  }
  if (newPassword.length < 10 || newPassword.length > 200) {
    res.status(400).json({ error: "Das neue Passwort muss 10 bis 200 Zeichen lang sein" });
    return;
  }
  if (currentPassword.length > 500 || currentPassword === newPassword) {
    res.status(400).json({ error: "Neues Passwort muss sich vom aktuellen unterscheiden" });
    return;
  }

  const [user] = await db
    .select({ passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.userId))
    .limit(1);
  if (!user?.passwordHash) {
    res.status(401).json({ error: "Ungültige Zugangsdaten" });
    return;
  }

  const bcrypt = await import("bcryptjs");
  if (!(await bcrypt.default.compare(currentPassword, user.passwordHash))) {
    res.status(401).json({ error: "Ungültige Zugangsdaten" });
    return;
  }

  const newHash = await bcrypt.default.hash(newPassword, 12);
  const updated = await db.transaction(async (tx) => {
    const [changed] = await tx
      .update(usersTable)
      .set({ passwordHash: newHash, passwordVersion: sql`${usersTable.passwordVersion} + 1`, mustChangePassword: false, oneTimePasswordExpiresAt: null, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId))
      .returning({ id: usersTable.id, role: usersTable.role, passwordVersion: usersTable.passwordVersion });
    if (!changed) return undefined;
    await tx
      .update(sessionsTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessionsTable.userId, req.user!.userId), isNull(sessionsTable.revokedAt)));
    return changed;
  });
  if (!updated) {
    res.status(404).json({ error: "Konto nicht gefunden" });
    return;
  }
  invalidateUserCache(req.user!.userId);
  const token = jwt.sign(
    { userId: updated.id, role: updated.role ?? req.user!.role, passwordVersion: updated.passwordVersion },
    JWT_SECRET,
    { expiresIn: "2h" },
  );
  if (req.cookies?.[SESSION_COOKIE]) {
    const sessionToken = await createSession(req.user!.userId);
    res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
  }
  res.json({ ok: true, token });
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
  if (!user || !user.isApproved || (user.authProvider === localProvider?.key && !user.emailVerifiedAt)) {
    await revokeSession(sessionToken);
    res.status(401).json({ error: "Sitzung ist abgelaufen." });
    return;
  }

  const role = user.role ?? "sanitaeter";
  const token = jwt.sign({ userId: user.id, role, passwordVersion: user.passwordVersion }, JWT_SECRET, { expiresIn: "2h" });
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

router.post("/logout", requireAuthForLogout, async (req, res) => {
  const rawToken = req.cookies?.[SESSION_COOKIE];
  if (rawToken) await revokeSession(rawToken);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
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
      mustChangePassword: updated!.mustChangePassword,

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
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(401).json({ error: "Sitzung abgelaufen" });
    return;
  }

  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, resolved.userId))
    .limit(1);

  const user = rows[0];
  if (!user || !user.isApproved || (user.authProvider === localProvider?.key && !user.emailVerifiedAt)) {
    await revokeSession(rawToken);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(401).json({ error: "Sitzung abgelaufen" });
    return;
  }

  const role = user.role ?? "sanitaeter";
  const token = jwt.sign({ userId: user.id, role, passwordVersion: user.passwordVersion }, JWT_SECRET, { expiresIn: "2h" });

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
  });
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
 * Am Ende dieselbe Sitzungsausgabe wie beim Formular-Login: ein httpOnly-
 * Sitzungscookie (`createSession`, unveraendert), das der Client anschliessend
 * ueber GET /auth/session gegen Token und Nutzerprojektion eintauscht.
 */
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
  const schoolId = process.env["SCHOOL_ID"] ?? "school";

  try {
    const existing = await db
      .select({
        id: usersTable.id,
        role: usersTable.role,
        isApproved: usersTable.isApproved,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.schoolId, schoolId),
          eq(usersTable.authProvider, provider.key),
          eq(usersTable.externalSubject, subject),
        ),
      )
      .limit(1);

    const userId: string = existing[0]?.id ?? crypto.randomUUID();
    const resolvedRole = existing[0]?.role ?? (await getRoleForUser(profile.groups ?? [], provider.key, schoolId));
    const role: UserRole = resolvedRole ?? "sanitaeter";
    const isApproved: boolean = existing[0]?.isApproved ?? false;

    // Apple liefert den Namen nur beim ersten Login. Vorhandene Profildaten
    // duerfen bei einem spaeteren Ruecksprung nicht durch leere Claims ersetzt werden.
    const firstName = profile.firstName || existing[0]?.firstName || subject;
    const lastName = profile.lastName || existing[0]?.lastName || "";
    // Unbestaetigte Google-Adressen bleiben leer. Eine bestehende Adresse bleibt
    // erhalten, wenn ein spaeterer Ruecksprung keinen verifizierten Claim liefert.
    const email = profile.email || existing[0]?.email || null;
    const phone = profile.phone;

    await db
      .insert(usersTable)
      .values({
        id: userId,
        authProvider: provider.key,
        externalSubject: subject,
        firstName,
        lastName,
        email,
        phone,
        role,
        isApproved,
        schoolId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: { firstName, lastName, email, updatedAt: new Date() },
      });

    if (!isApproved) {
      res.status(403).json({ error: "Dein Account wartet auf Freischaltung durch einen Administrator." });
      return;
    }

    const sessionToken = await createSession(userId);
    if (authResult.returnTo) {
      if (!authResult.handoffChallenge) {
        res.status(400).json({ error: "Native Weiterleitung ist unvollstaendig." });
        return;
      }
      const handoffCode = createNativeHandoff(sessionToken, authResult.handoffChallenge);
      const landingUrl = new URL(authResult.returnTo);
      landingUrl.searchParams.set("code", handoffCode);
      res.redirect(landingUrl.toString());
      return;
    }

    res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    res.redirect(config.allowedOrigins[0] ?? "/");
  } catch (err) {
    console.error("OIDC-Anmeldung: Kontoabgleich fehlgeschlagen:", err);
    res.status(500).json({ error: "Anmeldung fehlgeschlagen." });
  }
}

router.get("/:provider/callback", authLimiter, completeOidcCallback);
router.post("/:provider/callback", authLimiter, completeOidcCallback);


export default router;
