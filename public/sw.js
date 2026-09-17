// Service Worker for Rawatbhata Hyperlocal Platform
const CACHE_NAME = 'rawatbhata-v4-networkfirst';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First Strategy: NEVER serve stale HTML or intercept Next.js CSS/JS chunks
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Let Next.js bundles, CSS, and API calls pass directly to network without caching issues
  if (url.includes('/_next/') || url.includes('/api/') || url.includes('firestore') || url.includes('firebase')) {
    return;
  }

  // Navigation requests: Network first, fallback to offline cache only if completely offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If valid response, clone and cache for offline backup
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => cached || caches.match('/'));
        })
    );
    return;
  }
});

// Native Phone Push Notifications (Shows in Android/iOS Lock Screen & Status Bar)
self.addEventListener('push', (event) => {
  let title = '📢 Rawatbhata DIRECT';
  let options = {
    body: 'You have a new update in Rawatbhata.',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    vibrate: [300, 150, 300],
    tag: 'rawatbhata-push-' + Date.now(),
    renotify: true,
    data: { url: '/' }
  };

  if (event.data) {
    try {
      const data = event.data.json();
      if (data.title) title = data.title;
      if (data.body) options.body = data.body;
      if (data.url) options.data.url = data.url;
      if (data.tag) options.tag = data.tag;
    } catch {
      options.body = event.data.text();
    }
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click Handler: Focus or open the app window
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
