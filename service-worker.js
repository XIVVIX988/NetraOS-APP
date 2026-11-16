const CACHE_NAME = "netraos-shell-20261115-44";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css?v=received-income-button-right-20261115-2",
  "./css/mobile-accessibility.css?v=category-label-icons-20261115-1",
  "./js/scrip.js?v=dashboard-recent-income-date-fix-20261115-1",
  "./js/supabase-sync.js?v=onboarding-profile-save-20261113-1",
  "./js/supabase-config.js",
  "./js/theme-init.js",
  "./js/register-service-worker.js",
  "./manifest.webmanifest",
  "./assets/netraos-logo.svg",
  "./assets/netraos-logo-dark.svg",
  "./assets/netraos-app-icon.svg",
  "./assets/phone-welcome-wallet.jpeg",
  "./assets/tour%201.png",
  "./assets/tour%202.png",
  "./assets/tour%203.png"
];
const SHELL_PATHS = new Set([
  "", "index.html", "css/style.css", "css/mobile-accessibility.css", "js/scrip.js", "js/supabase-sync.js",
  "js/supabase-config.js", "js/theme-init.js", "js/register-service-worker.js", "manifest.webmanifest", "assets/netraos-logo.svg",
  "assets/netraos-logo-dark.svg", "assets/netraos-app-icon.svg", "assets/phone-welcome-wallet.jpeg",
  "assets/tour%201.png", "assets/tour%202.png", "assets/tour%203.png"
]);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith("netraos-shell-") && key !== CACHE_NAME)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isAppNavigation = request.mode === "navigate" && url.origin === self.location.origin;
  const isShellAsset = url.origin === self.location.origin
    && SHELL_PATHS.has(url.pathname.slice(new URL(self.registration.scope).pathname.length));

  if (isAppNavigation) {
    event.respondWith(fetch(request).then(async response => {
      if (response.ok) await caches.open(CACHE_NAME).then(cache => cache.put(new URL("./", self.registration.scope), response.clone()));
      return response;
    }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(new URL("./", self.registration.scope)) || cache.match(new URL("./index.html", self.registration.scope));
    }));
    return;
  }

  if (isShellAsset) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      const exact = await cache.match(request);
      if (exact) return exact;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        const previousVersion = await cache.match(request, { ignoreSearch: true });
        if (previousVersion) return previousVersion;
        throw error;
      }
    }));
    return;
  }

  // Cache only public render assets from CDNs. Auth and financial API requests
  // have no destination and are deliberately excluded from offline caching.
  if (url.origin !== self.location.origin && ["script", "style", "font"].includes(request.destination)) {
    const update = caches.open(CACHE_NAME).then(async cache => fetch(request).then(async response => {
        if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
        return response;
      }));
    event.waitUntil(update.catch(() => {}));
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return cached;
      return update;
    }));
  }
});
