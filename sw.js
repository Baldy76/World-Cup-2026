const CACHE_NAME = 'wc2026-v2';
const ASSETS = [
    './',
    './index.html',
    './app.js',
    './manifest.json'
];

// Install Event: Cache App Shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching App Shell');
                return cache.addAll(ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate Event: Clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys.map(key => {
                if (key !== CACHE_NAME) {
                    console.log('Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
});

// Fetch Event: Serve from cache, fallback to network
self.addEventListener('fetch', event => {
    // Only cache GET requests, and don't try to cache the API calls 
    if (event.request.method !== 'GET' || event.request.url.includes('workers.dev')) return;

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                return cachedResponse || fetch(event.request);
            })
    );
});
