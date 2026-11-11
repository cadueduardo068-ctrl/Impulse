/* Somente arquivos públicos fixos. Nunca guardar API, HTML autenticado, arquivos ou dados de empresas. */
const CACHE = "impulsa-public-v3-operacao";
const STATIC = [
  "/offline.html",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable.png",
  "/manifest.webmanifest",
  "/icon.svg",
];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (STATIC.includes(url.pathname)) {
    event.respondWith(
      caches
        .match(event.request)
        .then((cached) => cached || fetch(event.request)),
    );
    return;
  }
  if (event.request.mode === "navigate")
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html")),
    );
});
// A nova versão é ativada após fechar as abas antigas; o usuário decide quando recarregar.

self.addEventListener("message", (event) => {
  if (event.data === "ACTIVATE") void self.skipWaiting();
});
