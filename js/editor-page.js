// =========================================================
// EDITOR PAGE — halaman edit/tulis catatan (admin only)
// =========================================================

import { initAnalytics } from "./analytics.js";
import { initApp, onAuthReady, currentUser, currentIsAdmin } from "./ui-shared.js";
import { getNote, updateNote, getChapter, getAllChapters, moveNoteToChapter, publishNote, unpublishNote } from "./data.js";
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

function updatePublishBar() {
  const isDraft = !note.status || note.status === "draft";
  const bar = document.getElementById("publishBar");
  if (!bar) return;
  bar.innerHTML = `
    <div class="publish-bar__status ${isDraft ? "publish-bar__status--draft" : "publish-bar__status--published"}">
      ${isDraft
        ? "📝 <strong>Draft</strong> — hanya kamu yang bisa melihat tulisan ini"
        : "🌿 <strong>Published</strong> — tulisan sudah tayang dan bisa dibaca publik"}
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <a class="btn" href="note.html?id=${note.id}" target="_blank" title="Preview tulisan">👁 Preview</a>
      ${isDraft
        ? `<button class="btn btn-publish" id="publishBtn">Publish →</button>`
        : `<button class="btn btn-unpublish" id="unpublishBtn">↩ Kembali ke Draft</button>`}
    </div>
  `;

  document.getElementById("publishBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("publishBtn");
    btn.disabled = true;
    btn.textContent = "Mempublish…";
    try {
      if (saveTimeout) { clearTimeout(saveTimeout); await doSave(); }
      await publishNote(note.id);
      note.status = "published";
      updatePublishBar();
      setStatus("dipublish ✓ · " + new Date().toLocaleTimeString("id-ID"));
    } catch (err) {
      alert("Gagal publish: " + err.message);
      btn.disabled = false;
      btn.textContent = "Publish →";
    }
  });

  document.getElementById("unpublishBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("unpublishBtn");
    btn.disabled = true;
    btn.textContent = "Memproses…";
    try {
      await unpublishNote(note.id);
      note.status = "draft";
      updatePublishBar();
      setStatus("dikembalikan ke draft ✓");
    } catch (err) {
      alert("Gagal: " + err.message);
      btn.disabled = false;
      btn.textContent = "↩ Kembali ke Draft";
    }
  });
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
      <div class="publish-bar" id="publishBar"></div>
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
          <a class="btn btn-primary" href="chapter.html?id=${note.chapterId}">Selesai</a>
        </div>
      </div>
    </div>
  `;

  updatePublishBar();
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
  initAnalytics();
  onAuthReady(() => { if (!editorInitialized) init(); });
})();
