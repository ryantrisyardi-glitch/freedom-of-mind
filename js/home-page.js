// =========================================================
// HOME PAGE — showcase chapter ala carousel "you are here"
// =========================================================

import { initAnalytics } from "./analytics.js";
import { initApp, onAuthReady, currentIsAdmin, showModal, showChoice, createUploadProgress } from "./ui-shared.js";
import { getAllChapters, createChapter, updateChapter, deleteChapter, getAllNotes, QUICK_NOTES_NAME, uploadToCloudinary } from "./data.js";
import { defaultChapterArt } from "./chapter-art.js";

let chapters = [];
let noteCounts = {};
let activeIndex = 0;
let lastTrackOffset = 0; // posisi geser terakhir, dipakai supaya animasi slide nyambung mulus

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

// render() membangun ulang seluruh DOM carousel — HANYA dipanggil saat data
// benar-benar berubah (load awal, tambah/edit/hapus/pindah chapter). Untuk
// sekadar berpindah kartu (swipe, klik panah, klik dot, tap kartu) JANGAN
// panggil render() lagi — pakai goToIndex() yang cuma toggle class & animasi
// transform, supaya tidak terasa seperti "refresh halaman" setiap geser.
function render() {
  const showcase = document.getElementById("chapterShowcase");

  if (chapters.length === 0) {
    showcase.innerHTML = currentIsAdmin
      ? `<div class="empty-state">Belum ada bagian (chapter). Klik tombol di bawah untuk membuat yang pertama.</div>`
      : `<div class="empty-state">Belum ada catatan yang dipublikasikan.</div>`;
    renderAddButton();
    return;
  }

  // Semua kartu chapter punya lebar yang SAMA (bukan kartu aktif melebar &
  // kartu lain menyusut jadi secuil) — supaya chapter sebelum/sesudahnya
  // selalu terlihat utuh (mengintip cukup besar di tepi), persis seperti
  // swipe kartu, bukan cuma menampilkan potongan kecil.
  showcase.innerHTML = `
    <div class="chapter-showcase__viewport" id="showcaseViewport">
      <div class="chapter-showcase__track" id="showcaseTrack">
        ${chapters.map((c, i) => cardHtml(c, i)).join("")}
      </div>
    </div>
    <button class="showcase-nav showcase-nav--prev" id="navPrev" aria-label="Sebelumnya" ${activeIndex === 0 ? "disabled" : ""}>‹</button>
    <button class="showcase-nav showcase-nav--next" id="navNext" aria-label="Berikutnya" ${activeIndex === chapters.length - 1 ? "disabled" : ""}>›</button>
    <div class="showcase-dots" id="showcaseDots">
      ${chapters.map((_, i) => `<button class="showcase-dots__dot ${i === activeIndex ? "is-active" : ""}" data-dot="${i}" aria-label="Chapter ${i + 1}"></button>`).join("")}
    </div>
    ${chapters.length > 1 ? `<p class="showcase-hint">↔ Geser atau swipe untuk melihat chapter lain</p>` : ""}
  `;

  renderAddButton();
  attachEvents();

  // Posisi awal langsung ke kartu aktif tanpa animasi (baru dibangun ulang).
  const viewport = document.getElementById("showcaseViewport");
  const track = document.getElementById("showcaseTrack");
  if (viewport && track) {
    track.style.transition = "none";
    const target = computeCenterOffset(track, viewport);
    track.style.transform = `translateX(${target}px)`;
    lastTrackOffset = target;
    void track.offsetHeight;
    track.style.transition = "";
  }
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

/** Satu template kartu yang sama untuk semua chapter — supaya setiap kartu
 *  (aktif maupun tidak) selalu tampil "utuh" dengan ilustrasi/gambar sampul,
 *  bukan cuma kotak teks polos. Kartu aktif membesar & menampilkan elemen
 *  tambahan (badge, CTA, jumlah catatan) lewat CSS, bukan template terpisah. */
function cardHtml(c, idx) {
  const isActive = idx === activeIndex;
  const artBg = c.gambar ? ` style="background-image:url('${c.gambar.replace(/'/g, "")}')"` : "";
  const art = c.gambar ? "" : defaultChapterArt(idx);

  return `
    <article class="showcase-card ${isActive ? "is-active" : ""}" data-idx="${idx}" data-goto="chapter.html?id=${c.id}">
      <div class="showcase-card__body">
        <span class="showcase-card__badge">You are here</span>
        <p class="showcase-card__chip">Chapter ${chapterNumber(idx)}</p>
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
        <span class="showcase-card__peek-arrow">→</span>
      </div>
      <div class="showcase-card__art"${artBg}>${art}</div>
    </article>
  `;
}

/** Hitung offset supaya kartu aktif berada di tengah viewport, lalu geser
 *  ke sana dengan animasi mulus (seperti strip yang berputar/orbit). */
function computeCenterOffset(track, viewport) {
  const cards = [...track.children];
  const activeCard = cards[activeIndex];
  if (!activeCard) return 0;
  const viewportWidth = viewport.clientWidth;
  const activeCenter = activeCard.offsetLeft + activeCard.offsetWidth / 2;
  return viewportWidth / 2 - activeCenter;
}

window.addEventListener("resize", () => {
  const viewport = document.getElementById("showcaseViewport");
  const track = document.getElementById("showcaseTrack");
  if (!viewport || !track) return;
  track.style.transition = "none";
  const target = computeCenterOffset(track, viewport);
  track.style.transform = `translateX(${target}px)`;
  lastTrackOffset = target;
  void track.offsetHeight;
  track.style.transition = "";
});

/** Pindah ke kartu lain TANPA membangun ulang DOM (fix utama supaya swipe
 *  terasa mulus, bukan seperti "refresh halaman"). Hanya: toggle class
 *  is-active di kartu & dot yang relevan, update state tombol panah, lalu
 *  animasikan transform track ke posisi kartu baru. */
function goToIndex(idx, { animate = true } = {}) {
  const newIndex = Math.max(0, Math.min(chapters.length - 1, idx));
  const track = document.getElementById("showcaseTrack");
  const viewport = document.getElementById("showcaseViewport");
  if (!track || !viewport) { activeIndex = newIndex; return; }

  activeIndex = newIndex;

  track.querySelectorAll(".showcase-card").forEach((card) => {
    card.classList.toggle("is-active", Number(card.dataset.idx) === activeIndex);
  });
  document.querySelectorAll("#showcaseDots [data-dot]").forEach((dot) => {
    dot.classList.toggle("is-active", Number(dot.dataset.dot) === activeIndex);
  });
  const navPrev = document.getElementById("navPrev");
  const navNext = document.getElementById("navNext");
  if (navPrev) navPrev.disabled = activeIndex === 0;
  if (navNext) navNext.disabled = activeIndex === chapters.length - 1;

  const target = computeCenterOffset(track, viewport);
  track.style.transition = animate ? "" : "none";
  track.style.transform = `translateX(${target}px)`;
  lastTrackOffset = target;
  if (!animate) { void track.offsetHeight; track.style.transition = ""; }
}

function attachEvents() {
  const showcase = document.getElementById("chapterShowcase");

  document.getElementById("navPrev")?.addEventListener("click", () => goToIndex(activeIndex - 1));
  document.getElementById("navNext")?.addEventListener("click", () => goToIndex(activeIndex + 1));

  showcase.querySelectorAll("[data-dot]").forEach((dot) => {
    dot.addEventListener("click", () => goToIndex(Number(dot.dataset.dot)));
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
// Navigasi "buka chapter" dilakukan langsung dari urutan pointerdown→pointerup,
// BUKAN dari event "click" bawaan browser — supaya tidak tergantung pada
// perilaku click yang kadang tidak konsisten saat dikombinasikan dengan
// pointer capture/drag (ini yang sebelumnya bikin klik di PC kadang tidak jalan).
let wasDragged = false;

function attachDrag() {
  const track = document.getElementById("showcaseTrack");
  if (!track) return;
  wasDragged = false;

  let startX = 0;
  let startY = 0;
  let dragging = false;
  let deltaX = 0;
  let deltaY = 0;
  let downTarget = null;
  let isVerticalScroll = false; // gestur lebih condong ke atas/bawah → biarkan halaman scroll, jangan navigasi

  const DRAG_THRESHOLD = 10; // px gerakan minimum supaya dianggap drag, bukan klik biasa
  const SWIPE_THRESHOLD = 50; // px gerakan minimum supaya dianggap "pindah satu chapter" (maksimal 1 chapter per swipe)

  function onPointerMove(e) {
    if (!dragging || isVerticalScroll) return;
    deltaX = e.clientX - startX;
    deltaY = e.clientY - startY;

    // Kalau gerakan vertikal lebih dominan dari horizontal, ini gestur scroll
    // halaman (bukan geser carousel) — biarkan browser yang scroll, dan jangan
    // anggap ini sebagai tap saat jari diangkat nanti.
    if (!wasDragged && Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > DRAG_THRESHOLD) {
      isVerticalScroll = true;
      return;
    }

    if (!wasDragged && Math.abs(deltaX) < DRAG_THRESHOLD) return; // belum dianggap drag

    if (!wasDragged) track.style.transition = "none"; // drag baru resmi dimulai, matikan animasi sementara
    wasDragged = true;

    // Geser track mengikuti jari/mouse secara langsung dari posisi terakhir —
    // ini yang memberi kesan "memutar strip kartu" yang halus & responsif.
    track.style.transform = `translateX(${lastTrackOffset + deltaX}px)`;
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerUp);

    if (isVerticalScroll) {
      isVerticalScroll = false;
      return; // ini scroll halaman, bukan interaksi carousel — jangan lakukan apa-apa
    }

    if (wasDragged) {
      // Maksimal pindah 1 chapter per swipe — supaya selalu "on point" ke
      // chapter sebelum/sesudahnya, tidak meloncat lebih dari satu.
      let newIndex = activeIndex;
      if (deltaX <= -SWIPE_THRESHOLD) newIndex = Math.min(chapters.length - 1, activeIndex + 1);
      else if (deltaX >= SWIPE_THRESHOLD) newIndex = Math.max(0, activeIndex - 1);

      track.style.transition = "";
      if (newIndex !== activeIndex) {
        // DOM tidak dibangun ulang — hanya animasi transform yang lanjut
        // mulus dari posisi jari terakhir menuju kartu baru.
        requestAnimationFrame(() => goToIndex(newIndex));
      } else {
        // Tidak cukup jauh untuk pindah chapter → kembali mulus ke posisi semula.
        requestAnimationFrame(() => {
          track.style.transform = `translateX(${lastTrackOffset}px)`;
        });
      }
      setTimeout(() => { wasDragged = false; }, 50);
    } else {
      // Tidak ada gerakan berarti = tap/klik biasa → langsung tangani navigasinya di sini.
      handleTap(downTarget);
    }
  }

  function onPointerDown(e) {
    // Hanya tombol primer (klik kiri mouse), abaikan klik kanan / multi-touch
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging = true;
    isVerticalScroll = false;
    startX = e.clientX;
    startY = e.clientY;
    deltaX = 0;
    deltaY = 0;
    downTarget = e.target;
    // Dengarkan di document (bukan setPointerCapture) supaya tidak mengganggu
    // event click/native browser pada anak elemen (tombol, link) di dalam kartu.
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
  }

  track.addEventListener("pointerdown", onPointerDown);
}

function handleTap(target) {
  if (!target) return;
  if (target.closest("[data-admin-row]")) return; // sudah ditangani tombol admin masing-masing

  const card = target.closest(".showcase-card");
  if (!card) return;

  if (card.classList.contains("is-active")) {
    window.location.href = card.dataset.goto;
  } else {
    goToIndex(Number(card.dataset.idx));
  }
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

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn btn-danger";
  removeBtn.style.flexShrink = "0";
  removeBtn.textContent = "Hapus";
  removeBtn.title = "Hapus gambar sampul";
  wrap.appendChild(removeBtn);
  removeBtn.addEventListener("click", () => {
    input.value = "";
  });

  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Mengunggah…";
    const progress = createUploadProgress(wrap, "Mengunggah gambar sampul…");
    try {
      input.value = await uploadToCloudinary(file, (percent) => progress.update(percent));
    } catch (err) {
      alert("Gagal upload: " + err.message);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Upload";
      progress.remove();
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
  initAnalytics();
  onAuthReady(() => { render(); });
  await loadAndRender();
})();
