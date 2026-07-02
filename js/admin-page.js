// =========================================================
// ADMIN PAGE — Analitik · Pembaca · Admin
// =========================================================

import { initApp, onAuthReady, currentUser, currentIsAdmin, showConfirm } from "./ui-shared.js";
import {
  getAllAdmins, addAdmin, removeAdmin,
  getAllReaders, deleteReader,
  getPageViewStats, getPopularPages,
} from "./data.js";
import { initAnalytics } from "./analytics.js";

function isSuperadmin() {
  return currentUser && currentUser.email?.toLowerCase() === (window.SUPERADMIN_EMAIL || "").toLowerCase();
}

let activeTab = "analytics";
let admins = [], readers = [], pageStats = [], popularPages = [];

async function loadAndRender() {
  const root = document.getElementById("adminRoot");
  if (!currentUser) {
    root.innerHTML = `<div class="empty-state">Masuk dengan Google terlebih dahulu.</div>`;
    return;
  }
  if (!currentIsAdmin) {
    root.innerHTML = `<div class="empty-state">Akun ini tidak memiliki akses admin.</div>`;
    return;
  }

  root.innerHTML = `<div class="empty-state">Memuat data…</div>`;
  try {
    [admins, readers, pageStats, popularPages] = await Promise.all([
      getAllAdmins(), getAllReaders(), getPageViewStats(30), getPopularPages(10),
    ]);
  } catch (err) {
    root.innerHTML = `<div class="empty-state">Gagal memuat: ${err.message}</div>`;
    return;
  }
  render();
}

// ===============================================================
function render() {
  const root = document.getElementById("adminRoot");
  const totalReaders = readers.length;

  root.innerHTML = `
    <div class="admin-panel">
      <div class="admin-tabs">
        <button class="admin-tab ${activeTab==="analytics"?"is-active":""}" data-tab="analytics">📊 Analitik</button>
        <button class="admin-tab ${activeTab==="readers"?"is-active":""}" data-tab="readers">
          👁 Pembaca <span class="admin-tab__count">${totalReaders}</span>
        </button>
        <button class="admin-tab ${activeTab==="admins"?"is-active":""}" data-tab="admins">
          🔑 Admin <span class="admin-tab__count">${admins.length+1}</span>
        </button>
      </div>
      <div id="adminTabContent">
        ${activeTab==="analytics" ? renderAnalytics() :
          activeTab==="readers"  ? renderReaders()   : renderAdmins()}
      </div>
    </div>`;

  root.querySelectorAll(".admin-tab").forEach(b =>
    b.addEventListener("click", () => { activeTab = b.dataset.tab; render(); })
  );

  if (activeTab === "readers") {
    root.querySelectorAll("[data-del-reader]").forEach(b =>
      b.addEventListener("click", () => handleDeleteReader(b.dataset.delReader))
    );
  } else if (activeTab === "admins") {
    document.getElementById("addAdminBtn")?.addEventListener("click", handleAdd);
    root.querySelectorAll("[data-remove]").forEach(b =>
      b.addEventListener("click", () => handleRemove(b.dataset.remove))
    );
  }
}

// ---- Tab: Analitik ----------------------------------------
function renderAnalytics() {
  const today = new Date().toISOString().slice(0,10);
  const weekAgo  = daysAgo(7);
  const monthAgo = daysAgo(30);

  let todayViews=0, weekViews=0, monthViews=0;
  let todayUniq=0,  weekUniq=0,  monthUniq=0;
  const devices = {}, browsers = {}, os = {};
  const dailyMap = {};

  pageStats.forEach(v => {
    const views = v.views || 0;
    const uniq  = v.uniqueVisitors || 0;
    if (v.date === today)      { todayViews+=views; todayUniq+=uniq; }
    if (v.date >= weekAgo)     { weekViews +=views; weekUniq +=uniq; }
    if (v.date >= monthAgo)    { monthViews+=views; monthUniq+=uniq; }
    dailyMap[v.date] = (dailyMap[v.date]||0) + views;

    // Device / browser / OS breakdown
    Object.entries(v).forEach(([k,val]) => {
      if (!Number.isInteger(val) || val<1) return;
      if (k.startsWith("devices_"))  devices[k.replace("devices_","")]  = (devices[k.replace("devices_","")]||0)+val;
      if (k.startsWith("browsers_")) browsers[k.replace("browsers_","")] = (browsers[k.replace("browsers_","")]||0)+val;
      if (k.startsWith("os_"))       os[k.replace("os_","")]             = (os[k.replace("os_","")]||0)+val;
    });
  });

  const totalReaders = readers.length;
  const newReaders   = readers.filter(r => isNew(r.firstSeen)).length;

  // 7-day sparkline labels
  const last7 = Array.from({length:7},(_,i)=>daysAgo(6-i));
  const max7   = Math.max(1,...last7.map(d=>dailyMap[d]||0));

  return `
    <!-- Summary cards -->
    <div class="stat-grid">
      ${statCard("Hari ini","👁",todayViews,"kunjungan",todayUniq+" unik")}
      ${statCard("7 Hari","📅",weekViews,"kunjungan",weekUniq+" unik")}
      ${statCard("30 Hari","📆",monthViews,"kunjungan",monthUniq+" unik")}
      ${statCard("Pembaca Login","👤",totalReaders,"akun",newReaders+" baru (7h)")}
    </div>

    <!-- 7-day bar chart -->
    <div class="stat-section">
      <h3 class="stat-section__title">Kunjungan 7 Hari Terakhir</h3>
      <div class="bar-chart">
        ${last7.map(d => {
          const v = dailyMap[d]||0;
          const h = Math.round((v/max7)*100);
          const label = d.slice(5); // MM-DD
          return `<div class="bar-chart__col">
            <div class="bar-chart__bar" style="height:${h}%" title="${v} kunjungan"></div>
            <div class="bar-chart__val">${v}</div>
            <div class="bar-chart__label">${label}</div>
          </div>`;
        }).join("")}
      </div>
    </div>

    <!-- Popular pages -->
    <div class="stat-section">
      <h3 class="stat-section__title">Halaman Paling Banyak Dibaca (30 hari)</h3>
      ${popularPages.length === 0
        ? `<p class="empty-state" style="margin:12px 0">Belum ada data halaman. Data muncul setelah ada pengunjung.</p>`
        : `<div class="popular-list">
          ${popularPages.map((p,i) => {
            const maxV = popularPages[0].views||1;
            const pct  = Math.round((p.views/maxV)*100);
            const icon = p.type==="chapter"?"📖":p.type==="note"?"📝":"🏠";
            return `<div class="popular-row">
              <span class="popular-row__rank">${i+1}</span>
              <div class="popular-row__info">
                <span class="popular-row__title">${icon} ${escHtml(p.title||p.path)}</span>
                <div class="popular-row__bar"><div style="width:${pct}%"></div></div>
              </div>
              <span class="popular-row__count">${p.views} views</span>
            </div>`;
          }).join("")}
        </div>`}
    </div>

    <!-- Device / Browser / OS breakdown -->
    <div class="stat-row-3">
      ${breakdownCard("Device",devices,{"desktop":"💻","mobile":"📱","tablet":"📟"})}
      ${breakdownCard("Browser",browsers,{"chrome":"🟡","safari":"🔵","firefox":"🦊","edge":"🔷","other":"⚪"})}
      ${breakdownCard("OS",os,{"windows":"🪟","macos":"🍎","android":"🤖","ios":"📱","linux":"🐧","other":"⚪"})}
    </div>

    <p class="stat-note">
      📍 Data lokasi & metrik lebih detail tersedia di
      <a href="https://analytics.google.com" target="_blank" rel="noopener">Google Analytics ↗</a>
      (aktifkan dengan mengisi Measurement ID di js/firebase-config.js).
    </p>`;
}

function statCard(label, icon, value, unit, sub) {
  return `<div class="stat-card">
    <div class="stat-card__icon">${icon}</div>
    <div class="stat-card__val">${value.toLocaleString("id-ID")}</div>
    <div class="stat-card__unit">${unit}</div>
    <div class="stat-card__label">${label}</div>
    <div class="stat-card__sub">${sub}</div>
  </div>`;
}

function breakdownCard(title, data, icons={}) {
  const total = Object.values(data).reduce((a,b)=>a+b,0)||1;
  const sorted = Object.entries(data).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return `<div class="breakdown-card">
    <h4 class="breakdown-card__title">${title}</h4>
    ${sorted.length===0
      ? `<p class="empty-state" style="font-size:.82rem;margin:8px 0">Belum ada data</p>`
      : sorted.map(([k,v])=>{
          const pct = Math.round((v/total)*100);
          return `<div class="breakdown-row">
            <span>${icons[k]||"⚪"} ${k}</span>
            <div class="breakdown-bar"><div style="width:${pct}%"></div></div>
            <span>${pct}%</span>
          </div>`;
        }).join("")}
  </div>`;
}

// ---- Tab: Pembaca -----------------------------------------
function renderReaders() {
  if (readers.length === 0) return `
    <div class="empty-state" style="margin:32px 0">
      Belum ada pembaca yang login.<br>
      <span style="font-size:.88rem;color:var(--sage)">Pengunjung anonim tercatat di tab Analitik.</span>
    </div>`;

  return `
    <p class="admin-readers__meta">
      ${readers.length} pembaca pernah login · Data anonim ada di tab Analitik.
    </p>
    <div class="admin-readers">
      ${readers.map(r => {
        const lastSeen = r.lastSeen?.toDate ? fmtDate(r.lastSeen.toDate()) : "—";
        const pages    = r.pageCount || 0;
        const location = [r.city, r.country].filter(Boolean).join(", ") || "—";
        const isNewUser = isNew(r.firstSeen);
        return `<div class="reader-row">
          <img class="reader-row__avatar" src="${r.photoURL||""}" alt="" onerror="this.style.display='none'">
          <div class="reader-row__info">
            <strong>${escHtml(r.name)} ${isNewUser?'<span class="badge-new">baru</span>':""}</strong>
            <span class="reader-row__email">${escHtml(r.email)}</span>
            <span class="reader-row__stats">
              📅 Terakhir: ${lastSeen}
              · 📄 ${pages} halaman
              · 📍 ${escHtml(location)}
              · ${r.deviceType==="mobile"?"📱":"💻"} ${escHtml(r.deviceType||"")}
              · ${escHtml(r.browser||"")}
            </span>
            <span class="reader-row__stats" style="margin-top:2px">
              Terakhir baca: <em>${escHtml(r.lastPage||r.lastPath||"—")}</em>
            </span>
          </div>
          ${isSuperadmin()
            ? `<button class="btn btn-icon btn-danger" data-del-reader="${r.uid}" title="Hapus">🗑</button>`
            : ""}
        </div>`;
      }).join("")}
    </div>`;
}

// ---- Tab: Admin -------------------------------------------
function renderAdmins() {
  const superEmail = (window.SUPERADMIN_EMAIL||"").toLowerCase();
  return `
    <p style="color:var(--ink-soft);font-size:.92rem;margin:0 0 16px">Admin bisa menambah chapter, menulis, dan mengedit catatan.</p>
    <div class="admin-list">
      <div class="admin-list__row">
        <span>${superEmail} <span class="badge-admin">superadmin</span></span>
      </div>
      ${admins.map(email=>`
        <div class="admin-list__row">
          <span>${email}</span>
          ${isSuperadmin()?`<button class="btn-text" data-remove="${email}">hapus</button>`:""}
        </div>`).join("")}
    </div>
    ${isSuperadmin()?`
      <div class="admin-add-row">
        <input type="text" id="newAdminEmail" placeholder="email@gmail.com">
        <button class="btn btn-primary" id="addAdminBtn">+ Tambah admin</button>
      </div>`
    : `<p class="comments__signin-hint">Hanya superadmin yang bisa mengelola admin lain.</p>`}`;
}

// ---- Handlers ---------------------------------------------
async function handleDeleteReader(uid) {
  const ok = await showConfirm("Hapus data pembaca ini dari Firestore?");
  if (!ok) return;
  await deleteReader(uid);
  readers = readers.filter(r => r.uid !== uid);
  render();
}

async function handleAdd() {
  const input = document.getElementById("newAdminEmail");
  const email = input.value.trim().toLowerCase();
  if (!email || !email.includes("@")) { alert("Email tidak valid."); return; }
  await addAdmin(email, currentUser.email);
  input.value = "";
  admins = await getAllAdmins();
  render();
}

async function handleRemove(email) {
  const ok = await showConfirm(`Hapus akses admin untuk ${email}?`);
  if (!ok) return;
  await removeAdmin(email);
  admins = admins.filter(e => e !== email);
  render();
}

// ---- Helpers ----------------------------------------------
function escHtml(str) {
  return (str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate()-n);
  return d.toISOString().slice(0,10);
}
function isNew(firstSeen) {
  if (!firstSeen) return false;
  return new Date(firstSeen) >= new Date(Date.now() - 7*24*60*60*1000);
}
function fmtDate(d) {
  return new Intl.DateTimeFormat("id-ID",{
    day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"
  }).format(d);
}

(async () => {
  await initApp();
  initAnalytics();
  onAuthReady(() => loadAndRender());
})();
