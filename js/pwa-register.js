// =========================================================
// PWA REGISTER — daftarkan service worker (jangan diedit)
// =========================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
