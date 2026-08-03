import * as fs from "node:fs";
import * as https from "https";
import * as http from "http";
import { Router } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db, usersTable, userRoleEnum, type UserRole } from "@workspace/db";
import { permissionsForRole } from "../lib/rolePermissions";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { createSession, resolveSession, revokeSession } from "../lib/sessions";
import { config } from "../config";

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

const ISERV_BASE = config.iservBaseUrl;

const EMAIL_DOMAIN = config.emailDomain;

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1 SchulSanitaeter/1.0";

// Roles are always resolved from the database after login.
// There is no hardcoded username→role mapping — all roles are stored in the DB.
// Use the ROLE_MAP_PATH env var only for bootstrapping a fresh install (file must
// contain generic role assignments, never real names).
function loadBootstrapRoleMap(): Record<string, string> {
  const roleMapPath = process.env["ROLE_MAP_PATH"];
  if (roleMapPath) {
    try {
      return JSON.parse(fs.readFileSync(roleMapPath, "utf-8")) as Record<string, string>;
    } catch (err) {
      console.error("Failed to load bootstrap role map:", err);
    }
  }
  return {};
}

const BOOTSTRAP_ROLE_MAP = loadBootstrapRoleMap();

function isUserRole(value: string): value is UserRole {
  return (userRoleEnum.enumValues as readonly string[]).includes(value);
}

// Die Zuordnung kommt aus einer Datei ausserhalb der Anwendung und kann jeden
// Wert enthalten. Was der Datenbanktyp nicht kennt, faellt auf sanitaeter zurueck.
function getRoleForUser(username: string): UserRole {
  const mapped = BOOTSTRAP_ROLE_MAP[username.toLowerCase().trim()];
  return mapped !== undefined && isUserRole(mapped) ? mapped : "sanitaeter";
}

interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  rawHeaders: string[];
  body: string;
  location: string;
}

function httpRequest(method: "GET" | "POST", urlStr: string, reqHeaders: Record<string, string> = {}, body?: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "https:" ? https : http;
    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
      path: url.pathname + url.search,
      method,
      headers: { ...reqHeaders, ...(body ? { "Content-Length": Buffer.byteLength(body).toString() } : {}) },
    };
    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const rawLoc = res.headers["location"];
        const location = Array.isArray(rawLoc) ? rawLoc[0] : (rawLoc ?? "");
        resolve({ status: res.statusCode ?? 0, headers: res.headers, rawHeaders: res.rawHeaders, body: Buffer.concat(chunks).toString("utf-8"), location });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function extractSetCookies(rawHeaders: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < rawHeaders.length - 1; i++) {
    if (rawHeaders[i].toLowerCase() === "set-cookie") {
      const cookieStr = rawHeaders[i + 1];
      const kv = cookieStr.split(";")[0]?.trim() ?? "";
      const eq2 = kv.indexOf("=");
      if (eq2 > 0) result[kv.slice(0, eq2).trim()] = kv.slice(eq2 + 1).trim();
    }
  }
  return result;
}

function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

function resolveUrl(base: string, location: string): string {
  if (location.startsWith("http://") || location.startsWith("https://")) return location;
  const b = new URL(base);
  return `${b.protocol}//${b.host}${location}`;
}

async function iServAuth(username: string, password: string): Promise<{ firstName: string; lastName: string; email: string; phone: string }> {
  let cookies: Record<string, string> = {};
  let loginFormUrl = `${ISERV_BASE}/iserv/app/login`;

  for (let i = 0; i < 6; i++) {
    const resp = await httpRequest("GET", loginFormUrl, { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*", "Cookie": buildCookieHeader(cookies) });
    Object.assign(cookies, extractSetCookies(resp.rawHeaders));
    if (resp.status === 301 || resp.status === 302) loginFormUrl = resolveUrl(loginFormUrl, resp.location);
    else if (resp.status === 200) break;
    else throw new Error(`IServ antwortet nicht (${resp.status})`);
  }

  if (!cookies["IServAuthSession"]) throw new Error("IServ-Sitzung konnte nicht gestartet werden.");

  const formBody = new URLSearchParams({ _username: username, _password: password }).toString();
  const loginResp = await httpRequest("POST", loginFormUrl, { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA, "Cookie": buildCookieHeader(cookies), "Referer": loginFormUrl, "Accept": "text/html,application/xhtml+xml,*/*" }, formBody);
  Object.assign(cookies, extractSetCookies(loginResp.rawHeaders));

  if (loginResp.status === 200) throw new Error("Ungültige Zugangsdaten");
  if (loginResp.status !== 302) throw new Error(`Unerwartete Antwort vom Server (${loginResp.status})`);

  const postRedirectLoc = loginResp.location;
  if (postRedirectLoc.includes("/auth/login") || postRedirectLoc.includes("error") || postRedirectLoc.includes("login?")) throw new Error("Ungültige Zugangsdaten");

  let nextUrl = resolveUrl(loginFormUrl, postRedirectLoc);
  for (let i = 0; i < 6; i++) {
    const resp = await httpRequest("GET", nextUrl, { "User-Agent": UA, "Cookie": buildCookieHeader(cookies), "Accept": "text/html,*/*" });
    Object.assign(cookies, extractSetCookies(resp.rawHeaders));
    if (resp.status === 301 || resp.status === 302) nextUrl = resolveUrl(nextUrl, resp.location);
    else break;
  }

  let firstName = "";
  let lastName = "";
  let email = `${username}@${EMAIL_DOMAIN}`;
  const phone = "";

  try {
    const profileResp = await httpRequest("GET", `${ISERV_BASE}/iserv/profile`, { "User-Agent": UA, "Cookie": buildCookieHeader(cookies), "Accept": "text/html,*/*" });
    if (profileResp.status === 200) {
      const html = profileResp.body;
      const h1Match = html.match(/<h1[^>]*>\s*([^<]+)\s*<\/h1>/);
      if (h1Match?.[1]) {
        const fullName = h1Match[1].trim();
        if (fullName && !fullName.toLowerCase().includes("iserv") && fullName.length < 60) {
          const parts = fullName.split(/\s+/);
          firstName = parts.slice(0, -1).join(" ") || parts[0] || username;
          lastName = parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
        }
      }
      const emailMatch = html.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch?.[1]) email = emailMatch[1];
    }
  } catch {}

  return { firstName, lastName, email, phone };
}

// Baut die Nutzerprojektion, wie sie sowohl Login als auch Sitzungswiederherstellung
// in der Antwort zurueckgeben. Die Rolle wird hier nicht vorbelegt — das bleibt
// Sache der Aufrufer, da Login und Session unterschiedliche Standardwerte nutzen.
async function buildUserResponse(user: { id: string; firstName: string | null; lastName: string | null; email: string | null; role: string }) {
  // Die Rechte kommen mit der Anmeldeantwort, damit der Client nicht mehr aus
  // dem Rollennamen ableiten muss, was sichtbar ist.
  const permissions = await permissionsForRole(user.role, null);
  const isOwnerAccount = config.ownerUserId !== undefined && user.id === config.ownerUserId;
  return {
    user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role, isOwnerAccount },
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
  let email = `${cleanUsername}@${EMAIL_DOMAIN}`;
  let phone = "";

  try {
    const profile = await iServAuth(cleanUsername, password);
    if (profile.firstName) firstName = profile.firstName;
    if (profile.lastName) lastName = profile.lastName;
    if (profile.email) email = profile.email;
    if (profile.phone) phone = profile.phone;
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
    const existing = await db
      .select({ id: usersTable.id, role: usersTable.role, isApproved: usersTable.isApproved })
      .from(usersTable)
      .where(eq(usersTable.iservUsername, cleanUsername))
      .limit(1);

    const userId: string = existing[0]?.id ?? crypto.randomUUID();
    const role: UserRole = existing[0]?.role ?? getRoleForUser(cleanUsername);
    const isApproved: boolean = existing[0]?.isApproved ?? false;

    const userValues = {
      id: userId,
      iservUsername: cleanUsername,
      firstName,
      lastName,
      email,
      phone,
      role,
      isApproved,
      schoolId: process.env["SCHOOL_ID"] ?? "school",
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
    res.json({ token, ...(await buildUserResponse({ id: userId2, firstName, lastName, email, role: userRole })) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Anmeldung fehlgeschlagen";
    console.error("Login error");
    res.status(401).json({ error: message });
  }
});

router.post("/logout", requireAuth, async (req, res) => {
  const rawToken = req.cookies?.[SESSION_COOKIE];
  if (rawToken) await revokeSession(rawToken);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.clearCookie("sani-token");
  res.json({ message: "Logged out" });
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

  const role = user.role ?? "student_paramedic";
  const token = jwt.sign({ userId: user.id, role }, JWT_SECRET, { expiresIn: "2h" });

  res.json({
    token,
    ...(await buildUserResponse({ id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role })),
  });
});

export default router;
