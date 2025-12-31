// Service Worker for SeraVault PWA
// Provides offline support and caching for better performance

const CACHE_VERSION = 'v112';
const CACHE_NAME = `seravault-${CACHE_VERSION}`;
const SW_VERSION = '1.0.147'; // Built: 2025-12-27T18:00:40.359Z
const VERSION_CHECK_INTERVAL = 300000; // 5 minutes

// Files to cache for offline use (excluding index.html - always fetch fresh)
const STATIC_CACHE = [
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_CACHE);
      })
      .then(() => {
        console.log('[SW] Service worker installed successfully');
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        // Take control of all pages immediately
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache when possible, fall back to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip Firebase APIs and authentication
  if (url.pathname.includes('firebaseapp.com') || 
      url.pathname.includes('googleapis.com') ||
      url.pathname.includes('firebasestorage.googleapis.com')) {
    return;
  }

  // ALWAYS fetch fresh for index.html to prevent MIME type errors
  if (url.pathname === '/' || url.pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .catch((error) => {
          console.error('[SW] Failed to fetch index.html:', error);
          // Return a minimal error response instead of cached HTML
          return new Response('Application offline. Please check your connection.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        })
    );
    return;
  }

  // Always fetch fresh for JS and CSS assets (they have content hashes in filenames)
  if (url.pathname.includes('/assets/') && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
    event.respondWith(
      fetch(request, { 
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            console.error('[SW] Asset fetch failed:', url.pathname, response.status);
            throw new Error(`Asset not found: ${url.pathname}`);
          }
          return response;
        })
        .catch((error) => {
          console.error('[SW] Fetch failed for asset:', url.pathname, error);
          // Don't return cached HTML for missing JS/CSS - let it fail properly
          throw error;
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(request)
          .then((response) => {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            // Cache the fetched response for future use
            caches.open(CACHE_NAME)
              .then((cache) => {
                // Only cache GET requests
                if (request.method === 'GET') {
                  cache.put(request, responseToCache);
                }
              });

            return response;
          })
          .catch((error) => {
            console.error('[SW] Fetch failed:', error);
            // Don't return index.html as fallback - it causes MIME type errors
            // Just let the fetch fail properly
            throw error;
          });
      })
  );
});

// Listen for messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Handle version check requests
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ 
      type: 'VERSION_RESPONSE',
      version: SW_VERSION 
    });
  }
});

// Periodic version check - notify clients of updates
setInterval(() => {
  checkForUpdates();
}, VERSION_CHECK_INTERVAL);

async function checkForUpdates() {
  try {
    // Notify all clients to check for updates
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => {
      client.postMessage({
        type: 'VERSION_CHECK',
        version: SW_VERSION
      });
    });
  } catch (error) {
    console.error('[SW] Version check failed:', error);
  }
}

// Send version info to clients on first connection
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLIENT_READY') {
    event.source.postMessage({
      type: 'VERSION_INFO',
      version: SW_VERSION
    });
  }
});
