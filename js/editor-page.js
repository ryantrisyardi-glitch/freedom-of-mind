// =========================================================
// EDITOR PAGE — halaman edit/tulis catatan (admin only)
// =========================================================

import { initApp, onAuthReady, currentUser, currentIsAdmin } from "./ui-shared.js";
import { getNote, updateNote, getChapter, getAllChapters, moveNoteToChapter } from "./data.js";
import { initEditor, getEditorHtml } from "./editor.js";

function getNoteId() {
  return new URLSearchParams(location.search).get("id");
}
function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let note, chapter, allChapters = [];
let saveTimeout = null;
let editorInitialized = false;

function setStatus(text) {
  const el = document.getElementById("saveStatus");
  if (el) el.textContent = text;
}

function scheduleAutosave() {
  setStatus("menyimpan…");
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(doSave, 1200);
}

async function doSave() {
  const judul = document.getElementById("titleInput").value.trim() || "Tanpa judul";
  const tagRaw = document.getElementById("tagInput").value.trim();
  const tag = tagRaw ? tagRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const contentHtml = getEditorHtml();
  try {
    await updateNote(note.id, { judul, tag, contentHtml });
    setStatus("tersimpan ✓ · " + new Date().toLocaleTimeString("id-ID"));
  } catch (err) {
    setStatus("gagal menyimpan: " + err.message);
  }
}

async function renderAccessDenied(message) {
  document.getElementById("editorRoot").innerHTML = `<div class="empty-state">${message}</div>`;
}

async function renderEditor() {
  const root = document.getElementById("editorRoot");

  const chapterOptions = allChapters.map((c) =>
    `<option value="${c.id}" ${c.id === note.chapterId ? "selected" : ""}>${escapeHtml(c.judul)}</option>`
  ).join("");

  root.innerHTML = `
    <div class="editor-shell">
      <div class="editor-meta-bar">
        <input type="text" id="titleInput" value="${escapeHtml(note.judul)}" placeholder="Judul catatan">
        <select id="chapterSelect" class="btn">${chapterOptions}</select>
      </div>
      <div class="editor-meta-bar" style="padding-top:0;">
        <input type="text" id="tagInput" value="${(note.tag || []).join(", ")}" placeholder="Tag, dipisah koma (opsional)" style="font-family: var(--font-mono); font-size:0.85rem; font-weight:400; border-bottom:1px solid var(--line);">
      </div>
      <div id="editorMount"></div>
      <div class="editor-save-row">
        <span class="editor-save-row__status" id="saveStatus">tersimpan</span>
        <div style="display:flex; gap:10px;">
          <a class="btn" href="note.html?id=${note.id}" target="_blank">👁 Lihat hasil</a>
          <a class="btn btn-primary" href="chapter.html?id=${note.chapterId}">Selesai</a>
        </div>
      </div>
    </div>
  `;

  initEditor(document.getElementById("editorMount"), note.contentHtml, () => scheduleAutosave());
  editorInitialized = true;

  document.getElementById("titleInput").addEventListener("input", scheduleAutosave);
  document.getElementById("tagInput").addEventListener("input", scheduleAutosave);
  document.getElementById("chapterSelect").addEventListener("change", async (e) => {
    const newChapterId = e.target.value;
    await moveNoteToChapter(note.id, newChapterId);
    note.chapterId = newChapterId;
    setStatus("dipindahkan ✓");
  });

  // Simpan saat keluar halaman (jaga-jaga ada perubahan belum tersimpan)
  window.addEventListener("beforeunload", () => {
    if (saveTimeout) doSave();
  });
}

async function init() {
  const noteId = getNoteId();
  if (!noteId) {
    renderAccessDenied(`Catatan tidak ditemukan. <a href="index.html">Kembali</a>`);
    return;
  }

  if (!currentUser) {
    renderAccessDenied(`Kamu harus masuk dengan Google untuk mengedit. Gunakan tombol "Masuk dengan Google" di pojok kanan atas.`);
    return;
  }
  if (!currentIsAdmin) {
    renderAccessDenied(`Akun ini tidak memiliki akses admin untuk menulis catatan.`);
    return;
  }

  try {
    [note, allChapters] = await Promise.all([getNote(noteId), getAllChapters()]);
  } catch (err) {
    renderAccessDenied(`Gagal memuat catatan. ${err.message}`);
    return;
  }
  if (!note) {
    renderAccessDenied(`Catatan tidak ditemukan. <a href="index.html">Kembali</a>`);
    return;
  }

  chapter = await getChapter(note.chapterId).catch(() => null);
  document.getElementById("breadcrumb").innerHTML = `
    <a href="index.html">← semua chapter</a>
    ${chapter ? ` · <a href="chapter.html?id=${chapter.id}">${escapeHtml(chapter.judul)}</a>` : ""}
    · <span>mengedit</span>
  `;

  await renderEditor();
}

(async () => {
  await initApp();
  onAuthReady(() => { if (!editorInitialized) init(); });
})();
