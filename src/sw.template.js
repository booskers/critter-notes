/* Critter Notes on the web: keeps this version's files so Notes opens and works offline (campaigns are in the browser
   anyway). Written by build.mjs, which fills in this build's fingerprint and the list of every file in it. A new build installs
   alongside and takes over when Notes is next opened, or at once when the page asks ("Use it now"). Requests to other
   sites (a Homebase, fonts) go straight through, never cached here. */
const CACHE = 'critter-notes-__VERSION__', FILES = __FILES__;
// one file at a time (a file that can't be fetched just isn't kept, instead of stopping the rest)
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(async c => { for (const f of FILES) { try { const r = await fetch(f, { cache: 'reload' }); if (r.ok) await c.put(f, r); } catch {} } })); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('critter-notes-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(r, { ignoreSearch: true }) || (r.mode === 'navigate' ? await c.match('./') : null);
    if (hit) return hit;
    try { return await fetch(r); } catch { return (await c.match('./')) || Response.error(); }
  }));
});
