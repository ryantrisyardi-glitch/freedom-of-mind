// =========================================================
// CHAPTER PAGE — daftar notes dalam satu chapter, tombol tambah (admin)
// =========================================================

import { initApp, onAuthReady, currentIsAdmin, showModal, showConfirm } from "./ui-shared.js";
import { getChapter, getNotesByChapter, getNotesByChapterForAdmin, createNote, deleteNote, updateNote, uploadToCloudinary } from "./data.js";
import { defaultChapterArt } from "./chapter-art.js";

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
    [chapter, notes] = await Promise.all([
      getChapter(chapterId),
      currentIsAdmin ? getNotesByChapterForAdmin(chapterId) : getNotesByChapter(chapterId)
    ]);
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
  const artIdx = (chapter.urutan || 1) - 1;
  const artBg = chapter.gambar ? ` style="background-image:url('${chapter.gambar.replace(/'/g, "")}')"` : "";
  const art = chapter.gambar ? "" : defaultChapterArt(artIdx);

  document.getElementById("chapterHeader").innerHTML = `
    <div class="chapter-header--banner">
      <div class="chapter-header__body">
        <p class="chapter-header__chip">Chapter ${String(chapter.urutan || 1).padStart(2, "0")}</p>
        <h1>${escapeHtml(chapter.judul)}</h1>
        <p>${escapeHtml(chapter.tagline || chapter.deskripsi || "")}</p>
      </div>
      <div class="chapter-header__art"${artBg}>${art}</div>
    </div>
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
  list.innerHTML = notes.map((n) => {
    const isDraft = n.status === "draft" || !n.status;
    const draftBadge = isDraft && currentIsAdmin
      ? `<span class="badge-draft" title="Belum dipublish">draft</span>`
      : "";
    return `
    <article class="note-row is-clickable" data-id="${n.id}" data-href="note.html?id=${n.id}">
      <div class="note-row__content">
        ${currentIsAdmin ? `<span class="sortable-drag-handle" title="Seret untuk urutkan">⠿</span>` : ""}
        <div class="note-row__main">
          <h3><a href="note.html?id=${n.id}" class="card-link">${escapeHtml(n.judul)}</a> ${draftBadge}</h3>
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
      </div>
      <div class="note-row__thumbnail ${n.coverImage ? "has-image" : ""}">
        ${n.coverImage
          ? `<img src="${n.coverImage}" alt="" class="note-row__cover-img">`
          : `<div class="note-row__cover-empty"></div>`}
        ${currentIsAdmin ? `
          <button class="note-row__cover-btn" data-cover="${n.id}" title="${n.coverImage ? "Ganti gambar" : "Tambah gambar"}">
            ${n.coverImage ? "✎" : "＋"}
          </button>` : ""}
      </div>
    </article>
  `}).join("");

  // Hapus handler
  list.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); handleDeleteNote(btn.dataset.del); })
  );

  // Edit link — stop propagation
  list.querySelectorAll(".btn-icon[href]").forEach((a) =>
    a.addEventListener("click", (e) => e.stopPropagation())
  );

  // Cover image upload handler (admin only)
  list.querySelectorAll("[data-cover]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const noteId = btn.dataset.cover;
      handleCoverUpload(noteId, btn);
    });
  });

  // Klik pada row untuk navigasi (fix #3)
  list.querySelectorAll(".note-row.is-clickable").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("a") || e.target.closest(".sortable-drag-handle")) return;
      location.href = row.dataset.href;
    });
  });

  // Drag & drop sort (admin only, fix #2)
  if (currentIsAdmin) {
    initNoteDragSort(list);
  }
}

function initNoteDragSort(list) {
  let dragSrc = null;

  list.querySelectorAll(".note-row").forEach((row) => {
    row.setAttribute("draggable", "true");

    row.addEventListener("dragstart", (e) => {
      dragSrc = row;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      list.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      dragSrc = null;
    });

    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (row !== dragSrc) {
        list.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
        row.classList.add("drag-over");
      }
    });

    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));

    row.addEventListener("drop", async (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      if (!dragSrc || dragSrc === row) return;

      const rows = [...list.querySelectorAll(".note-row")];
      const srcIdx = rows.indexOf(dragSrc);
      const dstIdx = rows.indexOf(row);
      if (srcIdx < dstIdx) row.after(dragSrc); else row.before(dragSrc);

      const newOrder = [...list.querySelectorAll(".note-row")].map((r) => r.dataset.id);
      await saveNoteOrder(newOrder);
    });
  });
}

async function saveNoteOrder(orderedIds) {
  await Promise.all(
    orderedIds.map((id, idx) => updateNote(id, { urutan: idx + 1 }))
  );
  notes.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
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
  const ok = await showConfirm("Pindahkan catatan ini ke Trash? Kamu masih bisa memulihkannya nanti dari halaman Trash.");
  if (!ok) return;
  await deleteNote(noteId);
  notes = notes.filter((n) => n.id !== noteId);
  render();
}

async function handleCoverUpload(noteId, btn) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;

    const thumbnail = btn.closest(".note-row__thumbnail");
    btn.disabled = true;
    btn.textContent = "…";

    try {
      const url = await uploadToCloudinary(file);
      await updateNote(noteId, { coverImage: url });

      // Update local notes array
      const note = notes.find(n => n.id === noteId);
      if (note) note.coverImage = url;

      // Update DOM in place without full re-render
      const img = thumbnail.querySelector(".note-row__cover-img");
      const empty = thumbnail.querySelector(".note-row__cover-empty");
      if (img) {
        img.src = url;
      } else {
        const newImg = document.createElement("img");
        newImg.src = url;
        newImg.alt = "";
        newImg.className = "note-row__cover-img";
        empty?.replaceWith(newImg);
      }
      thumbnail.classList.add("has-image");
      btn.textContent = "✎";
      btn.title = "Ganti gambar";
    } catch (err) {
      alert("Gagal mengupload gambar: " + err.message);
      btn.textContent = "＋";
    } finally {
      btn.disabled = false;
    }
  });
  input.click();
}

(async () => {
  await initApp();
  onAuthReady(() => { loadAndRender(); });
})();
