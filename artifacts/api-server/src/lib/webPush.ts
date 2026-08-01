import webpush from "web-push";

/**
 * Versand von Web-Push-Nachrichten.
 *
 * Anders als bei Expo gibt es keinen zentralen Dienst: Jede Subscription nennt
 * ihren eigenen Endpunkt beim Browserhersteller. Die VAPID-Schluessel weisen den
 * Absender aus, damit der Endpunkt die Nachricht annimmt.
 */

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  notificationId: string;
}

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;

  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"];

  if (!publicKey || !privateKey || !subject) {
    console.log("[push] VAPID nicht konfiguriert, Web-Push wird uebersprungen");
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/**
 * Liefert `"gone"`, wenn der Endpunkt die Subscription abgelehnt hat — der
 * Browser hat sie dann verworfen und der Datensatz gehoert geloescht.
 */
export async function sendWebPush(
  subscriptionJson: string,
  payload: WebPushPayload,
): Promise<"ok" | "gone" | "error"> {
  if (!ensureConfigured()) return "error";

  try {
    const subscription = JSON.parse(subscriptionJson);
    // urgency "high" stammt aus RFC 8030 und bittet den Push-Dienst, sofort
    // zuzustellen statt zu buendeln oder auf einen guenstigen Zeitpunkt zu
    // warten. Das durchbricht keinen Fokus/DND — das kann auf iOS nur eine
    // native App mit dem Time-Sensitive-Entitlement.
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      urgency: "high",
    });
    return "ok";
  } catch (err: any) {
    // 404 und 410 bedeuten: diese Subscription existiert nicht mehr.
    if (err?.statusCode === 404 || err?.statusCode === 410) return "gone";
    console.error("[push] Web-Push fehlgeschlagen:", err?.statusCode ?? err);
    return "error";
  }
}
