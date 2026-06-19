// =========================================================
// HOME PAGE — grid chapter, tombol tambah chapter (admin only)
// =========================================================

import { initApp, onAuthReady, currentIsAdmin, showModal, showChoice } from "./ui-shared.js";
import { getAllChapters, createChapter, updateChapter, deleteChapter, getAllNotes, QUICK_NOTES_NAME } from "./data.js";

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
      <article class="chapter-card is-clickable" data-id="${c.id}" data-href="chapter.html?id=${c.id}">
        ${currentIsAdmin ? `<span class="sortable-drag-handle" draggable="false" title="Seret untuk urutkan">⠿</span>` : ""}
        <div class="chapter-card__count">${noteCounts[c.id] || 0} catatan</div>
        <h2><a href="chapter.html?id=${c.id}" class="card-link">${escapeHtml(c.judul)}</a></h2>
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
    btn.addEventListener("click", (e) => { e.stopPropagation(); handleEditChapter(btn.dataset.edit); })
  );
  grid.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); handleDeleteChapter(btn.dataset.del); })
  );

  // Klik pada card untuk navigasi (fix #3)
  grid.querySelectorAll(".chapter-card.is-clickable").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("a") || e.target.closest(".sortable-drag-handle")) return;
      location.href = card.dataset.href;
    });
  });

  // Drag & drop sort (admin only, fix #2)
  if (currentIsAdmin) {
    initChapterDragSort(grid);
  }
}

function initChapterDragSort(grid) {
  let dragSrc = null;

  grid.querySelectorAll(".chapter-card").forEach((card) => {
    card.setAttribute("draggable", "true");

    card.addEventListener("dragstart", (e) => {
      dragSrc = card;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      grid.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      dragSrc = null;
    });

    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (card !== dragSrc) {
        grid.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
        card.classList.add("drag-over");
      }
    });

    card.addEventListener("dragleave", () => card.classList.remove("drag-over"));

    card.addEventListener("drop", async (e) => {
      e.preventDefault();
      card.classList.remove("drag-over");
      if (!dragSrc || dragSrc === card) return;

      // Reorder in DOM
      const cards = [...grid.querySelectorAll(".chapter-card")];
      const srcIdx = cards.indexOf(dragSrc);
      const dstIdx = cards.indexOf(card);
      if (srcIdx < dstIdx) card.after(dragSrc); else card.before(dragSrc);

      // Rebuild order array and persist
      const newOrder = [...grid.querySelectorAll(".chapter-card")].map((c) => c.dataset.id);
      await saveChapterOrder(newOrder);
    });
  });
}

async function saveChapterOrder(orderedIds) {
  await Promise.all(
    orderedIds.map((id, idx) => updateChapter(id, { urutan: idx + 1 }))
  );
  // Update local chapters array order
  chapters.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
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
  const chapterToDelete = chapters.find((c) => c.id === id);
  const count = noteCounts[id] || 0;

  if (count === 0) {
    const choice = await showChoice({
      title: "Hapus chapter",
      message: `Hapus chapter "${escapeHtml(chapterToDelete?.judul || "")}"? Chapter akan masuk Trash dan bisa dipulihkan nanti.`,
      choices: [{ key: "delete", label: "Hapus chapter" }],
    });
    if (!choice) return;
    await deleteChapter(id, "moveNotes");
  } else {
    const choice = await showChoice({
      title: "Hapus chapter",
      message: `Chapter "${escapeHtml(chapterToDelete?.judul || "")}" berisi ${count} catatan. Apa yang ingin dilakukan dengan catatan-catatan tersebut?`,
      choices: [
        { key: "move", label: `Pindahkan ke "${QUICK_NOTES_NAME}"` },
        { key: "trash", label: "Hapus chapter & semua catatannya", danger: true },
      ],
    });
    if (!choice) return;
    await deleteChapter(id, choice === "move" ? "moveNotes" : "trashNotes");
  }

  await loadAndRender();
}

(async () => {
  await initApp();
  onAuthReady(() => { render(); });
  await loadAndRender();
})();
