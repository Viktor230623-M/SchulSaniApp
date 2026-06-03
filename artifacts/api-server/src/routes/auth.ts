import * as https from "https";
import * as http from "http";
import fs from "fs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts, please try again later." },
});

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
if (JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}

const ISERV_BASE = "https://gymbla.de";

const EMAIL_DOMAIN = process.env["EMAIL_DOMAIN"] ?? "gymbla.de";

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

function getRoleForUser(username: string): string {
  return BOOTSTRAP_ROLE_MAP[username.toLowerCase().trim()] ?? "sanitaeter";
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

  let firstName = username;
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

  // Whitelist check
  const whitelistPath = process.env["WHITELIST_PATH"] || "/var/www/SchulSaniApp/whitelist.json";
  let whitelist: { allowed: string[] } | null = null;
  try {
    whitelist = JSON.parse(fs.readFileSync(whitelistPath, "utf-8"));
  } catch (err) {
    console.error("Failed to load whitelist:", err);
    res.status(500).json({ error: "Server configuration error" });
    return;
  }
  
  if (!whitelist || !whitelist.allowed.includes(cleanUsername)) {
    res.status(403).json({ error: "Zugriff verweigert. Du bist nicht berechtigt diese App zu nutzen." });
    return;
  }

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
    if (msg.includes("Ungültige Zugangsdaten") || msg.includes("IServ-Sitzung")) {
      res.status(401).json({ error: "Ungültige Zugangsdaten" });
      return;
    }
    console.error("IServ profile fetch failed");
  }

  try {
    const role = getRoleForUser(cleanUsername);

    // Look up existing user by IServ username to get a stable UUID; create one on first login.
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.iservUsername, cleanUsername))
      .limit(1);

    const userId: string = existing[0]?.id ?? crypto.randomUUID();

    const userValues = {
      id: userId,
      iservUsername: cleanUsername,
      firstName,
      lastName,
      email,
      phone,
      role,
      schoolId: process.env["SCHOOL_ID"] ?? "school",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(usersTable).values(userValues).onConflictDoUpdate({
      target: usersTable.id,
      set: { firstName, lastName, email, updatedAt: new Date() },
    });

    const token = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "7d" });

    const isWeb = req.headers["user-agent"]?.includes("Mozilla") || req.headers["sec-fetch-dest"] === "document";
    if (rememberMe && isWeb) {
      res.cookie("sani-token", token, {
        httpOnly: true,
        secure: process.env["NODE_ENV"] === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    const { role: userRole, id: userId2 } = userValues;
    res.json({ token, user: { id: userId2, firstName, lastName, email, role: userRole }, isTealUnlocked: userRole === "cto" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Anmeldung fehlgeschlagen";
    console.error("Login error");
    res.status(401).json({ error: message });
  }
});

router.post("/logout", requireAuth, (req, res) => {
  res.clearCookie("sani-token");
  res.json({ message: "Logged out" });
});

router.get("/me", requireAuth, (req: AuthRequest, res) => {
  res.json({ userId: req.user!.userId, role: req.user!.role });
});

export default router;
