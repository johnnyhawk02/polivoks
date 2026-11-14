// FILTH offline cache.  index.html registers this as sw.js?v=VERSION, so each
// release is a new service worker with its own cache, and the old one is
// dropped when it takes over.  The page itself is always asked of the network
// first (skipping the browser's HTTP cache), so a phone that is online never
// sticks on an old copy; the cache is only the fallback for offline use.
const V = new URL(self.location).searchParams.get('v') || '0';
const CACHE = 'filth-' + V;
// three.js and the fonts are pinned by their address, so they keep their own
// cache across releases rather than downloading again each time
const LIB = 'filth-lib-1';
const OWN = ['./', 'view3d.js?v=' + V, 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';
const LIBS = [THREE + 'build/three.module.js', THREE + 'examples/jsm/environments/RoomEnvironment.js'];
const isLib = (u) => u.startsWith(THREE) || u.startsWith('https://fonts.googleapis.com/') || u.startsWith('https://fonts.gstatic.com/');

self.addEventListener('install', (ev) => ev.waitUntil((async () => {
  const c = await caches.open(CACHE);
  await c.addAll(OWN.map((u) => new Request(u, { cache: 'reload' })));
  // best effort: a CDN hiccup must not stop the app installing
  const l = await caches.open(LIB);
  await Promise.all(LIBS.map(async (u) => { if (!(await l.match(u))) try { await l.add(new Request(u, { mode: 'cors' })); } catch (e) {} }));
  await self.skipWaiting();
})()));

self.addEventListener('activate', (ev) => ev.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('filth-') && k !== CACHE && k !== LIB) await caches.delete(k);
  await self.clients.claim();
})()));

async function page(req) {
  const c = await caches.open(CACHE);
  const net = fetch(req, { cache: 'no-cache' }).then((r) => { if (r.ok) c.put('./', r.clone()); return r; });
  // offline (or no answer in 4 s on a bad signal): the cached page
  const late = new Promise((res) => setTimeout(res, 4000));
  try {
    const r = await Promise.race([net, late]);
    if (r) return r;
  } catch (e) { /* offline */ }
  return (await c.match('./')) || net;
}

async function stored(req, name) {
  const hit = await caches.match(req, { ignoreVary: true });
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') (await caches.open(name)).put(req, r.clone());
  return r;
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const u = req.url;
  if (req.mode === 'navigate') {
    // only the app page itself (any ?view=); other pages (3d.html) go straight through
    const p = new URL(u);
    if (p.origin === location.origin && new URL('./', location).pathname === p.pathname.replace(/index\.html$/, '')) ev.respondWith(page(req));
    return;
  }
  if (isLib(u)) ev.respondWith(stored(req, LIB));
  else if (u.startsWith(new URL('./', location).href)) ev.respondWith(stored(req, CACHE));
});
