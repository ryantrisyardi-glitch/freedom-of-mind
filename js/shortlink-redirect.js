// =========================================================
// SHORTLINK REDIRECT — dipakai oleh s.html
// URL: s.html?c=<kode>&utm_source=... -> baca dokumen shortlinks/<kode>
// di Firestore, lalu redirect ke target-nya (mis. note.html?id=xxx),
// sambil membawa serta query lain (utm_source, dst) yang ada di URL s.html.
// =========================================================

import { initFirebaseCore } from "./firebase-core.js";
import { getShortLink, bumpShortLinkHits } from "./data.js";

const rootEl = document.getElementById("shortlinkRoot");

function showError(msg) {
  rootEl.innerHTML =
    "<p>" + msg + "</p>" +
    '<p><a href="index.html">\u2190 Kembali ke beranda</a></p>';
}

async function run() {
  const ok = initFirebaseCore();
  if (!ok) { showError("Konfigurasi situs bermasalah, coba lagi nanti."); return; }

  const params = new URLSearchParams(location.search);
  const rawCode = params.get("c");
  if (!rawCode) { showError("Kode tautan tidak ditemukan di URL."); return; }
  const code = rawCode.trim().toLowerCase();

  let link;
  try {
    link = await getShortLink(code);
  } catch {
    showError("Gagal memuat tautan. Periksa koneksi internet lalu coba lagi.");
    return;
  }
  if (!link || !link.target) {
    showError("Tautan pendek ini tidak ditemukan atau sudah dihapus.");
    return;
  }

  bumpShortLinkHits(code); // tidak perlu ditunggu — tidak kritis

  // Bawa semua query dari s.html (KECUALI "c") ke URL tujuan — supaya
  // utm_source (atau param lain) yang ditempel di link pendek ikut kebawa
  // ke halaman aslinya.
  const targetUrl = new URL(link.target, location.href);
  params.forEach((value, key) => {
    if (key === "c") return;
    targetUrl.searchParams.set(key, value);
  });

  location.replace(targetUrl.toString());
}

run();
