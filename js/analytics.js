// =========================================================
// ANALYTICS — Freedom of Mind
// =========================================================

import { db, checkIsAdmin } from "./firebase-core.js";
import {
  doc, setDoc, addDoc, updateDoc, collection, serverTimestamp, increment,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---- GA4 ----
function loadGA4() {
  const id = window.GA_MEASUREMENT_ID;
  if (!id || id === "G-XXXXXXXXXX") return;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", id, { anonymize_ip: true });
}

// ---- Device & browser detection ----
function getDeviceInfo() {
  const ua = navigator.userAgent;
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua);
  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  let browser = "other";
  if (/Chrome/i.test(ua) && !/Edg|OPR/i.test(ua)) browser = "chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "safari";
  else if (/Firefox/i.test(ua)) browser = "firefox";
  else if (/Edg/i.test(ua)) browser = "edge";
  else if (/OPR|Opera/i.test(ua)) browser = "opera";
  let os = "other";
  if (/Windows/i.test(ua)) os = "windows";
  else if (/Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua)) os = "macos";
  else if (/Android/i.test(ua)) os = "android";
  else if (/iPhone|iPad/i.test(ua)) os = "ios";
  else if (/Linux/i.test(ua)) os = "linux";
  return { type: isTablet ? "tablet" : (isMobile ? "mobile" : "desktop"), browser, os };
}

// ---- Page info — pakai URL, bukan document.title ----
// (title di chapter.html / note.html belum diisi saat initAnalytics() dipanggil)
function getPageInfo() {
  const path  = window.location.pathname + window.location.search;
  const params = new URLSearchParams(window.location.search);
  let type = "home", refId = "";
  if (path.includes("chapter.html")) { type = "chapter"; refId = params.get("id") || ""; }
  else if (path.includes("note.html")) { type = "note"; refId = params.get("id") || ""; }
  else if (path.includes("editor.html")) type = "editor";
  else if (path.includes("admin.html")) type = "admin";
  // Judul sementara dari URL — akan diperbarui lewat updateAnalyticsTitle()
  const titleFallback = type === "home" ? "Beranda" : `${type} ${refId}`.trim();
  // Bersihkan SEMUA karakter selain huruf & angka supaya aman sebagai Firestore field
  const safeKey = path.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").slice(0, 80) || "home";
  return { path, type, refId, safeKey, title: titleFallback };
}

// Potong oktet/segmen terakhir IP (level jaringan, bukan host persis) lalu
// hash SHA-256 — supaya tidak pernah menyimpan IP asli sama sekali, cuma
// "sidik jari" yang tidak bisa dibalik ke IP semula, tapi tetap konsisten
// untuk mendeteksi kunjungan dari jaringan yang sama.
async function hashIp(ip) {
  if (!ip) return "";
  var truncated = ip.indexOf(":") >= 0
    ? ip.replace(/:[0-9a-f]*$/i, ":0")   // IPv6: buang segmen terakhir
    : ip.replace(/\.\d+$/, ".0");          // IPv4: buang oktet terakhir
  try {
    var enc  = new TextEncoder().encode(truncated);
    var buf  = await crypto.subtle.digest("SHA-256", enc);
    var hex  = Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
    return hex.slice(0, 12); // 12 hex char cukup buat dedup, tidak perlu hash penuh
  } catch { return ""; }
}

// ---- Geolokasi via ipapi.co (cache per session) ----
async function getLocation() {
  const cached = sessionStorage.getItem("fom_geo");
  if (cached) return JSON.parse(cached);
  try {
    const res = await fetch("https://ipapi.co/json/",
      { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error();
    const geo = await res.json();
    const ipHash = await hashIp(geo.ip || "");
    const loc = {
      country: (geo.country_name || "").replace(/[^a-zA-Z0-9 ]/g, "").trim(),
      city:    (geo.city    || "").replace(/[^a-zA-Z0-9 ]/g, "").trim(),
      ipHash,
    };
    sessionStorage.setItem("fom_geo", JSON.stringify(loc));
    return loc;
  } catch { return { country: "", city: "", ipHash: "" }; }
}

// Dipakai fitur lain (mis. komentar) yang butuh lokasi kasar (kota/negara)
// dari IP — TANPA prompt izin apa pun, dan memakai cache sesi yang sama
// dengan yang sudah dipakai untuk pageViews, supaya tidak boros kuota API.
export async function getVisitorLocation() {
  return getLocation();
}

function safeGeoKey(str) {
  return (str || "unknown").replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").slice(0, 40);
}

// ---- State ---
let _currentDocId     = null;
let _page             = null;
let _pageTracked      = false;
let _visitLogRefReady = null; // Promise<DocumentReference|null> — lihat catatan di bawah

// ---- Log detail per-kunjungan (satu dokumen per pemuatan halaman) ----
// Ini TERPISAH dari agregat harian di atas — tujuannya supaya admin bisa
// melihat detail "siapa buka apa jam berapa dari kota mana", bukan cuma
// ringkasan persentase.
//
// CATATAN PENTING: dulu ref dokumen ini disimpan di variabel biasa
// (_visitLogRef) yang null sampai addDoc() selesai. Kalau status login
// (fom:user-ready) selesai LEBIH DULU daripada addDoc() ini — yang sangat
// umum terjadi untuk admin yang sesi login-nya sudah tersimpan browser —
// trackReader() akan mengecek "if (_visitLogRef)", melihatnya masih null,
// dan diam-diam melewatkan update uid/name. Akibatnya kunjungan admin
// tercatat permanen sebagai uid:null alias "Tamu" di tabel Detail Kunjungan.
// Sekarang disimpan sebagai Promise supaya trackReader() selalu MENUNGGU
// dokumennya benar-benar ada, bukan cuma mengecek sesaat.
function logVisitDetail(page, device, loc) {
  _visitLogRefReady = addDoc(collection(db, "visitLogs"), {
    path: page.path,
    type: page.type,
    refId: page.refId,
    title: page.title,
    country: loc.country || "",
    city: loc.city || "",
    ipHash: loc.ipHash || "",
    deviceType: device.type,
    browser: device.browser,
    os: device.os,
    uid: null,
    name: "",
    isAdmin: false,
    createdAt: serverTimestamp(),
  }).catch(() => null); // silent fail — tidak kritis
  return _visitLogRefReady;
}

// ---- Track page view (semua pengunjung termasuk anonim) ----
async function trackPageView(page, device) {
  if (_pageTracked) return;
  _pageTracked = true;

  const today  = new Date().toISOString().slice(0, 10);
  _currentDocId = `${today}_${page.safeKey}`;

  // Dedup: 1 unique visitor per session per halaman
  const sKey  = `fom_v_${_currentDocId}`;
  const isNew = !sessionStorage.getItem(sKey);
  if (isNew) sessionStorage.setItem(sKey, "1");

  // Lokasi untuk SEMUA pengunjung (termasuk anonim)
  const loc        = await getLocation();
  const cCountry   = safeGeoKey(loc.country);
  const cCity      = safeGeoKey(loc.city);

  logVisitDetail(page, device, loc); // tidak perlu ditunggu (await) — tidak kritis

  try {
    await setDoc(doc(db, "pageViews", _currentDocId), {
      date:   today,
      path:   page.path,
      title:  page.title,      // judul sementara; akan diperbarui updateAnalyticsTitle()
      type:   page.type,
      refId:  page.refId,
      views:  increment(1),
      ...(isNew ? {
        uniqueVisitors: increment(1),
        [`countries_${cCountry}`]: increment(1),
        [`cities_${cCity}`]:       increment(1),
      } : {}),
      [`devices_${device.type}`]:    increment(1),
      [`browsers_${device.browser}`]: increment(1),
      [`os_${device.os}`]:           increment(1),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch { /* silent fail */ }
}

// ---- Perbarui judul setelah data halaman selesai di-load ----
// Dipanggil dari chapter-page.js dan note-page.js setelah judul asli diketahui.
export async function updateAnalyticsTitle(realTitle) {
  if (!_currentDocId || !realTitle) return;
  try {
    await setDoc(doc(db, "pageViews", _currentDocId), { title: realTitle }, { merge: true });
    // Update juga pageStats doc di readerVisits jika ada
    if (window._analyticsUser && _page) {
      const today = new Date().toISOString().slice(0, 10);
      const uid   = window._analyticsUser.uid;
      await setDoc(doc(db, "readerVisits", `${uid}_${today}`), {
        [`pages_${_page.safeKey}`]: realTitle,
      }, { merge: true });
    }
    if (_visitLogRefReady) {
      const ref = await _visitLogRefReady;
      if (ref) await updateDoc(ref, { title: realTitle }).catch(() => {});
    }
  } catch {}
}

// ---- Track waktu baca ----
function setupTimeTracking() {
  let start = Date.now();
  let total = 0;
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) {
      total += Date.now() - start;
      const secs = Math.round(total / 1000);
      if (secs >= 5 && _currentDocId) {
        try {
          await setDoc(doc(db, "pageViews", _currentDocId), {
            totalReadSeconds: increment(secs),
            readSessions: increment(1),
          }, { merge: true });
        } catch {}
        total = 0; // reset agar tidak double-count kalau tab di-hide lagi
      }
    } else {
      start = Date.now();
    }
  });
}

// ---- Track pembaca yang login ----
async function trackReader(user, page, device) {
  if (!user) return;
  window._analyticsUser = user; // simpan untuk updateAnalyticsTitle

  const loc     = await getLocation(); // sudah cached dari trackPageView
  const isAdmin = await checkIsAdmin(user.email).catch(() => false);

  // Tunggu dokumen visitLogs benar-benar tersedia (bukan cuma cek variabel
  // yang mungkin belum terisi) sebelum menambahkan uid/name/isAdmin —
  // ini yang tadinya bikin kunjungan admin nyangkut sebagai "Tamu".
  if (_visitLogRefReady) {
    const ref = await _visitLogRefReady;
    if (ref) {
      updateDoc(ref, { uid: user.uid, name: user.displayName || "", isAdmin }).catch(() => {});
    }
  }

  try {
    await setDoc(doc(db, "readers", user.uid), {
      uid:        user.uid,
      name:       user.displayName || "(tanpa nama)",
      email:      user.email       || "",
      photoURL:   user.photoURL    || "",
      lastSeen:   serverTimestamp(),
      lastPage:   page.title,      // akan mungkin masih sementara; updateAnalyticsTitle akan fix ini
      lastPath:   page.path,
      deviceType: device.type,
      browser:    device.browser,
      os:         device.os,
      country:    loc.country,
      city:       loc.city,
      isAdmin:    isAdmin,
      pageCount:  increment(1),
    }, { merge: true });

    // Riwayat halaman per hari
    const today = new Date().toISOString().slice(0, 10);
    await setDoc(doc(db, "readerVisits", `${user.uid}_${today}`), {
      uid:    user.uid,
      name:   user.displayName || "",
      date:   today,
      [`pages_${page.safeKey}`]: page.title,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch {}
}

// ---- Entry point ----
export function initAnalytics() {
  loadGA4();
  _page = getPageInfo();
  const device = getDeviceInfo();

  trackPageView(_page, device);
  setupTimeTracking();

  document.addEventListener("fom:user-ready", (e) => {
    if (e.detail?.user) trackReader(e.detail.user, _page, device);
  });
}

export function gaEvent(name, params = {}) {
  if (window.gtag) window.gtag("event", name, params);
}
