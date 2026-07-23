// =========================================================
// EDITOR — WYSIWYG ringan berbasis contenteditable
// Toolbar: Bold, Italic, Underline, Highlight (+ color palette),
// Sticky Note, Heading, Quote (2 gaya), Bullet list, Undo/Redo,
// Insert image (kiri/kanan/tengah/full), Divider.
// Floating toolbar: semua tombol, collapsible dengan ^/v toggle.
// =========================================================

import { uploadToCloudinary } from "./data.js";
import { showGlobalUploadProgress } from "./ui-shared.js";

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

// Ambil posisi kursor sebagai offset karakter (teks polos) relatif terhadap
// root — dipakai supaya undo/redo bisa mengembalikan posisi kursor ke tempat
// yang (kurang lebih) sama walau seluruh innerHTML diganti total.
function getCaretOffset(root) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const preRange = document.createRange();
  preRange.selectNodeContents(root);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

function setCaretOffset(root, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let node, remaining = offset, lastNode = null;
  while ((node = walker.nextNode())) {
    lastNode = node;
    const len = node.textContent.length;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, Math.max(0, remaining));
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
  }
  const range = document.createRange();
  if (lastNode) range.setStart(lastNode, lastNode.textContent.length);
  else range.selectNodeContents(root);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function restoreHistoryAt(idx) {
  const caretOffset = getCaretOffset(editorEl);
  isRestoringHistory = true;
  editorEl.innerHTML = history[idx];
  isRestoringHistory = false;
  updateUndoRedoButtons();
  triggerChange();
  editorEl.focus();
  if (caretOffset !== null) {
    try { setCaretOffset(editorEl, caretOffset); } catch { /* biarkan fokus tanpa posisi kursor spesifik */ }
  }
  updateToolbarState();
  updateFloatingToolbarState();
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

// Rapikan spasi berlebih (termasuk &nbsp; lama dari catatan sebelumnya)
// jadi satu spasi biasa. Sengaja TIDAK dipanggil setiap kali "input" —
// hanya saat catatan dibuka & saat editor kehilangan fokus — supaya tidak
// mengganggu posisi kursor selagi sedang aktif mengetik.
function sanitizeWhitespace(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  let changed = false;
  nodes.forEach((node) => {
    if (!node.nodeValue) return;
    const cleaned = node.nodeValue.replace(/[ \u00A0]{2,}/g, " ");
    if (cleaned !== node.nodeValue) {
      node.nodeValue = cleaned;
      changed = true;
    }
  });
  return changed;
}

function normalizeEmptyState() {
  const plainText = editorEl.textContent.replace(/\u200B/g, "").trim();
  const hasMedia = editorEl.querySelector("img, figure");
  if (!plainText && !hasMedia) editorEl.innerHTML = "";
}

// Sebagian browser (terutama saat paragraf ber-alignment "justify") membuat
// <div> baru (bukan <p>) ketika Enter ditekan, walau defaultParagraphSeparator
// sudah di-set ke "p". <div> punya margin bawaan browser yang berbeda dari
// aturan `.editor-area p{ margin:0 0 1.2em }` kita, sehingga muncul jarak
// ekstra yang tidak konsisten antar paragraf. Fungsi ini mengubah <div> yang
// "nyasar" jadi <p> asli (sambil mempertahankan style/alignment-nya), TAPI
// tidak pernah menyentuh blok yang sedang berisi kursor supaya tidak
// mengganggu pengetikan yang sedang berlangsung.
function normalizeStrayDivs() {
  const sel = window.getSelection();
  let activeBlock = null;
  if (sel.rangeCount) {
    let node = sel.getRangeAt(0).commonAncestorContainer;
    node = node.nodeType === 3 ? node.parentElement : node;
    activeBlock = node && node.closest ? node.closest("div") : null;
  }
  [...editorEl.children].forEach((el) => {
    if (el.tagName !== "DIV") return;
    if (el === activeBlock) return;
    if (el.classList.contains("divider") || el.classList.contains("sticky-note-wrapper")) return;
    const p = document.createElement("p");
    if (el.hasAttribute("style")) p.setAttribute("style", el.getAttribute("style"));
    p.innerHTML = el.innerHTML || "<br>";
    editorEl.replaceChild(p, el);
  });
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

// Pilih semua isi editor
function selectAllContent() {
  editorEl.focus();
  const range = document.createRange();
  range.selectNodeContents(editorEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  updateToolbarState();
  updateFloatingToolbarState();
}

// Cari <ol> terdekat SEBELUM elemen ini di alur dokumen (boleh dipisah
// paragraf/gambar/heading lain di antaranya) — dipakai untuk "lanjutkan
// penomoran" alih-alih selalu mulai dari 1 lagi.
function findPrecedingOl(fromEl) {
  let node = fromEl.previousElementSibling;
  while (node) {
    if (node.tagName === "OL") return node;
    node = node.previousElementSibling;
  }
  return null;
}

function getOlEndNumber(ol) {
  const start = parseInt(ol.getAttribute("start") || "1", 10);
  const liCount = ol.querySelectorAll(":scope > li").length;
  return start + Math.max(0, liCount - 1);
}

// Toggle list — ordered=false untuk bullet (•), ordered=true untuk numbering (1. 2. 3.)
function toggleList(ordered = false) {
  editorEl.focus();
  const sel = window.getSelection();
  let wasInList = false;
  if (sel.rangeCount) {
    let node = sel.getRangeAt(0).commonAncestorContainer;
    node = node.nodeType === 3 ? node.parentElement : node;
    wasInList = !!(node && node.closest && node.closest(ordered ? "ol" : "ul"));
  }

  document.execCommand(ordered ? "insertOrderedList" : "insertUnorderedList", false, null);

  if (ordered && !wasInList) {
    // Daftar baru saja dibuat (bukan sedang di-toggle-off) — kalau ada <ol>
    // sebelumnya di catatan ini, lanjutkan penomorannya alih-alih mulai
    // dari 1 lagi, supaya "1, 2, 3" bisa diteruskan walau sempat terpisah
    // paragraf/gambar lain di antaranya.
    const sel2 = window.getSelection();
    let node2 = sel2.rangeCount ? sel2.getRangeAt(0).commonAncestorContainer : null;
    node2 = node2 && node2.nodeType === 3 ? node2.parentElement : node2;
    const newOl = node2 && node2.closest ? node2.closest("ol") : null;
    if (newOl) {
      const prevOl = findPrecedingOl(newOl);
      if (prevOl) {
        const nextStart = getOlEndNumber(prevOl) + 1;
        if (nextStart > 1) newOl.setAttribute("start", String(nextStart));
      }
    }
  }

  scheduleHistoryPush();
  triggerChange();
  updateToolbarState();
  updateFloatingToolbarState();
}

// Reset penomoran daftar yang sedang berisi kursor kembali ke 1 — dipakai
// kalau lanjut-otomatis di atas TIDAK diinginkan untuk daftar tertentu.
function restartNumbering() {
  editorEl.focus();
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  let node = sel.getRangeAt(0).commonAncestorContainer;
  node = node.nodeType === 3 ? node.parentElement : node;
  const ol = node && node.closest ? node.closest("ol") : null;
  if (!ol) return;
  ol.removeAttribute("start");
  scheduleHistoryPush();
  triggerChange();
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
  { name: "Abu",      value: "#EEEEEE" },
];

const TEXT_COLORS = [
  { name: "Hitam",      value: "#1A1A1A" },
  { name: "Abu Tua",    value: "#555555" },
  { name: "Abu",        value: "#888888" },
  { name: "Terracotta", value: "#C0583A" },
  { name: "Merah",      value: "#E53935" },
  { name: "Oranye",     value: "#E65100" },
  { name: "Kuning",     value: "#F9A825" },
  { name: "Hijau Tua",  value: "#2E7D32" },
  { name: "Hijau",      value: "#388E3C" },
  { name: "Sage",       value: "#7A8B7F" },
  { name: "Biru Tua",   value: "#1565C0" },
  { name: "Biru",       value: "#1976D2" },
  { name: "Ungu",       value: "#6A1B9A" },
  { name: "Pink",       value: "#C2185B" },
  { name: "Coklat",     value: "#6D4C41" },
  { name: "Putih",      value: "#FFFFFF" },
];

let activeHighlightColor = HIGHLIGHT_COLORS[0].value;
let activeTextColor = TEXT_COLORS[0].value;

// Cari <mark> yang membungkus posisi kursor/seleksi saat ini (baik seleksi
// aktif teksnya di-drag, MAUPUN kursor cuma "diklik" / diletakkan di dalam
// teks yang sudah di-highlight tanpa memilih apa pun). Ini penting supaya
// tombol hapus/ganti warna highlight tetap berfungsi walau user tidak
// men-drag seleksi — cukup taruh kursor di dalam kata yang sudah di-highlight.
function findMarkAtSelection() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.getRangeAt(0).commonAncestorContainer;
  node = node.nodeType === 3 ? node.parentElement : node;
  while (node && node !== editorEl) {
    if (node.tagName === "MARK") return node;
    node = node.parentElement;
  }
  return null;
}

function removeMarkAtSelection() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;
  const node = findMarkAtSelection();
  if (node) {
    // Simpan node & offset kursor SEBELUM unwrap — node teks yang sama
    // akan tetap valid setelah dipindah ke parent (cuma reparenting),
    // jadi kita bisa taruh kursor persis di tempat yang sama lagi.
    const anchorNode = sel.anchorNode, anchorOffset = sel.anchorOffset;
    const focusNode = sel.focusNode, focusOffset = sel.focusOffset;
    const parent = node.parentNode;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    parent.removeChild(node);
    try {
      const range = document.createRange();
      range.setStart(anchorNode, anchorOffset);
      range.setEnd(focusNode, focusOffset);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      editorEl.focus();
    }
    scheduleHistoryPush();
    triggerChange();
    return true;
  }
  return false;
}

function toggleHighlight(color) {
  const useColor = color || activeHighlightColor;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  // Kursor (tanpa seleksi teks) diletakkan di dalam highlight yang sudah ada
  // → toggle berarti menghapus highlight tersebut.
  if (sel.isCollapsed) {
    removeMarkAtSelection();
    return;
  }
  if (removeMarkAtSelection()) return;
  const range = sel.getRangeAt(0);
  const mark = document.createElement("mark");
  mark.style.background = useColor;
  mark.dataset.color = useColor;
  mark.appendChild(range.extractContents());
  range.insertNode(mark);
  // Pilih ulang isi <mark> yang baru dibuat, bukan menghapus seleksi —
  // supaya kursor/seleksi tetap di tempat teks yang baru di-highlight,
  // bukan melompat ke awal dokumen.
  const newRange = document.createRange();
  newRange.selectNodeContents(mark);
  sel.removeAllRanges();
  sel.addRange(newRange);
  scheduleHistoryPush();
  triggerChange();
}

// Dipakai khusus oleh palet warna: SELALU menerapkan warna yang dipilih,
// tidak seperti toggleHighlight yang men-toggle (menghapus highlight kalau
// seleksi sudah punya highlight). Sebelumnya tombol warna di palet memanggil
// toggleHighlight — akibatnya kalau teks SUDAH ada highlight-nya, klik warna
// lain di palet malah MENGHAPUS highlight itu (bukan menggantinya), jadi
// terasa seperti "tidak bisa ganti warna". Sekarang: kalau seleksi sudah di
// dalam <mark>, warnanya diganti langsung; kalau belum, baru dibungkus <mark> baru.
function setHighlightColor(color) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const markNode = findMarkAtSelection();

  // Tidak ada seleksi teks (kursor cuma diletakkan) DAN tidak sedang di
  // dalam highlight yang ada → tidak ada apa pun untuk diwarnai, berhenti.
  if (!markNode && sel.isCollapsed) return;

  if (markNode) {
    markNode.style.background = color;
    markNode.dataset.color = color;
    const newRange = document.createRange();
    newRange.selectNodeContents(markNode);
    sel.removeAllRanges();
    sel.addRange(newRange);
  } else {
    const range = sel.getRangeAt(0);
    const mark = document.createElement("mark");
    mark.style.background = color;
    mark.dataset.color = color;
    mark.appendChild(range.extractContents());
    range.insertNode(mark);
    const newRange = document.createRange();
    newRange.selectNodeContents(mark);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
  scheduleHistoryPush();
  triggerChange();
}

// ---------- Ukuran teks ----------

function findFontSizeSpanAtSelection() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.getRangeAt(0).commonAncestorContainer;
  node = node.nodeType === 3 ? node.parentElement : node;
  while (node && node !== editorEl) {
    if (node.tagName === "SPAN" && node.style.fontSize) return node;
    node = node.parentElement;
  }
  return null;
}

function applyFontSize(px) {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;

  const existing = findFontSizeSpanAtSelection();
  if (existing && sel.getRangeAt(0).toString() === existing.textContent) {
    existing.style.fontSize = px + "px";
    const range = document.createRange();
    range.selectNodeContents(existing);
    sel.removeAllRanges();
    sel.addRange(range);
    scheduleHistoryPush();
    triggerChange();
    return;
  }

  const range = sel.getRangeAt(0);
  const span = document.createElement("span");
  span.style.fontSize = px + "px";
  span.appendChild(range.extractContents());
  range.insertNode(span);

  // Selalu pilih ulang isinya, bukan menghapus seleksi — supaya kursor
  // tetap di tempat teks yang baru diubah ukurannya.
  const newRange = document.createRange();
  newRange.selectNodeContents(span);
  sel.removeAllRanges();
  sel.addRange(newRange);
  scheduleHistoryPush();
  triggerChange();
}

function setupFontSizeSelect(select) {
  select.addEventListener("mousedown", () => saveSelection());
  select.addEventListener("focus", () => saveSelection());
  select.addEventListener("change", () => {
    const px = select.value;
    if (px) {
      restoreSelection();
      applyFontSize(Number(px));
      editorEl.focus();
    }
    select.value = "";
  });
}

function applyTextColor(color) {
  const useColor = color || activeTextColor;
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  editorEl.focus();
  document.execCommand("foreColor", false, useColor);
  scheduleHistoryPush();
  triggerChange();
  updateToolbarState();
  updateFloatingToolbarState();
}

// ---------- Paste dibersihkan (kunci font default) ----------
// Mencegah font asing (Verdana, Times New Roman, dll) ikut masuk saat
// paste dari Word/Google Docs/situs lain. Tag <font> dihapus (dibungkus-lepas),
// dan properti font-family/font-size pada style inline dibuang. Warna teks,
// bold, italic, list, dsb tetap dipertahankan.
function sanitizePastedFragment(root) {
  root.querySelectorAll("font").forEach((f) => {
    while (f.firstChild) f.parentNode.insertBefore(f.firstChild, f);
    f.parentNode.removeChild(f);
  });
  root.querySelectorAll("[style]").forEach((el) => {
    el.style.removeProperty("font-family");
    el.style.removeProperty("font-size");
    el.style.removeProperty("line-height");
    if (!el.getAttribute("style")) el.removeAttribute("style");
  });
  root.querySelectorAll("[class]").forEach((el) => el.removeAttribute("class"));
  root.querySelectorAll("[face]").forEach((el) => el.removeAttribute("face"));
  return root;
}

function handlePaste(e) {
  e.preventDefault();
  const cd = e.clipboardData || window.clipboardData;
  if (!cd) return;
  // Paste selalu sebagai teks polos saja — tanpa bold/italic/warna/font/link/
  // list, dsb ikut dari Word/Google Docs/situs lain. Ambil text/plain saja;
  // HTML dari clipboard sengaja tidak dipakai sama sekali.
  const text = cd.getData("text/plain");
  editorEl.focus();

  if (text) {
    document.execCommand("insertText", false, text);
  }

  normalizeEmptyState();
  scheduleHistoryPush();
  triggerChange();
  updateToolbarState();
  updateFloatingToolbarState();
}

// ---------- Unified Color Palette Popup ----------

let colorPaletteEl = null;
// Saved selection before palette opens (palette clicks lose focus)
let savedRange = null;

function saveSelection() {
  const sel = window.getSelection();
  if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
}

function restoreSelection() {
  if (!savedRange) return;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedRange);
}

function createColorPalette() {
  const palette = document.createElement("div");
  palette.className = "color-palette";
  palette.id = "colorPalette";
  palette.innerHTML = `
    <div class="color-palette__section">
      <div class="color-palette__label">Warna highlight</div>
      <div class="color-palette__grid color-palette__grid--hl">
        ${HIGHLIGHT_COLORS.map(c => `
          <button class="color-palette__swatch color-palette__swatch--hl${c.value === activeHighlightColor ? " is-active" : ""}"
            data-hl="${c.value}" title="${c.name}" style="background:${c.value}"></button>
        `).join("")}
        <button class="color-palette__swatch color-palette__swatch--none" data-hl="none" title="Hapus highlight">✕</button>
      </div>
    </div>
    <div class="color-palette__divider"></div>
    <div class="color-palette__section">
      <div class="color-palette__label">Warna teks</div>
      <div class="color-palette__grid color-palette__grid--txt">
        ${TEXT_COLORS.map(c => `
          <button class="color-palette__swatch color-palette__swatch--txt${c.value === activeTextColor ? " is-active" : ""}"
            data-txt="${c.value}" title="${c.name}" style="background:${c.value};${c.value === "#FFFFFF" ? "border:1.5px solid #ccc;" : ""}"></button>
        `).join("")}
      </div>
    </div>
  `;
  document.body.appendChild(palette);

  // Highlight swatches
  palette.querySelectorAll("[data-hl]").forEach(btn => {
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", e => {
      e.stopPropagation();
      restoreSelection();
      const val = btn.dataset.hl;
      if (val === "none") {
        removeMarkAtSelection();
      } else {
        activeHighlightColor = val;
        setHighlightColor(val);
        syncHighlightUI();
      }
      hideColorPalette();
    });
  });

  // Text color swatches
  palette.querySelectorAll("[data-txt]").forEach(btn => {
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", e => {
      e.stopPropagation();
      restoreSelection();
      activeTextColor = btn.dataset.txt;
      applyTextColor(activeTextColor);
      syncTextColorUI();
      hideColorPalette();
    });
  });

  // Close on outside click
  document.addEventListener("mousedown", e => {
    if (!palette.contains(e.target)) hideColorPalette();
  });

  return palette;
}

function syncHighlightUI() {
  // Update underline color on all highlight buttons
  document.querySelectorAll('[data-cmd="highlight"], [data-fcmd="highlight"]').forEach(b => {
    b.style.setProperty("--hl-color", activeHighlightColor);
  });
  // Update active swatch
  colorPaletteEl?.querySelectorAll("[data-hl]").forEach(s => {
    s.classList.toggle("is-active", s.dataset.hl === activeHighlightColor);
  });
}

function syncTextColorUI() {
  // Update underline color on all text-color buttons
  document.querySelectorAll('[data-cmd="textcolor"], [data-fcmd="textcolor"]').forEach(b => {
    b.style.setProperty("--tc-color", activeTextColor);
  });
  // Update active swatch
  colorPaletteEl?.querySelectorAll("[data-txt]").forEach(s => {
    s.classList.toggle("is-active", s.dataset.txt === activeTextColor);
  });
}

function showColorPalette(x, y) {
  if (!colorPaletteEl) colorPaletteEl = createColorPalette();
  colorPaletteEl.classList.add("is-visible");

  // Position — flip if near edges
  requestAnimationFrame(() => {
    const pw = colorPaletteEl.offsetWidth;
    const ph = colorPaletteEl.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x;
    let top = y - ph - 10;

    // flip right if overflows right
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (left < 8) left = 8;
    // flip below if overflows top
    if (top < 8) top = y + 14;
    // clip bottom
    if (top + ph > vh - 8) top = vh - ph - 8;

    colorPaletteEl.style.left = left + "px";
    colorPaletteEl.style.top = top + "px";
  });
}

function hideColorPalette() {
  colorPaletteEl?.classList.remove("is-visible");
}

function setupHighlightButton(btn) {
  btn.style.setProperty("--hl-color", activeHighlightColor);

  // Click = apply current color
  btn.addEventListener("mousedown", e => {
    e.preventDefault();
    saveSelection();
  });
  btn.addEventListener("click", e => {
    e.preventDefault();
    restoreSelection();
    toggleHighlight(activeHighlightColor);
    editorEl.focus();
    updateToolbarState();
    updateFloatingToolbarState();
    hideColorPalette();
  });

  // Right-click or long-press = open palette
  btn.addEventListener("contextmenu", e => {
    e.preventDefault();
    saveSelection();
    const r = btn.getBoundingClientRect();
    showColorPalette(r.left, r.top);
  });

  let holdTimer;
  btn.addEventListener("pointerdown", () => {
    holdTimer = setTimeout(() => {
      saveSelection();
      const r = btn.getBoundingClientRect();
      showColorPalette(r.left, r.top);
    }, 500);
  });
  btn.addEventListener("pointerup", () => clearTimeout(holdTimer));
  btn.addEventListener("pointerleave", () => clearTimeout(holdTimer));
}

// Tombol kecil "▾" di samping highlight/warna teks — cara pasti untuk
// membuka palet warna di mobile (tanpa tergantung klik-kanan/tekan-lama).
function setupPaletteCaret(btn) {
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    saveSelection();
    const r = btn.getBoundingClientRect();
    showColorPalette(r.left, r.bottom + 6);
  });
}

function setupTextColorButton(btn) {
  btn.style.setProperty("--tc-color", activeTextColor);

  btn.addEventListener("mousedown", e => {
    e.preventDefault();
    saveSelection();
  });
  btn.addEventListener("click", e => {
    e.preventDefault();
    restoreSelection();
    applyTextColor(activeTextColor);
    editorEl.focus();
    hideColorPalette();
  });

  btn.addEventListener("contextmenu", e => {
    e.preventDefault();
    saveSelection();
    const r = btn.getBoundingClientRect();
    showColorPalette(r.left, r.top);
  });

  let holdTimer;
  btn.addEventListener("pointerdown", () => {
    holdTimer = setTimeout(() => {
      saveSelection();
      const r = btn.getBoundingClientRect();
      showColorPalette(r.left, r.top);
    }, 500);
  });
  btn.addEventListener("pointerup", () => clearTimeout(holdTimer));
  btn.addEventListener("pointerleave", () => clearTimeout(holdTimer));
}

// Right-click inside editor area → open palette at cursor
function setupEditorContextMenu() {
  editorEl.addEventListener("contextmenu", e => {
    e.preventDefault();
    saveSelection();
    showColorPalette(e.clientX, e.clientY);
  });
}

// ---------- Paragraph Alignment ----------

function setAlignment(align) {
  editorEl.focus();
  const cmds = { left: "justifyLeft", center: "justifyCenter", right: "justifyRight", justify: "justifyFull" };
  document.execCommand(cmds[align] || "justifyLeft", false, null);
  scheduleHistoryPush(); triggerChange(); updateToolbarState(); updateFloatingToolbarState();
}

// ---------- Indentasi ----------

const INDENT_STEP_EM = 1.4; // sama dengan padding-left daftar berpoin/bernomor
const INDENT_MAX = 8;

function changeIndent(delta) {
  editorEl.focus();
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  let node = sel.getRangeAt(0).commonAncestorContainer;
  node = node.nodeType === 3 ? node.parentElement : node;
  if (!node) return;

  const li = node.closest ? node.closest("li") : null;
  if (li) {
    // Di dalam daftar (bullet/nomor) — pakai indentasi bawaan browser
    // supaya jadi sub-daftar yang benar.
    document.execCommand(delta > 0 ? "indent" : "outdent", false, null);
  } else {
    const block = node.closest ? node.closest("p, h2, h3, blockquote") : null;
    if (!block || block === editorEl) return;
    const current = parseInt(block.dataset.indent || "0", 10);
    const next = Math.max(0, Math.min(INDENT_MAX, current + delta));
    if (next === 0) {
      delete block.dataset.indent;
      block.style.marginLeft = "";
    } else {
      block.dataset.indent = String(next);
      block.style.marginLeft = (next * INDENT_STEP_EM) + "em";
    }
  }
  scheduleHistoryPush();
  triggerChange();
  updateToolbarState();
  updateFloatingToolbarState();
}

function getCurrentAlignment() {
  try {
    if (document.queryCommandState("justifyCenter")) return "center";
    if (document.queryCommandState("justifyRight")) return "right";
    if (document.queryCommandState("justifyFull")) return "justify";
  } catch {}
  return "left";
}

// ---------- Sticky Note ----------

const STICKY_COLORS = [
  "#FFF9C4", "#C8E6C9", "#B3E5FC", "#FFCDD2", "#E1BEE7",
];

let stickyCounter = 0;

function insertStickyNote(position = "left") {
  const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
  const id = "sticky-" + (++stickyCounter);

  const colorDotsHtml = STICKY_COLORS.map(c =>
    `<button type="button" class="sticky-note__color-dot${c === color ? " is-active" : ""}"
      data-sticky-action="color" data-sticky-id="${id}" data-color="${c}"
      style="background:${c}" title="Ganti warna"></button>`
  ).join("");

  const posButtons = ["left", "right", "none"].map(p =>
    `<button type="button" class="sticky-note__pos-btn${p === position ? " is-active" : ""}"
      data-sticky-action="pos" data-sticky-id="${id}" data-pos="${p}"
      title="${p === "none" ? "Inline (tidak float)" : "Float " + p}">
      ${{ left: "⇤", right: "⇥", none: "⇔" }[p]}
    </button>`
  ).join("");

  const html = `<div class="sticky-note-wrapper sticky-pos-${position}" data-sticky-id="${id}" contenteditable="false">
    <div class="sticky-note" style="background:${color}" data-sticky-id="${id}">
      <div class="sticky-note__controls">
        <div class="sticky-note__controls-left">${colorDotsHtml}</div>
        <div class="sticky-note__controls-right">
          ${posButtons}
          <button type="button" class="sticky-note__remove"
            data-sticky-action="remove" data-sticky-id="${id}" title="Hapus">✕</button>
        </div>
      </div>
      <div class="sticky-note__text" contenteditable="true" data-sticky-id="${id}">Catatan...</div>
    </div>
  </div>`;

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

function setupStickyDelegation() {
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
    editorEl.querySelectorAll(`[data-sticky-action="color"][data-sticky-id="${id}"]`)
      .forEach(d => d.classList.toggle("is-active", d.dataset.color === color));
    scheduleHistoryPush();
    triggerChange();
  } else if (action === "pos") {
    const pos = btn.dataset.pos;
    if (wrapper) {
      wrapper.className = `sticky-note-wrapper sticky-pos-${pos}`;
    }
    editorEl.querySelectorAll(`[data-sticky-action="pos"][data-sticky-id="${id}"]`)
      .forEach(d => d.classList.toggle("is-active", d.dataset.pos === pos));
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

async function handleImageUpload(file, progress) {
  return uploadToCloudinary(file, (percent) => progress?.update(percent));
}

async function insertImage(position) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const toolbar = document.getElementById("editorToolbar");
    const floatingBody = document.querySelector(".floating-toolbar__body");
    toolbar?.classList.add("is-busy");
    floatingBody?.classList.add("is-busy");
    const progress = showGlobalUploadProgress();
    try {
      const url = await handleImageUpload(file, progress);
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
      floatingBody?.classList.remove("is-busy");
      progress.remove();
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
    bold:           () => { try { return document.queryCommandState("bold"); } catch { return false; } },
    italic:         () => { try { return document.queryCommandState("italic"); } catch { return false; } },
    underline:      () => { try { return document.queryCommandState("underline"); } catch { return false; } },
    highlight:      () => isSelectionInsideTag("MARK"),
    "align-left":   () => { try { return document.queryCommandState("justifyLeft"); } catch { return false; } },
    "align-center": () => { try { return document.queryCommandState("justifyCenter"); } catch { return false; } },
    "align-right":  () => { try { return document.queryCommandState("justifyRight"); } catch { return false; } },
    "align-justify":() => { try { return document.queryCommandState("justifyFull"); } catch { return false; } },
    ul:             () => { try { return document.queryCommandState("insertUnorderedList"); } catch { return false; } },
    ol:             () => { try { return document.queryCommandState("insertOrderedList"); } catch { return false; } },
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
    <button data-cmd="selectall" title="Pilih semua (Ctrl+A)">▤ Semua</button>
  </div>
  <div class="toolbar-group">
    <button data-cmd="bold" title="Tebal (Ctrl+B)"><strong>B</strong></button>
    <button data-cmd="italic" title="Miring (Ctrl+I)"><em>I</em></button>
    <button data-cmd="underline" title="Garis bawah"><u>U</u></button>
    <span class="floating-toolbar__combo">
      <button data-cmd="highlight" class="btn-highlight" title="Highlight — klik kanan / tekan lama untuk pilih warna" style="--hl-color:#FFF176">▨</button>
      <button data-cmd="highlight-palette" class="btn-palette-caret" title="Pilih warna highlight">▾</button>
    </span>
    <span class="floating-toolbar__combo">
      <button data-cmd="textcolor" class="btn-textcolor" title="Warna teks — klik kanan / tekan lama untuk pilih warna" style="--tc-color:#1A1A1A">A</button>
      <button data-cmd="textcolor-palette" class="btn-palette-caret" title="Pilih warna teks">▾</button>
    </span>
    <button data-cmd="sticky" title="Sticky Note">📌</button>
  </div>
  <div class="toolbar-group">
    <select data-cmd="fontsize" class="toolbar-select" title="Ukuran teks">
      <option value="">Ukuran</option>
      <option value="12">12</option>
      <option value="14">14</option>
      <option value="16">16</option>
      <option value="18">18</option>
      <option value="20">20</option>
      <option value="24">24</option>
      <option value="28">28</option>
      <option value="32">32</option>
    </select>
  </div>
  <div class="toolbar-group">
    <button data-cmd="h2" title="Judul bagian">H2</button>
    <button data-cmd="h3" title="Sub-judul">H3</button>
    <button data-cmd="p" title="Paragraf normal">¶</button>
  </div>
  <div class="toolbar-group">
    <button data-cmd="align-left" title="Rata kiri">⬸</button>
    <button data-cmd="align-center" title="Rata tengah">⬷</button>
    <button data-cmd="align-right" title="Rata kanan">⬶</button>
    <button data-cmd="align-justify" title="Rata kanan-kiri">⬳</button>
  </div>
  <div class="toolbar-group">
    <button data-cmd="outdent" title="Kurangi indentasi">⇤¶</button>
    <button data-cmd="indent" title="Tambah indentasi">⇥¶</button>
  </div>
  <div class="toolbar-group">
    <button data-cmd="quote-line" title="Kutipan biasa">" biasa</button>
    <button data-cmd="quote-eye" title="Kutipan besar mencolok">" besar</button>
  </div>
  <div class="toolbar-group">
    <button data-cmd="ul" title="Daftar berpoin">• List</button>
    <button data-cmd="ol" title="Daftar bernomor — otomatis lanjut dari nomor sebelumnya kalau ada">1. List</button>
    <button data-cmd="ol-restart" title="Mulai ulang penomoran daftar ini dari 1">↺1</button>
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
      <button data-fcmd="selectall" title="Pilih semua">▤</button>
      <span class="floating-toolbar__sep"></span>
      <button data-fcmd="bold" title="Tebal"><strong>B</strong></button>
      <button data-fcmd="italic" title="Miring"><em>I</em></button>
      <button data-fcmd="underline" title="Garis bawah"><u>U</u></button>
      <span class="floating-toolbar__combo">
        <button data-fcmd="highlight" class="btn-highlight" title="Highlight — klik kanan / tekan lama untuk pilih warna" style="--hl-color:#FFF176">▨</button>
        <button data-fcmd="highlight-palette" class="btn-palette-caret" title="Pilih warna highlight">▾</button>
      </span>
      <span class="floating-toolbar__combo">
        <button data-fcmd="textcolor" class="btn-textcolor" title="Warna teks — klik kanan / tekan lama untuk pilih warna" style="--tc-color:#1A1A1A">A</button>
        <button data-fcmd="textcolor-palette" class="btn-palette-caret" title="Pilih warna teks">▾</button>
      </span>
      <button data-fcmd="sticky" title="Sticky Note">📌</button>
      <span class="floating-toolbar__sep"></span>
      <select data-fcmd="fontsize" class="toolbar-select toolbar-select--floating" title="Ukuran teks">
        <option value="">Sz</option>
        <option value="12">12</option>
        <option value="14">14</option>
        <option value="16">16</option>
        <option value="18">18</option>
        <option value="20">20</option>
        <option value="24">24</option>
        <option value="28">28</option>
        <option value="32">32</option>
      </select>
      <span class="floating-toolbar__sep"></span>
      <button data-fcmd="align-left" title="Rata kiri">⬸</button>
      <button data-fcmd="align-center" title="Rata tengah">⬷</button>
      <button data-fcmd="align-right" title="Rata kanan">⬶</button>
      <button data-fcmd="align-justify" title="Justify">⬳</button>
      <span class="floating-toolbar__sep"></span>
      <button data-fcmd="outdent" title="Kurangi indentasi">⇤¶</button>
      <button data-fcmd="indent" title="Tambah indentasi">⇥¶</button>
      <span class="floating-toolbar__sep"></span>
      <button data-fcmd="h2" title="Judul">H2</button>
      <button data-fcmd="h3" title="Sub-judul">H3</button>
      <button data-fcmd="p" title="Paragraf">¶</button>
      <span class="floating-toolbar__sep"></span>
      <button data-fcmd="quote-line" title="Kutipan">❝</button>
      <button data-fcmd="quote-eye" title="Kutipan besar">❝!</button>
      <button data-fcmd="ul" title="Daftar berpoin">•</button>
      <button data-fcmd="ol" title="Daftar bernomor — otomatis lanjut dari nomor sebelumnya">1.</button>
      <button data-fcmd="ol-restart" title="Mulai ulang dari 1">↺1</button>
      <button data-fcmd="divider" title="Pembatas">⋯</button>
      <span class="floating-toolbar__sep"></span>
      <button data-fcmd="img-left" title="Gambar di kiri, teks di kanan">🖼⇤</button>
      <button data-fcmd="img-right" title="Gambar di kanan, teks di kiri">🖼⇥</button>
      <button data-fcmd="img-center" title="Gambar di tengah">🖼◆</button>
      <button data-fcmd="img-full" title="Gambar lebar penuh">🖼⬜</button>
    </div>
  </div>
`;

function createFloatingToolbar() {
  const ft = document.createElement("div");
  ft.className = "floating-toolbar";
  ft.id = "floatingToolbar";
  ft.innerHTML = `
    <button class="floating-toolbar__toggle" id="floatingToggle" title="Sembunyikan/tampilkan toolbar">▶</button>
    ${FLOATING_BODY_HTML}
  `;
  document.body.appendChild(ft);

  // Toggle collapse (docking hide/unhide di pinggir kanan)
  const toggleBtn = ft.querySelector("#floatingToggle");
  toggleBtn.addEventListener("mousedown", e => e.preventDefault());
  toggleBtn.addEventListener("click", e => {
    e.preventDefault();
    floatingCollapsed = !floatingCollapsed;
    ft.classList.toggle("is-collapsed", floatingCollapsed);
    toggleBtn.textContent = floatingCollapsed ? "◀" : "▶";
    toggleBtn.title = floatingCollapsed ? "Tampilkan toolbar" : "Sembunyikan toolbar";
  });

  // Highlight & textcolor buttons – special setup
  ft.querySelectorAll('[data-fcmd="highlight"]').forEach(btn => setupHighlightButton(btn));
  ft.querySelectorAll('[data-fcmd="textcolor"]').forEach(btn => setupTextColorButton(btn));
  ft.querySelectorAll('[data-fcmd="highlight-palette"]').forEach(setupPaletteCaret);
  ft.querySelectorAll('[data-fcmd="textcolor-palette"]').forEach(setupPaletteCaret);

  // Other buttons
  ft.querySelectorAll("button[data-fcmd]").forEach((btn) => {
    const cmd = btn.dataset.fcmd;
    if (cmd === "highlight" || cmd === "textcolor" || cmd === "highlight-palette" || cmd === "textcolor-palette") return;
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      dispatchCmd(cmd);
      updateFloatingToolbarState();
    });
  });

  ft.querySelectorAll('select[data-fcmd="fontsize"]').forEach(setupFontSizeSelect);

  return ft;
}

function dispatchCmd(cmd) {
  switch (cmd) {
    case "undo": undo(); break;
    case "redo": redo(); break;
    case "bold": exec("bold"); break;
    case "italic": exec("italic"); break;
    case "underline": exec("underline"); break;
    case "highlight": toggleHighlight(activeHighlightColor); editorEl.focus(); updateToolbarState(); updateFloatingToolbarState(); break;
    case "textcolor": applyTextColor(activeTextColor); break;
    case "sticky": insertStickyNote(); break;
    case "align-left": setAlignment("left"); break;
    case "align-center": setAlignment("center"); break;
    case "align-right": setAlignment("right"); break;
    case "align-justify": setAlignment("justify"); break;
    case "indent": changeIndent(1); break;
    case "outdent": changeIndent(-1); break;
    case "h2": insertHeading(2); break;
    case "h3": insertHeading(3); break;
    case "p": insertParagraph(); break;
    case "quote-line": insertQuote("line"); break;
    case "quote-eye": insertQuote("eye"); break;
    case "ul": toggleList(false); break;
    case "ol": toggleList(true); break;
    case "ol-restart": restartNumbering(); break;
    case "divider": insertDivider(); break;
    case "selectall": selectAllContent(); break;
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
  } else {
    // Desktop: tampilkan saat toolbar asli tergulir ke atas
    const toolbar = document.getElementById("editorToolbar");
    if (!toolbar) return;
    const rect = toolbar.getBoundingClientRect();
    floatingToolbarEl.classList.toggle("is-visible", rect.bottom < 0);
  }
  positionFloatingToolbarAboveKeyboard();
  updateFloatingToolbarState();
}

function positionFloatingToolbarAboveKeyboard() {
  if (!floatingToolbarEl) return;
  // Dock berada di pinggir kanan, diposisikan vertikal mengikuti area yang
  // benar-benar terlihat (visualViewport). Ini memastikan dock tidak pernah
  // tertutup keyboard virtual saat mobile, karena pusatnya selalu berada
  // di tengah area yang tersisa setelah keyboard muncul.
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const visibleCenter = vv.offsetTop + vv.height / 2;
    const safeMax = Math.max(120, vv.height - 24);
    floatingToolbarEl.style.top = visibleCenter + "px";
    floatingToolbarEl.style.maxHeight = safeMax + "px";
    const body = floatingToolbarEl.querySelector(".floating-toolbar__body");
    if (body) body.style.maxHeight = safeMax + "px";
  } else {
    floatingToolbarEl.style.top = "50%";
    floatingToolbarEl.style.maxHeight = "";
  }
}

// ---------- Selection bubble (Cut / Copy / Paste saat teks diblok) ----------
// Muncul mengambang di atas teks yang sedang diseleksi. Diperlukan karena
// klik-kanan di area editor sudah dipakai untuk membuka color palette
// (lihat setupEditorContextMenu), sehingga menu cut/copy/paste bawaan
// browser tidak muncul lagi di dalam editor.

let selectionBubbleEl = null;
let bubbleRange = null;

function saveBubbleSelection() {
  const sel = window.getSelection();
  if (sel.rangeCount) bubbleRange = sel.getRangeAt(0).cloneRange();
}

function restoreBubbleSelection() {
  if (!bubbleRange) return;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(bubbleRange);
}

function createSelectionBubble() {
  const el = document.createElement("div");
  el.className = "selection-bubble";
  el.id = "selectionBubble";
  el.innerHTML = `
    <button type="button" data-bubble="selectall" title="Pilih semua">▤ Semua</button>
    <span class="selection-bubble__sep"></span>
    <button type="button" data-bubble="cut" title="Potong">✂ Cut</button>
    <span class="selection-bubble__sep"></span>
    <button type="button" data-bubble="copy" title="Salin">⧉ Copy</button>
    <span class="selection-bubble__sep"></span>
    <button type="button" data-bubble="paste" title="Tempel">📋 Paste</button>
  `;
  document.body.appendChild(el);

  el.querySelectorAll("button[data-bubble]").forEach((btn) => {
    // mousedown di-preventDefault supaya seleksi/fokus editor tidak hilang
    // sebelum aksi cut/copy/paste sempat dijalankan.
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      handleBubbleAction(btn.dataset.bubble);
    });
  });

  return el;
}

async function handleBubbleAction(action) {
  editorEl.focus();

  if (action === "selectall") {
    selectAllContent();
    positionSelectionBubble();
    return;
  }

  restoreBubbleSelection();

  if (action === "copy") {
    const text = window.getSelection().toString();
    try { document.execCommand("copy"); } catch { /* lanjut ke fallback */ }
    if (text && navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    }
  } else if (action === "cut") {
    const text = window.getSelection().toString();
    try { document.execCommand("cut"); } catch { /* lanjut ke fallback */ }
    if (text && navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    }
    normalizeEmptyState();
    scheduleHistoryPush();
    triggerChange();
  } else if (action === "paste") {
    let pasted = false;
    if (navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          document.execCommand("insertText", false, text);
          pasted = true;
        }
      } catch { /* izin clipboard ditolak browser — coba fallback di bawah */ }
    }
    if (!pasted) {
      try { pasted = document.execCommand("paste"); } catch { /* ignore */ }
    }
    if (!pasted) {
      alert("Browser ini membatasi tombol Paste lewat JavaScript. Gunakan Ctrl+V (Cmd+V di Mac) untuk menempel.");
    }
    scheduleHistoryPush();
    triggerChange();
  }

  hideSelectionBubble();
  updateToolbarState();
  updateFloatingToolbarState();
}

function positionSelectionBubble() {
  if (!selectionBubbleEl) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) { hideSelectionBubble(); return; }

  const range = sel.getRangeAt(0);
  const text = sel.toString();
  const insideEditor = editorEl && editorEl.contains(range.startContainer);

  if (!insideEditor || range.collapsed || !text.trim()) {
    hideSelectionBubble();
    return;
  }

  // range.getBoundingClientRect() bisa mengembalikan rect kosong (0,0,0,0) di
  // beberapa browser (WebKit/iOS Safari) saat seleksi mencakup banyak baris/
  // paragraf sekaligus — inilah sebabnya bubble cut/copy/paste/select-all
  // menghilang saat teks yang diseleksi terlalu banyak. Fallback: ambil rect
  // per-baris lewat getClientRects() dan gunakan baris pertama yang valid.
  let rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 || r.height > 0);
    if (rects.length === 0) { hideSelectionBubble(); return; }
    rect = rects[0];
  }

  saveBubbleSelection();

  const left = Math.min(Math.max(80, rect.left + rect.width / 2), window.innerWidth - 80);
  const top = Math.max(8, rect.top - 46);
  selectionBubbleEl.style.left = left + "px";
  selectionBubbleEl.style.top = top + "px";
  selectionBubbleEl.classList.add("is-visible");
}

function hideSelectionBubble() {
  selectionBubbleEl?.classList.remove("is-visible");
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
  editorEl.innerHTML = initialHtml && initialHtml.trim() ? initialHtml : "<p><br></p>";
  sanitizeWhitespace(editorEl);

  // Pastikan setiap kali Enter ditekan browser membuat <p> baru (bukan <div>,
  // yang jadi default di sebagian browser) — supaya paragraf pertama SELALU
  // berupa <p> asli sejak awal mengetik, konsisten untuk semua catatan.
  try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch {}
  editorEl.addEventListener("focus", () => {
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch {}
  });

  history = [editorEl.innerHTML];
  historyIndex = 0;

  // Delegasi event sticky note (hapus & ganti warna)
  setupStickyDelegation();

  // Setup tombol toolbar utama
  const highlightBtn = containerEl.querySelector('[data-cmd="highlight"]');
  if (highlightBtn) setupHighlightButton(highlightBtn);

  const textColorBtn = containerEl.querySelector('[data-cmd="textcolor"]');
  if (textColorBtn) setupTextColorButton(textColorBtn);

  containerEl.querySelectorAll('[data-cmd="highlight-palette"]').forEach(setupPaletteCaret);
  containerEl.querySelectorAll('[data-cmd="textcolor-palette"]').forEach(setupPaletteCaret);

  containerEl.querySelectorAll(".editor-toolbar button[data-cmd]").forEach((btn) => {
    const cmd = btn.dataset.cmd;
    if (cmd === "highlight" || cmd === "textcolor" || cmd === "highlight-palette" || cmd === "textcolor-palette") return;
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      dispatchCmd(cmd);
    });
  });

  containerEl.querySelectorAll('.editor-toolbar select[data-cmd="fontsize"]').forEach(setupFontSizeSelect);

  // Klik kanan di area editor → buka color palette di posisi kursor
  setupEditorContextMenu();

  editorEl.addEventListener("input", () => {
    normalizeEmptyState();
    normalizeStrayDivs();
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

  // Selection bubble (Cut / Copy / Paste) — dibuat sekali, dipakai ulang
  if (!selectionBubbleEl) selectionBubbleEl = createSelectionBubble();
  editorEl.addEventListener("mouseup", positionSelectionBubble);
  editorEl.addEventListener("keyup", positionSelectionBubble);
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === editorEl || editorEl.contains(document.activeElement)) {
      positionSelectionBubble();
    } else {
      hideSelectionBubble();
    }
  });
  document.addEventListener("mousedown", (e) => {
    if (!selectionBubbleEl.contains(e.target)) hideSelectionBubble();
  });

  editorEl.addEventListener("keydown", (e) => {
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    if (ctrlOrCmd && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault(); undo();
    } else if (ctrlOrCmd && ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y")) {
      e.preventDefault(); redo();
    } else if (e.key === " " && !ctrlOrCmd && !e.altKey) {
      // Sebagian browser diam-diam mengganti spasi kedua/ketiga yang
      // berurutan jadi non-breaking space (&nbsp;) supaya tidak "hilang"
      // secara visual. Masalahnya &nbsp; TIDAK PERNAH menyusut walau CSS
      // white-space normal — di paragraf rata kanan-kiri (justify) ini
      // jadi jarak antar kata yang tiba-tiba sangat lebar, padahal tidak
      // ada kata panjang sama sekali. Dengan selalu memasukkan spasi biasa
      // secara eksplisit di sini, ini tidak akan terjadi lagi.
      e.preventDefault();
      document.execCommand("insertText", false, " ");
    }
  });

  editorEl.addEventListener("paste", handlePaste);

  editorEl.addEventListener("dragover", (e) => e.preventDefault());
  editorEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const progress = showGlobalUploadProgress();
      try {
        const url = await handleImageUpload(file, progress);
        if (url) {
          const figure = buildImageFigure(url, "full");
          insertNodeAtCursor(figure);
          scheduleHistoryPush();
          triggerChange();
        }
      } catch (err) {
        alert("Gagal mengunggah gambar: " + err.message);
      } finally {
        progress.remove();
      }
    }
  });

  updateUndoRedoButtons();

  // Floating toolbar
  floatingToolbarEl = createFloatingToolbar();
  window.addEventListener("scroll", checkFloatingToolbarVisibility, { passive: true });
  window.addEventListener("scroll", hideSelectionBubble, { passive: true });
  editorEl.addEventListener("keyup", updateFloatingToolbarState);
  editorEl.addEventListener("mouseup", updateFloatingToolbarState);

  // Sembunyikan selection bubble saat editor kehilangan fokus
  editorEl.addEventListener("blur", () => {
    setTimeout(() => {
      if (!selectionBubbleEl.matches(":hover")) hideSelectionBubble();
    }, 150);
  });

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
        // Aman merapikan spasi berlebih sekarang — user sudah benar-benar
        // berhenti mengetik di editor ini, jadi tidak akan mengganggu kursor.
        if (sanitizeWhitespace(editorEl)) triggerChange();
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
  if (!editorEl) return "";
  normalizeFirstBlock();
  return editorEl.innerHTML;
}

// Drop cap (huruf pertama besar+orange) di halaman baca menyasar elemen
// `p:first-of-type`. Kalau sebuah catatan ditulis TANPA menekan Enter dulu
// (langsung ngetik di baris pertama), browser bisa membiarkan teks itu
// sebagai teks polos (atau di dalam <div>, bukan <p>) sampai Enter pertama
// ditekan — akibatnya drop cap tidak muncul untuk catatan itu meski catatan
// lain (yang kebetulan mulai dengan Enter/paste yang sudah ber-<p>) normal.
// Fungsi ini menormalkan itu tepat sebelum disimpan: teks/`<div>` di awal
// yang belum terbungkus <p> akan dibungkus jadi <p> asli.
function normalizeFirstBlock() {
  const BLOCK_TAGS = new Set(["P","H2","H3","BLOCKQUOTE","UL","OL","FIGURE","DIV","HR"]);
  const firstNode = editorEl.firstChild;
  if (!firstNode) return;

  // Kasus 1: node pertama teks polos atau elemen inline (belum terbungkus blok apa pun)
  // → kumpulkan semua sibling sampai ketemu elemen blok berikutnya, lalu bungkus jadi <p>.
  const isBlock = (n) => n.nodeType === 1 && BLOCK_TAGS.has(n.tagName);
  if (!isBlock(firstNode)) {
    const p = document.createElement("p");
    let node = firstNode;
    while (node && !isBlock(node)) {
      const next = node.nextSibling;
      p.appendChild(node);
      node = next;
    }
    editorEl.insertBefore(p, node);
    return;
  }

  // Kasus 2: node pertama adalah <div> (bukan <p>) — beberapa browser memakai
  // <div> sebagai paragraf default saat Enter ditekan. Ubah jadi <p> asli
  // supaya cocok dengan selector p:first-of-type.
  if (firstNode.tagName === "DIV") {
    const p = document.createElement("p");
    p.innerHTML = firstNode.innerHTML;
    editorEl.replaceChild(p, firstNode);
  }
}
