/* Brains Heist service worker.
 * Caches NOTHING, so every web deploy is live immediately.
 * - Page loads go straight to the network; only when the phone is offline does it show a small "you're offline" page.
 *   (Chrome on Android also needs this fetch handler before it offers the one-tap "Install" button.)
 * - Shows push notifications and opens the app when one is tapped. */

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Brains Heist</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050813;color:#f8fafc;font:16px system-ui,sans-serif;text-align:center;padding:24px}
button{margin-top:18px;min-height:48px;padding:0 22px;border:0;border-radius:14px;background:#2cf6c8;color:#021018;font-weight:800;font-size:16px}</style></head>
<body><div><div style="font-size:48px">📡</div><h1 style="font-size:20px">You're offline</h1><p style="color:#cbd5e1">Brains Heist needs the internet. Check your Wi-Fi or data and try again.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener('fetch', (event) => {
  // Only full page loads. Everything else (API calls, images, scripts) is left to the browser untouched.
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => new Response(OFFLINE_PAGE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })),
  );
});

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
