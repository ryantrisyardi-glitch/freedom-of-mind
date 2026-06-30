// =========================================================
// SERVICE WORKER — cache "app shell" (HTML/CSS/JS/icon statis)
// supaya situs bisa dibuka offline / install sebagai PWA.
// Data (chapter, catatan, komentar) TETAP selalu diambil
// langsung dari Firestore lewat internet — tidak di-cache,
// supaya kontennya selalu yang terbaru.
// =========================================================

const CACHE_NAME = "fom-shell-v1";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./chapter.html",
  "./note.html",
  "./editor.html",
  "./admin.html",
  "./trash.html",
  "./css/style.css",
  "./js/firebase-config.js",
  "./js/firebase-core.js",
  "./js/data.js",
  "./js/ui-shared.js",
  "./js/editor.js",
  "./js/home-page.js",
  "./js/chapter-page.js",
  "./js/note-page.js",
  "./js/editor-page.js",
  "./js/admin-page.js",
  "./js/trash-page.js",
  "./manifest.webmanifest",
  "./favicon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Hanya tangani GET. Biarkan semua request ke Firebase/Firestore/Cloudinary
  // dan request non-GET lewat tanpa campur tangan service worker.
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin) return;

  // App shell: cache-first, lalu update di background ("stale-while-revalidate")
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
