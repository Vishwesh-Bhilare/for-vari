/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
declare const self: ServiceWorkerGlobalScope & typeof globalThis;
precacheAndRoute(self.__WB_MANIFEST);

const TILE_CACHE = 'vari-map-tiles-v1';
const STATIC_CACHE = 'vari-static-v1';
const ROUTE_TILE_PATTERN = /^https:\/\/tile\.openstreetmap\.org\//;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(['/'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (ROUTE_TILE_PATTERN.test(url.href)) {
    event.respondWith(caches.open(TILE_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    }));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/').then((r) => r ?? Response.error())));
  }
});
