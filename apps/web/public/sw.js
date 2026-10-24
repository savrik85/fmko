// Prales — Service Worker
// Obsluhuje jen push notifikace. Nic necachuje a fetch nezachytává, takže bez
// připojení appka nefunguje (stránka /offline neexistuje).

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

// Push notifikace
self.addEventListener("push", (event) => {
  let data = { title: "Prales", body: "Máš novou zprávu.", url: "/prehled" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    // Notifikace se ukáže s výchozím textem.
    console.warn("push: data notifikace se nepodařilo přečíst:", e);
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
      vibrate: [200, 100, 200],
    }),
  );
});

// Klik na notifikaci — otevřít/zaměřit okno
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/prehled";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return clients.openWindow(targetUrl);
      }),
  );
});
