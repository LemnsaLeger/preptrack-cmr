/* PrepTrack CMR service worker.
 * The build injects PRECACHE (every built file) and BUILD_ID, so the whole app shell is stored on
 * first load and reopens offline. Supabase/API traffic is never intercepted or cached. */
const PRECACHE = self.__PRECACHE__;
const BUILD_ID = self.__BUILD_ID__;
const SHELL_CACHE = `preptrack-shell-${BUILD_ID}`;
const FONT_CACHE = 'preptrack-fonts-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('preptrack-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fonts: show the cached copy instantly, refresh in the background.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || refresh;
      }),
    );
    return;
  }

  // Anything cross-origin (Supabase, etc.) goes straight to the network.
  if (url.origin !== self.location.origin) return;

  // Page navigations: serve the cached app shell (fast on weak networks, works offline).
  if (req.mode === 'navigate') {
    // '/' is precached by the build. (Not '/index.html': some hosts redirect it, and a redirected
    // response cannot be used to answer a navigation.)
    event.respondWith(
      caches.match('/').then((cached) => cached || caches.match('/index.html')).then((cached) => cached || fetch(req)),
    );
    return;
  }

  // Same-origin static files: cache first, fall back to network and remember the result.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
