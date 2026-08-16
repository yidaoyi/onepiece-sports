// One Piece Sports 离线缓存（页面优先走网络，静态资源走缓存）
const CACHE = 'op-sports-v1';
const ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) {
    return;
  }
  // AI 接口请求不缓存
  if (url.pathname.startsWith('/.netlify/functions/')) {
    return;
  }

  // 页面：网络优先，离线时回退缓存
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          }
          return resp;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 静态资源：缓存优先，没有则联网并缓存
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return resp;
      });
    })
  );
});
