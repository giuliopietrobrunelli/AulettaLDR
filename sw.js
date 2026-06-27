const CACHE = "app-v1";

const FILES = [
  "/",
  "/index.html",
  "/src/style/main.css",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
    .then(cache => cache.addAll(FILES))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
    .then(response => response || fetch(event.request))
  );
});

// ── notifiche push ─────────────────────────────────
self.addEventListener('push', (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.titolo ?? 'Auletta LDR', {
      body: data.contenuto ?? '',
      icon: '/src/img/logo-prenotaldr-giallo.webp',
      badge: '/src/img/logo-prenotaldr-giallo.webp',
      tag: data.tag ?? 'ldr-notifica', // evita notifiche duplicate
      data: { url: data.url ?? '/' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // se l'app è già aperta la porta in primo piano
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(e.notification.data?.url ?? '/');
    })
  );
});