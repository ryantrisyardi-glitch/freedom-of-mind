// =========================================================
// EXIT GUARD — "tekan back 2x untuk keluar" khusus di halaman utama (index.html).
// Di halaman lain (chapter/note/editor/dll), tombol back HP dibiarkan bekerja
// normal: itu sudah otomatis kembali ke halaman sebelumnya karena tiap
// navigasi di app ini (location.href / <a href>) membuat entry history baru.
// Masalah "langsung keluar aplikasi" HANYA terjadi di halaman pertama (index),
// karena begitu kembali dari sana tidak ada lagi history di dalam app —
// jadi Android/browser menutup app. Modul ini mencegat back PERTAMA di
// halaman itu saja, dan baru mengizinkan keluar di back KEDUA.
// =========================================================

function isRootPage() {
  const path = location.pathname;
  return path === "/" || /\/(index\.html)?$/.test(path);
}

let armed = false;
let pressedOnce = false;
let resetTimer = null;

function arm() {
  // Tambahkan satu entry history "boneka" supaya back pertama nanti
  // memicu popstate (bisa dicegat) alih-alih langsung keluar dari app.
  history.pushState({ fomExitGuard: true }, "", location.href);
  armed = true;
}

function showExitToast() {
  let el = document.getElementById("exitToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "exitToast";
    el.className = "exit-toast";
    el.textContent = "Tekan sekali lagi untuk keluar";
    document.body.appendChild(el);
  }
  el.classList.add("is-visible");
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove("is-visible"), 1600);
}

export function initExitGuard() {
  if (!isRootPage()) return;
  if (armed) return; // sudah pernah dipasang di sesi ini

  arm();

  window.addEventListener("popstate", () => {
    if (!isRootPage()) return;
    if (pressedOnce) {
      // Back kedua — biarkan saja, jangan re-arm, supaya back berikutnya
      // (ditangani browser/OS) benar-benar keluar dari aplikasi.
      return;
    }
    pressedOnce = true;
    arm(); // "batalkan" efek back pertama dengan push state lagi
    showExitToast();
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { pressedOnce = false; }, 2000);
  });
}
