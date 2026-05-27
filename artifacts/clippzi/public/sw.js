// Minimal service worker — enables PWA install on Chrome/Android.
// No offline caching (the app needs the API), just lifecycle hooks.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // pass-through; network handles everything
});
