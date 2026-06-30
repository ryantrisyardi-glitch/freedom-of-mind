// =========================================================
// HOME PAGE — showcase chapter ala carousel "you are here"
// =========================================================

import { initApp, onAuthReady, currentIsAdmin, showModal, showChoice } from "./ui-shared.js";
import { getAllChapters, createChapter, updateChapter, deleteChapter, getAllNotes, QUICK_NOTES_NAME, uploadToCloudinary } from "./data.js";
import { defaultChapterArt } from "./chapter-art.js";

let chapters = [];
let noteCounts = {};
let activeIndex = 0;

async function loadAndRender() {
  const showcase = document.getElementById("chapterShowcase");
  try {
    const [chapterList, allNotes] = await Promise.all([getAllChapters(), getAllNotes()]);
    chapters = chapterList;
    noteCounts = {};
    allNotes.forEach((n) => { noteCounts[n.chapterId] = (noteCounts[n.chapterId] || 0) + 1; });
  } catch (err) {
    showcase.innerHTML = `<div class="empty-state">Gagal memuat. Pastikan Firebase sudah dikonfigurasi (lihat README.md). ${err.message || ""}</div>`;
    return;
  }
  if (activeIndex >= chapters.length) activeIndex = Math.max(0, chapters.length - 1);
  render();
}

function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function chapterNumber(idx) { return String(idx + 1).padStart(2, "0"); }

function render() {
  const showcase = document.getElementById("chapterShowcase");

  if (chapters.length === 0) {
    showcase.innerHTML = currentIsAdmin
      ? `<div class="empty-state">Belum ada bagian (chapter). Klik tombol di bawah untuk membuat yang pertama.</div>`
      : `<div class="empty-state">Belum ada catatan yang dipublikasikan.</div>`;
    renderAddButton();
    return;
  }

  const prevIdx = activeIndex - 1;
  const nextIdx = activeIndex + 1;

  showcase.innerHTML = `
    <div class="chapter-showcase__viewport" id="showcaseViewport">
      <div class="chapter-showcase__track" id="showcaseTrack">
        ${prevIdx >= 0 ? sideCardHtml(prevIdx) : ""}
        ${activeCardHtml(activeIndex)}
        ${nextIdx < chapters.length ? sideCardHtml(nextIdx) : ""}
      </div>
    </div>
    <button class="showcase-nav showcase-nav--prev" id="navPrev" aria-label="Sebelumnya" ${activeIndex === 0 ? "disabled" : ""}>‹</button>
    <button class="showcase-nav showcase-nav--next" id="navNext" aria-label="Berikutnya" ${activeIndex === chapters.length - 1 ? "disabled" : ""}>›</button>
    <div class="showcase-dots" id="showcaseDots">
      ${chapters.map((_, i) => `<button class="showcase-dots__dot ${i === activeIndex ? "is-active" : ""}" data-dot="${i}" aria-label="Chapter ${i + 1}"></button>`).join("")}
    </div>
  `;

  renderAddButton();
  attachEvents();
}

function renderAddButton() {
  const showcase = document.getElementById("chapterShowcase");
  document.getElementById("addChapterBtnWrap")?.remove();
  if (!currentIsAdmin) return;
  const wrap = document.createElement("div");
  wrap.id = "addChapterBtnWrap";
  wrap.innerHTML = `<button class="add-chapter-card" id="addChapterBtn">+ Chapter baru</button>`;
  showcase.after(wrap);
  document.getElementById("addChapterBtn").addEventListener("click", handleAddChapter);
}

function sideCardHtml(idx) {
  const c = chapters[idx];
  return `
    <article class="showcase-card showcase-card--side" data-idx="${idx}">
      <p class="showcase-card__chip">Chapter ${chapterNumber(idx)}</p>
      <h3>${escapeHtml(c.judul)}</h3>
      <p class="showcase-card__hint">${escapeHtml(c.tagline || c.deskripsi || "")}</p>
      <span class="showcase-card__arrow">→</span>
    </article>
  `;
}

function activeCardHtml(idx) {
  const c = chapters[idx];
  const artBg = c.gambar ? ` style="background-image:url('${c.gambar.replace(/'/g, "")}')"` : "";
  const art = c.gambar ? "" : defaultChapterArt(idx);
  return `
    <article class="showcase-card showcase-card--active" data-idx="${idx}" data-goto="chapter.html?id=${c.id}">
      <div class="showcase-card__body">
        <span class="showcase-card__badge">You are here</span>
        <p class="showcase-card__chip showcase-card__chip--active">Chapter ${chapterNumber(idx)}</p>
        <h2>${escapeHtml(c.judul)}</h2>
        <p class="showcase-card__tagline">${escapeHtml(c.tagline || c.deskripsi || "")}</p>
        <a class="btn btn-primary showcase-card__cta" href="chapter.html?id=${c.id}">Mulai Baca →</a>
        <p class="showcase-card__count">${noteCounts[c.id] || 0} catatan</p>
        ${currentIsAdmin ? `
          <div class="showcase-card__admin-row" data-admin-row>
            <button class="btn-icon btn" data-move-up="${c.id}" title="Naikkan urutan" ${idx === 0 ? "disabled" : ""}>↑</button>
            <button class="btn-icon btn" data-move-down="${c.id}" title="Turunkan urutan" ${idx === chapters.length - 1 ? "disabled" : ""}>↓</button>
            <button class="btn-icon btn" data-edit="${c.id}" title="Edit">✎</button>
            <button class="btn-icon btn-danger btn" data-del="${c.id}" title="Hapus">🗑</button>
          </div>` : ""}
      </div>
      <div class="showcase-card__art"${artBg}>${art}</div>
    </article>
  `;
}

function setActive(idx) {
  activeIndex = Math.max(0, Math.min(chapters.length - 1, idx));
  render();
}

function attachEvents() {
  const showcase = document.getElementById("chapterShowcase");

  document.getElementById("navPrev")?.addEventListener("click", () => setActive(activeIndex - 1));
  document.getElementById("navNext")?.addEventListener("click", () => setActive(activeIndex + 1));

  showcase.querySelectorAll("[data-dot]").forEach((dot) => {
    dot.addEventListener("click", () => setActive(Number(dot.dataset.dot)));
  });

  showcase.querySelectorAll(".showcase-card--side").forEach((card) => {
    card.addEventListener("click", () => { if (!wasDragged) setActive(Number(card.dataset.idx)); });
  });

  // Klik di mana saja pada kartu aktif (judul, deskripsi, gambar, area kosong)
  // akan membuka chapter — kecuali area tombol admin (naik/turun/edit/hapus).
  showcase.querySelectorAll(".showcase-card--active").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (wasDragged) return;
      if (e.target.closest("[data-admin-row]")) return;
      if (e.target.closest(".showcase-card__cta")) return; // biarkan <a> bekerja normal
      window.location.href = card.dataset.goto;
    });
  });

  showcase.querySelectorAll("[data-admin-row]").forEach((row) =>
    row.addEventListener("click", (e) => e.stopPropagation())
  );

  showcase.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); handleEditChapter(btn.dataset.edit); })
  );
  showcase.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); handleDeleteChapter(btn.dataset.del); })
  );
  showcase.querySelectorAll("[data-move-up]").forEach((btn) =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); handleMove(btn.dataset.moveUp, -1); })
  );
  showcase.querySelectorAll("[data-move-down]").forEach((btn) =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); handleMove(btn.dataset.moveDown, 1); })
  );

  attachDrag();
}

// ---------- Drag / swipe (mouse drag di desktop, swipe jari di mobile) ----------
let wasDragged = false;

function attachDrag() {
  const viewport = document.getElementById("showcaseViewport");
  const track = document.getElementById("showcaseTrack");
  if (!viewport || !track) return;

  let startX = 0;
  let dragging = false;
  let deltaX = 0;

  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < chapters.length - 1;

  function onPointerDown(e) {
    // Hanya tombol primer (klik kiri mouse), abaikan klik kanan / multi-touch
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging = true;
    wasDragged = false;
    startX = e.clientX;
    deltaX = 0;
    track.classList.add("is-dragging");
    track.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    deltaX = e.clientX - startX;

    // Efek rubber-band kalau sudah di ujung kiri/kanan (chapter pertama/terakhir)
    if ((!hasPrev && deltaX > 0) || (!hasNext && deltaX < 0)) {
      deltaX *= 0.35;
    }
    if (Math.abs(deltaX) > 4) wasDragged = true;
    track.style.transform = `translateX(${deltaX}px)`;
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    track.classList.remove("is-dragging");

    const THRESHOLD = 70;
    if (deltaX <= -THRESHOLD && hasNext) {
      setActive(activeIndex + 1);
    } else if (deltaX >= THRESHOLD && hasPrev) {
      setActive(activeIndex - 1);
    } else {
      track.style.transform = "translateX(0)";
    }
    // Biarkan event "click" berikutnya (yang menyusul pointerup) tahu bahwa
    // ini adalah akhir dari drag, bukan klik biasa — lalu reset.
    setTimeout(() => { wasDragged = false; }, 50);
  }

  track.addEventListener("pointerdown", onPointerDown);
  track.addEventListener("pointermove", onPointerMove);
  track.addEventListener("pointerup", onPointerUp);
  track.addEventListener("pointercancel", onPointerUp);
  track.addEventListener("pointerleave", (e) => { if (dragging) onPointerUp(); });
}

async function handleMove(id, dir) {
  const idx = chapters.findIndex((c) => c.id === id);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= chapters.length) return;

  [chapters[idx], chapters[swapIdx]] = [chapters[swapIdx], chapters[idx]];
  activeIndex = swapIdx;
  render();

  await Promise.all(chapters.map((c, i) => updateChapter(c.id, { urutan: i + 1 })));
}

// ---------- Form chapter: judul, deskripsi, tagline, gambar sampul ----------

/** Tambahkan tombol "Upload" di samping field gambar pada modal yang sedang terbuka. */
function enhanceCoverImageField() {
  const overlay = [...document.querySelectorAll(".modal-overlay")].pop();
  const input = overlay?.querySelector('input[name="gambar"]');
  if (!input) return;

  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex; gap:8px; align-items:center; margin-bottom:10px;";
  input.style.marginBottom = "0";
  input.before(wrap);
  wrap.appendChild(input);

  const uploadBtn = document.createElement("button");
  uploadBtn.type = "button";
  uploadBtn.className = "btn";
  uploadBtn.style.flexShrink = "0";
  uploadBtn.textContent = "Upload";
  wrap.appendChild(uploadBtn);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";
  wrap.appendChild(fileInput);

  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Mengunggah…";
    try {
      input.value = await uploadToCloudinary(file);
    } catch (err) {
      alert("Gagal upload: " + err.message);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Upload";
    }
  });
}

function chapterFields(chapter) {
  return [
    { key: "judul", label: "Judul", placeholder: "Misal: Freedom of Mind", value: chapter?.judul },
    { key: "tagline", label: "Tagline pendek", placeholder: "Misal: Brace for Impact", value: chapter?.tagline },
    { key: "deskripsi", label: "Deskripsi", placeholder: "Deskripsi singkat (opsional)", multiline: true, value: chapter?.deskripsi },
    { key: "gambar", label: "Gambar sampul", placeholder: "URL Cloudinary, atau klik Upload →", value: chapter?.gambar },
  ];
}

async function handleAddChapter() {
  const pending = showModal({
    title: "Chapter baru",
    fields: chapterFields(null),
    confirmLabel: "Buat chapter",
  });
  enhanceCoverImageField();
  const result = await pending;
  if (!result || !result.judul) return;
  await createChapter(result);
  activeIndex = chapters.length; // arahkan ke chapter baru
  await loadAndRender();
}

async function handleEditChapter(id) {
  const chapter = chapters.find((c) => c.id === id);
  const pending = showModal({
    title: "Edit chapter",
    fields: chapterFields(chapter),
    confirmLabel: "Simpan perubahan",
  });
  enhanceCoverImageField();
  const result = await pending;
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
