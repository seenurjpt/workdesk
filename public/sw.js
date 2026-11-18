/* WorkDesk service worker.
 *  1. Reminder notification buttons (Snooze / Done) call the app's API.
 *  2. Installable app: caches static files and recently viewed pages so they can be read offline.
 * Keep this file dependency-free: it is served as-is.
 *
 * In development (`?mode=dev`) it never caches, so hot reload keeps working. */

const DEV = new URL(self.location.href).searchParams.get("mode") === "dev";
const VERSION = "v1";
const STATIC = `workdesk-static-${VERSION}`;
const PAGES = `workdesk-pages-${VERSION}`;
const MAX_PAGES = 40;
const RECACHE_AFTER_MS = 60_000;
const recent = new Map();

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      if (!DEV) {
        const cache = await caches.open(PAGES);
        await cache.add("/offline").catch(() => {});
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC, PAGES]);
      for (const name of await caches.keys()) {
        if (name.startsWith("workdesk-") && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

// ---- caching ----

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

/** Only real pages are kept: never redirects (e.g. a sign-in bounce) or errors. */
function cacheable(res) {
  return res.ok && res.type === "basic" && !res.redirected;
}

/** Fresh when online; the last copy you saw when not. */
async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (cacheable(res)) {
      cache.put(request, res.clone()).then(() => trim(PAGES, MAX_PAGES));
      recent.set(new URL(request.url).pathname + new URL(request.url).search, Date.now());
    }
    return res;
  } catch {
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    return (await cache.match("/offline")) || Response.error();
  }
}

/**
 * Pages opened by in-app (soft) navigation never request HTML, so the app asks the worker to
 * save them. The worker fetches the page itself, at most once a minute per page.
 */
async function savePage(path) {
  const url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  const key = url.pathname + url.search;
  if (Date.now() - (recent.get(key) || 0) < RECACHE_AFTER_MS) return;
  recent.set(key, Date.now());
  try {
    const res = await fetch(url, { credentials: "same-origin", headers: { Accept: "text/html" } });
    if (!cacheable(res)) return;
    const cache = await caches.open(PAGES);
    await cache.put(new Request(url.toString(), { headers: { Accept: "text/html" } }), res);
    await trim(PAGES, MAX_PAGES);
  } catch {
    /* offline: nothing to save */
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (DEV || request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache the API (auth, exports, reminder actions) or the worker itself.
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Full page loads only. In-app navigation payloads are left alone: if one fails offline,
  // Next.js falls back to a normal page load, which is answered from the saved HTML below.
  if (request.mode === "navigate") event.respondWith(networkFirst(request));
});

// Signing out must not leave private pages on the device.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "cache-url" && typeof event.data.url === "string" && !DEV) {
    event.waitUntil(savePage(event.data.url));
    return;
  }
  if (event.data && event.data.type === "clear-pages") {
    recent.clear();
    event.waitUntil(
      (async () => {
        await caches.delete(PAGES);
        if (!DEV) {
          const cache = await caches.open(PAGES);
          await cache.add("/offline").catch(() => {});
        }
      })(),
    );
  }
});

// ---- reminder notification buttons ----

async function tellClients(message) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) client.postMessage(message);
  return windows;
}

async function openApp(taskId) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = windows.find((c) => new URL(c.url).origin === self.location.origin);
  if (existing) {
    await existing.focus();
    if (taskId) existing.postMessage({ type: "open-task", taskId });
    return;
  }
  await self.clients.openWindow(
    taskId ? `/today?openTask=${encodeURIComponent(taskId)}` : "/today",
  );
}

async function runAction({ taskId, reminderId, action }) {
  try {
    const res = await fetch("/api/reminders/action", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, reminderId, action }),
    });
    if (!res.ok) throw new Error(String(res.status));
    await tellClients({ type: "reminders-changed" });
  } catch {
    await self.registration.showNotification("Couldn't update that reminder", {
      body: "Open WorkDesk and try again.",
      tag: "reminder-action-error",
    });
  }
}

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  const action = event.action;
  if (data.kind === "single" && action && action !== "open") {
    event.waitUntil(runAction({ taskId: data.taskId, reminderId: data.reminderId, action }));
    return;
  }
  event.waitUntil(openApp(data.kind === "single" ? data.taskId : undefined));
});
