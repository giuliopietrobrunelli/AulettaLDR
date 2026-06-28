self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());

// ── notifiche push ─────────────────────────────────
self.addEventListener('push', (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.titolo ?? 'Auletta LDR', {
      body: data.contenuto ?? '',
      icon: '/src/img/logo-prenotaldr-giallo.webp',
      badge: '/src/img/logo-prenotaldr-giallo.webp',
      tag: data.tag ?? 'ldr-notifica',
      data: { url: data.url ?? '/' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(e.notification.data?.url ?? '/');
    })
  );
});