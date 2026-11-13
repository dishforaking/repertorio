/* DFAK – Repertorio: memoria offline e numero di versione dell'app.
 * Per pubblicare una nuova versione si cambia VERSIONE (e si caricano i file cambiati).
 * Tutto ciò che si salva usa il prefisso "dfak-" e vale solo per la cartella /repertorio/. */
const VERSIONE = '7';
const PREFISSO = 'dfak-repertorio-';
const CACHE = PREFISSO + 'v' + VERSIONE;
const FILE = [
  './',
  'index.html',
  'stile.css',
  'app.js',
  'regole.js',
  'metronomo.js',
  'lib/Sortable.min.js',
  'manifest.webmanifest',
  'icone/icona-192.png',
  'icone/icona-512.png',
  'icone/icona-maskable-512.png',
  'logo/logo-dish-scuro-scritta.svg',
  'logo/logo-dish-scuro-locandina.svg',
  'caratteri/grenze-gotisch.woff2'
];

self.addEventListener('install', (evento) => {
  // cache: 'reload' = scarica dal sito, non dalla memoria del browser (altrimenti potrebbe salvare file vecchi)
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILE.map((f) => new Request(f, { cache: 'reload' })))));
  // Niente attivazione automatica: la nuova versione aspetta il tocco su "Nuova versione".
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nomi = await caches.keys();
    await Promise.all(nomi.filter((n) => n.startsWith(PREFISSO) && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (evento) => {
  const msg = evento.data || {};
  if (msg.tipo === 'versione' && evento.ports[0]) evento.ports[0].postMessage({ versione: VERSIONE });
  if (msg.tipo === 'attiva') self.skipWaiting();
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  const url = new URL(req.url);
  // Il motore (script.google.com) e tutto ciò che non è di questa cartella passa senza toccarlo.
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL('./', self.location).pathname)) return;
  evento.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') return (await cache.match('index.html')) || fetch(req);
    return (await cache.match(req, { ignoreSearch: true })) || fetch(req);
  })());
});
