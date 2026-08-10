import { readFileSync } from "node:fs";
import http2 from "node:http2";
import { SignJWT, importPKCS8 } from "jose";

/**
 * Versand an iOS ueber den Apple Push Notification Service (HTTP/2), mit dem
 * .p8-Auth-Key des Anbieters -- keine Expo-Push-Abhaengigkeit.
 *
 * Payloads sind bewusst inhaltsleer (kein Personenbezug): Der Alert traegt nur
 * das neutrale "Neue Meldung", Details laedt die App nach dem Antippen aus der
 * API. Ueber APNs gehen damit ausschliesslich Geräte-Token und das
 * inhaltsleere Signal (Drittland-Minimierung, Anlage 2 zum AVV).
 */

export interface ApnsPushPayload {
  title: string;
  data: Record<string, string>;
  priority: "normal" | "high";
  sound?: string;
}

function keyId(): string | null {
  return process.env["APNS_KEY_ID"] || null;
}

function teamId(): string | null {
  return process.env["APNS_TEAM_ID"] || null;
}

function bundleId(): string | null {
  return process.env["APNS_BUNDLE_ID"] || null;
}

function loadAuthKey(): string | null {
  const path = process.env["APNS_KEY_PATH"];
  if (!path) return null;
  try {
    return readFileSync(path, "utf-8");
  } catch {
    console.error("[push] APNS_KEY_PATH nicht lesbar:", path);
    return null;
  }
}

const host = () =>
  process.env["APNS_ENV"] === "sandbox"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";

let cachedJwt: { value: string; expiresAt: number } | null = null;

async function providerJwt(key: string, kid: string, tid: string): Promise<string> {
  if (cachedJwt && cachedJwt.expiresAt > Date.now()) return cachedJwt.value;
  const privateKey = await importPKCS8(key, "ES256");
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuer(tid)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
  cachedJwt = { value: token, expiresAt: Date.now() + 50 * 60 * 1000 };
  return token;
}

/**
 * Liefert "gone", wenn APNs den Token verwirft (410 Unregistered) -- der
 * Datensatz gehoert dann geloescht.
 */
export async function sendApns(deviceToken: string, payload: ApnsPushPayload): Promise<"ok" | "gone" | "error"> {
  const key = loadAuthKey();
  const kid = keyId();
  const tid = teamId();
  const topic = bundleId();
  if (!key || !kid || !tid || !topic) {
    console.log("[push] APNs nicht konfiguriert, iOS-Push wird uebersprungen");
    return "error";
  }

  let token: string;
  try {
    token = await providerJwt(key, kid, tid);
  } catch (err) {
    console.error("[push] APNs-JWT konnte nicht signiert werden:", err instanceof Error ? err.message : err);
    return "error";
  }

  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title },
      sound: payload.sound ?? "default",
      ...(payload.priority === "high" ? { "content-available": 1 } : {}),
    },
    ...payload.data,
  });

  return new Promise((resolve) => {
    const client = http2.connect(host());
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${encodeURIComponent(deviceToken)}`,
      ":scheme": "https",
      authorization: `bearer ${token}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "content-type": "application/json",
    });
    req.on("response", (headers) => {
      const status = Number(headers[":status"] ?? 500);
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => { body += chunk; });
      req.on("end", () => {
        client.close();
        if (status === 410 || (status === 400 && body.includes("BadDeviceToken"))) {
          resolve("gone");
          return;
        }
        if (status === 200) {
          resolve("ok");
          return;
        }
        console.error("[push] APNs-Zustellung fehlgeschlagen:", status, body.slice(0, 200));
        resolve("error");
      });
    });
    req.on("error", (err) => {
      client.close();
      console.error("[push] APNs-Verbindung fehlgeschlagen:", err.message);
      resolve("error");
    });
    req.end(body);
  });
}
