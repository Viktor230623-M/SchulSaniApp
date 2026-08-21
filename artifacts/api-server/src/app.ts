import { randomUUID } from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import compression from "compression";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { config } from "./config";
import { MissingSchoolContextError } from "./middlewares/auth";
import { csrfProtection } from "./middlewares/csrf";
import { log } from "./lib/logger";

const app: Express = express();
app.disable("x-powered-by");
// API-Antworten sind personenbezogene Daten und duerfen nicht gecacht werden.
// Ohne diese Middleware setzt Express ETags und beantwortet einen erneuten
// GET mit 304 (leerer Body) -- der Client liest dann ein leeres resp.json().
app.disable("etag");
// Behind nginx — trust exactly the number of proxy hops so req.ip is the
// real client address; without this every client shares nginx's IP and the
// rate limiters throttle all users as one. Mehrere Hops (z.B. CDN vor nginx)
// erfordern TRUST_PROXY_HOPS. Die Limiter laufen in-memory; fuer mehrere
// Backend-Instanzen braucht es einen geteilten Store (rate-limit-redis).
app.set("trust proxy", Number(process.env["TRUST_PROXY_HOPS"] || 1));
app.use(helmet());
// JSON- und Text-Antworten ab ~1KB komprimieren. Nginx vor dem Backend
// komprimiert selbst nichts, also passiert es hier.
app.use(compression({ threshold: 1024 }));

app.use(cors({
  origin: config.allowedOrigins,
  credentials: true,
}));

// CSRF-Schutz fuer cookie-authentifizierte Schreibanfragen.
app.use("/api", csrfProtection);

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: "Too many requests, please try again later." },
});

app.use(generalLimiter);
app.use(cookieParser());
app.use(express.json({
  limit: "50kb",
  verify: (req, _res, buf) => {
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    if (buf.length === 0) return;
    try {
      JSON.parse(buf.toString());
    } catch {
      throw new Error("Invalid JSON");
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: "50kb" }));

app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
// Request-Id fuer die Korrelation von Logzeilen mit einer Anfrage. Der Pfad
// ohne Query-Parameter ist bewusst alles, was protokolliert wird — in einer
// Query koennte irgendwann Personenbezug landen, im Pfad nie.
app.use((req, res, next) => {
  const requestId = randomUUID();
  res.set("X-Request-Id", requestId);
  res.locals.requestId = requestId;
  const started = Date.now();
  res.on("finish", () => {
    if (res.statusCode >= 500) {
      log("error", "request failed", {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - started,
      });
    }
  });
  next();
});

app.use("/api", router);

// Error handler must be registered AFTER routes so it catches errors thrown within them.
app.use((err: Error, req: Request, res: Response, _next: express.NextFunction) => {
  if (err instanceof MissingSchoolContextError || err.name === "MissingSchoolContextError") {
    res.status(403).json({ error: "Schulkontext fehlt" });
    return;
  }
  if (err.message === "Invalid JSON") {
    res.status(400).json({ error: "Invalid JSON in request body" });
    return;
  }
  log("error", "unhandled error", {
    requestId: res.locals.requestId,
    method: req.method,
    path: req.path,
    message: err.message,
  });
  res.status(500).json({ error: "Internal server error" });
});

export default app;
