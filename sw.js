// Кэш для работы без интернета. При каждом выпуске новой версии увеличивайте VERSION —
// тогда у пользователей появится предложение «Доступна новая версия — Обновить».
const VERSION = 'recipes-v18';
const SHELL = ['./', 'index.html', 'recipes.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];

self.addEventListener('install', e => {
  // Первая установка активируется сразу, обновления ждут нажатия «Обновить».
  // cache: 'reload' — берём файлы прямо с сервера: GitHub Pages разрешает браузеру держать их 10 минут,
  // и без этого новая версия могла сохранить у себя старые файлы.
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(SHELL.map(url => new Request(url, { cache: 'reload' }))))
    .then(() => { if (!self.registration.active) return self.skipWaiting(); }));
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'images').map(k => caches.delete(k))))
    // Старые фото с Unsplash больше не нужны — освобождаем место на телефоне
    .then(() => caches.open('images')).then(async c => {
      for (const req of await c.keys()) if (new URL(req.url).hostname === 'images.unsplash.com') await c.delete(req);
    })
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Фото блюд и рукописный шрифт: сначала из кэша, иначе из сети с сохранением.
  // Кэш 'images' переживает обновления приложения; новое фото приходит со сменой ?v= в адресе.
  const isPhoto = url.origin === location.origin && url.pathname.includes('/photos/');
  if (isPhoto || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('images').then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Файлы приложения: из кэша своей версии, при промахе — из сети, офлайн — главная страница
  if (url.origin === location.origin) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch {
        return (await c.match('index.html')) || Response.error();
      }
    }));
  }
});
