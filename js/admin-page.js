// =========================================================
// ADMIN PAGE — kelola admin + dashboard pembaca
// =========================================================

import { initApp, onAuthReady, currentUser, currentIsAdmin, showConfirm } from "./ui-shared.js";
import { getAllAdmins, addAdmin, removeAdmin, getAllReaders, deleteReader } from "./data.js";
import { initAnalytics } from "./analytics.js";

function isSuperadmin() {
  return currentUser && currentUser.email?.toLowerCase() === (window.SUPERADMIN_EMAIL || "").toLowerCase();
}

let admins = [];
let readers = [];
let activeTab = "readers"; // "readers" | "admins"

async function loadAndRender() {
  const root = document.getElementById("adminRoot");
  if (!currentUser) {
    root.innerHTML = `<div class="empty-state">Masuk dengan Google terlebih dahulu untuk mengakses halaman ini.</div>`;
    return;
  }
  if (!currentIsAdmin) {
    root.innerHTML = `<div class="empty-state">Akun ini tidak memiliki akses admin.</div>`;
    return;
  }

  try {
    [admins, readers] = await Promise.all([getAllAdmins(), getAllReaders()]);
  } catch (err) {
    root.innerHTML = `<div class="empty-state">Gagal memuat data. ${err.message}</div>`;
    return;
  }
  render();
}

function render() {
  const root = document.getElementById("adminRoot");
  root.innerHTML = `
    <div class="admin-panel">
      <div class="admin-tabs">
        <button class="admin-tab ${activeTab === "readers" ? "is-active" : ""}" data-tab="readers">
          👁 Pembaca <span class="admin-tab__count">${readers.length}</span>
        </button>
        <button class="admin-tab ${activeTab === "admins" ? "is-active" : ""}" data-tab="admins">
          🔑 Admin <span class="admin-tab__count">${admins.length + 1}</span>
        </button>
      </div>

      <div id="adminTabContent">
        ${activeTab === "readers" ? renderReadersTab() : renderAdminsTab()}
      </div>
    </div>
  `;

  root.querySelectorAll(".admin-tab").forEach(btn =>
    btn.addEventListener("click", () => { activeTab = btn.dataset.tab; render(); })
  );

  if (activeTab === "readers") {
    root.querySelectorAll("[data-del-reader]").forEach(btn =>
      btn.addEventListener("click", () => handleDeleteReader(btn.dataset.delReader))
    );
  } else {
    document.getElementById("addAdminBtn")?.addEventListener("click", handleAdd);
    root.querySelectorAll("[data-remove]").forEach(btn =>
      btn.addEventListener("click", () => handleRemove(btn.dataset.remove))
    );
  }
}

// ---------- Tab Pembaca ----------

function renderReadersTab() {
  if (readers.length === 0) {
    return `<div class="empty-state" style="margin:32px 0">
      Belum ada pembaca yang login.<br>
      <span style="font-size:.88rem; color:var(--sage)">Pembaca anonim tercatat di Google Analytics.</span>
    </div>`;
  }

  return `
    <p class="admin-readers__meta">
      ${readers.length} pembaca terdaftar — hanya yang pernah login dengan Google.
      Pembaca anonim & data lokasi tersedia di
      <a href="https://analytics.google.com" target="_blank" rel="noopener">Google Analytics ↗</a>.
    </p>
    <div class="admin-readers">
      ${readers.map(r => readerRowHtml(r)).join("")}
    </div>
  `;
}

function readerRowHtml(r) {
  const lastSeen = r.lastSeen?.toDate ? formatDate(r.lastSeen.toDate()) : "—";
  const pageCount = r.pages ? Object.keys(r.pages).length : 0;

  return `
    <div class="reader-row">
      <img class="reader-row__avatar" src="${r.photoURL || ""}" alt="" onerror="this.style.display='none'">
      <div class="reader-row__info">
        <strong>${escapeHtml(r.name)}</strong>
        <span class="reader-row__email">${escapeHtml(r.email)}</span>
        <span class="reader-row__stats">
          Terakhir baca: ${lastSeen}
          &nbsp;·&nbsp;
          ${pageCount} halaman dikunjungi
          &nbsp;·&nbsp;
          <span title="${escapeHtml(r.lastPath || "")}">Terakhir di: ${escapeHtml(truncate(r.lastPage || r.lastPath || "—", 40))}</span>
        </span>
      </div>
      ${isSuperadmin() ? `<button class="btn btn-icon btn-danger" data-del-reader="${r.uid}" title="Hapus data pembaca ini">🗑</button>` : ""}
    </div>
  `;
}

// ---------- Tab Admin ----------

function renderAdminsTab() {
  const superEmail = (window.SUPERADMIN_EMAIL || "").toLowerCase();
  return `
    <p style="color:var(--ink-soft); font-size:0.92rem; margin: 0 0 16px">
      Admin bisa menambah chapter, menulis, dan mengedit catatan.
    </p>
    <div class="admin-list">
      <div class="admin-list__row">
        <span>${superEmail} <span class="badge-admin">superadmin</span></span>
      </div>
      ${admins.map(email => `
        <div class="admin-list__row">
          <span>${email}</span>
          ${isSuperadmin() ? `<button class="btn-text" data-remove="${email}">hapus</button>` : ""}
        </div>
      `).join("")}
    </div>
    ${isSuperadmin() ? `
      <div class="admin-add-row">
        <input type="text" id="newAdminEmail" placeholder="email@gmail.com">
        <button class="btn btn-primary" id="addAdminBtn">+ Tambah admin</button>
      </div>
    ` : `<p class="comments__signin-hint">Hanya superadmin yang bisa menambah/menghapus admin lain.</p>`}
  `;
}

// ---------- Handlers ----------

async function handleDeleteReader(uid) {
  const ok = await showConfirm("Hapus data kunjungan pembaca ini dari Firestore? (Data di Google Analytics tidak terpengaruh.)");
  if (!ok) return;
  await deleteReader(uid);
  readers = readers.filter(r => r.uid !== uid);
  render();
}

async function handleAdd() {
  const input = document.getElementById("newAdminEmail");
  const email = input.value.trim().toLowerCase();
  if (!email || !email.includes("@")) { alert("Masukkan alamat email yang valid."); return; }
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

// ---------- Helpers ----------

function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
}

(async () => {
  await initApp();
  initAnalytics();
  onAuthReady(() => { loadAndRender(); });
})();
