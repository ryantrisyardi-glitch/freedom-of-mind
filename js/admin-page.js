// =========================================================
// ADMIN PAGE — Analitik · Pembaca · Admin
// =========================================================

import { initApp, onAuthReady, currentUser, currentIsAdmin, showConfirm } from "./ui-shared.js";
import {
  getAllAdmins, addAdmin, removeAdmin,
  getAllReaders, deleteReader,
  getPageViewStats, getPopularPages, getVisitLogs, getAllCityStats, getAllSourceStats,
  getAllComments,
  getAllNotes, updateNote,
  backupAllData, restoreAllData,
} from "./data.js";
import { initAnalytics } from "./analytics.js";

function isSuperadmin() {
  return currentUser &&
    currentUser.email?.toLowerCase() === (window.SUPERADMIN_EMAIL || "").toLowerCase();
}

let activeTab = "analytics";
let admins = [], readers = [], pageStats = [], popularPages = [], comments = [], visitLogs = [];
let allCityStats = {};
let allSourceStats = {};
let visitFilterDate = "", visitFilterHourFrom = 0, visitFilterHourTo = 23;
let visitFilterWho = "all"; // "all" | "admin" | "nonadmin"
let comparePeriod = "day"; // "hour" | "day" | "week" | "month" — untuk section Perbandingan Qty vs Qty Unik

let loadErrors = {};

async function loadAndRender() {
  const root = document.getElementById("adminRoot");
  if (!currentUser) {
    root.innerHTML = '<div class="empty-state">Masuk dengan Google terlebih dahulu.</div>';
    return;
  }
  if (!currentIsAdmin) {
    root.innerHTML = '<div class="empty-state">Akun ini tidak memiliki akses admin.</div>';
    return;
  }
  root.innerHTML = '<div class="empty-state">Memuat data...</div>';

  loadErrors = {};
  // pageStats diambil 180 hari (bukan 30) supaya section "Perbandingan Qty vs
  // Qty Unik" punya cukup data untuk bucket per-minggu & per-bulan. Kartu
  // ringkasan (Hari ini/7 Hari/30 Hari) tetap memfilter dari data yang sama
  // memakai batas tanggalnya masing-masing, jadi tidak ada yang berubah di situ.
  const results = await Promise.allSettled([
    getAllAdmins(), getAllReaders(), getPageViewStats(180), getPopularPages(10), getAllComments(), getVisitLogs(90, 5000), getAllCityStats(), getAllSourceStats(),
  ]);
  const keys = ["admins", "readers", "pageStats", "popularPages", "comments", "visitLogs", "allCityStats", "allSourceStats"];
  const fallbacks = [admins, readers, pageStats, popularPages, comments, visitLogs, allCityStats, allSourceStats];
  const values = results.map(function(r, i) {
    if (r.status === "fulfilled") return r.value;
    loadErrors[keys[i]] = (r.reason && r.reason.message) || String(r.reason);
    return Array.isArray(fallbacks[i]) ? [] : fallbacks[i];
  });
  admins = values[0]; readers = values[1]; pageStats = values[2];
  popularPages = values[3]; comments = values[4]; visitLogs = values[5];
  allCityStats = values[6] || {};
  allSourceStats = values[7] || {};
  lastLoadedAt = new Date();

  // Kalau SEMUA query gagal (mis. belum login/rules salah total), baru
  // tampilkan error penuh — kalau cuma sebagian gagal, tetap render apa
  // adanya dan tunjukkan pesan kecil di bagian yang bermasalah saja.
  if (Object.keys(loadErrors).length === results.length) {
    root.innerHTML = '<div class="empty-state">Gagal memuat: ' + (loadErrors.admins || "") + "</div>";
    return;
  }
  render();
}

let lastLoadedAt = null;

function render() {
  const root = document.getElementById("adminRoot");
  var refreshedLabel = lastLoadedAt
    ? "Data per " + lastLoadedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";
  root.innerHTML =
    '<div class="admin-panel">' +
      '<div class="admin-tabs">' +
        tabBtn("analytics", "Analitik", "") +
        tabBtn("readers",   "Pembaca",  readers.length) +
        tabBtn("admins",    "Admin",    admins.length + 1) +
        tabBtn("maintenance", "Perbaikan", "") +
        '<span class="admin-tabs__spacer"></span>' +
        '<span class="admin-tabs__refreshed" id="adminRefreshedAt">' + escHtml(refreshedLabel) + '</span>' +
        '<button class="btn" id="adminRefreshBtn" title="Data di sini diambil sekali saat halaman dibuka — klik untuk mengambil data terbaru dari server tanpa reload penuh">🔄 Muat ulang</button>' +
      "</div>" +
      '<div id="adminTabContent">' +
        (activeTab === "analytics" ? renderAnalytics() :
         activeTab === "readers"   ? renderReaders()   :
         activeTab === "admins"    ? renderAdmins()    : renderMaintenance()) +
      "</div>" +
    "</div>";

  root.querySelectorAll(".admin-tab").forEach(function(b) {
    b.addEventListener("click", function() { activeTab = b.dataset.tab; render(); });
  });
  var refreshBtn = document.getElementById("adminRefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", function() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Memuat…";
    loadAndRender();
  });
  if (activeTab === "analytics") {
    var applyBtn = document.getElementById("visitFilterApplyBtn");
    if (applyBtn) applyBtn.addEventListener("click", function() {
      visitFilterDate = document.getElementById("visitFilterDateInput").value || "";
      visitFilterHourFrom = parseInt(document.getElementById("visitFilterFromInput").value, 10) || 0;
      visitFilterHourTo = parseInt(document.getElementById("visitFilterToInput").value, 10);
      if (isNaN(visitFilterHourTo)) visitFilterHourTo = 23;
      render();
    });
    var resetBtn = document.getElementById("visitFilterResetBtn");
    if (resetBtn) resetBtn.addEventListener("click", function() {
      visitFilterDate = ""; visitFilterHourFrom = 0; visitFilterHourTo = 23; visitFilterWho = "all";
      render();
    });
    var whoInput = document.getElementById("visitFilterWhoInput");
    if (whoInput) whoInput.addEventListener("change", function() {
      visitFilterWho = whoInput.value;
      render();
    });
    root.querySelectorAll("[data-compare-period]").forEach(function(b) {
      b.addEventListener("click", function() {
        comparePeriod = b.dataset.comparePeriod;
        render();
      });
    });
  }
  if (activeTab === "readers") {
    root.querySelectorAll("[data-del-reader]").forEach(function(b) {
      b.addEventListener("click", function() { handleDeleteReader(b.dataset.delReader); });
    });
  } else if (activeTab === "admins") {
    var addBtn = document.getElementById("addAdminBtn");
    if (addBtn) addBtn.addEventListener("click", handleAdd);
    root.querySelectorAll("[data-remove]").forEach(function(b) {
      b.addEventListener("click", function() { handleRemove(b.dataset.remove); });
    });
  } else if (activeTab === "maintenance") {
    var fixBtn = document.getElementById("fixDropCapBtn");
    if (fixBtn) fixBtn.addEventListener("click", handleFixDropCaps);
    var backupBtn = document.getElementById("backupBtn");
    if (backupBtn) backupBtn.addEventListener("click", handleBackup);
    var restoreInput = document.getElementById("restoreFileInput");
    if (restoreInput) restoreInput.addEventListener("change", handleRestoreFileChosen);
  }
}

function tabBtn(tab, label, count) {
  var active = activeTab === tab ? " is-active" : "";
  var badge  = count !== "" ? ' <span class="admin-tab__count">' + count + "</span>" : "";
  return '<button class="admin-tab' + active + '" data-tab="' + tab + '">' + label + badge + "</button>";
}

// ============================================================
// Tab: Analitik
// ============================================================
function renderAnalytics() {
  var today    = new Date().toISOString().slice(0, 10);
  var weekAgo  = daysAgo(6); // 7 hari termasuk hari ini (0..6) — selaras dgn thisWeekViews di bawah
  var monthAgo = daysAgo(30);

  var todayViews = 0, weekViews = 0, monthViews = 0;
  var todayUniq  = 0, weekUniq  = 0, monthUniq  = 0;
  var totalReadSecs = 0, totalReadSessions = 0;
  var devices = {}, browsers = {}, os = {}, countries = {}, cities = {};
  var dailyMap = {}, dailyUniqMap = {};

  pageStats.forEach(function(v) {
    var views = v.views || 0;
    var uniq  = v.uniqueVisitors || 0;
    if (v.date === today)    { todayViews += views; todayUniq += uniq; }
    if (v.date >= weekAgo)   { weekViews  += views; weekUniq  += uniq; }
    if (v.date >= monthAgo)  { monthViews += views; monthUniq += uniq; }
    dailyMap[v.date]     = (dailyMap[v.date]     || 0) + views;
    dailyUniqMap[v.date] = (dailyUniqMap[v.date] || 0) + uniq;
    totalReadSecs     += v.totalReadSeconds || 0;
    totalReadSessions += v.readSessions     || 0;

    Object.keys(v).forEach(function(k) {
      var val = v[k];
      if (typeof val !== "number" || val < 1) return;
      if (k.startsWith("devices_"))   devices[k.slice(8)]   = (devices[k.slice(8)]   || 0) + val;
      if (k.startsWith("browsers_"))  browsers[k.slice(9)]  = (browsers[k.slice(9)]  || 0) + val;
      if (k.startsWith("os_"))        os[k.slice(3)]        = (os[k.slice(3)]        || 0) + val;
      if (k.startsWith("countries_")) countries[k.slice(10)]= (countries[k.slice(10)]|| 0) + val;
      if (k.startsWith("cities_"))    cities[k.slice(7)]    = (cities[k.slice(7)]    || 0) + val;
    });
  });

  var avgSecs   = totalReadSessions > 0 ? Math.round(totalReadSecs / totalReadSessions) : 0;
  var avgDurStr = avgSecs >= 60 ? (Math.floor(avgSecs / 60) + "m " + (avgSecs % 60) + "s")
                : avgSecs > 0  ? (avgSecs + "s") : "-";
  var newReaders = readers.filter(function(r) { return isNew(r.firstSeen); }).length;
  var ga4Active  = window.GA_MEASUREMENT_ID && window.GA_MEASUREMENT_ID !== "G-XXXXXXXXXX";

  var totalComments = comments.length;
  var guestComments = comments.filter(function(c) { return !c.uid; }).length;
  var commentCountries = {}, commentCities = {};
  comments.forEach(function(c) {
    var loc = c.location;
    if (!loc) return;
    if (loc.country) commentCountries[loc.country] = (commentCountries[loc.country] || 0) + 1;
    if (loc.city)    commentCities[loc.city]       = (commentCities[loc.city]       || 0) + 1;
  });
  var recentComments = comments.slice(0, 8);

  var last7  = [];
  for (var i = 6; i >= 0; i--) last7.push(daysAgo(i));
  var max7   = 1;
  last7.forEach(function(d) { if ((dailyMap[d] || 0) > max7) max7 = dailyMap[d]; });

  // ---- Perbandingan ala Google Analytics: hari ini vs kemarin,
  // minggu ini vs minggu lalu — dihitung dari dailyMap yang sudah ada
  // (data 30 hari dari getPageViewStats), tidak perlu query tambahan.
  var yesterdayViews = dailyMap[daysAgo(1)] || 0;
  var thisWeekViews = 0, lastWeekViews = 0;
  for (var j = 0; j <= 6; j++)  thisWeekViews += dailyMap[daysAgo(j)]  || 0;
  for (var k = 7; k <= 13; k++) lastWeekViews += dailyMap[daysAgo(k)] || 0;

  var banner = ga4Active
    ? '<div class="stat-banner stat-banner--ok">Google Analytics aktif (' + escHtml(window.GA_MEASUREMENT_ID) +
        ') &mdash; <a href="https://analytics.google.com" target="_blank" rel="noopener">buka dashboard GA4</a></div>'
    : '<div class="stat-banner stat-banner--warn">Google Analytics belum aktif &mdash; isi Measurement ID di js/firebase-config.js</div>';

  var cards =
    statCard("Hari ini",        todayViews, "kunjungan",    todayUniq + " unik", trendBadge(todayViews, yesterdayViews)) +
    statCard("7 Hari",          weekViews,  "kunjungan",    weekUniq  + " unik", trendBadge(thisWeekViews, lastWeekViews)) +
    statCard("30 Hari",         monthViews, "kunjungan",    monthUniq + " unik") +
    statCard("Durasi Rata-rata",avgDurStr,  "per sesi",     totalReadSessions + " sesi") +
    statCard("Pembaca Login",   readers.length, "akun",     newReaders + " baru (7h)") +
    statCard("Komentar",        totalComments, "total",     guestComments + " dari tamu");

  var bars = last7.map(function(d) {
    var v = dailyMap[d] || 0;
    var h = Math.round((v / max7) * 100);
    return '<div class="bar-chart__col">' +
      '<div class="bar-chart__bar" style="height:' + h + '%" title="' + v + ' kunjungan"></div>' +
      '<div class="bar-chart__val">' + v + "</div>" +
      '<div class="bar-chart__label">' + d.slice(5) + "</div>" +
      "</div>";
  }).join("");

  var popRows = popularPages.length === 0
    ? '<p class="empty-state" style="margin:12px 0;font-size:.85rem">Belum ada data. Kunjungi beberapa halaman dulu.</p>'
    : popularPages.map(function(p, i) {
        var maxV  = (popularPages[0].views || 1);
        var pct   = Math.round((p.views / maxV) * 100);
        var icon  = p.type === "chapter" ? "[Bab]" : p.type === "note" ? "[Cat]" : "[Hal]";
        var avgD  = p.readSessions > 0 ? Math.round((p.totalReadSeconds || 0) / p.readSessions) : 0;
        var durStr= avgD >= 60 ? (Math.floor(avgD/60) + "m" + (avgD%60) + "s") : avgD > 0 ? (avgD + "s") : "";
        return '<div class="popular-row">' +
          '<span class="popular-row__rank">' + (i + 1) + "</span>" +
          '<div class="popular-row__info">' +
            '<span class="popular-row__title">' + icon + " " + escHtml(p.title || p.path) + "</span>" +
            '<div class="popular-row__bar"><div style="width:' + pct + '%"></div></div>' +
          "</div>" +
          '<div class="popular-row__right">' +
            '<span class="popular-row__count">' + p.views + " views</span>" +
            (durStr ? '<span class="popular-row__dur">' + durStr + "</span>" : "") +
          "</div>" +
          "</div>";
      }).join("");

  var recentCommentRows = recentComments.length === 0
    ? '<p class="empty-state" style="margin:12px 0;font-size:.85rem">Belum ada komentar.</p>'
    : recentComments.map(function(c) {
        var loc = c.location && (c.location.city || c.location.country)
          ? [c.location.city, c.location.country].filter(Boolean).join(", ")
          : "lokasi tidak diketahui";
        var badge = c.uid ? "login" : "tamu";
        var snippet = (c.text || "").slice(0, 90) + ((c.text || "").length > 90 ? "…" : "");
        return '<div class="popular-row">' +
          '<div class="popular-row__info">' +
            '<span class="popular-row__title">' + escHtml(c.name || "Anonim") +
              ' <span style="font-family:var(--font-mono);font-size:10px;color:var(--sage);border:1px solid var(--line);border-radius:999px;padding:1px 6px;margin-left:4px;">' + badge + '</span></span>' +
            '<div style="font-size:.82rem;color:var(--ink-soft);margin-top:2px;">' + escHtml(snippet) + '</div>' +
          '</div>' +
          '<div class="popular-row__right">' +
            '<span class="popular-row__count">' + escHtml(loc) + '</span>' +
          '</div>' +
        '</div>';
      }).join("");

  return banner +
    '<div class="stat-grid">' + cards + "</div>" +
    '<div class="stat-section">' +
      '<h3 class="stat-section__title">Kunjungan 7 Hari Terakhir</h3>' +
      '<div class="bar-chart">' + bars + "</div>" +
    "</div>" +
    '<div class="stat-section">' +
      '<h3 class="stat-section__title">Halaman Paling Banyak Dibaca (30 hari)</h3>' +
      '<div class="popular-list">' + popRows + "</div>" +
    "</div>" +
    '<div class="stat-row-3">' +
      breakdownCard("Device",   devices,   ["desktop:Komputer","mobile:HP","tablet:Tablet"]) +
      breakdownCard("Browser",  browsers,  ["chrome:Chrome","safari:Safari","firefox:Firefox","edge:Edge","opera:Opera","other:Lainnya"]) +
      breakdownCard("OS",       os,        ["windows:Windows","macos:macOS","android:Android","ios:iOS","linux:Linux","other:Lainnya"]) +
    "</div>" +
    '<div class="stat-row-3">' +
      breakdownCard("Negara",   countries, []) +
      breakdownCard("Kota (semua waktu)", allCityStats, [], 999) +
      breakdownCard("Sumber Kunjungan (semua waktu)", humanizeSourceKeys(allSourceStats), [], 999) +
      breakdownCard("Pembaca",  {"Baru (7h)": newReaders, "Kembali": Math.max(0, readers.length - newReaders)}, []) +
    "</div>" +
    renderComparisonSection() +
    renderVisitLogSection() +
    '<div class="stat-section">' +
      '<h3 class="stat-section__title">Asal Komentar (kota/negara dari IP)</h3>' +
      '<div class="stat-row-3">' +
        breakdownCard("Negara (Komentar)", commentCountries, []) +
        breakdownCard("Kota (Komentar)",   commentCities,    []) +
        breakdownCard("Jenis Komentator",  {"Tamu": guestComments, "Login": totalComments - guestComments}, []) +
      "</div>" +
    "</div>" +
    '<div class="stat-section">' +
      '<h3 class="stat-section__title">Komentar Terbaru</h3>' +
      '<div class="popular-list">' + recentCommentRows + "</div>" +
    "</div>";
}

// ---- Detail kunjungan per-baris, dengan filter tanggal & rentang jam ----
function renderVisitLogSection() {
  if (loadErrors.visitLogs) {
    return '<div class="stat-section">' +
      '<h3 class="stat-section__title">Detail Kunjungan (per jam)</h3>' +
      '<div class="stat-banner stat-banner--warn">Gagal memuat detail kunjungan: ' + escHtml(loadErrors.visitLogs) +
        '. Kemungkinan Firestore Rules untuk koleksi <code>visitLogs</code> belum di-Publish ulang di Firebase Console — lihat README.md bagian Setup.</div>' +
    '</div>';
  }

  var hourOptionsFrom = "", hourOptionsTo = "";
  for (var h = 0; h < 24; h++) {
    var label = String(h).padStart(2, "0") + ":00";
    hourOptionsFrom += '<option value="' + h + '"' + (h === visitFilterHourFrom ? " selected" : "") + '>' + label + '</option>';
    hourOptionsTo   += '<option value="' + h + '"' + (h === visitFilterHourTo   ? " selected" : "") + '>' + label + '</option>';
  }

  var filtered = visitLogs.filter(function(v) {
    if (!v.createdAt || !v.createdAt.seconds) return false;
    var d = new Date(v.createdAt.seconds * 1000);
    if (visitFilterDate) {
      var dateStr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      if (dateStr !== visitFilterDate) return false;
    }
    var hour = d.getHours();
    if (hour < visitFilterHourFrom || hour > visitFilterHourTo) return false;
    if (visitFilterWho === "admin" && !v.isAdmin) return false;
    if (visitFilterWho === "nonadmin" && v.isAdmin) return false;
    return true;
  });

  var rows = filtered.length === 0
    ? '<p class="empty-state" style="margin:12px 0;font-size:.85rem">Tidak ada kunjungan pada rentang waktu ini.</p>'
    : filtered.slice(0, 200).map(function(v) {
        var d = new Date(v.createdAt.seconds * 1000);
        var waktu = d.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
        var loc = [v.city, v.country].filter(Boolean).join(", ") || "tidak diketahui";
        // Admin (v.isAdmin) TIDAK dianggap "Tamu" lagi walau field lama belum
        // punya isAdmin (kunjungan sebelum update ini) — fallback tetap aman
        // karena v.isAdmin hanya true kalau memang tercatat sebagai admin.
        var who = v.isAdmin
          ? (escHtml(v.name || "Admin") + ' <span class="badge-admin" style="font-size:.7em">admin</span>')
          : (v.uid ? escHtml(v.name || "Pembaca login") : "Tamu");
        var icon = v.type === "chapter" ? "[Bab]" : v.type === "note" ? "[Cat]" : v.type === "admin" ? "[Admin]" : v.type === "editor" ? "[Editor]" : "[Hal]";
        return '<div class="visitlog-row">' +
          '<span class="visitlog-row__time">' + waktu + '</span>' +
          '<span class="visitlog-row__page">' + icon + " " + escHtml(v.title || v.path || "") + '</span>' +
          '<span class="visitlog-row__loc">' + escHtml(loc) + '</span>' +
          '<span class="visitlog-row__source">' + escHtml(humanizeSource(v.source || "direct")) + '</span>' +
          '<span class="visitlog-row__device">' + escHtml(v.deviceType || "") + " · " + escHtml(v.browser || "") + '</span>' +
          '<span class="visitlog-row__who">' + who + '</span>' +
        '</div>';
      }).join("");

  return '<div class="stat-section">' +
    '<h3 class="stat-section__title">Detail Kunjungan (per jam)</h3>' +
    '<div class="visitlog-filter">' +
      '<label>Tanggal <input type="date" id="visitFilterDateInput" value="' + visitFilterDate + '"></label>' +
      '<label>Dari jam <select id="visitFilterFromInput">' + hourOptionsFrom + '</select></label>' +
      '<label>Sampai jam <select id="visitFilterToInput">' + hourOptionsTo + '</select></label>' +
      '<label>Pengunjung <select id="visitFilterWhoInput">' +
        '<option value="all"' + (visitFilterWho === "all" ? " selected" : "") + '>Semua</option>' +
        '<option value="admin"' + (visitFilterWho === "admin" ? " selected" : "") + '>Admin saja</option>' +
        '<option value="nonadmin"' + (visitFilterWho === "nonadmin" ? " selected" : "") + '>Non-admin saja</option>' +
      '</select></label>' +
      '<button class="btn" id="visitFilterApplyBtn">Terapkan</button>' +
      '<button class="btn" id="visitFilterResetBtn">Reset</button>' +
      '<span class="visitlog-filter__count">' + filtered.length + ' kunjungan' + (filtered.length > 200 ? " (menampilkan 200 pertama)" : "") + '</span>' +
    '</div>' +
    '<div class="visitlog-list">' +
      '<div class="visitlog-row visitlog-row--head">' +
        '<span>Waktu</span><span>Halaman</span><span>Lokasi</span><span>Sumber</span><span>Perangkat</span><span>Pembaca</span>' +
      '</div>' +
      rows +
    '</div>' +
    '<p class="stat-note">Data 90 hari terakhir, disimpan per kunjungan (bukan agregat) — lokasi berasal dari IP (kota/negara saja).</p>' +
  '</div>';
}

// ---- Perbandingan Qty (total kunjungan) vs Qty Unik ----
// Semua tab (Jam/Hari/Minggu/Bulan/Halaman) diambil dari SATU sumber yang
// sama: visitLogs (detail per-kunjungan, 90 hari terakhir), supaya metode
// hitung "unik"-nya konsisten di semua tab. "Unik" = jumlah ipHash berbeda
// dalam kelompok itu — ipHash adalah SHA-256 dari IP yang oktet terakhirnya
// sudah dibuang (jadi bukan IP asli, tapi sidik jari jaringan). Kunjungan
// lama (sebelum fitur ipHash ini ada) belum punya ipHash, jadi untuk baris
// itu dipakai fallback: uid (kalau login) atau kombinasi kota+perangkat+
// browser+OS per hari sebagai perkiraan.
function identityOf(v, dateStr) {
  if (v.ipHash) return "ip:" + v.ipHash;
  if (v.uid)    return "uid:" + v.uid;
  return "fp:" + dateStr + "|" + [v.city, v.country, v.deviceType, v.browser, v.os].join("|");
}

function localDateStr(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function isoWeekKey(dateStr) {
  var d = new Date(dateStr + "T00:00:00");
  var day = (d.getDay() + 6) % 7; // Senin=0
  d.setDate(d.getDate() - day + 3); // geser ke Kamis di minggu yang sama (ISO)
  var firstThu = new Date(d.getFullYear(), 0, 4);
  var firstDay = (firstThu.getDay() + 6) % 7;
  firstThu.setDate(firstThu.getDate() - firstDay + 3);
  var week = 1 + Math.round((d - firstThu) / (7 * 86400000));
  return d.getFullYear() + "-W" + String(week).padStart(2, "0");
}

var BULAN_SINGKAT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

// Kelompokkan visitLogs jadi bucket (key -> {qty, uniqSet}) memakai fungsi
// bucketKeyFn(v, dateStr, hour) yang mengembalikan key, atau null utk dilewati.
function bucketVisitLogs(bucketKeyFn) {
  var buckets = {};
  visitLogs.forEach(function(v) {
    if (!v.createdAt || !v.createdAt.seconds) return;
    var d = new Date(v.createdAt.seconds * 1000);
    var dateStr = localDateStr(d);
    var key = bucketKeyFn(v, dateStr, d.getHours());
    if (key == null) return;
    if (!buckets[key]) buckets[key] = { qty: 0, uniq: new Set() };
    buckets[key].qty++;
    buckets[key].uniq.add(identityOf(v, dateStr));
  });
  return buckets;
}

function buildHourlyCompare() {
  var buckets = bucketVisitLogs(function(v, dateStr, hour) { return String(hour).padStart(2, "0"); });
  var groups = [];
  for (var h = 0; h < 24; h++) {
    var key = String(h).padStart(2, "0");
    var b = buckets[key] || { qty: 0, uniq: new Set() };
    groups.push({ label: key, qty: b.qty, uniq: b.uniq.size });
  }
  return { groups: groups, note: "Berdasarkan 90 hari terakhir, dikelompokkan per jam-dalam-hari. \u201cUnik\u201d dihitung dari IP (di-hash, oktet terakhir dibuang demi privasi)." };
}

function buildDailyCompare() {
  var buckets = bucketVisitLogs(function(v, dateStr) { return dateStr; });
  var keys = Object.keys(buckets).sort().slice(-30); // 30 hari terakhir biar chart tidak terlalu padat
  var groups = keys.map(function(k) {
    return { label: k.slice(5), qty: buckets[k].qty, uniq: buckets[k].uniq.size };
  });
  return { groups: groups, note: "30 hari terakhir. \u201cUnik\u201d dihitung dari IP (di-hash) per hari." };
}

function buildWeeklyCompare() {
  var buckets = bucketVisitLogs(function(v, dateStr) { return isoWeekKey(dateStr); });
  var keys = Object.keys(buckets).sort().slice(-12); // 12 minggu terakhir
  var groups = keys.map(function(k) {
    return { label: k.replace(/^\d{4}-/, ""), qty: buckets[k].qty, uniq: buckets[k].uniq.size };
  });
  return { groups: groups, note: "12 minggu terakhir (kalender ISO, Senin\u2013Minggu). \u201cUnik\u201d dihitung dari IP (di-hash) per minggu." };
}

function buildMonthlyCompare() {
  var buckets = bucketVisitLogs(function(v, dateStr) { return dateStr.slice(0, 7); });
  var keys = Object.keys(buckets).sort();
  var groups = keys.map(function(k) {
    var parts = k.split("-");
    var label = BULAN_SINGKAT[parseInt(parts[1], 10) - 1] + " " + parts[0].slice(2);
    return { label: label, qty: buckets[k].qty, uniq: buckets[k].uniq.size };
  });
  return { groups: groups, note: "Seluruh bulan dari 90 hari terakhir. \u201cUnik\u201d dihitung dari IP (di-hash) per bulan." };
}

function buildPageCompare() {
  var buckets = bucketVisitLogs(function(v) { return v.title || v.path || "(tanpa judul)"; });
  var keys = Object.keys(buckets).sort(function(a, b) { return buckets[b].qty - buckets[a].qty; }).slice(0, 10);
  var groups = keys.map(function(k) {
    var label = k.length > 18 ? k.slice(0, 17) + "\u2026" : k;
    return { label: label, full: k, qty: buckets[k].qty, uniq: buckets[k].uniq.size };
  });
  return { groups: groups, note: "10 halaman paling banyak dikunjungi, 90 hari terakhir. \u201cUnik\u201d dihitung dari IP (di-hash) per halaman." };
}

function buildSourceCompare() {
  var buckets = bucketVisitLogs(function(v) { return v.source || "direct"; });
  var keys = Object.keys(buckets).sort(function(a, b) { return buckets[b].qty - buckets[a].qty; });
  var groups = keys.map(function(k) {
    return { label: humanizeSource(k), full: humanizeSource(k), qty: buckets[k].qty, uniq: buckets[k].uniq.size };
  });
  return { groups: groups, note: "90 hari terakhir. Sumber dari ?utm_source= atau referrer browser \u2014 klik dari WhatsApp/Instagram tanpa tag UTM sering kehitung \u201cLangsung\u201d karena app itu membuang referrer demi privasi." };
}

function renderComparisonSection() {
  var tabs = [
    ["hour",  "Per Jam"],
    ["day",   "Per Hari"],
    ["week",  "Per Minggu"],
    ["month", "Per Bulan"],
    ["page",  "Per Halaman"],
    ["source","Per Sumber"],
  ];
  var tabsHtml = tabs.map(function(t) {
    var active = comparePeriod === t[0] ? " is-active" : "";
    return '<button class="compare-tab' + active + '" data-compare-period="' + t[0] + '">' + t[1] + "</button>";
  }).join("");

  var built = comparePeriod === "hour"   ? buildHourlyCompare()
            : comparePeriod === "week"   ? buildWeeklyCompare()
            : comparePeriod === "month"  ? buildMonthlyCompare()
            : comparePeriod === "page"   ? buildPageCompare()
            : comparePeriod === "source" ? buildSourceCompare()
            : buildDailyCompare();

  var groups = built.groups;
  var maxV = 1;
  groups.forEach(function(g) { maxV = Math.max(maxV, g.qty, g.uniq); });

  var totalQty = groups.reduce(function(a, g) { return a + g.qty; }, 0);
  var totalUniq = groups.reduce(function(a, g) { return a + g.uniq; }, 0);
  var pctUniq = totalQty > 0 ? Math.round((totalUniq / totalQty) * 100) : 0;

  var TRACK_H = 110; // tinggi area bar dalam px — dipakai juga untuk hitung tinggi batang
  var cols = groups.length === 0
    ? '<p class="empty-state" style="margin:12px 0;font-size:.85rem">Belum ada data untuk periode ini.</p>'
    : groups.map(function(g) {
        var hQty  = Math.max(2, Math.round((g.qty  / maxV) * TRACK_H));
        var hUniq = Math.max(2, Math.round((g.uniq / maxV) * TRACK_H));
        var tip = escHtml(g.full || g.label) + ": " + g.qty + " qty, " + g.uniq + " unik";
        return '<div class="compare-chart__col" title="' + tip + '">' +
          '<div class="compare-chart__bars" style="height:' + TRACK_H + 'px">' +
            '<div class="compare-chart__bar compare-chart__bar--qty" style="height:' + hQty + 'px"></div>' +
            '<div class="compare-chart__bar compare-chart__bar--uniq" style="height:' + hUniq + 'px"></div>' +
          '</div>' +
          '<div class="compare-chart__label">' + escHtml(g.label) + '</div>' +
        '</div>';
      }).join("");

  return '<div class="stat-section">' +
    '<h3 class="stat-section__title">Perbandingan Qty vs Qty Unik</h3>' +
    '<div class="compare-tabs">' + tabsHtml + '</div>' +
    '<div class="compare-summary">' +
      '<span><span class="compare-dot compare-dot--qty"></span> Qty: <strong>' + totalQty.toLocaleString("id-ID") + '</strong></span>' +
      '<span><span class="compare-dot compare-dot--uniq"></span> Qty Unik: <strong>' + totalUniq.toLocaleString("id-ID") + '</strong></span>' +
      '<span>Rasio unik: <strong>' + pctUniq + '%</strong></span>' +
    '</div>' +
    '<div class="compare-chart">' + cols + '</div>' +
    '<p class="stat-note">' + built.note + '</p>' +
  '</div>';
}


function trendBadge(current, previous) {
  // Kalau baseline (previous) 0, persentase tidak bermakna (bisa "tak
  // terhingga") — tampilkan sebagai kunjungan baru murni, bukan %.
  if (previous === 0) {
    if (current === 0) return '<span class="trend trend--flat">tidak ada data</span>';
    return '<span class="trend trend--up">baru (0 → ' + current.toLocaleString("id-ID") + ")</span>";
  }
  var pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return '<span class="trend trend--flat">= sama seperti sebelumnya</span>';
  var arrow = pct > 0 ? "▲" : "▼";
  var cls   = pct > 0 ? "trend--up" : "trend--down";
  return '<span class="trend ' + cls + '">' + arrow + " " + Math.abs(pct) + "% vs sebelumnya</span>";
}

function statCard(label, value, unit, sub, trendHtml) {
  var display = typeof value === "number" ? value.toLocaleString("id-ID") : value;
  return '<div class="stat-card">' +
    '<div class="stat-card__val">' + display + "</div>" +
    '<div class="stat-card__unit">' + unit + "</div>" +
    '<div class="stat-card__label">' + label + "</div>" +
    '<div class="stat-card__sub">' + sub + "</div>" +
    (trendHtml ? '<div class="stat-card__trend">' + trendHtml + "</div>" : "") +
    "</div>";
}

// Label yang enak dibaca untuk key sumber kunjungan (lihat detectSource() di
// analytics.js). Key yang tidak dikenal (hostname mentah) ditampilkan apa
// adanya dengan huruf awal kapital, supaya tetap kebaca meski bukan platform
// yang sudah dikenali eksplisit.
var SOURCE_LABELS = {
  direct: "Langsung / Bookmark",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  twitter_x: "Twitter / X",
  telegram: "Telegram",
  tiktok: "TikTok",
  google: "Google",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  unknown: "Tidak diketahui",
};
function humanizeSource(key) {
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  return (key || "unknown").replace(/_/g, ".");
}
// breakdownCard butuh objek {label: qty} — sources_* disimpan dengan key
// mentah (mis. "whatsapp", "some_blog_com"), jadi di-relabel dulu di sini.
function humanizeSourceKeys(stats) {
  var out = {};
  Object.keys(stats).forEach(function(k) {
    var label = humanizeSource(k);
    out[label] = (out[label] || 0) + stats[k];
  });
  return out;
}

function breakdownCard(title, data, labelPairs, maxRows) {
  var labelMap = {};
  labelPairs.forEach(function(p) {
    var parts = p.split(":");
    labelMap[parts[0]] = parts[1] || parts[0];
  });

  var total  = Object.values(data).reduce(function(a, b) { return a + b; }, 0) || 1;
  var sorted = Object.entries(data).sort(function(a, b) { return b[1] - a[1]; }).slice(0, maxRows || 6);

  var rows = sorted.length === 0
    ? '<p style="font-size:.82rem;color:var(--sage);margin:4px 0">Belum ada data</p>'
    : sorted.map(function(entry) {
        var k   = entry[0];
        var v   = entry[1];
        var pct = Math.round((v / total) * 100);
        var lbl = labelMap[k] || k.replace(/_/g, " ");
        return '<div class="breakdown-row">' +
          "<span>" + escHtml(lbl) + "</span>" +
          '<div class="breakdown-bar"><div style="width:' + pct + '%"></div></div>' +
          "<span>" + v + " (" + pct + "%)</span>" +
          "</div>";
      }).join("");

  var scrollCls = sorted.length > 8 ? " breakdown-card--scroll" : "";
  return '<div class="breakdown-card' + scrollCls + '">' +
    '<h4 class="breakdown-card__title">' + title + "</h4>" +
    '<div class="breakdown-card__rows">' + rows + '</div>' +
    "</div>";
}

// ============================================================
// Tab: Pembaca
// ============================================================
function renderReaders() {
  if (readers.length === 0) {
    return '<div class="empty-state" style="margin:32px 0">' +
      "Belum ada pembaca yang login.<br>" +
      '<span style="font-size:.88rem;color:var(--sage)">Pengunjung anonim tercatat di tab Analitik.</span>' +
      "</div>";
  }

  var rows = readers.map(function(r) {
    var lastSeen  = r.lastSeen && r.lastSeen.toDate ? fmtDate(r.lastSeen.toDate()) : "-";
    var pages     = r.pageCount || 0;
    var location  = [r.city, r.country].filter(Boolean).join(", ") || "-";
    var isNewUser = isNew(r.firstSeen);
    var newBadge  = isNewUser ? ' <span class="badge-new">baru</span>' : "";
    var devLabel  = r.deviceType === "mobile" ? "HP" : r.deviceType === "tablet" ? "Tablet" : "Komputer";
    var delBtn    = isSuperadmin()
      ? '<button class="btn btn-icon btn-danger" data-del-reader="' + r.uid + '" title="Hapus">Hapus</button>'
      : "";
    return '<div class="reader-row">' +
      '<img class="reader-row__avatar" src="' + escHtml(r.photoURL || "") + '" alt="" onerror="this.style.display=\'none\'">' +
      '<div class="reader-row__info">' +
        "<strong>" + escHtml(r.name) + newBadge + "</strong>" +
        '<span class="reader-row__email">' + escHtml(r.email) + "</span>" +
        '<span class="reader-row__stats">Terakhir: ' + lastSeen +
          " &middot; " + pages + " halaman" +
          " &middot; " + escHtml(location) +
          " &middot; " + devLabel + " / " + escHtml(r.browser || "-") +
        "</span>" +
        '<span class="reader-row__stats" style="margin-top:2px">Terakhir baca: <em>' +
          escHtml(r.lastPage || r.lastPath || "-") + "</em></span>" +
      "</div>" +
      delBtn +
      "</div>";
  }).join("");

  return '<p class="admin-readers__meta">' + readers.length + " pembaca pernah login</p>" +
    '<div class="admin-readers">' + rows + "</div>";
}

// ============================================================
// Tab: Admin
// ============================================================
function renderAdmins() {
  var superEmail = (window.SUPERADMIN_EMAIL || "").toLowerCase();
  var adminRows = admins.map(function(email) {
    var removeBtn = isSuperadmin()
      ? '<button class="btn-text" data-remove="' + escHtml(email) + '">hapus</button>'
      : "";
    return '<div class="admin-list__row"><span>' + escHtml(email) + "</span>" + removeBtn + "</div>";
  }).join("");

  var addSection = isSuperadmin()
    ? '<div class="admin-add-row">' +
        '<input type="text" id="newAdminEmail" placeholder="email@gmail.com">' +
        '<button class="btn btn-primary" id="addAdminBtn">+ Tambah admin</button>' +
      "</div>"
    : '<p class="comments__signin-hint">Hanya superadmin yang bisa mengelola admin lain.</p>';

  return '<p style="color:var(--ink-soft);font-size:.92rem;margin:0 0 16px">Admin bisa menulis dan mengedit catatan.</p>' +
    '<div class="admin-list">' +
      '<div class="admin-list__row"><span>' + superEmail + ' <span class="badge-admin">superadmin</span></span></div>' +
      adminRows +
    "</div>" +
    addSection;
}

// ============================================================
// Tab: Perbaikan (maintenance tools)
// ============================================================
function renderMaintenance() {
  return '<div class="stat-section">' +
    '<h3 class="stat-section__title">Backup &amp; Restore</h3>' +
    '<p style="color:var(--ink-soft);font-size:.92rem;margin:0 0 16px;max-width:560px">' +
      "Cadangkan SEMUA chapter dan catatan (yang sudah publish, masih draft, maupun yang ada di Trash) " +
      "jadi satu file JSON yang bisa kamu simpan sendiri (misalnya di Google Drive/laptop). " +
      "Kalau suatu saat Firestore bermasalah atau data hilang, file ini bisa dipakai untuk memulihkan semuanya kembali." +
    "</p>" +
    '<div class="backup-restore-row">' +
      '<div class="backup-restore-box">' +
        "<h4>Backup</h4>" +
        '<p>Unduh semua chapter &amp; catatan sebagai satu file <code>.json</code>.</p>' +
        '<button class="btn btn-primary" id="backupBtn">⬇ Download Backup</button>' +
        '<div id="backupResult" class="backup-restore-status"></div>' +
      "</div>" +
      '<div class="backup-restore-box">' +
        "<h4>Restore</h4>" +
        '<p>Pulihkan dari file backup <code>.json</code> yang pernah diunduh. ' +
          "Chapter/catatan dengan ID yang sama akan ditimpa sesuai isi file; " +
          "yang tidak ada di file backup tidak akan dihapus.</p>" +
        '<label class="btn" style="display:inline-block;cursor:pointer">' +
          "📤 Pilih File Backup" +
          '<input type="file" id="restoreFileInput" accept="application/json,.json" style="display:none">' +
        "</label>" +
        '<div id="restoreResult" class="backup-restore-status"></div>' +
      "</div>" +
    "</div>" +
  "</div>" +
  '<div class="stat-section">' +
    '<h3 class="stat-section__title">Perbaiki Drop Cap Catatan Lama</h3>' +
    '<p style="color:var(--ink-soft);font-size:.92rem;margin:0 0 16px;max-width:560px">' +
      "Huruf pertama besar-orange (drop cap) menyasar paragraf pertama tiap catatan. " +
      "Catatan yang ditulis sebelum perbaikan editor mungkin paragraf pertamanya belum " +
      "berupa <code>&lt;p&gt;</code> yang benar, jadi drop cap tidak muncul. Klik tombol di bawah " +
      "untuk memperbaiki SEMUA catatan sekaligus (isi tulisan tidak berubah, hanya strukturnya)." +
    "</p>" +
    '<button class="btn btn-primary" id="fixDropCapBtn">Perbaiki Drop Cap Semua Catatan</button>' +
    '<div id="fixDropCapResult" style="margin-top:12px;font-size:.88rem;color:var(--ink-soft)"></div>' +
  "</div>";
}

// Versi standalone dari normalisasi di editor.js (tanpa contenteditable) —
// membungkus teks/elemen yang belum jadi <p> di awal catatan jadi <p> asli,
// dan mengubah <div> pertama jadi <p>, supaya selector CSS `p:first-of-type`
// (drop cap) selalu punya target YANG BENAR (bukan paragraf kosong nyasar).
function isEmptyLeadingP(el) {
  if (!el || el.nodeType !== 1 || el.tagName !== "P") return false;
  if (el.querySelector("img, figure")) return false; // jangan buang yang berisi gambar
  const text = el.textContent.replace(/\u200B|\u00A0/g, "").trim();
  return text === "";
}

function fixDropCapHtml(html) {
  const container = document.createElement("div");
  container.innerHTML = html || "";
  const BLOCK_TAGS = new Set(["P", "H2", "H3", "BLOCKQUOTE", "UL", "OL", "FIGURE", "DIV", "HR"]);
  const isBlock = (n) => n.nodeType === 1 && BLOCK_TAGS.has(n.tagName);

  let changed = false;

  // 1) Buang <p> KOSONG yang nyasar di paling awal (mis. baris kosong tak
  //    sengaja sebelum mulai menulis). Ini penyebab paling umum drop cap
  //    tidak muncul: CSS `p:first-of-type` menempel ke paragraf kosong itu,
  //    bukan ke paragraf pertama yang sungguhan berisi tulisan.
  while (container.firstChild && isEmptyLeadingP(container.firstChild)) {
    container.removeChild(container.firstChild);
    changed = true;
  }

  const firstNode = container.firstChild;
  if (!firstNode) return { html: container.innerHTML, changed };

  if (!isBlock(firstNode)) {
    const p = document.createElement("p");
    let node = firstNode;
    while (node && !isBlock(node)) {
      const next = node.nextSibling;
      p.appendChild(node);
      node = next;
    }
    container.insertBefore(p, node);
    return { html: container.innerHTML, changed: true };
  }

  if (firstNode.tagName === "DIV") {
    const p = document.createElement("p");
    p.innerHTML = firstNode.innerHTML;
    container.replaceChild(p, firstNode);
    return { html: container.innerHTML, changed: true };
  }

  return { html: container.innerHTML, changed };
}

async function handleBackup() {
  var btn = document.getElementById("backupBtn");
  var resultEl = document.getElementById("backupResult");
  if (btn) { btn.disabled = true; btn.textContent = "Menyiapkan backup..."; }
  if (resultEl) resultEl.textContent = "";
  try {
    var backup = await backupAllData();
    var json = JSON.stringify(backup, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    var a = document.createElement("a");
    a.href = url;
    a.download = "freedom-of-mind-backup-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (resultEl) {
      resultEl.textContent = "Selesai — " + backup.counts.chapters + " chapter, " +
        backup.counts.notes + " catatan berhasil dicadangkan.";
    }
  } catch (err) {
    if (resultEl) resultEl.textContent = "Gagal membuat backup: " + (err.message || err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "⬇ Download Backup"; }
  }
}

function handleRestoreFileChosen(e) {
  var file = e.target.files && e.target.files[0];
  e.target.value = ""; // supaya bisa pilih file yang sama lagi nanti
  if (!file) return;

  var reader = new FileReader();
  reader.onload = async function() {
    var resultEl = document.getElementById("restoreResult");
    var backup;
    try {
      backup = JSON.parse(reader.result);
    } catch (err) {
      if (resultEl) resultEl.textContent = "File bukan JSON yang valid.";
      return;
    }
    if (!backup || !Array.isArray(backup.chapters) || !Array.isArray(backup.notes)) {
      if (resultEl) resultEl.textContent = "File ini bukan hasil Backup dari fitur ini.";
      return;
    }

    var when = backup.exportedAt ? new Date(backup.exportedAt).toLocaleString("id-ID") : "tidak diketahui";
    var ok = await showConfirm(
      "File backup ini dibuat pada " + when + ", berisi " + backup.chapters.length +
      " chapter dan " + backup.notes.length + " catatan.\n\n" +
      "Chapter/catatan dengan ID yang sama di Firestore akan DITIMPA sesuai isi file ini. " +
      "Data yang tidak ada di file backup tidak akan dihapus. Lanjutkan restore?"
    );
    if (!ok) return;

    if (resultEl) resultEl.textContent = "Memproses restore...";
    try {
      var result = await restoreAllData(backup, function(done, total) {
        if (resultEl) resultEl.textContent = "Memproses restore... " + done + "/" + total;
      });
      if (resultEl) {
        resultEl.textContent = "Selesai — " + result.chaptersRestored + " chapter, " +
          result.notesRestored + " catatan berhasil dipulihkan.";
      }
    } catch (err) {
      if (resultEl) resultEl.textContent = "Gagal restore: " + (err.message || err);
    }
  };
  reader.readAsText(file);
}

async function handleFixDropCaps() {
  var ok = await showConfirm(
    "Perbaiki struktur paragraf pertama (drop cap) untuk SEMUA catatan? " +
    "Ini aman — isi tulisan tidak berubah, hanya strukturnya."
  );
  if (!ok) return;

  var btn = document.getElementById("fixDropCapBtn");
  var resultEl = document.getElementById("fixDropCapResult");
  if (btn) { btn.disabled = true; btn.textContent = "Memproses..."; }
  if (resultEl) resultEl.textContent = "";

  try {
    var allNotes = await getAllNotes();
    var fixed = 0;
    for (var i = 0; i < allNotes.length; i++) {
      var n = allNotes[i];
      var result = fixDropCapHtml(n.contentHtml || "");
      if (result.changed) {
        await updateNote(n.id, { contentHtml: result.html });
        fixed++;
      }
      if (resultEl) resultEl.textContent = "Memproses... " + (i + 1) + "/" + allNotes.length;
    }
    if (resultEl) {
      resultEl.textContent = fixed > 0
        ? "Selesai — " + fixed + " dari " + allNotes.length + " catatan diperbaiki."
        : "Selesai — semua catatan (" + allNotes.length + ") sudah OK, tidak ada yang perlu diperbaiki.";
    }
  } catch (err) {
    if (resultEl) resultEl.textContent = "Gagal: " + (err.message || err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Perbaiki Drop Cap Semua Catatan"; }
  }
}

// ============================================================
// Handlers
// ============================================================
async function handleDeleteReader(uid) {
  var ok = await showConfirm("Hapus data pembaca ini dari Firestore?");
  if (!ok) return;
  await deleteReader(uid);
  readers = readers.filter(function(r) { return r.uid !== uid; });
  render();
}

async function handleAdd() {
  var input = document.getElementById("newAdminEmail");
  var email = (input.value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) { alert("Email tidak valid."); return; }
  await addAdmin(email, currentUser.email);
  input.value = "";
  admins = await getAllAdmins();
  render();
}

async function handleRemove(email) {
  var ok = await showConfirm("Hapus akses admin untuk " + email + "?");
  if (!ok) return;
  await removeAdmin(email);
  admins = admins.filter(function(e) { return e !== email; });
  render();
}

// ============================================================
// Helpers
// ============================================================
function escHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function daysAgo(n) {
  var d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function isNew(firstSeen) {
  if (!firstSeen) return false;
  return new Date(firstSeen) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}
function fmtDate(d) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(d);
}

(async function() {
  await initApp();
  initAnalytics();
  onAuthReady(function() { loadAndRender(); });
})();
