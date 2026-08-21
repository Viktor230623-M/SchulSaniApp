import { createHmac, timingSafeEqual } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Router, type IRouter, type Request } from "express";

const router: IRouter = Router();
const logDir = join(process.cwd(), "logs");
const bounceLog = join(logDir, "resend-webhooks.log");
const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

type RawRequest = Request & { rawBody?: Buffer };

interface BounceData {
  bounce_type?: string | null;
}

interface WebhookData {
  email_id?: string | null;
  created_at?: string | null;
  bounce?: BounceData | null;
  [key: string]: unknown;
}

interface WebhookBody {
  type?: string;
  data?: WebhookData;
  [key: string]: unknown;
}

function logEvent(entry: Record<string, unknown>): void {
  try {
    mkdirSync(logDir, { recursive: true });
    appendFileSync(bounceLog, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch (err) {
    console.error("Webhook-Log fehlgeschlagen:", err);
  }
}

export function hasValidResendSignature(req: RawRequest, now = Date.now()): boolean {
  const secret = process.env["RESEND_WEBHOOK_SECRET"]?.trim();
  const webhookId = req.header("svix-id");
  const timestamp = req.header("svix-timestamp");
  const signatures = req.header("svix-signature")?.split(" ") ?? [];
  if (!secret || !webhookId || !timestamp || !req.rawBody || signatures.length === 0) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isInteger(timestampSeconds) || Math.abs(Math.floor(now / 1000) - timestampSeconds) > MAX_SIGNATURE_AGE_SECONDS) {
    return false;
  }

  const encodedSecret = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const key = Buffer.from(encodedSecret, "base64");
  const expected = createHmac("sha256", key)
    .update(`${webhookId}.${timestamp}.${req.rawBody.toString("utf8")}`)
    .digest("base64");
  const expectedBytes = Buffer.from(expected);

  return signatures.some((signature) => {
    const [version, value] = signature.split(",", 2);
    if (version !== "v1" || !value) return false;
    const actualBytes = Buffer.from(value);
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
  });
}

router.post("/webhooks/resend", (req, res) => {
  if (!hasValidResendSignature(req as RawRequest)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const body = req.body as WebhookBody;
  const data = body.data ?? {};
  logEvent({
    type: String(body.type ?? ""),
    emailId: data.email_id ?? null,
    createdAt: data.created_at ?? null,
    bounceType: data.bounce?.bounce_type ?? null,
  });

  res.status(200).json({ ok: true });
});

export default router;
