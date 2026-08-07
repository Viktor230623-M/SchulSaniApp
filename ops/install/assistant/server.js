#!/usr/bin/env node
"use strict";

// Einrichtungsassistent fuer SchulSani — Schritte 5 (Konfiguration) und 6
// (Geheimnisse) der Roadmap, plus Anlegen des ersten Eigentuemer-Kontos (Rolle "owner").
// Wird von ops/install/install.sh am Ende des Systemteils gestartet, laeuft
// nur so lange, wie die Einrichtung dauert, und beendet sich danach selbst.
//
// Bewusst ohne npm-Abhaengigkeiten: zum Zeitpunkt des Aufrufs ist noch kein
// "pnpm install" im Workspace gelaufen. Nur eingebaute Node-Module.

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// --- Konfiguration aus der Umgebung (von install.sh gesetzt) ---------------

const TOKEN = process.env.SCHULSANI_TOKEN || "";
const PORT = Number(process.env.SCHULSANI_PORT || 0);
const STATE_FILE = process.env.SCHULSANI_STATE_FILE || "";
const LOG_FILE = process.env.SCHULSANI_LOG_FILE || "";
const APP_ROOT = process.env.SCHULSANI_APP_ROOT || "";
const DATABASE_URL = process.env.SCHULSANI_DATABASE_URL || "";

const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 Minuten
const SESSION_TTL_MS = 60 * 60 * 1000;

if (!TOKEN || !PORT || !STATE_FILE || !APP_ROOT || !DATABASE_URL) {
  process.stderr.write(
    "Einrichtungsassistent: Pflichtvariablen fehlen (SCHULSANI_TOKEN, " +
      "SCHULSANI_PORT, SCHULSANI_STATE_FILE, SCHULSANI_APP_ROOT, " +
      "SCHULSANI_DATABASE_URL). Wird von install.sh gesetzt.\n",
  );
  process.exit(1);
}

const BACKEND_ENV_PATH = path.join(APP_ROOT, "artifacts", "api-server", ".env");
const APP_ENV_PATH = path.join(APP_ROOT, "artifacts", "paramedic-app", ".env");

// --- Protokoll ---------------------------------------------------------

function logLine(message) {
  const line = `${new Date().toISOString()} [ASSISTENT] ${message}\n`;
  if (LOG_FILE) {
    try {
      fs.appendFileSync(LOG_FILE, line, { mode: 0o640 });
    } catch {
      // Protokoll ist nicht kritisch fuer den Ablauf.
    }
  }
  process.stdout.write(line);
}

// --- Zustandsdatei (Wiederaufnahmefall) -------------------------------

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {
      config: null,
      secrets: { jwtGenerated: false, vapidGenerated: false },
      admin: { created: false, username: null },
      complete: false,
      completedAt: null,
    };
  }
}

function saveState(state) {
  const dir = path.dirname(STATE_FILE);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, STATE_FILE);
}

let state = loadState();
let pendingProviderClientSecret = "";
if (state.config && !state.config.ownerAccountId) {
  state.config.ownerAccountId = crypto.randomUUID();
}
if (typeof state.config?.providerClientSecret === "string") {
  pendingProviderClientSecret = state.config.providerClientSecret;
  delete state.config.providerClientSecret;
  saveState(state);
}

// --- Hilfsfunktionen: Validierung (spiegelt config.ts / app.config.ts) --

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const BUNDLE_ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const IDENTIFIER_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
const SCHOOL_ID_RE = /^[a-z0-9_-]{1,40}$/i;

function trimOrEmpty(v) {
  return typeof v === "string" ? v.trim() : "";
}

function hasControlCharacter(value) {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function validateConfig(body) {
  const errors = {};
  const out = {};

  out.schoolName = trimOrEmpty(body.schoolName);
  if (!out.schoolName || out.schoolName.length > 120 || hasControlCharacter(out.schoolName)) {
    errors.schoolName = "Bitte einen Namen zwischen 1 und 120 Zeichen ohne Steuerzeichen angeben.";
  }

  out.domain = trimOrEmpty(body.domain).toLowerCase();
  if (!DOMAIN_RE.test(out.domain)) {
    errors.domain = 'Das ist keine gueltige Domain (Beispiel: sani.beispielschule.de), ohne "https://".';
  }

  out.providerKey = trimOrEmpty(body.providerKey).toLowerCase();
  if (!IDENTIFIER_RE.test(out.providerKey)) {
    errors.providerKey = "Nur eine kurze Kennung aus Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich.";
  }

  out.providerDisplayName = trimOrEmpty(body.providerDisplayName);
  if (!out.providerDisplayName || out.providerDisplayName.length > 80 || hasControlCharacter(out.providerDisplayName)) {
    errors.providerDisplayName = "Bitte einen Anzeigenamen zwischen 1 und 80 Zeichen ohne Steuerzeichen angeben.";
  }

  out.providerIssuerUrl = trimOrEmpty(body.providerIssuerUrl).replace(/\/$/, "");
  try {
    const issuer = new URL(out.providerIssuerUrl);
    if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash) throw new Error();
  } catch {
    errors.providerIssuerUrl = "Bitte eine gueltige HTTPS-Issuer-URL ohne Zugangsdaten angeben.";
  }

  out.providerClientId = trimOrEmpty(body.providerClientId);
  if (!out.providerClientId || out.providerClientId.length > 300 || hasControlCharacter(out.providerClientId)) {
    errors.providerClientId = "Bitte eine Client-ID ohne Steuerzeichen angeben.";
  }

  out.providerClientSecret = trimOrEmpty(body.providerClientSecret);
  if (out.providerClientSecret.length > 1000) {
    errors.providerClientSecret = "Client-Secret ist zu lang.";
  }

  out.appName = trimOrEmpty(body.appName);
  if (!out.appName || out.appName.length > 60 || hasControlCharacter(out.appName)) {
    errors.appName = "Bitte einen Anwendungsnamen zwischen 1 und 60 Zeichen ohne Steuerzeichen angeben.";
  }

  out.themeColor = trimOrEmpty(body.themeColor) || "#22C55E";
  if (!HEX_COLOR_RE.test(out.themeColor)) {
    errors.themeColor = "Das ist keine gueltige Farbe (Beispiel: #22C55E).";
  }

  out.bundleId = trimOrEmpty(body.bundleId);
  if (!BUNDLE_ID_RE.test(out.bundleId)) {
    errors.bundleId = "Das ist keine gueltige Kennung (Beispiel: com.beispielschule.sani).";
  }

  out.schoolId = trimOrEmpty(body.schoolId) || "school";
  if (!SCHOOL_ID_RE.test(out.schoolId)) {
    errors.schoolId = "Nur Kleinbuchstaben, Ziffern, Bindestrich und Unterstrich, maximal 40 Zeichen.";
  }

  out.ownerUserId = trimOrEmpty(body.ownerUserId);
  if (out.ownerUserId && !IDENTIFIER_RE.test(out.ownerUserId)) {
    errors.ownerUserId = "Bitte eine gueltige Konto-ID angeben.";
  }

  out.vapidSubject = trimOrEmpty(body.vapidSubject);
  if (out.vapidSubject && !/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.vapidSubject)) {
    errors.vapidSubject = 'Bitte im Format "mailto:name@domain.de" angeben, oder freilassen.';
  }
  if (!out.vapidSubject) {
    out.vapidSubject = `mailto:admin@${out.domain || "beispielschule.de"}`;
  }
  out.ownerAccountId = out.ownerUserId || crypto.randomUUID();

  return { out, errors };
}

function validateAdmin(body) {
  const errors = {};
  const out = {};
  out.externalSubject = trimOrEmpty(body.externalSubject);
  if (!out.externalSubject || out.externalSubject.length > 300) {
    errors.externalSubject = "Bitte den stabilen sub-Wert des OIDC-Anbieters angeben.";
  }
  return { out, errors };
}

// --- Geheimnisse ---------------------------------------------------------

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateJwtSecret() {
  return crypto.randomBytes(48).toString("base64");
}

function generateVapidKeyPair() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const rawPublic = ecdh.getPublicKey(); // 65 Byte, unkomprimiert
  let rawPrivate = ecdh.getPrivateKey();
  if (rawPrivate.length < 32) {
    rawPrivate = Buffer.concat([Buffer.alloc(32 - rawPrivate.length, 0), rawPrivate]);
  }
  return {
    publicKey: base64url(rawPublic),
    privateKey: base64url(rawPrivate),
  };
}

// --- .env-Dateien lesen/schreiben ----------------------------------------

function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return result;
}

function writeSecretFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(filePath, "w", 0o600);
  fs.writeSync(fd, content);
  fs.closeSync(fd);
  fs.chmodSync(filePath, 0o600);
}

function buildBackendEnv(cfg, secrets) {
  const allowedOrigins = `https://${cfg.domain}`;
  return [
    "# Automatisch vom Einrichtungsassistenten erzeugt.",
    `DATABASE_URL=${DATABASE_URL}`,
    "PORT=3002",
    `JWT_SECRET=${secrets.jwtSecret}`,
    "NODE_ENV=production",
    `ALLOWED_ORIGINS=${allowedOrigins}`,
    `AUTH_PROVIDERS_PATH=/etc/schulsani/auth-providers.json`,
    `APP_NAME=${cfg.appName}`,
    `SCHOOL_ID=${cfg.schoolId || "school"}`,
    `OWNER_USER_ID=${cfg.ownerUserId || ""}`,
    `VAPID_PUBLIC_KEY=${secrets.vapidPublicKey}`,
    `VAPID_PRIVATE_KEY=${secrets.vapidPrivateKey}`,
    `VAPID_SUBJECT=${cfg.vapidSubject}`,
    "EXPO_ACCESS_TOKEN=",
    "LIBRETRANSLATE_URL=",
    "",
  ].join("\n");
}

function buildAppEnv(cfg, secrets) {
  return [
    "# Automatisch vom Einrichtungsassistenten erzeugt.",
    `EXPO_PUBLIC_DOMAIN=${cfg.domain}`,
    `EXPO_PUBLIC_SCHOOL_NAME=${cfg.schoolName}`,
    `EXPO_PUBLIC_APP_NAME=${cfg.appName}`,
    `EXPO_PUBLIC_THEME_COLOR=${cfg.themeColor}`,
    `APP_BUNDLE_ID=${cfg.bundleId}`,
    `EXPO_PUBLIC_OWNER_USER_ID=${cfg.ownerUserId || ""}`,
    `EXPO_PUBLIC_VAPID_PUBLIC_KEY=${secrets.vapidPublicKey}`,
    "",
  ].join("\n");
}

// --- Admin-Konto ----------------------------------------------------------

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function psql(sql) {
  return execFileSync("psql", [DATABASE_URL, "-tAc", sql], {
    encoding: "utf-8",
    timeout: 15000,
  }).trim();
}

function usersTableExists() {
  const result = psql("SELECT to_regclass('public.users')");
  return result !== "" && result.toLowerCase() !== "null" && result.toLowerCase() !== "(null)";
}

// Rolle "owner" ist die schulische Hoechstrolle (vormals "cto", siehe R5
// Schritt 1 — der Enum-Wert "cto" bleibt in der Datenbank bestehen, wird
// hier aber nicht mehr vergeben).
function upsertOwner(externalSubject, cfg) {
  const id = cfg.ownerAccountId;
  const providerKey = cfg.providerKey;
  const schoolIdSql = sqlQuote(cfg.schoolId || "school");
  const ownerIdSql = sqlQuote(id);
  const subjectSql = sqlQuote(externalSubject);
  const providerSql = sqlQuote(providerKey);
  const identityIdSql = sqlQuote(`primary-${id}`);

  const existingOwner = psql(
    `SELECT coalesce(auth_provider, '') || E'\\t' || coalesce(external_subject, '') FROM users WHERE id = ${ownerIdSql}`,
  );
  if (existingOwner && existingOwner !== `${providerKey}\t${externalSubject}`) {
    throw new Error("Die konfigurierte Eigentuemer-ID gehoert bereits zu einer anderen Identitaet.");
  }

  const existingIdentity = psql(
    `SELECT user_id FROM user_identities WHERE school_id IS NOT DISTINCT FROM ${schoolIdSql} AND auth_provider = ${providerSql} AND external_subject = ${subjectSql}`,
  );
  if (existingIdentity && existingIdentity !== id) {
    throw new Error("Das OIDC-Subjekt ist bereits einem anderen Konto zugeordnet.");
  }

  const userSql =
    `INSERT INTO users (id, auth_provider, external_subject, first_name, last_name, role, school_id, is_approved, profile_confirmed_at, created_at, updated_at) ` +
    `VALUES (${ownerIdSql}, ${providerSql}, ${subjectSql}, 'Eigentuemer', 'Konto', 'owner', ${schoolIdSql}, true, NULL, now(), now()) ` +
    `ON CONFLICT (id) DO UPDATE SET role = 'owner', is_approved = true, updated_at = now();`;
  execFileSync("psql", [DATABASE_URL, "-c", userSql], { encoding: "utf-8", timeout: 15000 });
  const identitySql =
    `INSERT INTO user_identities (id, user_id, school_id, auth_provider, external_subject, last_used_at) ` +
    `VALUES (${identityIdSql}, ${ownerIdSql}, ${schoolIdSql}, ${providerSql}, ${subjectSql}, now()) ` +
    `ON CONFLICT (school_id, auth_provider, external_subject) DO UPDATE SET last_used_at = now();`;
  execFileSync("psql", [DATABASE_URL, "-c", identitySql], { encoding: "utf-8", timeout: 15000 });
}

function existingProviderClientSecret(providerKey) {
  try {
    const raw = JSON.parse(fs.readFileSync("/etc/schulsani/auth-providers.json", "utf-8"));
    const existing = Array.isArray(raw) ? raw.find((entry) => entry?.key === providerKey) : null;
    return typeof existing?.clientSecret === "string" ? existing.clientSecret : "";
  } catch {
    return "";
  }
}

function writeAuthProvidersFile(cfg, clientSecret) {
  const provider = {
    enabled: true,
    key: cfg.providerKey,
    displayName: cfg.providerDisplayName,
    type: "oidc-redirect",
    issuerUrl: cfg.providerIssuerUrl,
    clientId: cfg.providerClientId,
    redirectUri: `https://${cfg.domain}/api/auth/${cfg.providerKey}/callback`,
    scopes: ["openid", "email", "profile"],
  };
  const secret = clientSecret || existingProviderClientSecret(cfg.providerKey);
  if (secret) provider.clientSecret = secret;
  writeSecretFile("/etc/schulsani/auth-providers.json", JSON.stringify([provider], null, 2) + "\\n");
}

// --- HTTP-Server -----------------------------------------------------------

const sessions = new Map(); // sid -> { expires }
let tokenConsumed = false;
let server = null;
let lastActivity = Date.now();
let idleTimer = null;

function tokenMatches(candidate) {
  const expectedHash = crypto.createHash("sha256").update(TOKEN).digest();
  const candidateHash = crypto.createHash("sha256").update(String(candidate || "")).digest();
  return crypto.timingSafeEqual(expectedHash, candidateHash);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies["schulsani_setup"];
  if (!sid) return false;
  const entry = sessions.get(sid);
  if (!entry) return false;
  if (Date.now() > entry.expires) {
    sessions.delete(sid);
    return false;
  }
  entry.expires = Date.now() + SESSION_TTL_MS;
  return true;
}

function createSession() {
  const sid = crypto.randomBytes(32).toString("hex");
  sessions.set(sid, { expires: Date.now() + SESSION_TTL_MS });
  return sid;
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  res.end(data);
}

function sendHtml(res, status, html, nonce) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy":
      `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; ` +
      "img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self';",
  });
  res.end(html);
}

const DENIED_HTML =
  "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\">" +
  "<title>Zugriff verweigert</title></head><body style=\"font-family:sans-serif;padding:2rem\">" +
  "<h1>Zugriff verweigert</h1><p>Dieser Link ist ungueltig oder abgelaufen. " +
  "Terminal des Servers pruefen und install.sh bei Bedarf erneut starten.</p></body></html>";

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("zu gross"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const raw = await readBody(req, 64 * 1024);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("ungueltiges JSON");
  }
}

function resetIdleTimer() {
  lastActivity = Date.now();
}

function publicState() {
  return {
    config: state.config
      ? {
          schoolName: state.config.schoolName,
          domain: state.config.domain,
          providerKey: state.config.providerKey,
          providerDisplayName: state.config.providerDisplayName,
          providerIssuerUrl: state.config.providerIssuerUrl,
          providerClientId: state.config.providerClientId,
          appName: state.config.appName,
          themeColor: state.config.themeColor,
          bundleId: state.config.bundleId,
          schoolId: state.config.schoolId,
          ownerUserId: state.config.ownerUserId,
          vapidSubject: state.config.vapidSubject,
        }
      : null,
    secretsGenerated: Boolean(state.secrets.jwtGenerated && state.secrets.vapidGenerated),
    admin: { created: state.admin.created, username: state.admin.username },
    complete: state.complete,
  };
}

function shutdown(reason) {
  logLine(`Beende mich: ${reason}`);
  if (idleTimer) clearInterval(idleTimer);
  if (server) {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  } else {
    process.exit(0);
  }
}

async function handleApi(req, res, pathname) {
  resetIdleTimer();

  if (pathname === "/api/state" && req.method === "GET") {
    return sendJson(res, 200, publicState());
  }

  if (pathname === "/api/config" && req.method === "POST") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { ok: false, errors: { _: "Anfrage konnte nicht gelesen werden." } });
    }
    const { out, errors } = validateConfig(body);
    if (Object.keys(errors).length > 0) {
      return sendJson(res, 422, { ok: false, errors });
    }
    const { providerClientSecret, ...config } = out;
    config.ownerAccountId = state.config?.ownerAccountId || config.ownerAccountId || crypto.randomUUID();
    state.config = config;
    pendingProviderClientSecret = providerClientSecret;
    saveState(state);
    logLine("Konfiguration gespeichert.");
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/secrets" && req.method === "POST") {
    if (!state.config) {
      return sendJson(res, 409, { ok: false, error: "Zuerst die Konfiguration speichern." });
    }
    try {
      const existingBackend = parseEnvFile(BACKEND_ENV_PATH);
      const existingApp = parseEnvFile(APP_ENV_PATH);
      const jwtSecret = existingBackend.JWT_SECRET && existingBackend.JWT_SECRET.length >= 32
        ? existingBackend.JWT_SECRET
        : generateJwtSecret();
      let vapidPublicKey = existingBackend.VAPID_PUBLIC_KEY;
      let vapidPrivateKey = existingBackend.VAPID_PRIVATE_KEY;
      if (!vapidPublicKey || !vapidPrivateKey) {
        const pair = generateVapidKeyPair();
        vapidPublicKey = pair.publicKey;
        vapidPrivateKey = pair.privateKey;
      }
      void existingApp; // App-.env wird komplett neu aus dem Backend-Stand erzeugt.

      const secrets = { jwtSecret, vapidPublicKey, vapidPrivateKey };
      writeSecretFile(BACKEND_ENV_PATH, buildBackendEnv(state.config, secrets));
      writeSecretFile(APP_ENV_PATH, buildAppEnv(state.config, secrets));
      writeAuthProvidersFile(state.config, pendingProviderClientSecret);

      state.secrets = { jwtGenerated: true, vapidGenerated: true };
      saveState(state);
      logLine("Geheimnisse erzeugt/uebernommen, Konfigurationsdateien geschrieben (Werte nicht protokolliert).");
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      logLine(`Fehler beim Schreiben der Konfiguration: ${err.message}`);
      return sendJson(res, 500, { ok: false, error: "Konfigurationsdateien konnten nicht geschrieben werden. Protokoll pruefen." });
    }
  }

  if (pathname === "/api/admin" && req.method === "POST") {
    if (!state.secrets.jwtGenerated) {
      return sendJson(res, 409, { ok: false, error: "Zuerst die Geheimnisse erzeugen." });
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { ok: false, errors: { _: "Anfrage konnte nicht gelesen werden." } });
    }
    const { out, errors } = validateAdmin(body);
    if (Object.keys(errors).length > 0) {
      return sendJson(res, 422, { ok: false, errors });
    }
    try {
      if (!usersTableExists()) {
        return sendJson(res, 409, {
          ok: false,
          error:
            "Datenbankschema fehlt noch — Migrationen wurden noch nicht ausgefuehrt. " +
            "Migrationen zuerst nachholen, dann diese Seite erneut aufrufen.",
        });
      }
      upsertOwner(out.externalSubject, state.config);
      state.admin = { created: true, username: out.externalSubject };
      saveState(state);
      logLine(`Eigentuemer-Konto angelegt/aktualisiert (Kennung im Protokoll nicht ausgeschrieben).`);
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      logLine(`Fehler beim Anlegen des Eigentuemer-Kontos: ${err.message}`);
      return sendJson(res, 502, {
        ok: false,
        error: "Datenbank nicht erreichbar oder Befehl fehlgeschlagen. Protokoll auf dem Server pruefen.",
      });
    }
  }

  if (pathname === "/api/finish" && req.method === "POST") {
    if (!state.config || !state.secrets.jwtGenerated || !state.admin.created) {
      return sendJson(res, 409, { ok: false, error: "Einrichtung ist noch nicht vollstaendig." });
    }
    state.complete = true;
    state.completedAt = new Date().toISOString();
    saveState(state);
    logLine("Einrichtung abgeschlossen, Assistent wird beendet.");
    sendJson(res, 200, { ok: true });
    setTimeout(() => shutdown("Einrichtung abgeschlossen"), 800);
    return undefined;
  }

  return sendJson(res, 404, { ok: false, error: "Unbekannter Endpunkt." });
}

let wizardHtmlTemplate = "";
try {
  wizardHtmlTemplate = fs.readFileSync(path.join(__dirname, "wizard.html"), "utf-8");
} catch (err) {
  process.stderr.write(`wizard.html nicht lesbar: ${err.message}\n`);
  process.exit(1);
}

server = http.createServer(async (req, res) => {
  resetIdleTimer();
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;

  if (pathname === "/favicon.ico") {
    res.writeHead(204, { "Cache-Control": "no-store" });
    return res.end();
  }

  if (pathname.startsWith("/setup/") && req.method === "GET") {
    const candidate = pathname.slice("/setup/".length);
    if (tokenMatches(candidate) && !tokenConsumed) {
      const sid = createSession();
      tokenConsumed = true;
      res.writeHead(302, {
        Location: "/",
        "Set-Cookie": `schulsani_setup=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
        "Cache-Control": "no-store",
      });
      logLine("Einmal-Token verwendet, Sitzung angelegt.");
      return res.end();
    }
    logLine("Ungueltiger Zugriffsversuch auf /setup/*.");
    return sendHtml(res, 403, DENIED_HTML, "none");
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    if (!isAuthenticated(req)) {
      return sendJson(res, 401, { ok: false, error: "Nicht angemeldet." });
    }
    try {
      await handleApi(req, res, pathname);
    } catch (err) {
      logLine(`Unerwarteter Fehler: ${err.message}`);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: "Unerwarteter Fehler." });
    }
    return undefined;
  }

  if (pathname === "/" && req.method === "GET") {
    if (!isAuthenticated(req)) {
      return sendHtml(res, 403, DENIED_HTML, "none");
    }
    const nonce = crypto.randomBytes(16).toString("base64");
    const html = wizardHtmlTemplate.split("__NONCE__").join(nonce);
    return sendHtml(res, 200, html, nonce);
  }

  return sendJson(res, 404, { ok: false, error: "Nicht gefunden." });
});

idleTimer = setInterval(() => {
  if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
    shutdown("Inaktivitaets-Zeitlimit erreicht");
  }
}, 30 * 1000);
idleTimer.unref?.();

server.listen(PORT, "0.0.0.0", () => {
  logLine(`Einrichtungsassistent laeuft auf Port ${PORT}.`);
  void tokenConsumed;
});

process.on("SIGTERM", () => shutdown("SIGTERM empfangen"));
process.on("SIGINT", () => shutdown("SIGINT empfangen"));
