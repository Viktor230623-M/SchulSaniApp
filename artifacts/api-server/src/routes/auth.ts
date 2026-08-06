import { Router } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { eq, and, or, isNull } from "drizzle-orm";
import { db, usersTable, rolesTable, userRoleEnum, type UserRole } from "@workspace/db";
import { permissionsForRole } from "../lib/rolePermissions";
import { requireAuth, requireAuthAllowUnconfirmedProfile, invalidateUserCache, type AuthRequest } from "../middlewares/auth";
import { createSession, resolveSession, revokeSession } from "../lib/sessions";
import { config } from "../config";
import { loadAuthProviders } from "../auth/registry";
import type { PasswordAuthProvider } from "../auth/types";
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

// Anmeldewege dieser Installation, siehe ../auth/registry. Kein Anmeldeweg ist
// mehr still voreingestellt: fehlt AUTH_PROVIDERS_PATH oder ist die Datei
// unvollstaendig, bricht loadAuthProviders() den Start mit einer erklaerenden
// Meldung ab, statt stillschweigend ohne Anmeldeweg hochzufahren.
const authProviders = loadAuthProviders();
const primaryAuthProvider = authProviders.find(
  (p): p is PasswordAuthProvider => p.type === "iserv-form",
);
if (!primaryAuthProvider) {
  throw new Error("Kein passwortbasierter Anmeldeweg konfiguriert.");
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
async function buildUserResponse(user: { id: string; firstName: string | null; lastName: string | null; email: string | null; role: string; schoolId: string | null; profileConfirmedAt: Date | null }) {
  // Die Rechte kommen mit der Anmeldeantwort, damit der Client nicht mehr aus
  // dem Rollennamen ableiten muss, was sichtbar ist. Bereich ist die Schule
  // der Nutzerzeile, nicht der globale Bereich -- sonst ueberschreibt eine
  // entzogene, schulgebundene Berechtigung nie die globale Voreinstellung.
  const permissions = await permissionsForRole(user.role, user.schoolId);
  const isOwnerAccount = config.ownerUserId !== undefined && user.id === config.ownerUserId;
  return {
    user: {
      id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role, isOwnerAccount,
      profileConfirmedAt: user.profileConfirmedAt ? user.profileConfirmedAt.toISOString() : null,
    },
    permissions,
    isTealUnlocked: user.role === "owner",
  };
}

router.post("/login", authLimiter, async (req, res) => {
  const { username, password, rememberMe } = req.body as { username: string; password: string; rememberMe?: boolean };
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

  try {
    const { profile, subject: providerSubject } = await primaryAuthProvider.authenticate({ username: cleanUsername, password });
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
    console.error("IServ auth unavailable — denying login");
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
      .select({ id: usersTable.id, role: usersTable.role, isApproved: usersTable.isApproved, profileConfirmedAt: usersTable.profileConfirmedAt })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.schoolId, schoolId),
          eq(usersTable.authProvider, primaryAuthProvider.key),
          eq(usersTable.externalSubject, subject),
        ),
      )
      .limit(1);
    const userId: string = existing[0]?.id ?? crypto.randomUUID();
    // Ohne passende Gruppe (neues Konto) bleibt "sanitaeter" nur ein Platzhalter
    // fuer die NOT-NULL-Spalte -- er entfaltet keine Wirkung, solange isApproved
    // weiter unten false bleibt und die Anmeldung blockiert. Ein Verwalter muss
    // Rolle und Freischaltung explizit setzen.
    const resolvedRole = existing[0]?.role ?? (await getRoleForUser(groups, primaryAuthProvider.key, schoolId));
    const role: UserRole = resolvedRole ?? "sanitaeter";
    const isApproved: boolean = existing[0]?.isApproved ?? false;

    const userValues = {
      id: userId,
      iservUsername: cleanUsername,
      authProvider: primaryAuthProvider.key,
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

    const token = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "2h" });

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
      ...(await buildUserResponse({ id: userId2, firstName, lastName, email, role: userRole, schoolId, profileConfirmedAt: existing[0]?.profileConfirmedAt ?? null })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Anmeldung fehlgeschlagen";
    console.error("Login error");
    res.status(401).json({ error: message });
  }
});

router.post("/logout", requireAuthAllowUnconfirmedProfile, async (req, res) => {
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
      role: updated!.role, schoolId: updated!.schoolId, profileConfirmedAt: updated!.profileConfirmedAt,
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
  const token = jwt.sign({ userId: user.id, role }, JWT_SECRET, { expiresIn: "2h" });

  res.json({
    token,
    ...(await buildUserResponse({ id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role, schoolId: user.schoolId, profileConfirmedAt: user.profileConfirmedAt })),
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
    const { redirectUrl } = await provider.beginRedirect();
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
router.get("/:provider/callback", authLimiter, async (req, res) => {
  const provider = authProviders.find((p) => p.key === req.params["provider"]);
  if (!provider || provider.type !== "oidc-redirect") {
    res.status(404).json({ error: "Anmeldeweg nicht gefunden." });
    return;
  }

  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === "string") query[k] = v;
  }

  let authResult: { subject: string; profile: { firstName: string; lastName: string; email: string; phone: string; groups?: string[] } };
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
      .select({ id: usersTable.id, role: usersTable.role, isApproved: usersTable.isApproved })
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
    // Siehe Kommentar im Formular-Login: "sanitaeter" ist hier nur ein
    // Platzhalter fuer die Spalte, wirkungslos solange isApproved false bleibt.
    const resolvedRole = existing[0]?.role ?? (await getRoleForUser(profile.groups ?? [], provider.key, schoolId));
    const role: UserRole = resolvedRole ?? "sanitaeter";
    const isApproved: boolean = existing[0]?.isApproved ?? false;

    const firstName = profile.firstName || subject;
    const lastName = profile.lastName || "";
    const email = profile.email;
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
    res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());

    // Kein eigener Anmeldebildschirm fuer OIDC in dieser Version (Schritt 7).
    // Der Client liest die Sitzung nach der Weiterleitung ueber GET /auth/session
    // aus dem gerade gesetzten Cookie -- derselbe Mechanismus wie beim Reload.
    const landingUrl = config.allowedOrigins[0] ?? "/";
    res.redirect(landingUrl);
  } catch (err) {
    console.error("OIDC-Anmeldung: Kontoabgleich fehlgeschlagen:", err);
    res.status(500).json({ error: "Anmeldung fehlgeschlagen." });
  }
});

export default router;
