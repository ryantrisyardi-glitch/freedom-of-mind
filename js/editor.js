// =========================================================
// EDITOR — WYSIWYG ringan berbasis contenteditable
// Toolbar: Bold, Italic, Underline, Highlight, Heading, Quote (2 gaya),
// Bullet list, Undo/Redo, Insert image (kiri/kanan/tengah/full), Divider.
// =========================================================

let editorEl = null;
let onChangeCallback = null;

// ---------- Riwayat undo/redo manual ----------
// document.execCommand("undo") bawaan browser tidak konsisten di mobile
// (terutama Android Chrome & in-app browser), jadi kita kelola sendiri.
let history = [];
let historyIndex = -1;
let isRestoringHistory = false;
const MAX_HISTORY = 100;

function pushHistory() {
  if (isRestoringHistory) return;
  const html = editorEl.innerHTML;
  if (history[historyIndex] === html) return; // tidak ada perubahan nyata
  history = history.slice(0, historyIndex + 1);
  history.push(html);
  if (history.length > MAX_HISTORY) history.shift();
  historyIndex = history.length - 1;
  updateUndoRedoButtons();
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  restoreHistoryAt(historyIndex);
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  restoreHistoryAt(historyIndex);
}

function restoreHistoryAt(idx) {
  isRestoringHistory = true;
  editorEl.innerHTML = history[idx];
  isRestoringHistory = false;
  updateUndoRedoButtons();
  triggerChange();
}

function updateUndoRedoButtons() {
  const undoBtn = document.querySelector('[data-cmd="undo"]');
  const redoBtn = document.querySelector('[data-cmd="redo"]');
  if (undoBtn) undoBtn.disabled = historyIndex <= 0;
  if (redoBtn) redoBtn.disabled = historyIndex >= history.length - 1;
}

let historyDebounce = null;
function scheduleHistoryPush() {
  clearTimeout(historyDebounce);
  historyDebounce = setTimeout(pushHistory, 400);
}

// ---------- Helpers umum ----------

function triggerChange() {
  if (onChangeCallback) onChangeCallback(editorEl.innerHTML);
}

/**
 * Saat user menghapus semua isi (Backspace berulang), contenteditable
 * sering menyisakan elemen kosong seperti "<p><br></p>" yang membuat
 * placeholder CSS (:empty::before) tidak muncul lagi meski terlihat
 * kosong. Fungsi ini membersihkannya jadi benar-benar kosong.
 */
function normalizeEmptyState() {
  const plainText = editorEl.textContent.replace(/\u200B/g, "").trim();
  const hasMedia = editorEl.querySelector("img, figure");
  if (!plainText && !hasMedia) {
    editorEl.innerHTML = "";
  }
}

function exec(command, value = null) {
  document.execCommand(command, false, value);
  editorEl.focus();
  scheduleHistoryPush();
  triggerChange();
  updateToolbarState();
}

/**
 * Menyisipkan/melepas <mark> pada seleksi saat ini (toggle highlight asli,
 * bukan cuma menambah terus — jadi bisa benar-benar dimatikan).
 */
function toggleHighlight() {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);

  // Jika seleksi sudah berada di dalam <mark>, lepas highlight-nya.
  let node = range.commonAncestorContainer;
  let markEl = node.nodeType === 3 ? node.parentElement : node;
  while (markEl && markEl !== editorEl) {
    if (markEl.tagName === "MARK") {
      const parent = markEl.parentNode;
      while (markEl.firstChild) parent.insertBefore(markEl.firstChild, markEl);
      parent.removeChild(markEl);
      sel.removeAllRanges();
      scheduleHistoryPush();
      triggerChange();
      return;
    }
    markEl = markEl.parentElement;
  }

  // Belum di-highlight -> bungkus dengan <mark>
  const mark = document.createElement("mark");
  mark.appendChild(range.extractContents());
  range.insertNode(mark);
  sel.removeAllRanges();
  scheduleHistoryPush();
  triggerChange();
}

function insertHeading(level) {
  exec("formatBlock", `<h${level}>`);
}

function insertParagraph() {
  exec("formatBlock", "<p>");
}

/**
 * Dua gaya quote:
 *  - "line"  : kutipan bergaris pinggir tipis (gaya lama, untuk kutipan biasa)
 *  - "eye"   : kutipan besar eye-catching (untuk kalimat kunci yang mau ditonjolkan)
 */
function insertQuote(style = "line") {
  const sel = window.getSelection();
  const selectedText = sel.rangeCount ? sel.toString() : "";

  if (style === "eye") {
    const bq = document.createElement("blockquote");
    bq.className = "quote-eyecatch";
    bq.textContent = selectedText || "Kutipan menarik...";
    insertNodeAtCursor(bq);
    insertNodeAtCursor(document.createElement("p"));
  } else {
    exec("formatBlock", "<blockquote>");
    return;
  }
  scheduleHistoryPush();
  triggerChange();
}

function insertDivider() {
  const hr = document.createElement("div");
  hr.className = "divider";
  hr.contentEditable = "false";
  hr.textContent = "• • •";
  insertNodeAtCursor(hr);
  insertNodeAtCursor(document.createElement("p"));
  scheduleHistoryPush();
  triggerChange();
}

function insertNodeAtCursor(node) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !editorEl.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    editorEl.appendChild(node);
    return;
  }
  const range = sel.getRangeAt(0);
  range.collapse(false);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Membuat figure gambar dengan posisi float tertentu.
 */
function buildImageFigure(url, position) {
  const figure = document.createElement("figure");
  figure.className = `img-pos-${position}`;
  figure.contentEditable = "false";
  figure.dataset.position = position;

  const img = document.createElement("img");
  img.src = url;
  img.alt = "";
  figure.appendChild(img);

  const controls = document.createElement("div");
  controls.className = "img-controls";
  controls.contentEditable = "false";
  ["left", "center", "right", "full"].forEach((pos) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "img-controls__btn" + (pos === position ? " is-active" : "");
    btn.dataset.pos = pos;
    btn.title = "Posisikan: " + pos;
    btn.textContent = { left: "⇤", center: "⇔", right: "⇥", full: "⬜" }[pos];
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      figure.className = `img-pos-${pos}`;
      figure.dataset.position = pos;
      controls.querySelectorAll(".img-controls__btn").forEach((b) =>
        b.classList.toggle("is-active", b.dataset.pos === pos)
      );
      scheduleHistoryPush();
      triggerChange();
    });
    controls.appendChild(btn);
  });
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "img-controls__btn img-controls__btn--remove";
  removeBtn.title = "Hapus gambar";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("mousedown", (e) => e.preventDefault());
  removeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    figure.remove();
    scheduleHistoryPush();
    triggerChange();
  });
  controls.appendChild(removeBtn);
  figure.appendChild(controls);

  return figure;
}

async function handleImageUpload(file) {
  const cfg = window.CLOUDINARY_CONFIG;
  if (!cfg || cfg.cloudName === "GANTI_CLOUD_NAME") {
    alert("Penyimpanan gambar belum aktif — konfigurasi Cloudinary di js/firebase-config.js terlebih dahulu (lihat README.md).");
    return null;
  }
  if (file.size > 8 * 1024 * 1024) {
    alert("Ukuran gambar maksimal 8 MB.");
    return null;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", cfg.uploadPreset);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Upload ke Cloudinary gagal");
  }
  return data.secure_url;
}

async function insertImage(position) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const toolbar = document.getElementById("editorToolbar");
    toolbar?.classList.add("is-busy");
    try {
      const url = await handleImageUpload(file);
      if (!url) return;
      const figure = buildImageFigure(url, position);
      insertNodeAtCursor(figure);
      const p = document.createElement("p");
      p.innerHTML = "<br>";
      insertNodeAtCursor(p);
      scheduleHistoryPush();
      triggerChange();
    } catch (err) {
      alert("Gagal mengunggah gambar: " + err.message);
    } finally {
      toolbar?.classList.remove("is-busy");
    }
  });
  input.click();
}

// ---------- Status tombol (bold/italic/underline aktif atau tidak) ----------

function isSelectionInsideTag(tagName) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;
  let node = sel.getRangeAt(0).commonAncestorContainer;
  node = node.nodeType === 3 ? node.parentElement : node;
  while (node && node !== editorEl) {
    if (node.tagName === tagName) return true;
    node = node.parentElement;
  }
  return false;
}

function updateToolbarState() {
  const map = {
    bold: () => { try { return document.queryCommandState("bold"); } catch { return false; } },
    italic: () => { try { return document.queryCommandState("italic"); } catch { return false; } },
    underline: () => { try { return document.queryCommandState("underline"); } catch { return false; } },
    highlight: () => isSelectionInsideTag("MARK"),
  };
  Object.entries(map).forEach(([cmd, check]) => {
    const btn = document.querySelector(`[data-cmd="${cmd}"]`);
    if (btn) btn.classList.toggle("is-active", !!check());
  });
}

const TOOLBAR_HTML = `
  <div class="toolbar-group">
    <button data-cmd="undo" title="Urungkan (Ctrl+Z)" disabled>↶</button>
    <button data-cmd="redo" title="Ulangi (Ctrl+Shift+Z)" disabled>↷</button>
  </div>
  <div class="toolbar-group">
    <button data-cmd="bold" title="Tebal (Ctrl+B)"><strong>B</strong></button>
    <button data-cmd="italic" title="Miring (Ctrl+I)"><em>I</em></button>
    <button data-cmd="underline" title="Garis bawah"><u>U</u></button>
    <button data-cmd="highlight" title="Highlight">⬛</button>
  </div>
  <div class="toolbar-group">
    <button data-cmd="h2" title="Judul bagian">H2</button>
    <button data-cmd="h3" title="Sub-judul">H3</button>
    <button data-cmd="p" title="Paragraf normal">¶</button>
  </div>
  <div class="toolbar-group">
    <button data-cmd="quote-line" title="Kutipan biasa">" biasa</button>
    <button data-cmd="quote-eye" title="Kutipan besar mencolok">" besar</button>
  </div>
  <div class="toolbar-group">
    <button data-cmd="ul" title="Daftar berpoin">• List</button>
    <button data-cmd="divider" title="Pembatas">⋯</button>
  </div>
  <div class="toolbar-group">
    <span class="toolbar-label">Gambar:</span>
    <button data-cmd="img-left" title="Gambar di kiri, teks di kanan">⇤ Kiri</button>
    <button data-cmd="img-right" title="Gambar di kanan, teks di kiri">Kanan ⇥</button>
    <button data-cmd="img-center" title="Gambar di tengah">⇔ Tengah</button>
    <button data-cmd="img-full" title="Gambar lebar penuh">⬜ Penuh</button>
  </div>
`;

// ---------- Floating mini toolbar ----------

const FLOATING_TOOLBAR_HTML = `
  <button data-fcmd="undo" title="Urungkan" disabled>↶</button>
  <button data-fcmd="redo" title="Ulangi" disabled>↷</button>
  <span class="floating-toolbar__sep"></span>
  <button data-fcmd="bold" title="Tebal"><strong>B</strong></button>
  <button data-fcmd="italic" title="Miring"><em>I</em></button>
  <button data-fcmd="underline" title="Garis bawah"><u>U</u></button>
  <button data-fcmd="highlight" title="Highlight">▨</button>
`;

let floatingToolbarEl = null;

function createFloatingToolbar() {
  const ft = document.createElement("div");
  ft.className = "floating-toolbar";
  ft.id = "floatingToolbar";
  ft.innerHTML = FLOATING_TOOLBAR_HTML;
  document.body.appendChild(ft);

  ft.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      const cmd = btn.dataset.fcmd;
      switch (cmd) {
        case "undo": undo(); break;
        case "redo": redo(); break;
        case "bold": exec("bold"); break;
        case "italic": exec("italic"); break;
        case "underline": exec("underline"); break;
        case "highlight": toggleHighlight(); editorEl.focus(); updateToolbarState(); break;
      }
      updateFloatingToolbarState();
    });
  });

  return ft;
}

function updateFloatingToolbarState() {
  if (!floatingToolbarEl) return;
  const map = {
    bold: () => { try { return document.queryCommandState("bold"); } catch { return false; } },
    italic: () => { try { return document.queryCommandState("italic"); } catch { return false; } },
    underline: () => { try { return document.queryCommandState("underline"); } catch { return false; } },
    highlight: () => isSelectionInsideTag("MARK"),
  };
  Object.entries(map).forEach(([cmd, check]) => {
    const btn = floatingToolbarEl.querySelector(`[data-fcmd="${cmd}"]`);
    if (btn) btn.classList.toggle("is-active", !!check());
  });
  const undoBtn = floatingToolbarEl.querySelector('[data-fcmd="undo"]');
  const redoBtn = floatingToolbarEl.querySelector('[data-fcmd="redo"]');
  if (undoBtn) undoBtn.disabled = historyIndex <= 0;
  if (redoBtn) redoBtn.disabled = historyIndex >= history.length - 1;
}

function checkFloatingToolbarVisibility() {
  if (!floatingToolbarEl) return;
  const toolbar = document.getElementById("editorToolbar");
  if (!toolbar) return;
  const rect = toolbar.getBoundingClientRect();
  floatingToolbarEl.classList.toggle("is-visible", rect.bottom < 0);
  if (rect.bottom < 0) updateFloatingToolbarState();
}

/**
 * Inisialisasi editor pada elemen tertentu.
 */
export function initEditor(containerEl, initialHtml, onChange) {
  onChangeCallback = onChange;
  containerEl.innerHTML = `
    <div class="editor-toolbar" id="editorToolbar">${TOOLBAR_HTML}</div>
    <div class="editor-area" id="editorArea" contenteditable="true" data-placeholder="Mulai menulis di sini..."></div>
  `;
  editorEl = containerEl.querySelector("#editorArea");
  editorEl.innerHTML = initialHtml && initialHtml.trim() ? initialHtml : "";

  // riwayat awal
  history = [editorEl.innerHTML];
  historyIndex = 0;

  // PENTING: mousedown preventDefault mencegah browser memindahkan fokus
  // ke tombol toolbar sebelum click diproses — inilah sumber bug
  // "bold/italic/highlight selalu ON": tanpa ini, seleksi teks hilang
  // duluan sehingga execCommand dieksekusi pada posisi yang salah.
  containerEl.querySelectorAll(".editor-toolbar button").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      const cmd = btn.dataset.cmd;
      switch (cmd) {
        case "undo": undo(); break;
        case "redo": redo(); break;
        case "bold": exec("bold"); break;
        case "italic": exec("italic"); break;
        case "underline": exec("underline"); break;
        case "highlight": toggleHighlight(); editorEl.focus(); updateToolbarState(); break;
        case "h2": insertHeading(2); break;
        case "h3": insertHeading(3); break;
        case "p": insertParagraph(); break;
        case "quote-line": insertQuote("line"); break;
        case "quote-eye": insertQuote("eye"); break;
        case "ul": exec("insertUnorderedList"); break;
        case "divider": insertDivider(); break;
        case "img-left": insertImage("left"); break;
        case "img-right": insertImage("right"); break;
        case "img-center": insertImage("center"); break;
        case "img-full": insertImage("full"); break;
      }
    });
  });

  editorEl.addEventListener("input", () => {
    normalizeEmptyState();
    triggerChange();
    scheduleHistoryPush();
  });
  editorEl.addEventListener("keyup", updateToolbarState);
  editorEl.addEventListener("mouseup", updateToolbarState);
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === editorEl || editorEl.contains(document.activeElement)) {
      updateToolbarState();
    }
  });

  // Shortcut keyboard: Ctrl+Z / Ctrl+Shift+Z (juga membantu di keyboard eksternal mobile)
  editorEl.addEventListener("keydown", (e) => {
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    if (ctrlOrCmd && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (ctrlOrCmd && ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y")) {
      e.preventDefault();
      redo();
    }
  });

  // Drag & drop gambar langsung ke editor (default: full-width)
  editorEl.addEventListener("dragover", (e) => e.preventDefault());
  editorEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      try {
        const url = await handleImageUpload(file);
        if (url) {
          const figure = buildImageFigure(url, "full");
          insertNodeAtCursor(figure);
          scheduleHistoryPush();
          triggerChange();
        }
      } catch (err) {
        alert("Gagal mengunggah gambar: " + err.message);
      }
    }
  });

  updateUndoRedoButtons();

  // Floating toolbar — muncul saat toolbar asli tergulir ke atas
  floatingToolbarEl = createFloatingToolbar();
  window.addEventListener("scroll", checkFloatingToolbarVisibility, { passive: true });
  editorEl.addEventListener("keyup", updateFloatingToolbarState);
  editorEl.addEventListener("mouseup", updateFloatingToolbarState);

  return editorEl;
}

export function getEditorHtml() {
  return editorEl ? editorEl.innerHTML : "";
}
