// =========================================================
// CHAPTER PAGE — daftar notes dalam satu chapter, tombol tambah (admin)
// =========================================================

import { initApp, onAuthReady, currentIsAdmin, showModal, showConfirm } from "./ui-shared.js";
import { getChapter, getNotesByChapter, createNote, deleteNote } from "./data.js";

function getChapterId() {
  return new URLSearchParams(location.search).get("id");
}

function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatTanggal(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

let chapterId, chapter, notes = [];

async function loadAndRender() {
  chapterId = getChapterId();
  if (!chapterId) {
    document.getElementById("chapterHeader").innerHTML = `<div class="empty-state">Chapter tidak ditemukan. <a href="index.html">Kembali</a></div>`;
    return;
  }
  try {
    [chapter, notes] = await Promise.all([getChapter(chapterId), getNotesByChapter(chapterId)]);
  } catch (err) {
    document.getElementById("noteList").innerHTML = `<div class="empty-state">Gagal memuat. ${err.message}</div>`;
    return;
  }
  if (!chapter) {
    document.getElementById("chapterHeader").innerHTML = `<div class="empty-state">Chapter tidak ditemukan. <a href="index.html">Kembali</a></div>`;
    return;
  }
  document.title = chapter.judul + " — Freedom of Mind";
  render();
}

function render() {
  document.getElementById("chapterHeader").innerHTML = `
    <h1>${escapeHtml(chapter.judul)}</h1>
    <p>${escapeHtml(chapter.deskripsi || "")}</p>
  `;

  document.getElementById("addNoteBar").innerHTML = currentIsAdmin
    ? `<button class="btn btn-primary" id="addNoteBtn">+ Catatan baru</button>`
    : "";
  document.getElementById("addNoteBtn")?.addEventListener("click", handleAddNote);

  const list = document.getElementById("noteList");
  if (notes.length === 0) {
    list.innerHTML = `<div class="empty-state">Belum ada catatan di bagian ini.</div>`;
    return;
  }
  list.innerHTML = notes.map((n) => `
    <article class="note-row">
      <div class="note-row__main">
        <h3><a href="note.html?id=${n.id}">${escapeHtml(n.judul)}</a></h3>
        <div class="note-row__meta">
          <span>${formatTanggal(n.updatedAt)}</span>
          <div class="note-row__tags">${(n.tag || []).map((t) => `<span>#${escapeHtml(t)}</span>`).join("")}</div>
        </div>
      </div>
      ${currentIsAdmin ? `
        <div class="note-row__actions">
          <a class="btn btn-icon" href="editor.html?id=${n.id}" title="Edit">✎</a>
          <button class="btn btn-icon btn-danger" data-del="${n.id}" title="Hapus">🗑</button>
        </div>` : ""}
    </article>
  `).join("");

  list.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", () => handleDeleteNote(btn.dataset.del))
  );
}

async function handleAddNote() {
  const result = await showModal({
    title: "Catatan baru",
    fields: [{ key: "judul", label: "Judul", placeholder: "Misal: Palestina dan penjajahan" }],
    confirmLabel: "Buat & mulai menulis",
  });
  if (!result || !result.judul) return;
  const ref = await createNote({ chapterId, judul: result.judul });
  location.href = `editor.html?id=${ref.id}`;
}

async function handleDeleteNote(noteId) {
  const ok = await showConfirm("Hapus catatan ini? Tindakan ini tidak bisa dibatalkan.");
  if (!ok) return;
  await deleteNote(noteId);
  notes = notes.filter((n) => n.id !== noteId);
  render();
}

(async () => {
  await initApp();
  onAuthReady(() => { if (chapter) render(); });
  await loadAndRender();
})();
