// =========================================================
// HOME PAGE — grid chapter, tombol tambah chapter (admin only)
// =========================================================

import { initApp, onAuthReady, currentIsAdmin, showModal, showConfirm } from "./ui-shared.js";
import { getAllChapters, createChapter, updateChapter, deleteChapter, getAllNotes } from "./data.js";

let chapters = [];
let noteCounts = {};

async function loadAndRender() {
  const grid = document.getElementById("chapterGrid");
  try {
    const [chapterList, allNotes] = await Promise.all([getAllChapters(), getAllNotes()]);
    chapters = chapterList;
    noteCounts = {};
    allNotes.forEach((n) => { noteCounts[n.chapterId] = (noteCounts[n.chapterId] || 0) + 1; });
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Gagal memuat. Pastikan Firebase sudah dikonfigurasi (lihat README.md). ${err.message || ""}</div>`;
    return;
  }
  render();
}

function render() {
  const grid = document.getElementById("chapterGrid");

  if (chapters.length === 0) {
    grid.innerHTML = currentIsAdmin
      ? `<div class="empty-state">Belum ada bagian (chapter). Klik tombol di bawah untuk membuat yang pertama.</div>`
      : `<div class="empty-state">Belum ada catatan yang dipublikasikan.</div>`;
  } else {
    grid.innerHTML = chapters.map((c) => `
      <article class="chapter-card">
        <div class="chapter-card__count">${noteCounts[c.id] || 0} catatan</div>
        <h2><a href="chapter.html?id=${c.id}">${escapeHtml(c.judul)}</a></h2>
        <p>${escapeHtml(c.deskripsi || "")}</p>
        ${currentIsAdmin ? `
          <div class="chapter-card__admin-row">
            <button class="btn-icon btn" data-edit="${c.id}" title="Edit">✎</button>
            <button class="btn-icon btn-danger btn" data-del="${c.id}" title="Hapus">🗑</button>
          </div>` : ""}
      </article>
    `).join("");
  }

  if (currentIsAdmin) {
    grid.innerHTML += `<button class="add-chapter-card" id="addChapterBtn">+ Chapter baru</button>`;
  }

  document.getElementById("addChapterBtn")?.addEventListener("click", handleAddChapter);
  grid.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => handleEditChapter(btn.dataset.edit))
  );
  grid.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", () => handleDeleteChapter(btn.dataset.del))
  );
}

function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function handleAddChapter() {
  const result = await showModal({
    title: "Chapter baru",
    fields: [
      { key: "judul", label: "Judul", placeholder: "Misal: Freedom of Mind" },
      { key: "deskripsi", label: "Deskripsi", placeholder: "Deskripsi singkat (opsional)", multiline: true },
    ],
    confirmLabel: "Buat chapter",
  });
  if (!result || !result.judul) return;
  await createChapter(result);
  await loadAndRender();
}

async function handleEditChapter(id) {
  const chapter = chapters.find((c) => c.id === id);
  const result = await showModal({
    title: "Edit chapter",
    fields: [
      { key: "judul", label: "Judul", value: chapter.judul },
      { key: "deskripsi", label: "Deskripsi", value: chapter.deskripsi, multiline: true },
    ],
    confirmLabel: "Simpan perubahan",
  });
  if (!result || !result.judul) return;
  await updateChapter(id, result);
  await loadAndRender();
}

async function handleDeleteChapter(id) {
  const count = noteCounts[id] || 0;
  const msg = count > 0
    ? `Chapter ini berisi ${count} catatan. Menghapus chapter TIDAK menghapus catatan di dalamnya, tapi catatan akan jadi "tanpa chapter". Lanjutkan?`
    : "Hapus chapter ini?";
  const ok = await showConfirm(msg);
  if (!ok) return;
  await deleteChapter(id);
  await loadAndRender();
}

(async () => {
  await initApp();
  onAuthReady(() => { render(); });
  await loadAndRender();
})();
