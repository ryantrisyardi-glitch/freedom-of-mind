// =========================================================
// ANALYTICS — Freedom of Mind
// Melacak SEMUA pengunjung (anonim + login) ke Firestore,
// sekaligus memuat Google Analytics 4 kalau sudah dikonfigurasi.
// =========================================================

import { db } from "./firebase-core.js";
import {
  doc, setDoc, serverTimestamp, increment,
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
  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua);

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

  return {
    type: isTablet ? "tablet" : (isMobile ? "mobile" : "desktop"),
    browser,
    os,
  };
}

// ---- Page info ----
function getPageInfo() {
  const path = window.location.pathname + window.location.search;
  const params = new URLSearchParams(window.location.search);

  let type = "other";
  let refId = "";
  if (path.includes("index.html") || path.endsWith("/")) type = "home";
  else if (path.includes("chapter.html")) { type = "chapter"; refId = params.get("id") || ""; }
  else if (path.includes("note.html")) { type = "note"; refId = params.get("id") || ""; }
  else if (path.includes("editor.html")) type = "editor";
  else if (path.includes("admin.html")) type = "admin";

  // Bersihkan SEMUA karakter non-alphanumeric supaya aman sebagai Firestore field name
  const safeKey = path.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").slice(0, 80) || "home";
  const title = (document.title || path).replace(" — Freedom of Mind", "").trim();

  return { path, type, refId, safeKey, title };
}

// ---- Geolokasi via ipapi.co (cache di sessionStorage) ----
async function getLocation() {
  const cached = sessionStorage.getItem("fom_geo");
  if (cached) return JSON.parse(cached);
  try {
    const res = await fetch("https://ipapi.co/json/", {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error();
    const geo = await res.json();
    const loc = { country: geo.country_name || "", city: geo.city || "" };
    sessionStorage.setItem("fom_geo", JSON.stringify(loc));
    return loc;
  } catch {
    return { country: "", city: "" };
  }
}

// ---- Track page view (semua pengunjung, termasuk anonim) ----
let pageTracked = false;

async function trackPageView(page, device) {
  if (pageTracked) return;
  pageTracked = true;

  const today = new Date().toISOString().slice(0, 10);
  const docId = `${today}_${page.safeKey}`;

  // Dedup: 1 unique visitor per session per halaman (pakai sessionStorage)
  const sKey = `fom_v_${docId}`;
  const isNew = !sessionStorage.getItem(sKey);
  if (isNew) sessionStorage.setItem(sKey, "1");

  try {
    await setDoc(doc(db, "pageViews", docId), {
      date: today,
      path: page.path,
      title: page.title,
      type: page.type,
      refId: page.refId,
      views: increment(1),
      ...(isNew ? { uniqueVisitors: increment(1) } : {}),
      [`devices_${device.type}`]: increment(1),
      [`browsers_${device.browser}`]: increment(1),
      [`os_${device.os}`]: increment(1),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch { /* silent fail */ }
}

// ---- Track waktu baca ----
function setupTimeTracking(page) {
  let start = Date.now();
  let total = 0;

  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) {
      total += Date.now() - start;
      const secs = Math.round(total / 1000);
      if (secs >= 5) {
        const today = new Date().toISOString().slice(0, 10);
        try {
          await setDoc(doc(db, "pageViews", `${today}_${page.safeKey}`), {
            totalReadSeconds: increment(secs),
          }, { merge: true });
        } catch {}
        total = 0;
      }
    } else {
      start = Date.now();
    }
  });
}

// ---- Track pembaca yang login ----
async function trackReader(user, page, device) {
  if (!user) return;

  const loc = await getLocation();

  try {
    // Upsert reader doc (satu dokumen per user, selalu update)
    await setDoc(doc(db, "readers", user.uid), {
      uid: user.uid,
      name: user.displayName || "(tanpa nama)",
      email: user.email || "",
      photoURL: user.photoURL || "",
      lastSeen: serverTimestamp(),
      lastPage: page.title,
      lastPath: page.path,
      deviceType: device.type,
      browser: device.browser,
      os: device.os,
      country: loc.country,
      city: loc.city,
      pageCount: increment(1),
    }, { merge: true });

    // Simpan halaman yang dikunjungi per hari (terpisah dari dok utama)
    const today = new Date().toISOString().slice(0, 10);
    await setDoc(doc(db, "readerVisits", `${user.uid}_${today}`), {
      uid: user.uid,
      name: user.displayName || "",
      date: today,
      // Map: safeKey → judul halaman  (aman sebagai Firestore field)
      [`pages_${page.safeKey}`]: page.title,
      updatedAt: serverTimestamp(),
    }, { merge: true });

  } catch { /* silent fail */ }
}

// ---- Entry point ----
export function initAnalytics() {
  loadGA4();
  const page = getPageInfo();
  const device = getDeviceInfo();

  // Track segera — bekerja untuk semua pengunjung termasuk anonim
  trackPageView(page, device);
  setupTimeTracking(page);

  // Track pembaca yang login saat auth Firebase siap
  document.addEventListener("fom:user-ready", (e) => {
    if (e.detail?.user) trackReader(e.detail.user, page, device);
  });
}

export function gaEvent(name, params = {}) {
  if (window.gtag) window.gtag("event", name, params);
}
