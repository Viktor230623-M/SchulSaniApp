import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import router from "./routes";

const app: Express = express();

const allowedOrigins = process.env["ALLOWED_ORIGINS"]?.split(",") || ["https://sani.avo-network.com"];
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
  verify: (req, _res, buf) => {
    try {
      JSON.parse(buf.toString());
    } catch {
      throw new Error("Invalid JSON");
    }
  }
}));
app.use(express.urlencoded({ extended: true }));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.message === "Invalid JSON") {
    res.status(400).json({ error: "Invalid JSON in request body" });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.use("/api", router);

export default app;
