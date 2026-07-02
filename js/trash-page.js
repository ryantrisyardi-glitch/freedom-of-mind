// =========================================================
// TRASH PAGE — restore / hapus permanen chapter & catatan (admin only)
// =========================================================

import { initAnalytics } from "./analytics.js";
import { initApp, onAuthReady, currentUser, currentIsAdmin, showConfirm } from "./ui-shared.js";
import {
  getTrashedChapters,
  getTrashedNotes,
  restoreChapter,
  restoreNote,
  deleteChapterForever,
  deleteNoteForever,
  getAllChapters,
} from "./data.js";

let trashedChapters = [];
let trashedNotes = [];
let chapterNameById = {};

function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatWaktu(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "";
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

async function loadAndRender() {
  const root = document.getElementById("trashRoot");
  if (!currentUser) {
    root.innerHTML = `<div class="empty-state">Masuk dengan Google terlebih dahulu untuk mengakses Trash.</div>`;
    return;
  }
  if (!currentIsAdmin) {
    root.innerHTML = `<div class="empty-state">Akun ini tidak memiliki akses admin.</div>`;
    return;
  }
  try {
    const [chapters, notes, activeChapters] = await Promise.all([
      getTrashedChapters(),
      getTrashedNotes(),
      getAllChapters(),
    ]);
    trashedChapters = chapters;
    trashedNotes = notes;
    chapterNameById = {};
    activeChapters.forEach((c) => { chapterNameById[c.id] = c.judul; });
  } catch (err) {
    root.innerHTML = `<div class="empty-state">Gagal memuat Trash. ${err.message}</div>`;
    return;
  }
  render();
}

function render() {
  const root = document.getElementById("trashRoot");

  if (trashedChapters.length === 0 && trashedNotes.length === 0) {
    root.innerHTML = `<div class="empty-state">Trash kosong.</div>`;
    return;
  }

  const chapterRows = trashedChapters.map((c) => `
    <article class="note-row">
      <div class="note-row__main">
        <h3>${escapeHtml(c.judul)} <span class="badge-admin">chapter</span></h3>
        <div class="note-row__meta"><span>dihapus ${formatWaktu(c.deletedAt)}</span></div>
      </div>
      <div class="note-row__actions">
        <button class="btn" data-restore-chapter="${c.id}">Pulihkan</button>
        <button class="btn btn-danger" data-forever-chapter="${c.id}">Hapus permanen</button>
      </div>
    </article>
  `).join("");

  const noteRows = trashedNotes.map((n) => `
    <article class="note-row">
      <div class="note-row__main">
        <h3>${escapeHtml(n.judul)}</h3>
        <div class="note-row__meta">
          <span>dari chapter: ${escapeHtml(chapterNameById[n.chapterId] || "(sudah terhapus)")}</span>
          <span>dihapus ${formatWaktu(n.deletedAt)}</span>
        </div>
      </div>
      <div class="note-row__actions">
        <button class="btn" data-restore-note="${n.id}">Pulihkan</button>
        <button class="btn btn-danger" data-forever-note="${n.id}">Hapus permanen</button>
      </div>
    </article>
  `).join("");

  root.innerHTML = `
    ${trashedChapters.length > 0 ? `<h2 style="font-family:var(--font-display); font-size:1.2rem; margin: 24px 0 12px;">Chapter (${trashedChapters.length})</h2><div class="note-list">${chapterRows}</div>` : ""}
    ${trashedNotes.length > 0 ? `<h2 style="font-family:var(--font-display); font-size:1.2rem; margin: 28px 0 12px;">Catatan (${trashedNotes.length})</h2><div class="note-list">${noteRows}</div>` : ""}
  `;

  root.querySelectorAll("[data-restore-chapter]").forEach((btn) =>
    btn.addEventListener("click", () => handleRestoreChapter(btn.dataset.restoreChapter))
  );
  root.querySelectorAll("[data-forever-chapter]").forEach((btn) =>
    btn.addEventListener("click", () => handleForeverChapter(btn.dataset.foreverChapter))
  );
  root.querySelectorAll("[data-restore-note]").forEach((btn) =>
    btn.addEventListener("click", () => handleRestoreNote(btn.dataset.restoreNote))
  );
  root.querySelectorAll("[data-forever-note]").forEach((btn) =>
    btn.addEventListener("click", () => handleForeverNote(btn.dataset.foreverNote))
  );
}

async function handleRestoreChapter(id) {
  await restoreChapter(id);
  trashedChapters = trashedChapters.filter((c) => c.id !== id);
  render();
}

async function handleForeverChapter(id) {
  const ok = await showConfirm("Hapus chapter ini secara PERMANEN? Tindakan ini tidak bisa dibatalkan.");
  if (!ok) return;
  await deleteChapterForever(id);
  trashedChapters = trashedChapters.filter((c) => c.id !== id);
  render();
}

async function handleRestoreNote(id) {
  await restoreNote(id);
  trashedNotes = trashedNotes.filter((n) => n.id !== id);
  render();
}

async function handleForeverNote(id) {
  const ok = await showConfirm("Hapus catatan ini secara PERMANEN? Tindakan ini tidak bisa dibatalkan.");
  if (!ok) return;
  await deleteNoteForever(id);
  trashedNotes = trashedNotes.filter((n) => n.id !== id);
  render();
}

(async () => {
  await initApp();
  initAnalytics();
  onAuthReady(() => { loadAndRender(); });
})();
