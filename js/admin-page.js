// =========================================================
// ADMIN PAGE — Analitik · Pembaca · Admin
// =========================================================

import { initApp, onAuthReady, currentUser, currentIsAdmin, showConfirm } from "./ui-shared.js";
import {
  getAllAdmins, addAdmin, removeAdmin,
  getAllReaders, deleteReader,
  getPageViewStats, getPopularPages,
  getAllNotes, updateNote,
  backupAllData, restoreAllData,
} from "./data.js";
import { initAnalytics } from "./analytics.js";

function isSuperadmin() {
  return currentUser &&
    currentUser.email?.toLowerCase() === (window.SUPERADMIN_EMAIL || "").toLowerCase();
}

let activeTab = "analytics";
let admins = [], readers = [], pageStats = [], popularPages = [];

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
  try {
    [admins, readers, pageStats, popularPages] = await Promise.all([
      getAllAdmins(), getAllReaders(), getPageViewStats(30), getPopularPages(10),
    ]);
  } catch (err) {
    root.innerHTML = '<div class="empty-state">Gagal memuat: ' + (err.message || "") + "</div>";
    return;
  }
  render();
}

function render() {
  const root = document.getElementById("adminRoot");
  root.innerHTML =
    '<div class="admin-panel">' +
      '<div class="admin-tabs">' +
        tabBtn("analytics", "Analitik", "") +
        tabBtn("readers",   "Pembaca",  readers.length) +
        tabBtn("admins",    "Admin",    admins.length + 1) +
        tabBtn("maintenance", "Perbaikan", "") +
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
  var weekAgo  = daysAgo(7);
  var monthAgo = daysAgo(30);

  var todayViews = 0, weekViews = 0, monthViews = 0;
  var todayUniq  = 0, weekUniq  = 0, monthUniq  = 0;
  var totalReadSecs = 0, totalReadSessions = 0;
  var devices = {}, browsers = {}, os = {}, countries = {}, cities = {};
  var dailyMap = {};

  pageStats.forEach(function(v) {
    var views = v.views || 0;
    var uniq  = v.uniqueVisitors || 0;
    if (v.date === today)    { todayViews += views; todayUniq += uniq; }
    if (v.date >= weekAgo)   { weekViews  += views; weekUniq  += uniq; }
    if (v.date >= monthAgo)  { monthViews += views; monthUniq += uniq; }
    dailyMap[v.date] = (dailyMap[v.date] || 0) + views;
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

  var last7  = [];
  for (var i = 6; i >= 0; i--) last7.push(daysAgo(i));
  var max7   = 1;
  last7.forEach(function(d) { if ((dailyMap[d] || 0) > max7) max7 = dailyMap[d]; });

  var banner = ga4Active
    ? '<div class="stat-banner stat-banner--ok">Google Analytics aktif (' + escHtml(window.GA_MEASUREMENT_ID) +
        ') &mdash; <a href="https://analytics.google.com" target="_blank" rel="noopener">buka dashboard GA4</a></div>'
    : '<div class="stat-banner stat-banner--warn">Google Analytics belum aktif &mdash; isi Measurement ID di js/firebase-config.js</div>';

  var cards =
    statCard("Hari ini",        todayViews, "kunjungan",    todayUniq + " unik") +
    statCard("7 Hari",          weekViews,  "kunjungan",    weekUniq  + " unik") +
    statCard("30 Hari",         monthViews, "kunjungan",    monthUniq + " unik") +
    statCard("Durasi Rata-rata",avgDurStr,  "per sesi",     totalReadSessions + " sesi") +
    statCard("Pembaca Login",   readers.length, "akun",     newReaders + " baru (7h)");

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
      breakdownCard("Kota",     cities,    []) +
      breakdownCard("Pembaca",  {"Baru (7h)": newReaders, "Kembali": Math.max(0, readers.length - newReaders)}, []) +
    "</div>";
}

function statCard(label, value, unit, sub) {
  var display = typeof value === "number" ? value.toLocaleString("id-ID") : value;
  return '<div class="stat-card">' +
    '<div class="stat-card__val">' + display + "</div>" +
    '<div class="stat-card__unit">' + unit + "</div>" +
    '<div class="stat-card__label">' + label + "</div>" +
    '<div class="stat-card__sub">' + sub + "</div>" +
    "</div>";
}

function breakdownCard(title, data, labelPairs) {
  var labelMap = {};
  labelPairs.forEach(function(p) {
    var parts = p.split(":");
    labelMap[parts[0]] = parts[1] || parts[0];
  });

  var total  = Object.values(data).reduce(function(a, b) { return a + b; }, 0) || 1;
  var sorted = Object.entries(data).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 6);

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
          "<span>" + pct + "%</span>" +
          "</div>";
      }).join("");

  return '<div class="breakdown-card">' +
    '<h4 class="breakdown-card__title">' + title + "</h4>" +
    rows +
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
// (drop cap) selalu punya target.
function fixDropCapHtml(html) {
  const container = document.createElement("div");
  container.innerHTML = html || "";
  const BLOCK_TAGS = new Set(["P", "H2", "H3", "BLOCKQUOTE", "UL", "OL", "FIGURE", "DIV", "HR"]);
  const isBlock = (n) => n.nodeType === 1 && BLOCK_TAGS.has(n.tagName);

  const firstNode = container.firstChild;
  if (!firstNode) return { html: html || "", changed: false };

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

  return { html: html || "", changed: false };
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
