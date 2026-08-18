import { Router, type IRouter } from "express";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Empfaengt Resend-Webhook-Events (bounce, delivery_error) und schreibt sie
// in eine Log-Datei. Kein Request-Handling im engeren Sinne: Der Endpoint
// dient nur der Ueberwachung, damit unguelstige Empfaenger auffallen, bevor
// sie die Sender-Reputation belasten.
//
// Absicherung: Resend signiert Webhooks (Svix). Wir verifizieren die
// Signatur hier nicht, sondern vergleichen optional ein Secret aus der
// .env (WEBHOOK_SECRET), falls gesetzt. Ohne gesetztes Secret akzeptiert
// der Endpoint jeden Request -- er schreibt nur in ein Log, es passiert
// nichts Gefaehrliches.

const router: IRouter = Router();

// Nach dem Build liegt das Bundle in dist/, daher relativ zum Prozess-CWD
// (artifacts/api-server) aufloesen statt __dirname zu nutzen.
const logDir = join(process.cwd(), "logs");
const bounceLog = join(logDir, "resend-webhooks.log");

interface BounceData {
  bounce_type?: string | null;
  diagnostic_code?: string | null;
}

interface WebhookData {
  email_id?: string | null;
  email?: string | null;
  to?: string | null;
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

router.post("/webhooks/resend", (req, res) => {
  const secret = process.env["WEBHOOK_SECRET"];
  if (secret && req.header("x-webhook-secret") !== secret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const body = req.body as WebhookBody;
  const eventType = String(body.type ?? "");
  const data = body.data ?? {};

  logEvent({
    type: eventType,
    emailId: data.email_id ?? null,
    to: data.email ?? data.to ?? null,
    createdAt: data.created_at ?? null,
    bounceType: data.bounce?.bounce_type ?? null,
    bounceSubType: data.bounce?.bounce_type ?? null,
    diagnosticCode: data.bounce?.diagnostic_code ?? null,
  } satisfies Record<string, unknown>);

  // Nur Bounces/Sendefehler prominent loggen, Rest ist Laufgeraeusch.
  if (eventType === "email.bounced" || eventType === "email.delivery_error") {
    console.warn(`[webhook] ${eventType} für ${String(data.email ?? "?")}`);
  }

  res.status(200).json({ ok: true });
});

export default router;
