// Keeps the site working without a connection. Online, every file still comes from the site, so
// visitors always get the latest version (and copies of it are kept); the kept copies are used
// when the connection is gone, or so slow that waiting for it would feel broken.
// Only this site's own files are ever touched. Change CACHE to throw all the copies away.
const CACHE = 'areavisualizer-1';
const PATIENCE_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const [cache, files] = await Promise.all([
      caches.open(CACHE),
      fetch('offline-files.json', { cache: 'no-cache' }).then(response => response.json()),
    ]);
    // A few at a time, so a slow connection stays usable; one that fails shouldn't cost the others.
    const waiting = ['./', ...files];
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (waiting.length) await cache.add(new Request(waiting.pop(), { cache: 'no-cache' })).catch(() => {});
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function answer(network, key, page) {
  const cache = await caches.open(CACHE);
  const kept = (await cache.match(key)) ?? (page ? await cache.match('./') : undefined);
  if (!kept) return network;
  return Promise.race([
    network.catch(() => kept),
    new Promise(resolve => { setTimeout(resolve, PATIENCE_MS, kept); }),
  ]);
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range') || new URL(request.url).origin !== location.origin) return;
  const page = request.mode === 'navigate';
  const key = page ? new URL(request.url).pathname : request; // every link to the page (?a=100…) is the same page
  const network = fetch(request).then(async response => {
    // Not being able to keep a copy (a full phone, say) must never stop the page from loading.
    if (response.ok) await caches.open(CACHE).then(cache => cache.put(key, response.clone())).catch(console.warn);
    return response;
  });
  event.waitUntil(network.catch(() => {})); // finishes keeping a copy even if the kept one was used
  event.respondWith(answer(network, key, page));
});
