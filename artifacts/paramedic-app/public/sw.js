// Service Worker fuer Web-Push.
//
// Laeuft unabhaengig von der Seite und bleibt aktiv, wenn die App geschlossen
// ist — nur deshalb koennen Benachrichtigungen ueberhaupt ankommen. Bewusst
// ohne Caching: Ein veralteter Cache waere hier eine Fehlerquelle ohne Nutzen.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: "SchulSani", body: "Neue Benachrichtigung" };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "SchulSani", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.notificationId || undefined,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) return client.focus();
        }
        return self.clients.openWindow(target);
      }),
  );
});
