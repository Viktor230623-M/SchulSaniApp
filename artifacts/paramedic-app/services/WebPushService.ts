import { Platform } from "react-native";

import ApiService from "@/services/ApiService";

/**
 * Web-Push im Browser.
 *
 * Auf iOS gilt eine Einschraenkung, die sich technisch nicht umgehen laesst:
 * Benachrichtigungen funktionieren ausschliesslich, wenn die Seite ueber
 * "Zum Home-Bildschirm" installiert wurde. In einem Safari-Tab fehlt die
 * PushManager-Schnittstelle vollstaendig.
 */

const VAPID_PUBLIC_KEY = process.env["EXPO_PUBLIC_VAPID_PUBLIC_KEY"] ?? "";

/** Der Browser erwartet den Schluessel als Byte-Array, nicht als base64url-Text. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export function webPushSupported(): boolean {
  if (Platform.OS !== "web") return false;
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function webPushState(): Promise<
  "unsupported" | "needs-install" | "denied" | "granted" | "default"
> {
  if (Platform.OS !== "web") return "unsupported";
  // Auf iOS fehlt PushManager im Tab und erscheint erst nach der Installation.
  if (!webPushSupported()) return isStandalone() ? "unsupported" : "needs-install";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return "default";
}

export async function enableWebPush(): Promise<"granted" | "denied" | "unsupported"> {
  if (!webPushSupported() || !VAPID_PUBLIC_KEY) return "unsupported";

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  // Muss aus einer Nutzeraktion heraus laufen — Safari lehnt sonst stumm ab.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    }));

  await ApiService.registerDeviceToken(JSON.stringify(subscription), "web");
  return "granted";
}
