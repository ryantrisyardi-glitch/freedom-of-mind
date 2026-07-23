// =========================================================
// UI SHARED — navbar, auth state, modal helper
// Dipakai di semua halaman (index, chapter, note, editor, admin)
// =========================================================

import { initFirebaseCore, auth, watchAuth, googleSignIn, signOut, checkIsAdmin } from "./firebase-core.js";
import { applyStoredTheme, initThemeSwitcher } from "./theme.js";
import { initExitGuard } from "./exit-guard.js";

// Terapkan tema tersimpan sesegera mungkin, sebelum initApp() dipanggil,
// supaya tidak ada "kedipan" warna default sesaat sebelum tema custom aktif.
applyStoredTheme();
initExitGuard();

export let currentUser = null;
export let currentIsAdmin = false;
let onAuthChangeCallbacks = [];

export function onAuthReady(cb) {
  onAuthChangeCallbacks.push(cb);
}

export async function initApp() {
  const ok = initFirebaseCore();
  renderTopnav();
  if (!ok) {
    onAuthChangeCallbacks.forEach((cb) => cb(null, false));
    return false;
  }
  watchAuth(async (user) => {
    currentUser = user;
    currentIsAdmin = user ? await checkIsAdmin(user.email) : false;
    renderTopnav();
    onAuthChangeCallbacks.forEach((cb) => cb(currentUser, currentIsAdmin));
    // Dispatch custom event supaya analytics.js bisa mencatat reader
    // tanpa circular import ke ui-shared.
    document.dispatchEvent(new CustomEvent("fom:user-ready", { detail: { user } }));
  });
  return true;
}

function renderTopnav() {
  const slot = document.getElementById("topnavActions");
  if (!slot) return;

  initThemeSwitcher();

  if (!currentUser) {
    slot.innerHTML = `<button class="btn" id="navSignIn">Masuk dengan Google</button>`;
    const btn = document.getElementById("navSignIn");
    btn?.addEventListener("click", async () => {
      try { await googleSignIn(); } catch (err) { alert("Gagal masuk: " + err.message); }
    });
    return;
  }

  const isSuper = currentUser.email?.toLowerCase() === (window.SUPERADMIN_EMAIL || "").toLowerCase();
  slot.innerHTML = `
    ${currentIsAdmin ? `<span class="badge-admin">admin</span>` : ""}
    ${currentIsAdmin ? `<a class="btn-text" href="trash.html">trash</a>` : ""}
    ${isSuper ? `<a class="btn-text" href="admin.html">kelola admin</a>` : ""}
    <div class="user-chip">
      <img src="${currentUser.photoURL || ""}" alt="">
      <span>${currentUser.displayName}</span>
    </div>
    <button class="btn-text" id="navSignOut">keluar</button>
  `;
  document.getElementById("navSignOut")?.addEventListener("click", () => signOut());
}

/**
 * Progress bar tipis yang selalu fixed di paling atas viewport — dipakai untuk
 * upload gambar di dalam editor, supaya selalu terlihat terlepas dari toolbar
 * mana (statis di atas / floating di pinggir) yang memicu upload-nya.
 */
export function showGlobalUploadProgress() {
  let bar = document.getElementById("globalUploadProgress");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "globalUploadProgress";
    bar.className = "upload-progress-global";
    bar.innerHTML = `<div class="upload-progress-global__fill"></div>`;
    document.body.appendChild(bar);
  }
  bar.style.display = "block";
  const fill = bar.querySelector(".upload-progress-global__fill");
  fill.style.width = "0%";
  return {
    update(percent) {
      const p = Math.max(0, Math.min(100, Math.round(percent)));
      fill.style.width = p + "%";
    },
    remove() {
      bar.style.display = "none";
      fill.style.width = "0%";
    },
  };
}

/**
 * Membuat elemen progress bar kecil untuk proses upload gambar, dan
 * menyisipkannya tepat setelah `anchorEl` di DOM.
 * Mengembalikan { update(percent), remove() }.
 */
export function createUploadProgress(anchorEl, label = "Mengunggah gambar…") {
  const el = document.createElement("div");
  el.className = "upload-progress";
  el.innerHTML = `
    <span class="upload-progress__label">${label}</span>
    <span class="upload-progress__track"><span class="upload-progress__fill"></span></span>
    <span class="upload-progress__pct">0%</span>
  `;
  anchorEl?.insertAdjacentElement("afterend", el);
  const fill = el.querySelector(".upload-progress__fill");
  const pct = el.querySelector(".upload-progress__pct");
  return {
    update(percent) {
      const p = Math.max(0, Math.min(100, Math.round(percent)));
      fill.style.width = p + "%";
      pct.textContent = p + "%";
    },
    remove() {
      el.remove();
    },
  };
}

/**
 * Modal sederhana: prompt dengan satu atau dua input teks.
 * fields: [{key, label, placeholder, multiline}]
 * Mengembalikan Promise<object|null> (null jika dibatalkan)
 */
export function showModal({ title, fields, confirmLabel = "Simpan", danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h3>${title}</h3>
        <form id="modalForm">
          ${fields.map((f) => `
            ${f.multiline
              ? `<textarea name="${f.key}" placeholder="${f.placeholder || ""}" rows="3">${f.value || ""}</textarea>`
              : `<input type="text" name="${f.key}" placeholder="${f.placeholder || ""}" value="${f.value || ""}" autocomplete="off">`
            }
          `).join("")}
          <div class="modal__actions">
            <button type="button" class="btn" id="modalCancel">Batal</button>
            <button type="submit" class="btn ${danger ? "btn-danger" : "btn-primary"}">${confirmLabel}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector("input,textarea")?.focus();

    function cleanup() { overlay.remove(); }

    overlay.querySelector("#modalCancel").addEventListener("click", () => { cleanup(); resolve(null); });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) { cleanup(); resolve(null); } });
    overlay.querySelector("#modalForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const data = {};
      fields.forEach((f) => { data[f.key] = e.target[f.key].value.trim(); });
      cleanup();
      resolve(data);
    });
  });
}

export function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h3>Konfirmasi</h3>
        <p style="color:var(--ink-soft); margin-bottom:18px;">${message}</p>
        <div class="modal__actions">
          <button class="btn" id="confirmNo">Batal</button>
          <button class="btn btn-danger" id="confirmYes">Ya, lanjutkan</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    function cleanup(v) { overlay.remove(); resolve(v); }
    overlay.querySelector("#confirmNo").addEventListener("click", () => cleanup(false));
    overlay.querySelector("#confirmYes").addEventListener("click", () => cleanup(true));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(false); });
  });
}

/**
 * Modal dengan beberapa pilihan tombol (lebih dari Ya/Tidak biasa).
 * choices: [{key, label, danger?}]
 * Mengembalikan Promise<string|null> -> key pilihan, atau null jika dibatalkan.
 */
export function showChoice({ title, message, choices }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h3>${title}</h3>
        <p style="color:var(--ink-soft); margin-bottom:18px;">${message}</p>
        <div class="modal__actions" style="flex-wrap:wrap;">
          <button class="btn" id="choiceCancel">Batal</button>
          ${choices.map((c) => `<button class="btn ${c.danger ? "btn-danger" : "btn-primary"}" data-choice="${c.key}">${c.label}</button>`).join("")}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    function cleanup(v) { overlay.remove(); resolve(v); }
    overlay.querySelector("#choiceCancel").addEventListener("click", () => cleanup(null));
    overlay.querySelectorAll("[data-choice]").forEach((btn) =>
      btn.addEventListener("click", () => cleanup(btn.dataset.choice))
    );
    overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(null); });
  });
}
