// =========================================================
// SERVICE WORKER — cache "app shell" (HTML/CSS/JS/icon statis)
// supaya situs bisa dibuka offline / install sebagai PWA.
// Data (chapter, catatan, komentar) TETAP selalu diambil
// langsung dari Firestore lewat internet — tidak di-cache,
// supaya kontennya selalu yang terbaru.
// =========================================================

// PENTING: naikkan angka versi ini SETIAP KALI ada perubahan pada file-file
// di SHELL_FILES (terutama file .js). Service worker ini cache-first untuk
// app shell, jadi kalau versi tidak dinaikkan, browser/HP yang sudah pernah
// membuka situs ini akan terus memakai file JS versi LAMA dari cache walau
// filenya sudah diganti di server — inilah penyebab error
// "does not provide an export named 'backupAllData'": admin.html memuat
// admin-page.js versi baru, tapi data.js yang dipanggilnya masih versi lama
// dari cache (belum punya fungsi backupAllData/restoreAllData).
const CACHE_NAME = "fom-shell-v13";

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
  "./js/theme.js",
  "./js/exit-guard.js",
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

  // App shell: network-first, fallback ke cache kalau offline.
  // (Sebelumnya cache-first + update di background — masalahnya, kalau ada
  // file baru dideploy, tab yang sudah terbuka/PWA yang sudah ke-install
  // tetap langsung dapat file LAMA dari cache dulu, baru versi baru dipakai
  // di reload BERIKUTNYA. Kalau dua file yang saling terhubung — misalnya
  // data.js & admin-page.js — sempat "kejeda" satu update-siklus, keduanya
  // bisa tidak sinkron dan menyebabkan error seperti
  // "does not provide an export named ...". Network-first memastikan versi
  // terbaru dipakai kapan pun ada koneksi, dan cache cuma jadi cadangan
  // waktu offline.)
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
