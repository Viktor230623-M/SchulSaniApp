import * as https from "https";
import * as http from "http";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

const JWT_SECRET = process.env["JWT_SECRET"] ?? "schulsan-dev-secret-change-in-prod";
const ISERV_BASE = "https://gymbla.de";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1 SchulSanitaeter/1.0";

const ROLE_MAP: Record<string, string> = {
  "viktor.gnjatic": "cto",
};

function getRoleForUser(username: string): string {
  return ROLE_MAP[username.toLowerCase().trim()] ?? "student_paramedic";
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
  let email = `${username}@gymbla.de`;
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

router.post("/login", async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username?.trim() || !password?.trim()) {
    res.status(400).json({ error: "Benutzername und Passwort erforderlich" });
    return;
  }

  const cleanUsername = username.toLowerCase().trim();

  try {
    const { firstName, lastName, email, phone } = await iServAuth(cleanUsername, password);
    const role = getRoleForUser(cleanUsername);
    const userId = `iserv-${cleanUsername}`;

    const user = {
      id: userId,
      firstName,
      lastName,
      email,
      phone,
      role: role as any,
      schoolId: "gymbla",
      passwordHash: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Upsert user in DB
    await db.insert(usersTable).values(user).onConflictDoUpdate({
      target: usersTable.id,
      set: { firstName, lastName, email, updatedAt: new Date() },
    });

    const token = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "7d" });
    const isTealUnlocked = role === "cto";

    res.json({ token, user, isTealUnlocked });
  } catch (err: any) {
    const message = err?.message ?? "Anmeldung fehlgeschlagen";
    res.status(401).json({ error: message });
  }
});

router.post("/logout", requireAuth, (_req, res) => {
  res.json({ message: "Logged out" });
});

router.get("/me", requireAuth, (req: AuthRequest, res) => {
  res.json({ userId: req.user!.userId, role: req.user!.role });
});

export default router;
