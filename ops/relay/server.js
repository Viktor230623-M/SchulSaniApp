#!/usr/bin/env node
"use strict";

// Zentraler Callback-Relay fuer OIDC-Anmeldewege.
//
// Apple, Google und Microsoft akzeptieren nur exakt registrierte Redirect-URIs.
// Instanzen im Relay-Modus zeigen ihre OIDC-Rueckspruenge deshalb auf EINE
// gemeinsame Domain (z. B. auth.schulsani.app). Dieser Dienst haengt dort am
// Pfad /api/auth/<anbieter>/callback und reicht den Ruecksprung an die Instanz
// weiter, deren Herkunft der state-Parameter als Praefix traegt:
//
//     state = <instanz-origin>|<opaque-token>
//
// Er haelt keinen Zustand: keine Sessions, keine Datenbank, nichts im Speicher
// ausser der Freigabeliste. Der opaque-Teil des state ist fuer ihn unlesbar
// und bleibt unveraendert — die eigentliche Pruefung macht die Instanz, die
// ihn erzeugt hat. Der Relay kann nur dorthin weiterleiten, wo die Freigabe-
// liste es erlaubt; damit bleibt er kein offener Proxy.
//
// Betrieb: pm2 start ops/relay/server.js --name sani-relay
// Freigabeliste: RELAY_ALLOWED_ORIGINS (Kommagetrennt) oder
// RELAY_ALLOWED_ORIGINS_FILE (JSON-Liste). Beides muss https sein.

const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");

const PORT = Number(process.env.RELAY_PORT || 3004);
const CALLBACK_RE = /^\/api\/auth\/([a-z0-9._-]+)\/callback$/;
const BODY_LIMIT = 100 * 1024;

// Hop-by-Hop-Header werden nicht weitergereicht; der Rest geht unveraendert
// zurueck an den Browser — insbesondere Set-Cookie, ohne das die Sitzung der
// Instanz nie ankommt.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function loadAllowedOrigins() {
  const fromEnv = (process.env.RELAY_ALLOWED_ORIGINS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  let list = fromEnv;
  const file = process.env.RELAY_ALLOWED_ORIGINS_FILE;
  if (!list.length && file) {
    try {
      list = JSON.parse(fs.readFileSync(file, "utf-8")).map(String).map((entry) => entry.trim()).filter(Boolean);
    } catch {
      process.stderr.write(`Freigabeliste ${file} nicht lesbar.\n`);
      process.exit(1);
    }
  }
  const origins = new Set();
  for (const entry of list) {
    let url;
    try {
      url = new URL(entry);
    } catch {
      process.stderr.write(`Ungueltige Freigabe-Origin: ${entry}\n`);
      process.exit(1);
    }
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
      process.stderr.write(`Freigabe-Origin muss eine HTTPS-URL ohne Pfad sein: ${entry}\n`);
      process.exit(1);
    }
    origins.add(url.origin);
  }
  if (!origins.size) {
    process.stderr.write("Keine Freigabe-Origins. RELAY_ALLOWED_ORIGINS oder RELAY_ALLOWED_ORIGINS_FILE setzen.\n");
    process.exit(1);
  }
  return origins;
}

const ALLOWED_ORIGINS = loadAllowedOrigins();

// Einfache Scheibe pro IP, damit der Relay nicht als Spamschleuder dienen
// kann. Die eigentliche Ratenbegrenzung macht die Instanz; das hier ist nur
// die grobe Daemmerung vor der Tuer.
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 60;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  for (const [key, until] of hits) {
    if (until <= windowStart) hits.delete(key);
  }
  const count = (hits.get(ip) || 0) + 1;
  hits.set(ip, count);
  return count > RATE_MAX;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > BODY_LIMIT) {
        reject(new Error("Body zu gross"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function originFromState(state) {
  const sep = state.indexOf("|");
  if (sep === -1) return "";
  try {
    return new URL(state.slice(0, sep)).origin;
  } catch {
    return "";
  }
}

function clientIp(req) {
  // Hinter einer vorgeschalteten nginx liefert der Socket nur deren Loopback-
  // Adresse; dann steht die echte Adresse schon in X-Forwarded-For. Ohne
  // vorgeschalteten Proxy ist es direkt der Socket.
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim() !== "") return forwarded.trim();
  return req.socket.remoteAddress || "";
}

function forward(req, res, target, body) {
  const transport = target.protocol === "https:" ? https : http;
  // Die Adresse des echten Besuchers wird durchgereicht, damit die Instanz
  // sie mit ihrem trust-proxy-Setup als Client sieht und ihre Limiter pro
  // Besucher greifen, nicht pro Relay.
  const realClient = clientIp(req);
  const headers = {
    host: target.host,
    "x-forwarded-for": realClient,
    "x-forwarded-proto": "https",
    "x-real-ip": realClient,
  };
  if (body.length > 0) {
    headers["content-type"] = req.headers["content-type"] || "application/x-www-form-urlencoded";
    headers["content-length"] = body.length;
  }

  const upstream = transport.request(target, { method: req.method, headers }, (upstreamRes) => {
    const outHeaders = {};
    const raw = upstreamRes.rawHeaders;
    for (let i = 0; i < raw.length; i += 2) {
      const name = raw[i].toLowerCase();
      if (HOP_BY_HOP.has(name)) continue;
      if (name === "set-cookie") {
        // Mehrere Set-Cookie-Zeilen duerfen nicht zu einer verschmolzen werden.
        const key = raw[i];
        if (!outHeaders[key]) outHeaders[key] = [];
        outHeaders[key].push(raw[i + 1]);
        continue;
      }
      outHeaders[raw[i]] = raw[i + 1];
    }
    res.writeHead(upstreamRes.statusCode || 502, outHeaders);
    upstreamRes.pipe(res);
  });
  upstream.setTimeout(30 * 1000, () => upstream.destroy(new Error("Timeout")));
  upstream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Anmeldung fehlgeschlagen.");
    } else {
      res.end();
    }
  });
  upstream.end(body);
}

async function handleCallback(req, res, match) {
  const provider = match[1];
  const query = new URL(req.url, "http://localhost");

  let state = query.searchParams.get("state") || "";
  let body = Buffer.alloc(0);
  if (req.method === "POST") {
    const contentType = (req.headers["content-type"] || "").toLowerCase();
    if (!contentType.includes("application/x-www-form-urlencoded")) {
      res.writeHead(415, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Unzulaessige Anfrage.");
      return;
    }
    body = await readBody(req);
    const params = new URLSearchParams(body.toString("utf-8"));
    state = params.get("state") || "";
  } else if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Methode nicht erlaubt.");
    return;
  }

  const origin = originFromState(state);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    // Kein Hinweis, welche Origins freigegeben sind: die Antwort ist dieselbe
    // fuer unbekannte Herkunft und fehlende Herkunft.
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Anmeldung fehlgeschlagen.");
    return;
  }

  // Der komplette Ruecksprung (Query oder Body) geht unveraendert an die
  // Instanz; nur das Ziel ist fest aus der Freigabeliste zusammengesetzt.
  const target = new URL(`/api/auth/${provider}/callback`, origin);
  if (req.method === "GET") target.search = query.search;
  forward(req, res, target, body);
}

const server = http.createServer(async (req, res) => {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    res.writeHead(429, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Zu viele Anfragen, bitte kurz warten.");
    return;
  }

  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/healthz" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  const match = CALLBACK_RE.exec(url.pathname);
  if (!match) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Nicht gefunden.");
    return;
  }

  try {
    await handleCallback(req, res, match);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Anmeldung fehlgeschlagen.");
    } else {
      res.end();
    }
  }
});

server.listen(PORT, () => {
  process.stdout.write(`sani-relay laeuft auf Port ${PORT}, ${ALLOWED_ORIGINS.size} Freigabe-Origins.\n`);
});
