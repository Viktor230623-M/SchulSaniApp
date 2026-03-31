import { Router } from "express";
import jwt from "jsonwebtoken";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

const JWT_SECRET = process.env["JWT_SECRET"] ?? "schulsan-dev-secret-change-in-prod";
const ISERV_BASE = "https://gymbla.de";

// ─── Role map (username → app role) ──────────────────────────────────────────
const ROLE_MAP: Record<string, string> = {
  "viktor.gnjatic": "cto",
};

function getRoleForUser(username: string): string {
  const key = username.toLowerCase().trim();
  return ROLE_MAP[key] ?? "student_paramedic";
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────
function parseSetCookies(header: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const segment of header.split(/,\s*(?=[A-Za-z_-]+=)/)) {
    const kv = segment.split(";")[0]?.trim() ?? "";
    const eq = kv.indexOf("=");
    if (eq > 0) result[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
  }
  return result;
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

// ─── IServ HTTP auth ──────────────────────────────────────────────────────────
async function iServAuth(username: string, password: string) {
  const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1 SchulSanitaeter/1.0";

  // Step 1: GET login page → extract CSRF token + initial cookie
  let pageResp: Response;
  try {
    pageResp = await fetch(`${ISERV_BASE}/iserv/app/login`, {
      headers: { "User-Agent": UA, "Accept": "text/html" },
    });
  } catch {
    throw new Error("IServ server nicht erreichbar. Bitte Internetverbindung prüfen.");
  }

  if (!pageResp.ok) throw new Error(`IServ antwortet nicht (${pageResp.status})`);

  const html = await pageResp.text();
  const csrfMatch = html.match(/name="_csrf_token"[^>]*value="([^"]+)"/);
  if (!csrfMatch) throw new Error("Login-Seite konnte nicht geladen werden.");
  const csrfToken = csrfMatch[1];

  const initCookies = parseSetCookies(pageResp.headers.get("set-cookie"));

  // Step 2: POST credentials
  const loginResp = await fetch(`${ISERV_BASE}/iserv/app/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookieHeader(initCookies),
      "User-Agent": UA,
      "Referer": `${ISERV_BASE}/iserv/app/login`,
    },
    body: new URLSearchParams({
      _username: username,
      _password: password,
      _csrf_token: csrfToken,
    }).toString(),
    redirect: "manual",
  });

  if (loginResp.status !== 302) {
    throw new Error("Ungültige Zugangsdaten");
  }

  const location = loginResp.headers.get("location") ?? "";
  if (location.includes("/login") || location.includes("error")) {
    throw new Error("Ungültige Zugangsdaten");
  }

  const loginCookies = parseSetCookies(loginResp.headers.get("set-cookie"));
  const sessionCookies = { ...initCookies, ...loginCookies };
  const session = cookieHeader(sessionCookies);

  // Step 3: Try to get user info from IServ API
  let firstName = username;
  let lastName = "";
  let email = `${username}@gymbla.de`;
  let phone = "";

  try {
    const profileResp = await fetch(`${ISERV_BASE}/iserv/profile`, {
      headers: { "Cookie": session, "User-Agent": UA },
    });

    if (profileResp.ok) {
      const profileHtml = await profileResp.text();

      // Extract full name from <title> or <h1>
      const h1 = profileHtml.match(/<h1[^>]*>\s*([^<]+)\s*<\/h1>/)?.[1]?.trim();
      const titleMatch = profileHtml.match(/<title>([^<|–-]+)/)?.[1]?.trim();
      const rawName = h1 ?? titleMatch ?? "";
      if (rawName && !rawName.toLowerCase().includes("iserv")) {
        const parts = rawName.trim().split(/\s+/);
        firstName = parts.slice(0, -1).join(" ") || parts[0] || username;
        lastName = parts[parts.length - 1] || "";
      }

      // Extract email
      const emailMatch = profileHtml.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) email = emailMatch[1];
    }
  } catch {
    // Profile fetch failed, use defaults — login still succeeded
  }

  return { firstName, lastName, email, phone };
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
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
      role,
      schoolId: "gymbla",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const token = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "7d" });
    const isTealUnlocked = role === "cto";

    res.json({ token, user, isTealUnlocked });
  } catch (err: any) {
    const message = err?.message ?? "Anmeldung fehlgeschlagen";
    res.status(401).json({ error: message });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post("/logout", requireAuth, (_req, res) => {
  res.json({ message: "Logged out" });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get("/me", requireAuth, (req: AuthRequest, res) => {
  res.json({ userId: req.user!.userId, role: req.user!.role });
});

export default router;
