import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { eq, and, or, isNull } from "drizzle-orm";
import { db, userIdentitiesTable, usersTable, rolesTable, sessionsTable, userRoleEnum, type UserRole } from "@workspace/db";
import { permissionsForRole } from "../lib/rolePermissions";
import {
  requireAuth,
  requireAuthAllowUnconfirmedProfile,
  requireAuthForLogout,
  invalidateUserCache,
  type AuthRequest,
} from "../middlewares/auth";
import { createSession, resolveSession, revokeSession } from "../lib/sessions";
import { config } from "../config";
import { loadAuthProviders } from "../auth/registry";
import type { AuthResult } from "../auth/types";
import { validateProfileName } from "../lib/profileName";

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

const SESSION_COOKIE = "sani-session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const LINK_SESSION_FRESHNESS_MS = 15 * 60 * 1000;

function currentAuthTime(): number {
  return Math.floor(Date.now() / 1000);
}
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

const authProviders = loadAuthProviders();

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
async function buildUserResponse(user: { id: string; firstName: string | null; lastName: string | null; email: string | null; username?: string | null; role: string; schoolId: string | null; profileConfirmedAt: Date | null }) {
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
    },
    permissions,
    isTealUnlocked: user.role === "owner",
  };
}

/*
 * Passwort-Login ist absichtlich kein API-Weg. Jede Anmeldung startet bei
 * einem OIDC-Anbieter und kommt nur ueber dessen geprueften Callback zurueck.
 */
router.post("/login", authLimiter, (_req, res) => {
  res.status(404).json({ error: "Anmeldeweg nicht gefunden." });
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
  if (!user || !user.isApproved) {
    await revokeSession(rawToken);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(401).json({ error: "Sitzung abgelaufen" });
    return;
  }

  const role = user.role ?? "sanitaeter";
  const token = jwt.sign({
    userId: user.id,
    role,
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
  const schoolId = process.env["SCHOOL_ID"]?.trim() || "school";

  if (authResult.returnTo && !authResult.handoffChallenge) {
    res.status(400).json({ error: "Native Weiterleitung ist unvollstaendig." });
    return;
  }

  try {
    const existing = await db
      .select({
        identityId: userIdentitiesTable.id,
        id: usersTable.id,
        role: usersTable.role,
        isApproved: usersTable.isApproved,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
      })
      .from(userIdentitiesTable)
      .innerJoin(usersTable, eq(usersTable.id, userIdentitiesTable.userId))
      .where(
        and(
          eq(userIdentitiesTable.schoolId, schoolId),
          eq(userIdentitiesTable.authProvider, provider.key),
          eq(userIdentitiesTable.externalSubject, subject),
        ),
      )
      .limit(1);

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
        return inserted.length > 0 ? "success" as const : "collision" as const;
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
    }

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

    await db.transaction(async (tx) => {
      await tx.insert(usersTable).values({
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

      if (existing[0]?.identityId) {
        await tx.update(userIdentitiesTable)
          .set({ lastUsedAt: new Date() })
          .where(eq(userIdentitiesTable.id, existing[0].identityId));
      } else {
        await tx.insert(userIdentitiesTable).values({
          id: `primary-${userId}`,
          userId,
          schoolId,
          authProvider: provider.key,
          externalSubject: subject,
          emailAtLink: email,
          lastUsedAt: new Date(),
        });
      }
    });

    if (!isApproved) {
      res.status(403).json({ error: "Dein Account wartet auf Freischaltung durch einen Administrator." });
      return;
    }

    const sessionToken = await createSession(userId);
    if (authResult.returnTo) {
      const handoffCode = createNativeHandoff(sessionToken, authResult.handoffChallenge!);
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
