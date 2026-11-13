"use strict";

const CACHE_PREFIX = `klassentafel:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const ASSETS = ["./", "./index.html", "./style.css", "./script.js", "./favicon.svg"]
  .map(path => new URL(path, self.registration.scope).href);

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS.map(url => new Request(url, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const assetUrl = `${url.origin}${url.pathname}`;
  if (!ASSETS.includes(assetUrl)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        await cache.put(assetUrl, response.clone());
        return response;
      }
      return await cache.match(assetUrl) || response;
    } catch {
      return await cache.match(assetUrl) || Response.error();
    }
  })());
});
