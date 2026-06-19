// =========================================================
// EDITOR — WYSIWYG ringan berbasis contenteditable
// Toolbar: Bold, Italic, Underline, Highlight (+ color palette),
// Sticky Note, Heading, Quote (2 gaya), Bullet list, Undo/Redo,
// Insert image (kiri/kanan/tengah/full), Divider.
// Floating toolbar: semua tombol, collapsible dengan ^/v toggle.
// =========================================================

let editorEl = null;
let onChangeCallback = null;

// ---------- Riwayat undo/redo manual ----------
let history = [];
let historyIndex = -1;
let isRestoringHistory = false;
const MAX_HISTORY = 100;

function pushHistory() {
  if (isRestoringHistory) return;
  const html = editorEl.innerHTML;
  if (history[historyIndex] === html) return;
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
  document.querySelectorAll('[data-cmd="undo"], [data-fcmd="undo"]').forEach(b => b.disabled = historyIndex <= 0);
  document.querySelectorAll('[data-cmd="redo"], [data-fcmd="redo"]').forEach(b => b.disabled = historyIndex >= history.length - 1);
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

function normalizeEmptyState() {
  const plainText = editorEl.textContent.replace(/\u200B/g, "").trim();
  const hasMedia = editorEl.querySelector("img, figure");
  if (!plainText && !hasMedia) editorEl.innerHTML = "";
}

function exec(command, value = null) {
  editorEl.focus();
  document.execCommand(command, false, value);
  scheduleHistoryPush();
  triggerChange();
  updateToolbarState();
  updateFloatingToolbarState();
}

// Toggle block-level format: jika sudah dalam tag tsb, kembalikan ke <p>
function toggleBlock(tag) {
  editorEl.focus();
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  let node = sel.getRangeAt(0).commonAncestorContainer;
  node = node.nodeType === 3 ? node.parentElement : node;
  const match = node.closest ? node.closest(tag) : null;
  if (match) {
    document.execCommand("formatBlock", false, "<p>");
  } else {
    document.execCommand("formatBlock", false, `<${tag}>`);
  }
  scheduleHistoryPush();
  triggerChange();
  updateToolbarState();
  updateFloatingToolbarState();
}

// Toggle list
function toggleList() {
  editorEl.focus();
  document.execCommand("insertUnorderedList", false, null);
  scheduleHistoryPush();
  triggerChange();
  updateToolbarState();
  updateFloatingToolbarState();
}

// ---------- Highlight dengan warna ----------

const HIGHLIGHT_COLORS = [
  { name: "Kuning",   value: "#FFF176" },
  { name: "Hijau",    value: "#C8E6C9" },
  { name: "Biru",     value: "#B3E5FC" },
  { name: "Merah",    value: "#FFCDD2" },
  { name: "Ungu",     value: "#E1BEE7" },
  { name: "Oranye",   value: "#FFE0B2" },
  { name: "Pink",     value: "#F8BBD9" },
  { name: "Abu",      value: "#F5F5F5" },
];

let activeHighlightColor = HIGHLIGHT_COLORS[0].value; // default kuning

function getMarkColorAtSelection() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.getRangeAt(0).commonAncestorContainer;
  node = node.nodeType === 3 ? node.parentElement : node;
  while (node && node !== editorEl) {
    if (node.tagName === "MARK") return node.style.background || node.dataset.color || null;
    node = node.parentElement;
  }
  return null;
}

function removeMarkAtSelection() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;
  let node = sel.getRangeAt(0).commonAncestorContainer;
  node = node.nodeType === 3 ? node.parentElement : node;
  while (node && node !== editorEl) {
    if (node.tagName === "MARK") {
      const parent = node.parentNode;
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      parent.removeChild(node);
      sel.removeAllRanges();
      scheduleHistoryPush();
      triggerChange();
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function toggleHighlight(color) {
  const useColor = color || activeHighlightColor;
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;

  // Jika sudah di dalam mark, lepas
  if (removeMarkAtSelection()) return;

  // Bungkus dengan mark berwarna
  const range = sel.getRangeAt(0);
  const mark = document.createElement("mark");
  mark.style.background = useColor;
  mark.dataset.color = useColor;
  mark.appendChild(range.extractContents());
  range.insertNode(mark);
  sel.removeAllRanges();
  scheduleHistoryPush();
  triggerChange();
}

// ---------- Color palette popup ----------

let colorPaletteEl = null;
let highlightHoldTimer = null;

function createColorPalette() {
  const palette = document.createElement("div");
  palette.className = "color-palette";
  palette.id = "colorPalette";
  palette.innerHTML = `
    <div class="color-palette__label">Warna highlight</div>
    <div class="color-palette__grid">
      ${HIGHLIGHT_COLORS.map(c => `
        <button class="color-palette__swatch" style="background:${c.value}" data-color="${c.value}" title="${c.name}"></button>
      `).join("")}
    </div>
  `;
  document.body.appendChild(palette);

  palette.querySelectorAll(".color-palette__swatch").forEach(btn => {
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const color = btn.dataset.color;
      activeHighlightColor = color;
      // Update semua tombol highlight
      document.querySelectorAll('[data-cmd="highlight"], [data-fcmd="highlight"]').forEach(b => {
        b.style.setProperty("--hl-color", color);
      });
      palette.querySelectorAll(".color-palette__swatch").forEach(s => s.classList.remove("is-active"));
      btn.classList.add("is-active");
      toggleHighlight(color);
      hideColorPalette();
    });
  });

  // Tandai default aktif
  palette.querySelector(`[data-color="${activeHighlightColor}"]`)?.classList.add("is-active");

  document.addEventListener("click", e => {
    if (!palette.contains(e.target) && !e.target.closest('[data-cmd="highlight"]') && !e.target.closest('[data-fcmd="highlight"]')) {
      hideColorPalette();
    }
  });

  return palette;
}

function showColorPalette(anchorBtn) {
  if (!colorPaletteEl) colorPaletteEl = createColorPalette();
  const rect = anchorBtn.getBoundingClientRect();
  colorPaletteEl.style.left = Math.max(8, rect.left - 8) + "px";
  colorPaletteEl.style.top = (rect.top - colorPaletteEl.offsetHeight - 10 + window.scrollY) + "px";
  colorPaletteEl.classList.add("is-visible");
  // Hitung ulang posisi setelah visible (untuk dapatkan offsetHeight)
  requestAnimationFrame(() => {
    const h = colorPaletteEl.offsetHeight;
    colorPaletteEl.style.top = (rect.top - h - 8 + window.scrollY) + "px";
  });
}

function hideColorPalette() {
  colorPaletteEl?.classList.remove("is-visible");
}

function setupHighlightButton(btn, isFcmd) {
  const cmdKey = isFcmd ? "fcmd" : "cmd";
  btn.style.setProperty("--hl-color", activeHighlightColor);

  // Klik biasa = highlight dengan warna aktif
  btn.addEventListener("mousedown", e => e.preventDefault());
  btn.addEventListener("click", e => {
    e.preventDefault();
    toggleHighlight(activeHighlightColor);
    editorEl.focus();
    updateToolbarState();
    hideColorPalette();
  });

  // Tahan lama = buka color palette
  btn.addEventListener("pointerdown", e => {
    highlightHoldTimer = setTimeout(() => {
      showColorPalette(btn);
    }, 500);
  });
  btn.addEventListener("pointerup", () => clearTimeout(highlightHoldTimer));
  btn.addEventListener("pointerleave", () => clearTimeout(highlightHoldTimer));

  // Klik kanan = langsung buka palette
  btn.addEventListener("contextmenu", e => {
    e.preventDefault();
    showColorPalette(btn);
  });
}

// ---------- Sticky Note ----------

const STICKY_COLORS = [
  "#FFF9C4", // kuning lembut
  "#C8E6C9", // hijau lembut
  "#B3E5FC", // biru lembut
  "#FFCDD2", // merah muda
  "#E1BEE7", // ungu lembut
];

let stickyCounter = 0;

function insertStickyNote() {
  const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
  const id = "sticky-" + (++stickyCounter);

  // Seluruh struktur pakai data-attribute, event ditangani via delegation di editorEl
  const colorDotsHtml = STICKY_COLORS.map(c =>
    `<button type="button" class="sticky-note__color-dot${c === color ? " is-active" : ""}"
      data-sticky-action="color" data-sticky-id="${id}" data-color="${c}"
      style="background:${c}" title="Ganti warna"></button>`
  ).join("");

  const html = `
    <div class="sticky-note-wrapper" data-sticky-id="${id}" contenteditable="false">
      <div class="sticky-note" style="background:${color}" data-sticky-id="${id}">
        <div class="sticky-note__controls">
          ${colorDotsHtml}
          <button type="button" class="sticky-note__remove"
            data-sticky-action="remove" data-sticky-id="${id}" title="Hapus">✕</button>
        </div>
        <div class="sticky-note__text" contenteditable="true" data-sticky-id="${id}">Catatan...</div>
      </div>
    </div>
  `;

  // Insert sebagai node
  const temp = document.createElement("div");
  temp.innerHTML = html;
  const wrapper = temp.firstElementChild;
  insertNodeAtCursor(wrapper);

  const p = document.createElement("p");
  p.innerHTML = "<br>";
  insertNodeAtCursor(p);

  scheduleHistoryPush();
  triggerChange();
}

// Dipanggil sekali saat initEditor — delegasi semua event sticky note ke editorEl
function setupStickyDelegation() {
  // Gunakan mousedown+pointerup agar tidak kehilangan event di mobile contenteditable
  editorEl.addEventListener("mousedown", handleStickyInteraction);
  editorEl.addEventListener("touchend", handleStickyInteraction);
}

function handleStickyInteraction(e) {
  const btn = e.target.closest("[data-sticky-action]");
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  const action = btn.dataset.stickyAction;
  const id = btn.dataset.stickyId;
  const wrapper = editorEl.querySelector(`.sticky-note-wrapper[data-sticky-id="${id}"]`);
  const sticky = editorEl.querySelector(`.sticky-note[data-sticky-id="${id}"]`);

  if (action === "remove") {
    wrapper?.remove();
    scheduleHistoryPush();
    triggerChange();
  } else if (action === "color") {
    const color = btn.dataset.color;
    if (sticky) sticky.style.background = color;
    // Update active dot
    editorEl.querySelectorAll(`[data-sticky-action="color"][data-sticky-id="${id}"]`)
      .forEach(d => d.classList.toggle("is-active", d.dataset.color === color));
    scheduleHistoryPush();
    triggerChange();
  }
}

// ---------- Heading / Quote / Divider ----------

function insertHeading(level) { toggleBlock(`h${level}`); }
function insertParagraph() {
  editorEl.focus();
  document.execCommand("formatBlock", false, "<p>");
  scheduleHistoryPush(); triggerChange(); updateToolbarState(); updateFloatingToolbarState();
}

function insertQuote(style = "line") {
  const sel = window.getSelection();
  const selectedText = sel.rangeCount ? sel.toString() : "";
  if (style === "eye") {
    // Toggle: jika sudah di dalam quote-eyecatch, hapus wrapper-nya
    let node = sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null;
    node = node && node.nodeType === 3 ? node.parentElement : node;
    const existing = node && node.closest ? node.closest(".quote-eyecatch") : null;
    if (existing) {
      const p = document.createElement("p");
      p.textContent = existing.textContent;
      existing.replaceWith(p);
    } else {
      const bq = document.createElement("blockquote");
      bq.className = "quote-eyecatch";
      bq.textContent = selectedText || "Kutipan menarik...";
      insertNodeAtCursor(bq);
      insertNodeAtCursor(document.createElement("p"));
    }
  } else {
    toggleBlock("blockquote");
    return;
  }
  scheduleHistoryPush();
  triggerChange();
  updateToolbarState();
  updateFloatingToolbarState();
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

// ---------- Image ----------

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
  if (!res.ok) throw new Error(data.error?.message || "Upload ke Cloudinary gagal");
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

// ---------- Status tombol ----------

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
    bold:      () => { try { return document.queryCommandState("bold"); } catch { return false; } },
    italic:    () => { try { return document.queryCommandState("italic"); } catch { return false; } },
    underline: () => { try { return document.queryCommandState("underline"); } catch { return false; } },
    highlight: () => isSelectionInsideTag("MARK"),
  };
  ["cmd", "fcmd"].forEach(k => {
    Object.entries(map).forEach(([cmd, check]) => {
      const btn = document.querySelector(`[data-${k}="${cmd}"]`);
      if (btn) btn.classList.toggle("is-active", !!check());
    });
  });
}

// ---------- Toolbar HTML ----------

const TOOLBAR_HTML = `
  <div class="toolbar-group">
    <button data-cmd="undo" title="Urungkan (Ctrl+Z)" disabled>↶</button>
    <button data-cmd="redo" title="Ulangi (Ctrl+Shift+Z)" disabled>↷</button>
  </div>
  <div class="toolbar-group">
    <button data-cmd="bold" title="Tebal (Ctrl+B)"><strong>B</strong></button>
    <button data-cmd="italic" title="Miring (Ctrl+I)"><em>I</em></button>
    <button data-cmd="underline" title="Garis bawah"><u>U</u></button>
    <button data-cmd="highlight" class="btn-highlight" title="Highlight (tahan untuk pilih warna)" style="--hl-color:#FFF176">▨</button>
    <button data-cmd="sticky" title="Sticky Note">📌</button>
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

// ---------- Floating toolbar ----------

let floatingToolbarEl = null;
let floatingCollapsed = false;

const FLOATING_BODY_HTML = `
  <div class="floating-toolbar__body">
    <div class="floating-toolbar__row">
      <button data-fcmd="undo" title="Urungkan" disabled>↶</button>
      <button data-fcmd="redo" title="Ulangi" disabled>↷</button>
      <span class="floating-toolbar__sep"></span>
      <button data-fcmd="bold" title="Tebal"><strong>B</strong></button>
      <button data-fcmd="italic" title="Miring"><em>I</em></button>
      <button data-fcmd="underline" title="Garis bawah"><u>U</u></button>
      <button data-fcmd="highlight" class="btn-highlight" title="Highlight (tahan untuk pilih warna)" style="--hl-color:#FFF176">▨</button>
      <button data-fcmd="sticky" title="Sticky Note">📌</button>
      <span class="floating-toolbar__sep"></span>
      <button data-fcmd="h2" title="Judul">H2</button>
      <button data-fcmd="h3" title="Sub-judul">H3</button>
      <button data-fcmd="p" title="Paragraf">¶</button>
      <span class="floating-toolbar__sep"></span>
      <button data-fcmd="quote-line" title="Kutipan">❝</button>
      <button data-fcmd="quote-eye" title="Kutipan besar">❝!</button>
      <button data-fcmd="ul" title="Daftar berpoin">•</button>
      <button data-fcmd="divider" title="Pembatas">⋯</button>
    </div>
  </div>
`;

function createFloatingToolbar() {
  const ft = document.createElement("div");
  ft.className = "floating-toolbar";
  ft.id = "floatingToolbar";
  ft.innerHTML = `
    <button class="floating-toolbar__toggle" id="floatingToggle" title="Sembunyikan/tampilkan toolbar">▲</button>
    ${FLOATING_BODY_HTML}
  `;
  document.body.appendChild(ft);

  // Toggle collapse
  const toggleBtn = ft.querySelector("#floatingToggle");
  toggleBtn.addEventListener("mousedown", e => e.preventDefault());
  toggleBtn.addEventListener("click", e => {
    e.preventDefault();
    floatingCollapsed = !floatingCollapsed;
    ft.classList.toggle("is-collapsed", floatingCollapsed);
    toggleBtn.textContent = floatingCollapsed ? "▲" : "▼";
    toggleBtn.title = floatingCollapsed ? "Tampilkan toolbar" : "Sembunyikan toolbar";
  });

  // Highlight buttons – special setup
  ft.querySelectorAll('[data-fcmd="highlight"]').forEach(btn => {
    setupHighlightButton(btn, true);
  });

  // Other buttons
  ft.querySelectorAll("button[data-fcmd]").forEach((btn) => {
    const cmd = btn.dataset.fcmd;
    if (cmd === "highlight") return; // sudah di-setup di atas
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      dispatchCmd(cmd);
      updateFloatingToolbarState();
    });
  });

  return ft;
}

function dispatchCmd(cmd) {
  switch (cmd) {
    case "undo": undo(); break;
    case "redo": redo(); break;
    case "bold": exec("bold"); break;
    case "italic": exec("italic"); break;
    case "underline": exec("underline"); break;
    case "sticky": insertStickyNote(); break;
    case "h2": insertHeading(2); break;
    case "h3": insertHeading(3); break;
    case "p": insertParagraph(); break;
    case "quote-line": insertQuote("line"); break;
    case "quote-eye": insertQuote("eye"); break;
    case "ul": toggleList(); break;
    case "divider": insertDivider(); break;
    case "img-left": insertImage("left"); break;
    case "img-right": insertImage("right"); break;
    case "img-center": insertImage("center"); break;
    case "img-full": insertImage("full"); break;
  }
}

function updateFloatingToolbarState() {
  if (!floatingToolbarEl) return;
  const map = {
    bold:      () => { try { return document.queryCommandState("bold"); } catch { return false; } },
    italic:    () => { try { return document.queryCommandState("italic"); } catch { return false; } },
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
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    // Pada mobile: selalu tampilkan saat editor aktif (keyboard terbuka)
    const isEditorFocused = document.activeElement === editorEl || editorEl.contains(document.activeElement);
    floatingToolbarEl.classList.toggle("is-visible", isEditorFocused);
    positionFloatingToolbarAboveKeyboard();
  } else {
    // Desktop: tampilkan saat toolbar asli tergulir ke atas
    const toolbar = document.getElementById("editorToolbar");
    if (!toolbar) return;
    const rect = toolbar.getBoundingClientRect();
    floatingToolbarEl.classList.toggle("is-visible", rect.bottom < 0);
  }
  updateFloatingToolbarState();
}

function positionFloatingToolbarAboveKeyboard() {
  if (!floatingToolbarEl) return;
  // Gunakan visualViewport API jika tersedia (iOS/Android)
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const bottomOfViewport = vv.offsetTop + vv.height;
    floatingToolbarEl.style.bottom = (window.innerHeight - bottomOfViewport + 8) + "px";
  } else {
    floatingToolbarEl.style.bottom = "8px";
  }
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

  history = [editorEl.innerHTML];
  historyIndex = 0;

  // Delegasi event sticky note (hapus & ganti warna)
  setupStickyDelegation();

  // Setup tombol toolbar utama
  const highlightBtn = containerEl.querySelector('[data-cmd="highlight"]');
  if (highlightBtn) setupHighlightButton(highlightBtn, false);

  containerEl.querySelectorAll(".editor-toolbar button[data-cmd]").forEach((btn) => {
    const cmd = btn.dataset.cmd;
    if (cmd === "highlight") return; // sudah di-setup
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      dispatchCmd(cmd);
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

  editorEl.addEventListener("keydown", (e) => {
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    if (ctrlOrCmd && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault(); undo();
    } else if (ctrlOrCmd && ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y")) {
      e.preventDefault(); redo();
    }
  });

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

  // Floating toolbar
  floatingToolbarEl = createFloatingToolbar();
  window.addEventListener("scroll", checkFloatingToolbarVisibility, { passive: true });
  editorEl.addEventListener("keyup", updateFloatingToolbarState);
  editorEl.addEventListener("mouseup", updateFloatingToolbarState);

  // Mobile: tampilkan/sembunyikan floating toolbar berdasarkan fokus dan keyboard
  editorEl.addEventListener("focus", () => {
    if (window.innerWidth <= 768) {
      floatingToolbarEl.classList.add("is-visible");
      positionFloatingToolbarAboveKeyboard();
    }
  });
  editorEl.addEventListener("blur", e => {
    // Jangan sembunyikan jika yang diklik adalah tombol di floating toolbar
    setTimeout(() => {
      const active = document.activeElement;
      if (!floatingToolbarEl.contains(active) && active !== editorEl && !editorEl.contains(active)) {
        if (window.innerWidth <= 768) floatingToolbarEl.classList.remove("is-visible");
      }
    }, 150);
  });

  // Visualviewport (keyboard muncul/hilang di mobile)
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      positionFloatingToolbarAboveKeyboard();
      checkFloatingToolbarVisibility();
    });
    window.visualViewport.addEventListener("scroll", positionFloatingToolbarAboveKeyboard);
  }

  return editorEl;
}

export function getEditorHtml() {
  return editorEl ? editorEl.innerHTML : "";
}
