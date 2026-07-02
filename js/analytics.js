// =========================================================
// ANALYTICS — Freedom of Mind
//
// Melakukan DUA hal sekaligus:
//   1. Memuat Google Analytics 4 (GA4) untuk statistik umum
//      (pengunjung, lokasi, device, halaman populer, dsb)
//   2. Mencatat sesi pembaca ke Firestore (koleksi "readers")
//      supaya admin bisa melihat SIAPA yang membaca (yang login),
//      halaman apa yang dibuka, kapan terakhir berkunjung.
//
// Tidak ada data yang dikirim ke pihak ketiga selain Google Analytics.
// Pembaca anonim (tidak login) tetap tercatat di GA4 tapi TIDAK
// disimpan ke Firestore (tidak ada identitas yang bisa direkam).
// =========================================================

import { db } from "./firebase-core.js";
import {
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---------- 1. Google Analytics 4 ----------

function loadGA4() {
  const id = window.GA_MEASUREMENT_ID;
  if (!id || id === "G-XXXXXXXXXX") return; // belum dikonfigurasi

  // Inject gtag script
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", id, {
    // Kirim page_path supaya tiap halaman (chapter, catatan, dll) terlacak
    page_path: window.location.pathname + window.location.search,
    // Anonimisasi IP (wajib di banyak wilayah, termasuk Indonesia/UE)
    anonymize_ip: true,
  });
}

// ---------- 2. Firestore reader tracking ----------
// Mencatat siapa pembaca yang sedang login, halaman apa yang mereka buka,
// kapan, dan dari device apa. Satu dokumen per user (upsert berdasarkan uid),
// sehingga data tidak membengkak — hanya update "lastSeen" dan "pages".

async function trackReader(user) {
  if (!user) return; // anonim → tidak ada yang bisa diidentifikasi, lewati saja

  const pageInfo = getPageInfo();

  try {
    const ref = doc(db, "readers", user.uid);
    await setDoc(ref, {
      uid:        user.uid,
      name:       user.displayName || "(tanpa nama)",
      email:      user.email || "",
      photoURL:   user.photoURL || "",
      lastSeen:   serverTimestamp(),
      lastPage:   pageInfo.title,
      lastPath:   pageInfo.path,
      // Merge: tambahkan halaman ini ke dalam set halaman yang pernah dikunjungi
      // (disimpan sebagai object map {path: true} supaya mudah di-query)
      [`pages.${pageInfo.key}`]: true,
    }, { merge: true });
  } catch {
    // Gagal tracking tidak boleh mengganggu pengalaman pembaca
  }
}

function getPageInfo() {
  const path = window.location.pathname + window.location.search;
  const params = new URLSearchParams(window.location.search);

  // Tentukan judul halaman dari URL
  let title = document.title || path;
  // Bersihkan key supaya aman sebagai Firestore field name
  const key = path.replace(/[.#$[\]/]/g, "_").slice(0, 100) || "home";

  return { title, path, key };
}

// ---------- Entry point — dipanggil dari setiap halaman ----------

export function initAnalytics() {
  loadGA4();
  // Dengarkan status auth Firebase supaya tahu siapa user-nya
  // (tidak import ulang firebase-core agar tidak membuat instance ganda —
  //  cukup pantau perubahan DOM atau ekspos via event custom dari ui-shared)
  document.addEventListener("fom:user-ready", (e) => {
    if (e.detail?.user) trackReader(e.detail.user);
  });
}

// ---------- GA4: custom event helpers (bisa dipakai dari halaman lain) ----------
// Contoh pakai: import { gaEvent } from "./analytics.js"; gaEvent("baca_chapter", { chapter: "..." });
export function gaEvent(name, params = {}) {
  if (window.gtag) window.gtag("event", name, params);
}
