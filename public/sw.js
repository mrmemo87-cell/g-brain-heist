/* Brains Heist push-only service worker.
 * Deliberately has NO fetch handler: nothing is cached, so every web deploy is live immediately.
 * It only shows push notifications and opens the app when one is tapped. */

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener('push', (event) => {
  let data = { title: 'Brains Heist', body: '', url: '/', tag: undefined };
  try { data = { ...data, ...(event.data ? event.data.json() : {}) }; } catch { /* non-JSON payload: show defaults */ }
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Brains Heist', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
        try { await client.navigate(target); } catch { /* some browsers forbid navigate(); focusing is still useful */ }
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
