import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import router from "./routes";

const app: Express = express();
app.disable("x-powered-by");

const allowedOrigins = process.env["ALLOWED_ORIGINS"]?.split(",").map((o) => o.trim()) || ["https://sani.avo-network.com"];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: "Too many requests, please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 login attempts per minute
  message: { error: "Too many login attempts, please try again later." },
});

app.use(generalLimiter);
app.use(cookieParser());
app.use(express.json({
  limit: "50kb",
  verify: (req, _res, buf) => {
    if (buf.length === 0) return;
    try {
      JSON.parse(buf.toString());
    } catch {
      throw new Error("Invalid JSON");
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: "50kb" }));

app.use("/api", router);

// Error handler must be registered AFTER routes so it catches errors thrown within them.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.message === "Invalid JSON") {
    res.status(400).json({ error: "Invalid JSON in request body" });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
