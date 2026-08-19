// HTTPS-Reverse-Proxy für lokale E2E-Tests. Serviert den Expo-Web-Build und
// reicht /api/* an das lokale Backend weiter. Die App ruft die API unter
// https://<EXPO_PUBLIC_DOMAIN>/api auf — deshalb braucht es HTTPS und einen
// einzigen Origin, damit Cookies (same-origin) und CSRF-Check funktionieren.
import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.E2E_DIST ?? path.join(HIER, "..", "..", "artifacts", "paramedic-app", "dist");
const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT ?? "3002");
const PROXY_PORT = Number(process.env.E2E_PROXY_PORT ?? "8443");
const CERT_DIR = process.env.E2E_CERT_DIR ?? path.join(HIER, ".certs");

const keyPath = path.join(CERT_DIR, "key.pem");
const certPath = path.join(CERT_DIR, "cert.pem");
if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error(`Zertifikat fehlt: ${CERT_DIR}. Erst erzeugen mit ops/e2e/gen-cert.sh`);
  process.exit(1);
}
const key = fs.readFileSync(keyPath);
const cert = fs.readFileSync(certPath);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function proxyApi(req, res) {
  const opts = {
    host: "127.0.0.1",
    port: BACKEND_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${BACKEND_PORT}` },
  };
  const preq = http.request(opts, (pres) => {
    res.writeHead(pres.statusCode ?? 502, pres.headers);
    pres.pipe(res);
  });
  preq.on("error", () => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Backend nicht erreichbar" }));
  });
  req.pipe(preq);
}

function serveStatic(req, res) {
  const urlPath = (req.url ?? "/").split("?")[0];
  const relative = urlPath === "/" ? "/index.html" : urlPath;
  const safe = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = path.join(DIST, safe);

  const hasExtension = path.extname(relative) !== "";
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath)) {
    // Expo statischer Export legt je Route eine .html-Datei an (/login -> login.html).
    if (!hasExtension) {
      const asHtml = path.join(DIST, `${relative.replace(/^\//, "")}.html`);
      if (fs.existsSync(asHtml)) filePath = asHtml;
    }
  }
  if (!fs.existsSync(filePath)) {
    // SPA-Fallback: unbekannte clientseitige Routen bekommen index.html.
    if (hasExtension) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    filePath = path.join(DIST, "index.html");
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

https
  .createServer({ key, cert }, (req, res) => {
    if ((req.url ?? "").startsWith("/api")) return proxyApi(req, res);
    serveStatic(req, res);
  })
  .listen(PROXY_PORT, "0.0.0.0", () => {
    console.log(`HTTPS proxy on https://localhost:${PROXY_PORT} -> backend 127.0.0.1:${BACKEND_PORT}`);
  });
