#!/usr/bin/env node
"use strict";

// Einrichtungsassistent fuer SchulSani — Schritte 5 (Konfiguration) und 6
// (Geheimnisse) der Roadmap, plus Anlegen des ersten Eigentuemer-Kontos (Rolle "owner").
// Wird von ops/install/install.sh am Ende des Systemteils gestartet, laeuft
// nur so lange, wie die Einrichtung dauert, und beendet sich danach selbst.
//
// Der Systemteil installiert den Workspace vor dem Assistenten, damit lokale
// Konten beim Bootstrap denselben bcrypt-Adapter wie der Server verwenden.

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
const AUTH_PROVIDERS_PATH = process.env.SCHULSANI_AUTH_PROVIDERS_PATH || "/etc/schulsani/auth-providers.json";
const TEMP_SECRET_FILE = path.join(path.dirname(STATE_FILE), "secrets.json");

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
let pendingProviderSecrets = {};
let pendingSmtpPassword = "";
let pendingOwnerPassword = "";
let pendingOwnerEmail = "";
let pendingOwnerSubject = "";
if (state.config && !state.config.ownerAccountId) {
  state.config.ownerAccountId = crypto.randomUUID();
}
if (typeof state.config?.providerClientSecret === "string") {
  pendingProviderClientSecret = state.config.providerClientSecret;
  delete state.config.providerClientSecret;
  saveState(state);
}
loadPendingSecrets();

// --- Hilfsfunktionen: Validierung (spiegelt config.ts / app.config.ts) --

// Optionaler Port am Ende (sani.beispielschule.de:8443), wenn die
// Standard-Ports 80/443 auf dem Server belegt sind.
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$/i;
const IDENTIFIER_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
const SCHOOL_ID_RE = /^[a-z0-9_-]{1,40}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SMTP_HOST_RE = /^(?:[a-z0-9][a-z0-9.-]{0,253}|\[?[0-9a-f:]+\]?)$/i;
const SCHULSANI_PRIVATE_DIR = "/etc/schulsani/";
const INSTALLER_ROLE_KEYS = new Set(["owner", "admin", "sanitaeter_leitung_admin", "sanitaeter_leitung", "teacher", "sanitaeter"]);
const SMTP_PASSWORD_MAX_LENGTH = 1000;
const LOCAL_PASSWORD_MIN_LENGTH = 10;

// Feste Marke des SaaS: eine App fuer alle Schulen, dieselbe Bundle-ID.
// Diese Werte sind kein Feld der Einrichtung — die Schule konfiguriert nur
// Domain, Anmeldewege, SMTP und Eigentuemer. Aenderungen betreffen alle
// Instanzen und passieren nur in Absprache mit dem Eigentuemer.
const BRAND_APP_NAME = "SchulSani";
const BRAND_THEME_COLOR = "#22C55E";
const BRAND_BUNDLE_ID = "com.schulsani.app";

function hashLocalPassword(password) {
  try {
    const bcrypt = require(path.join(APP_ROOT, "artifacts", "api-server", "node_modules", "bcryptjs"));
    return bcrypt.hashSync(password, 12);
  } catch {
    throw new Error("bcryptjs fehlt. Vor dem Assistenten muss pnpm install erfolgreich laufen.");
  }
}

function envLine(name, value) {
  if (hasControlCharacter(value)) throw new Error(`${name} enthaelt unzulaessige Steuerzeichen`);
  const text = String(value);
  if (text === "") return `${name}=""`;
  if (/^[A-Za-z0-9_./:@+,-]+$/.test(text)) return `${name}=${text}`;
  return `${name}="${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function validEmail(value) {
  return EMAIL_RE.test(value) && value.length <= 254;
}

function smtpConfigValid(cfg) {
  if (!cfg.smtpHost || !cfg.smtpPort || !cfg.mailFrom) return false;
  return !(cfg.smtpUser && !cfg.smtpPassword) && !(!cfg.smtpUser && cfg.smtpPassword);
}

function loadPendingSecrets() {
  try {
    const parsed = JSON.parse(fs.readFileSync(TEMP_SECRET_FILE, "utf-8"));
    pendingProviderClientSecret = typeof parsed.providerClientSecret === "string" ? parsed.providerClientSecret : "";
    pendingProviderSecrets = parsed.providerSecrets && typeof parsed.providerSecrets === "object" ? parsed.providerSecrets : {};
    pendingSmtpPassword = typeof parsed.smtpPassword === "string" ? parsed.smtpPassword : "";
    pendingOwnerEmail = typeof parsed.ownerEmail === "string" ? parsed.ownerEmail : "";
    pendingOwnerPassword = typeof parsed.ownerPassword === "string" ? parsed.ownerPassword : "";
    pendingOwnerSubject = typeof parsed.ownerSubject === "string" ? parsed.ownerSubject : "";
  } catch {
    // Keine gespeicherten Eingaben: der Assistent fragt die Geheimnisse erneut ab.
  }
}

function savePendingSecrets() {
  if (!pendingProviderClientSecret && !pendingSmtpPassword && !pendingOwnerPassword && Object.keys(pendingProviderSecrets).length === 0) return;
  writeSecretFile(TEMP_SECRET_FILE, JSON.stringify({ providerClientSecret: pendingProviderClientSecret, providerSecrets: pendingProviderSecrets, smtpPassword: pendingSmtpPassword, ownerEmail: pendingOwnerEmail, ownerPassword: pendingOwnerPassword, ownerSubject: pendingOwnerSubject }));
}

function clearPendingSecrets() {
  fs.rmSync(TEMP_SECRET_FILE, { force: true });
  pendingProviderClientSecret = "";
  pendingProviderSecrets = {};
  pendingSmtpPassword = "";
  pendingOwnerEmail = "";
  pendingOwnerPassword = "";
  pendingOwnerSubject = "";
}

function authModeIsLocal(cfg) {
  return cfg.authMode === "local" || cfg.authMode === "local+oidc";
}

function trimOrEmpty(v) {
  return typeof v === "string" ? v.trim() : "";
}

function hasControlCharacter(value) {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function providerFieldName(prefix, name) {
  return prefix ? `provider2${name[0].toUpperCase()}${name.slice(1)}` : `provider${name[0].toUpperCase()}${name.slice(1)}`;
}

function needsConfidentialClientSecret(issuerUrl) {
  const issuer = issuerUrl.replace(/\/$/, "");
  return issuer === "https://accounts.google.com" || issuer.startsWith("https://login.microsoftonline.com/");
}

function readProviderOptions(body, prefix, errors, issuerUrl) {
  const value = (name) => trimOrEmpty(body[providerFieldName(prefix, name)]);
  const options = {
    allowedHostedDomains: value("allowedHostedDomains")
      .split(",")
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean),
    scopes: (value("scopes") || "openid email profile")
      .split(/[\s,]+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
    groupsClaim: value("groupsClaim") || "groups",
    groupToRoleMap: {},
    clientSecretMode: value("clientSecretMode") || "static",
    appleTeamId: value("appleTeamId"),
    appleKeyId: value("appleKeyId"),
    applePrivateKeyPath: value("applePrivateKeyPath"),
    responseMode: value("responseMode") || "query",
  };
  const mapText = value("groupToRoleMap");
  const prefixName = prefix ? "des zweiten Anbieters" : "des Anbieters";

  if (options.allowedHostedDomains.length > 20 || options.allowedHostedDomains.some((domain) => !DOMAIN_RE.test(domain))) {
    errors[providerFieldName(prefix, "allowedHostedDomains")] = `Hosted-Domains ${prefixName} sind ungueltig.`;
  }
  if (!options.scopes.length || options.scopes.length > 20 || options.scopes.some((scope) => !/^[A-Za-z0-9._:-]{1,64}$/.test(scope))) {
    errors[providerFieldName(prefix, "scopes")] = `Scopes ${prefixName} sind ungueltig.`;
  }
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(options.groupsClaim)) {
    errors[providerFieldName(prefix, "groupsClaim")] = `Gruppen-Claim ${prefixName} ist ungueltig.`;
  }
  if (mapText) {
    for (const line of mapText.split(/\\r?\\n/).map((entry) => entry.trim()).filter(Boolean)) {
      const separator = line.indexOf("=");
      const group = separator === -1 ? "" : line.slice(0, separator).trim();
      const role = separator === -1 ? "" : line.slice(separator + 1).trim();
      if (!group || !role || group.length > 120 || role.length > 80 || !INSTALLER_ROLE_KEYS.has(role) || hasControlCharacter(line)) {
        errors[providerFieldName(prefix, "groupToRoleMap")] = `Gruppen-Zuordnung ${prefixName} ist ungueltig.`;
        break;
      }
      options.groupToRoleMap[group] = role;
    }
    if (Object.keys(options.groupToRoleMap).length > 50) {
      errors[providerFieldName(prefix, "groupToRoleMap")] = `Gruppen-Zuordnung ${prefixName} enthaelt zu viele Eintraege.`;
    }
  }
  if (!["static", "apple-jwt"].includes(options.clientSecretMode)) {
    errors[providerFieldName(prefix, "clientSecretMode")] = `Secret-Modus ${prefixName} ist ungueltig.`;
  }
  if (!["query", "form_post"].includes(options.responseMode)) {
    errors[providerFieldName(prefix, "responseMode")] = `Antwortmodus ${prefixName} ist ungueltig.`;
  }
  const apple = issuerUrl === "https://appleid.apple.com";
  if (apple && options.clientSecretMode !== "apple-jwt") {
    errors[providerFieldName(prefix, "clientSecretMode")] = "Apple braucht den Secret-Modus Apple-JWT.";
  }
  if (options.clientSecretMode === "apple-jwt") {
    if (!apple || !options.appleTeamId || !options.appleKeyId || !options.applePrivateKeyPath || path.resolve(options.applePrivateKeyPath).indexOf("/etc/schulsani/") !== 0) {
      errors[providerFieldName(prefix, "appleTeamId")] = `Apple-JWT-Konfiguration ${prefixName} ist unvollstaendig.`;
    }
    if (options.appleTeamId.length > 32 || options.appleKeyId.length > 32 || options.applePrivateKeyPath.length > 500 || hasControlCharacter(options.appleTeamId) || hasControlCharacter(options.appleKeyId) || hasControlCharacter(options.applePrivateKeyPath)) {
      errors[providerFieldName(prefix, "applePrivateKeyPath")] = `Apple-JWT-Konfiguration ${prefixName} ist ungueltig.`;
    }
  }
  return options;
}

function validateConfig(body) {
  const errors = {};
  const out = {};

  out.authMode = trimOrEmpty(body.authMode).toLowerCase() || "local";
  if (!["local", "oidc", "local+oidc"].includes(out.authMode)) {
    errors.authMode = "Bitte E-Mail, OIDC oder E-Mail mit OIDC auswaehlen.";
  }
  const usesLocal = out.authMode === "local" || out.authMode === "local+oidc";
  const usesOidc = out.authMode === "oidc" || out.authMode === "local+oidc";

  // Mindestens sechs Zeichen: Der Code ist die Eintrittskarte der Schule und
  // haelt eine 15-Minuten-Rate von wenigen Versuchen pro Minute aus. Kuerzere
  // Codes wuerde der Limiter nicht mehr vor Erraten schuetzen.
  out.joinCode = trimOrEmpty(body.joinCode);
  if (out.joinCode !== "" && (out.joinCode.length < 6 || out.joinCode.length > 200 || hasControlCharacter(out.joinCode))) {
    errors.joinCode = "Schul-Zugangscode muss 6 bis 200 Zeichen lang sein.";
  }

  out.schoolName = trimOrEmpty(body.schoolName);
  if (!out.schoolName || out.schoolName.length > 120 || hasControlCharacter(out.schoolName)) {
    errors.schoolName = "Bitte einen Namen zwischen 1 und 120 Zeichen ohne Steuerzeichen angeben.";
  }

  out.domain = trimOrEmpty(body.domain).toLowerCase();
  const domainPort = out.domain.match(/:([0-9]{1,5})$/);
  if (domainPort && (Number(domainPort[1]) < 1 || Number(domainPort[1]) > 65535)) {
    errors.domain = "Der Port muss zwischen 1 und 65535 liegen.";
  }
  if (!DOMAIN_RE.test(out.domain)) {
    errors.domain = 'Das ist keine gueltige Domain (Beispiel: sani.beispielschule.de:8443), ohne "https://".';
  }

  out.providerKey = usesOidc ? trimOrEmpty(body.providerKey).toLowerCase() : "local";
  if (!IDENTIFIER_RE.test(out.providerKey)) {
    errors.providerKey = "Nur eine kurze Kennung aus Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich.";
  }

  out.providerDisplayName = usesOidc ? trimOrEmpty(body.providerDisplayName) : "E-Mail";
  if (!out.providerDisplayName || out.providerDisplayName.length > 80 || hasControlCharacter(out.providerDisplayName)) {
    errors.providerDisplayName = "Bitte einen Anzeigenamen zwischen 1 und 80 Zeichen ohne Steuerzeichen angeben.";
  }

  out.providerIssuerUrl = trimOrEmpty(body.providerIssuerUrl).replace(/\/$/, "");
  if (usesOidc) {
    try {
      const issuer = new URL(out.providerIssuerUrl);
      if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash) throw new Error();
    } catch {
      errors.providerIssuerUrl = "Bitte eine gueltige HTTPS-Issuer-URL ohne Zugangsdaten angeben.";
    }
  } else {
    out.providerIssuerUrl = "";
  }

  out.providerClientId = trimOrEmpty(body.providerClientId);
  if (usesOidc && (!out.providerClientId || out.providerClientId.length > 300 || hasControlCharacter(out.providerClientId))) {
    errors.providerClientId = "Bitte eine Client-ID ohne Steuerzeichen angeben.";
  }
  if (!usesOidc) out.providerClientId = "";

  out.providerClientSecret = typeof body.providerClientSecret === "string" ? body.providerClientSecret : "";
  if (out.providerClientSecret.length > 1000 || hasControlCharacter(out.providerClientSecret)) {
    errors.providerClientSecret = "Client-Secret ist zu lang oder enthaelt unzulaessige Zeichen.";
  }
  if (usesOidc && needsConfidentialClientSecret(out.providerIssuerUrl) && !out.providerClientSecret) {
    errors.providerClientSecret = "Google und Microsoft brauchen fuer den Server-Anmeldeweg ein Client-Secret.";
  }
  if (!usesOidc) out.providerClientSecret = "";

  out.smtpHost = trimOrEmpty(body.smtpHost);
  if (usesLocal && (!SMTP_HOST_RE.test(out.smtpHost) || out.smtpHost.includes(".."))) {
    errors.smtpHost = "Bitte den Hostnamen oder die IP-Adresse des SMTP-Servers angeben.";
  }

  const smtpPortText = trimOrEmpty(body.smtpPort) || "587";
  const smtpPort = Number(smtpPortText);
  out.smtpPort = String(smtpPort);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    errors.smtpPort = "Bitte einen SMTP-Port zwischen 1 und 65535 angeben.";
  }

  out.smtpUser = trimOrEmpty(body.smtpUser);
  out.smtpPassword = typeof body.smtpPassword === "string" ? body.smtpPassword : "";
  if (out.smtpUser.length > 254 || hasControlCharacter(out.smtpUser)) {
    errors.smtpUser = "SMTP-Benutzername ist ungueltig.";
  }
  if (out.smtpPassword.length > SMTP_PASSWORD_MAX_LENGTH || hasControlCharacter(out.smtpPassword)) {
    errors.smtpPassword = "SMTP-Passwort ist zu lang oder enthaelt unzulaessige Zeichen.";
  }
  if ((out.smtpUser && !out.smtpPassword) || (!out.smtpUser && out.smtpPassword)) {
    errors.smtpPassword = "SMTP-Benutzername und Passwort muessen gemeinsam gesetzt werden.";
  }

  out.smtpSecure = body.smtpSecure === true || trimOrEmpty(body.smtpSecure).toLowerCase() === "true";
  out.mailFrom = trimOrEmpty(body.mailFrom).toLowerCase();
  if (usesLocal && !validEmail(out.mailFrom)) {
    errors.mailFrom = "Bitte eine gueltige Absender-E-Mail-Adresse angeben.";
  }
  if (out.mailFrom.length > 254 || hasControlCharacter(out.mailFrom)) {
    errors.mailFrom = "Absender-E-Mail-Adresse ist ungueltig.";
  }

  out.mailFromName = trimOrEmpty(body.mailFromName);
  if (out.mailFromName.length > 120 || hasControlCharacter(out.mailFromName)) {
    errors.mailFromName = "Absendername ist zu lang oder enthaelt unzulaessige Zeichen.";
  }

  // Marke kommt nicht aus dem Formular, sondern ist fest (siehe BRAND_*).
  out.appName = BRAND_APP_NAME;
  out.themeColor = BRAND_THEME_COLOR;
  out.bundleId = BRAND_BUNDLE_ID;

  out.schoolId = trimOrEmpty(body.schoolId) || "school";
  if (!SCHOOL_ID_RE.test(out.schoolId)) {
    errors.schoolId = "Nur Kleinbuchstaben, Ziffern, Bindestrich und Unterstrich, maximal 40 Zeichen.";
  } else if (schoolIdTaken(out.schoolId, state.config?.ownerAccountId || out.ownerAccountId, state.config?.schoolId)) {
    errors.schoolId = "Diese Schul-Kennung ist bereits vergeben.";
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
  const primaryOptions = usesOidc ? readProviderOptions(body, "", errors, out.providerIssuerUrl) : null;
  out.providers = usesOidc ? [{
    key: out.providerKey,
    displayName: out.providerDisplayName,
    issuerUrl: out.providerIssuerUrl,
    clientId: out.providerClientId,
    clientSecret: out.providerClientSecret,
    ...(primaryOptions || {}),
  }] : [];
  const secondKey = trimOrEmpty(body.provider2Key).toLowerCase();
  const secondDisplayName = trimOrEmpty(body.provider2DisplayName);
  const secondIssuerUrl = trimOrEmpty(body.provider2IssuerUrl).replace(/\/$/, "");
  const secondClientId = trimOrEmpty(body.provider2ClientId);
  const secondClientSecret = typeof body.provider2ClientSecret === "string" ? body.provider2ClientSecret : "";
  if (secondClientSecret.length > 1000 || hasControlCharacter(secondClientSecret)) errors.provider2ClientSecret = "Client-Secret des zweiten Anbieters ist zu lang oder enthaelt unzulaessige Zeichen.";
  const secondPresent = secondKey || secondDisplayName || secondIssuerUrl || secondClientId || secondClientSecret;
  if (secondPresent && needsConfidentialClientSecret(secondIssuerUrl) && !secondClientSecret) {
    errors.provider2ClientSecret = "Google und Microsoft brauchen fuer den Server-Anmeldeweg ein Client-Secret.";
  }
  const secondOptions = secondPresent ? readProviderOptions(body, "2", errors, secondIssuerUrl) : null;
  if (secondPresent) {
    let secondValid =
      IDENTIFIER_RE.test(secondKey) &&
      secondDisplayName.length > 0 &&
      secondDisplayName.length <= 80 &&
      !hasControlCharacter(secondDisplayName) &&
      secondClientId.length > 0 &&
      secondClientId.length <= 300 &&
      !hasControlCharacter(secondClientId);
    try {
      const issuer = new URL(secondIssuerUrl);
      secondValid = secondValid && issuer.protocol === "https:" && !issuer.username && !issuer.password && !issuer.search && !issuer.hash;
    } catch {
      secondValid = false;
    }
    if (hasControlCharacter(secondKey) || hasControlCharacter(secondIssuerUrl)) secondValid = false;
    if (!secondValid) errors.provider2Key = "Zweiter OIDC-Anbieter ist unvollstaendig oder ungueltig.";
    if (secondValid) out.providers.push({ key: secondKey, displayName: secondDisplayName, issuerUrl: secondIssuerUrl, clientId: secondClientId, clientSecret: secondClientSecret, ...(secondOptions || {}) });
  }
  if (new Set(out.providers.map((provider) => provider.key)).size !== out.providers.length) {
    errors.providerKey = "Anbieter-Kennungen muessen eindeutig sein.";
  }
  out.ownerProviderKey = usesLocal ? "local" : out.providerKey;

  return { out, errors };
}

function validateAdmin(body, cfg) {
  const errors = {};
  const out = {};
  if (authModeIsLocal(cfg)) {
    out.ownerEmail = trimOrEmpty(body.ownerEmail).toLowerCase();
    if (!validEmail(out.ownerEmail)) errors.ownerEmail = "Bitte eine gueltige E-Mail-Adresse angeben.";
    out.ownerPassword = typeof body.ownerPassword === "string" ? body.ownerPassword : "";
    out.ownerPasswordConfirm = typeof body.ownerPasswordConfirm === "string" ? body.ownerPasswordConfirm : "";
    if (out.ownerPassword.length < LOCAL_PASSWORD_MIN_LENGTH || out.ownerPassword.length > 200) {
      errors.ownerPassword = `Passwort muss zwischen ${LOCAL_PASSWORD_MIN_LENGTH} und 200 Zeichen lang sein.`;
    }
    if (out.ownerPassword !== out.ownerPasswordConfirm) {
      errors.ownerPasswordConfirm = "Passwoerter stimmen nicht ueberein.";
    }
  } else {
    out.externalSubject = trimOrEmpty(body.externalSubject);
    if (!out.externalSubject || out.externalSubject.length > 300) {
      errors.externalSubject = "Bitte den stabilen sub-Wert des OIDC-Anbieters angeben.";
    }
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

function parseEnvValue(value) {
  const text = value.trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/\\\\/g, "\\").replace(/\\"/g, '"');
  }
  return text;
}

function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    result[line.slice(0, idx).trim()] = parseEnvValue(line.slice(idx + 1));
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
    envLine("DATABASE_URL", DATABASE_URL),
    // Backend-Port kann install.sh auf einem belegten 3002 ueber
    // SCHULSANI_BACKEND_PORT umstellen.
    envLine("PORT", process.env.SCHULSANI_BACKEND_PORT || "3002"),
    envLine("JWT_SECRET", secrets.jwtSecret),
    "NODE_ENV=production",
    envLine("ALLOWED_ORIGINS", allowedOrigins),
    // Muss zum Pfad passen, in den writeAuthProvidersFile() schreibt — der
    // kommt aus SCHULSANI_AUTH_PROVIDERS_PATH und ist auf Mehrinstanz-
    // Servern nicht immer die Produktionsdatei.
    envLine("AUTH_PROVIDERS_PATH", AUTH_PROVIDERS_PATH),
    envLine("APP_NAME", cfg.appName),
    envLine("SCHOOL_ID", cfg.schoolId || "school"),
    envLine("OWNER_USER_ID", cfg.ownerUserId || ""),
    envLine("SCHOOL_JOIN_CODE", cfg.joinCode || ""),
    envLine("APP_BASE_URL", allowedOrigins),
    envLine("SMTP_HOST", cfg.smtpHost),
    envLine("SMTP_PORT", cfg.smtpPort),
    envLine("SMTP_USER", cfg.smtpUser),
    envLine("SMTP_PASSWORD", secrets.smtpPassword),
    envLine("SMTP_SECURE", cfg.smtpSecure ? "true" : "false"),
    "SMTP_REQUIRE_TLS=true",
    envLine("MAIL_FROM", cfg.mailFrom),
    envLine("MAIL_FROM_NAME", cfg.mailFromName),
    envLine("VAPID_PUBLIC_KEY", secrets.vapidPublicKey),
    envLine("VAPID_PRIVATE_KEY", secrets.vapidPrivateKey),
    envLine("VAPID_SUBJECT", cfg.vapidSubject),
    "EXPO_ACCESS_TOKEN=",
    "LIBRETRANSLATE_URL=",
    "",
  ].join("\n");
}

function buildAppEnv(cfg, secrets) {
  return [
    "# Automatisch vom Einrichtungsassistenten erzeugt.",
    envLine("EXPO_PUBLIC_DOMAIN", cfg.domain),
    envLine("EXPO_PUBLIC_SCHOOL_NAME", cfg.schoolName),
    envLine("EXPO_PUBLIC_APP_NAME", cfg.appName),
    envLine("EXPO_PUBLIC_THEME_COLOR", cfg.themeColor),
    envLine("APP_BUNDLE_ID", cfg.bundleId),
    envLine("EXPO_PUBLIC_OWNER_USER_ID", cfg.ownerUserId || ""),
    envLine("EXPO_PUBLIC_VAPID_PUBLIC_KEY", secrets.vapidPublicKey),
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

// Auf einem Server mit mehreren Schulen ist die Schul-Kennung die einzige
// Verbindung zwischen allen Zeilen einer Schule. Sie darf nur einmal
// vergeben sein. Die eigene Schule faellt heraus: laeuft der Assistent fuer
// sie erneut (Wiederaufnahme), gehoeren alle ihre Zeilen schon zu dieser
// Installation und sind kein Konflikt.
function schoolIdTaken(schoolId, ownerAccountId, configuredSchoolId) {
  if (schoolId === configuredSchoolId) return false;
  try {
    if (!usersTableExists()) return false;
    const schoolIdSql = sqlQuote(schoolId);
    const ownerIdSql = sqlQuote(ownerAccountId || "");
    const result = psql(
      `SELECT 1 FROM users WHERE school_id = ${schoolIdSql} AND id IS DISTINCT FROM ${ownerIdSql} LIMIT 1`,
    );
    return result !== "";
  } catch {
    // Datenbank nicht erreichbar: die Pruefung faellt aus, upsertOwner
    // meldet den Verbindungsfehler spaetestens beim Anlegen.
    return false;
  }
}

// Rolle "owner" ist die schulische Hoechstrolle (vormals "cto", siehe R5
// Schritt 1 — der Enum-Wert "cto" bleibt in der Datenbank bestehen, wird
// hier aber nicht mehr vergeben).
function upsertOwner(externalSubject, cfg) {
  const id = cfg.ownerAccountId;
  const providerKey = cfg.ownerProviderKey || cfg.providerKey;
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

  const local = authModeIsLocal(cfg);
  const emailSql = local ? sqlQuote(pendingOwnerEmail) : "NULL";
  const passwordSql = local ? sqlQuote(hashLocalPassword(pendingOwnerPassword)) : "DEFAULT";
  const verifiedSql = local ? "now()" : "NULL";
  const userSql =
    `INSERT INTO users (id, auth_provider, external_subject, email, email_verified_at, password_hash, first_name, last_name, role, school_id, is_approved, profile_confirmed_at, created_at, updated_at) ` +
    `VALUES (${ownerIdSql}, ${providerSql}, ${subjectSql}, ${emailSql}, ${verifiedSql}, ${passwordSql}, 'Eigentuemer', 'Konto', 'owner', ${schoolIdSql}, true, NULL, now(), now()) ` +
    `ON CONFLICT (id) DO UPDATE SET auth_provider = ${providerSql}, external_subject = ${subjectSql}, ` +
    `email = ${emailSql}, email_verified_at = ${verifiedSql}, password_hash = ${passwordSql}, role = 'owner', is_approved = true, updated_at = now();`;
  execFileSync("psql", [DATABASE_URL, "-c", userSql], { encoding: "utf-8", timeout: 15000 });
  const identitySql =
    `INSERT INTO user_identities (id, user_id, school_id, auth_provider, external_subject, last_used_at) ` +
    `VALUES (${identityIdSql}, ${ownerIdSql}, ${schoolIdSql}, ${providerSql}, ${subjectSql}, now()) ` +
    `ON CONFLICT (school_id, auth_provider, external_subject) DO UPDATE SET last_used_at = now();`;
  execFileSync("psql", [DATABASE_URL, "-c", identitySql], { encoding: "utf-8", timeout: 15000 });
}

function existingProviderClientSecret(providerKey) {
  try {
    const raw = JSON.parse(fs.readFileSync(AUTH_PROVIDERS_PATH, "utf-8"));
    const existing = Array.isArray(raw) ? raw.find((entry) => entry?.key === providerKey) : null;
    return typeof existing?.clientSecret === "string" ? existing.clientSecret : "";
  } catch {
    return "";
  }
}

function writeAuthProvidersFile(cfg, clientSecret) {
  const providers = [];
  if (authModeIsLocal(cfg)) {
    providers.push({ enabled: true, key: "local", displayName: "E-Mail", type: "local", schoolId: cfg.schoolId || "school" });
  }
  for (const entry of cfg.providers || []) {
    const provider = {
      enabled: true,
      key: entry.key,
      displayName: entry.displayName,
      type: "oidc-redirect",
      issuerUrl: entry.issuerUrl,
      clientId: entry.clientId,
      redirectUri: `https://${cfg.domain}/api/auth/${entry.key}/callback`,
      scopes: entry.scopes || ["openid", "email", "profile"],
      allowedHostedDomains: entry.allowedHostedDomains,
      groupsClaim: entry.groupsClaim,
      groupToRoleMap: entry.groupToRoleMap,
      clientSecretMode: entry.clientSecretMode,
      appleTeamId: entry.appleTeamId,
      appleKeyId: entry.appleKeyId,
      applePrivateKeyPath: entry.applePrivateKeyPath,
      // Der native iOS-Login nennt die Bundle-ID des Apps als Zielgruppe
      // (audience) im Identity-Token -- die kennt der Installer bereits.
      appleNativeClientId: entry.clientSecretMode === "apple-jwt" ? cfg.bundleId : undefined,
      responseMode: entry.responseMode,
    };
    const secret = pendingProviderSecrets[entry.key] || (entry.key === cfg.providerKey ? clientSecret : existingProviderClientSecret(entry.key));
    if (secret) provider.clientSecret = secret;
    providers.push(provider);
  }
  for (const entry of cfg.providers || []) {
    if (entry.clientSecretMode !== "apple-jwt") continue;
    const keyPath = path.resolve(entry.applePrivateKeyPath || "");
    let realKeyPath = "";
    try {
      realKeyPath = fs.realpathSync(keyPath);
      const stat = fs.statSync(realKeyPath);
      if (!realKeyPath.startsWith(SCHULSANI_PRIVATE_DIR) || !stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error();
    } catch {
      throw new Error(`Apple-Schluesseldatei fuer "${entry.key}" fehlt oder ist nicht privat.`);
    }
  }
  writeSecretFile(AUTH_PROVIDERS_PATH, JSON.stringify(providers, null, 2) + "\n");
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
          authMode: state.config.authMode,
          schoolName: state.config.schoolName,
          domain: state.config.domain,
          providerKey: state.config.providerKey,
          providerDisplayName: state.config.providerDisplayName,
          providerIssuerUrl: state.config.providerIssuerUrl,
          providerClientId: state.config.providerClientId,
          providers: (state.config.providers || []).map(({ clientSecret, ...provider }) => provider),
          smtpHost: state.config.smtpHost,
          smtpPort: state.config.smtpPort,
          smtpUser: state.config.smtpUser,
          smtpSecure: state.config.smtpSecure,
          mailFrom: state.config.mailFrom,
          mailFromName: state.config.mailFromName,
          appName: state.config.appName,
          themeColor: state.config.themeColor,
          bundleId: state.config.bundleId,
          schoolId: state.config.schoolId,
          ownerUserId: state.config.ownerUserId,
          joinCode: state.config.joinCode,
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

  if (pathname === "/api/check-school-id" && req.method === "GET") {
    const query = new URL(req.url, "http://localhost").searchParams.get("v") || "";
    const value = trimOrEmpty(query);
    if (!SCHOOL_ID_RE.test(value)) return sendJson(res, 200, { ok: true, taken: false });
    return sendJson(res, 200, { ok: true, taken: schoolIdTaken(value, state.config?.ownerAccountId || "", state.config?.schoolId) });
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
    const { providerClientSecret, smtpPassword, providers = [], ...config } = out;
    config.providers = providers.map(({ clientSecret, ...provider }) => provider);
    config.ownerAccountId = state.config?.ownerAccountId || config.ownerAccountId || crypto.randomUUID();
    state.config = config;
    pendingProviderClientSecret = providerClientSecret || pendingProviderClientSecret;
    const enteredProviderSecrets = Object.fromEntries(providers.filter((provider) => provider.clientSecret).map((provider) => [provider.key, provider.clientSecret]));
    if (Object.keys(enteredProviderSecrets).length > 0) pendingProviderSecrets = enteredProviderSecrets;
    if (smtpPassword) pendingSmtpPassword = smtpPassword;
      pendingOwnerEmail = "";
    pendingOwnerPassword = "";
    pendingOwnerSubject = "";
    savePendingSecrets();
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

      const smtpPassword = pendingSmtpPassword || existingBackend.SMTP_PASSWORD || "";
      if (authModeIsLocal(state.config) && !smtpConfigValid({ ...state.config, smtpPassword })) {
        throw new Error("SMTP-Konfiguration fuer lokale Konten ist unvollstaendig.");
      }
      const secrets = { jwtSecret, vapidPublicKey, vapidPrivateKey, smtpPassword };
      writeSecretFile(BACKEND_ENV_PATH, buildBackendEnv(state.config, secrets));
      writeSecretFile(APP_ENV_PATH, buildAppEnv(state.config, secrets));
      writeAuthProvidersFile(state.config, pendingProviderClientSecret);
      clearPendingSecrets();

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
    const { out, errors } = validateAdmin(body, state.config);
    if (Object.keys(errors).length > 0) {
      return sendJson(res, 422, { ok: false, errors });
    }
    pendingOwnerEmail = out.ownerEmail || "";
    pendingOwnerPassword = out.ownerPassword || "";
    pendingOwnerSubject = out.externalSubject || "";
    savePendingSecrets();
    try {
      if (!usersTableExists()) {
        return sendJson(res, 409, {
          ok: false,
          error:
            "Datenbankschema fehlt noch — Migrationen wurden noch nicht ausgefuehrt. " +
            "Migrationen zuerst nachholen, dann diese Seite erneut aufrufen.",
        });
      }
      upsertOwner(authModeIsLocal(state.config) ? out.ownerEmail : out.externalSubject, state.config);
      state.admin = { created: true, username: authModeIsLocal(state.config) ? out.ownerEmail : out.externalSubject };
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
    clearPendingSecrets();
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
