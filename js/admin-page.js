// =========================================================
// ADMIN PAGE — kelola daftar admin tambahan
// Hanya superadmin (email di firebase-config.js) yang bisa menambah/hapus admin lain,
// supaya tidak ada admin yang saling menghapus akses satu sama lain.
// =========================================================

import { initApp, onAuthReady, currentUser, currentIsAdmin, showConfirm } from "./ui-shared.js";
import { getAllAdmins, addAdmin, removeAdmin } from "./data.js";

function isSuperadmin() {
  return currentUser && currentUser.email?.toLowerCase() === (window.SUPERADMIN_EMAIL || "").toLowerCase();
}

let admins = [];

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
    admins = await getAllAdmins();
  } catch (err) {
    root.innerHTML = `<div class="empty-state">Gagal memuat daftar admin. ${err.message}</div>`;
    return;
  }
  render();
}

function render() {
  const root = document.getElementById("adminRoot");
  const superEmail = (window.SUPERADMIN_EMAIL || "").toLowerCase();

  root.innerHTML = `
    <div class="admin-panel">
      <h2>Kelola admin</h2>
      <p style="color:var(--ink-soft); font-size:0.92rem; margin-top:-8px;">
        Admin bisa menambah chapter, menulis, dan mengedit catatan.
      </p>
      <div class="admin-list">
        <div class="admin-list__row">
          <span>${superEmail} <span class="badge-admin">superadmin</span></span>
        </div>
        ${admins.map((email) => `
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
    </div>
  `;

  document.getElementById("addAdminBtn")?.addEventListener("click", handleAdd);
  root.querySelectorAll("[data-remove]").forEach((btn) =>
    btn.addEventListener("click", () => handleRemove(btn.dataset.remove))
  );
}

async function handleAdd() {
  const input = document.getElementById("newAdminEmail");
  const email = input.value.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    alert("Masukkan alamat email yang valid.");
    return;
  }
  await addAdmin(email, currentUser.email);
  input.value = "";
  admins = await getAllAdmins();
  render();
}

async function handleRemove(email) {
  const ok = await showConfirm(`Hapus akses admin untuk ${email}?`);
  if (!ok) return;
  await removeAdmin(email);
  admins = admins.filter((e) => e !== email);
  render();
}

(async () => {
  await initApp();
  onAuthReady(() => { loadAndRender(); });
})();
