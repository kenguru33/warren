// Install-only service worker. Exists so the browser considers the app
// installable; deliberately performs no caching and no fetch interception.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
