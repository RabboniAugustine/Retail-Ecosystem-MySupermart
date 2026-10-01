// Minimal service worker so the app is installable. It does not cache anything,
// so you always get the latest deployed version.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
