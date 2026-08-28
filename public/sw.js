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

// --- nudges ----------------------------------------------------------------
//
// The two numbers Insight can't measure — last night's sleep, today's phone
// time — have to be typed in, and a student who forgets for a week leaves a
// biased dataset rather than a smaller one. This is the only thing that
// reaches a phone nobody is looking at.
//
// The payload is a fixed question with no numbers in it, because the server
// has none: it can see that a row is missing, never what would have been in
// it. So a lock screen never shows anyone's data to whoever picks the phone up.

self.addEventListener("push", (event) => {
  let message = { title: "Insight", body: "", url: "/dashboard" };

  try {
    if (event.data) message = { ...message, ...event.data.json() };
  } catch {
    // A malformed payload still deserves to open the app rather than nothing.
  }

  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // One per kind, so a week away doesn't produce seven identical rows.
      tag: message.kind || "insight-nudge",
      renotify: false,
      data: { url: message.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";

  // Focus a tab that's already open rather than piling up new ones.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(url) && "focus" in client) return client.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
