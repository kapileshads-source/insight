/**
 * Insight's service worker, which caches almost nothing on purpose.
 *
 * A service worker exists here for one reason: without a fetch handler,
 * Chrome won't offer to install the app. The obvious next step — caching pages
 * so it works offline — is one this app should not take. Every page worth
 * caching is a page showing a student's decrypted study data, and a cache is a
 * copy on disk that outlives the tab, survives a lock, and isn't covered by
 * anything the privacy page promises.
 *
 * So: one offline page is pre-cached, navigations go to the network, and if
 * the network isn't there the student gets told plainly. Nothing else is
 * stored, ever.
 */

const CACHE = "insight-shell-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Drop older shells so a renamed cache doesn't accumulate forever.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only page loads. Anything else — API calls, server actions, encrypted
  // records — goes straight to the network without this worker touching it.
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      const offline = await cache.match(OFFLINE_URL);
      return offline ?? Response.error();
    }),
  );
});
