import { readFileSync } from "node:fs";
import { SignJWT, importPKCS8 } from "jose";

/**
 * Versand an Android ueber Firebase Cloud Messaging (HTTP v1), mit dem
 * Service-Account des Anbieters -- keine Expo-Push-Abhaengigkeit.
 *
 * Payloads sind bewusst inhaltsleer (kein Personenbezug): Titel ist immer das
 * neutrale "Neue Meldung", der Inhalt liegt in `data` nur als technischer
 * Bezeichner und wird von der App nach dem Antippen aus der API geholt.
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

function loadServiceAccount(): ServiceAccount | null {
  const inline = process.env["FCM_SERVICE_ACCOUNT"];
  const path = process.env["FCM_SERVICE_ACCOUNT_PATH"];
  let raw: string | undefined;
  if (inline) {
    raw = inline;
  } else if (path) {
    try {
      raw = readFileSync(path, "utf-8");
    } catch {
      console.error("[push] FCM_SERVICE_ACCOUNT_PATH nicht lesbar:", path);
      return null;
    }
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) return null;
    return parsed;
  } catch {
    console.error("[push] FCM_SERVICE_ACCOUNT ist kein gueltiges JSON");
    return null;
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

// OAuth2-Token aus dem Service-Account. Der JWT-Baustein ist gueltig eine
// Stunde; wir tauschen 5 Minuten vor Ablauf neu.
async function accessToken(account: ServiceAccount): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  try {
    const key = await importPKCS8(account.private_key, "RS256");
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(account.client_email)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!resp.ok) {
      console.error("[push] FCM-Token-Austausch fehlgeschlagen:", resp.status);
      return null;
    }
    const data = (await resp.json()) as { access_token?: string; expires_in?: number };
    if (typeof data.access_token !== "string") return null;
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + ((data.expires_in ?? 3600) - 300) * 1000,
    };
    return cachedToken.value;
  } catch (err) {
    console.error("[push] FCM-Token konnte nicht erzeugt werden:", err instanceof Error ? err.message : err);
    return null;
  }
}

export interface FcmPushPayload {
  title: string;
  data: Record<string, string>;
  priority: "normal" | "high";
  sound?: string;
}

/**
 * Liefert "gone", wenn FCM den Token verwirft (UNREGISTERED / INVALID_ARGUMENT)
 * -- der Datensatz gehoert dann geloescht.
 */
export async function sendFcm(deviceToken: string, payload: FcmPushPayload): Promise<"ok" | "gone" | "error"> {
  const account = loadServiceAccount();
  const projectId = process.env["FCM_PROJECT_ID"] ?? account?.project_id;
  if (!account || !projectId) {
    console.log("[push] FCM nicht konfiguriert, Android-Push wird uebersprungen");
    return "error";
  }
  const token = await accessToken(account);
  if (!token) return "error";

  const message: Record<string, unknown> = {
    token: deviceToken,
    notification: { title: payload.title },
    data: payload.data,
  };
  if (payload.priority === "high") {
    message.android = { priority: "high", notification: { sound: payload.sound ?? "default" } };
  }

  try {
    const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });
    if (resp.status === 404 || resp.status === 400) {
      const body = (await resp.json().catch(() => ({}))) as { error?: { details?: { errorCode?: string }[] } };
      const code = body.error?.details?.[0]?.errorCode;
      if (code === "UNREGISTERED" || code === "INVALID_ARGUMENT") return "gone";
    }
    if (!resp.ok) {
      console.error("[push] FCM-Zustellung fehlgeschlagen:", resp.status);
      return "error";
    }
    return "ok";
  } catch (err) {
    console.error("[push] FCM-Verbindung fehlgeschlagen:", err instanceof Error ? err.message : err);
    return "error";
  }
}
