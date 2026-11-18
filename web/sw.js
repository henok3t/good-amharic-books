// Offline support: keeps the app shell and fonts on the device. Book text for offline reading is saved
// by the app itself (IndexedDB) after sign-in; private Cloud Storage requests are never cached here.
const VERSION = '__BUILD_VERSION__';
const SHELL = `gab-shell-${VERSION}`, FONTS = 'gab-fonts-v1';
const PRECACHE = ['/', '/index.html', '/assets/main.js', '/assets/styles.css', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('gab-shell-') && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/__/')) return;                // Firebase reserved URLs
    if (req.mode === 'navigate') {                              // pages: network first, offline fallback
      e.respondWith(fetch(req).then((r) => { caches.open(SHELL).then((c) => c.put('/index.html', r.clone())); return r; })
        .catch(() => caches.match('/index.html')));
      return;
    }
    e.respondWith(caches.open(SHELL).then(async (c) => {        // assets: cached copy, refreshed in the background
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { c.put(req, r.clone()); return r; })));
  }
});
