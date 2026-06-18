// =========================================================
// EDITOR — WYSIWYG ringan berbasis contenteditable
// Toolbar: Bold, Italic, Underline, Heading, Quote, Highlight,
// Bullet list, Insert image (kiri/kanan/tengah/full), Insert divider.
// =========================================================

import { storage } from "./firebase-core.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

let editorEl = null;
let onChangeCallback = null;

function exec(command, value = null) {
  document.execCommand(command, false, value);
  editorEl.focus();
  triggerChange();
}

function triggerChange() {
  if (onChangeCallback) onChangeCallback(editorEl.innerHTML);
}

function wrapSelectionWithHighlight() {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const mark = document.createElement("mark");
  mark.appendChild(range.extractContents());
  range.insertNode(mark);
  sel.removeAllRanges();
  triggerChange();
}

function insertHeading(level) {
  exec("formatBlock", `<h${level}>`);
}

function insertParagraph() {
  exec("formatBlock", "<p>");
}

function insertQuote() {
  exec("formatBlock", "<blockquote>");
}

function insertDivider() {
  const hr = document.createElement("div");
  hr.className = "divider";
  hr.contentEditable = "false";
  hr.textContent = "• • •";
  insertNodeAtCursor(hr);
  insertNodeAtCursor(document.createElement("p"));
  triggerChange();
}

function insertNodeAtCursor(node) {
  const sel = window.getSelection();
  if (!sel.rangeCount) {
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
 * position: "left" | "right" | "center" | "full"
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
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      figure.className = `img-pos-${pos}`;
      figure.dataset.position = pos;
      controls.querySelectorAll(".img-controls__btn").forEach((b) =>
        b.classList.toggle("is-active", b.dataset.pos === pos)
      );
      triggerChange();
    });
    controls.appendChild(btn);
  });
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "img-controls__btn img-controls__btn--remove";
  removeBtn.title = "Hapus gambar";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    figure.remove();
    triggerChange();
  });
  controls.appendChild(removeBtn);
  figure.appendChild(controls);

  return figure;
}

async function handleImageUpload(file) {
  if (!storage) {
    alert("Penyimpanan gambar belum aktif — konfigurasi Firebase terlebih dahulu.");
    return null;
  }
  const path = `notes-images/${Date.now()}-${file.name}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file);
  return getDownloadURL(fileRef);
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
      triggerChange();
    } catch (err) {
      alert("Gagal mengunggah gambar: " + err.message);
    } finally {
      toolbar?.classList.remove("is-busy");
    }
  });
  input.click();
}

const TOOLBAR_HTML = `
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
    <button data-cmd="quote" title="Kutipan">"</button>
  </div>
  <div class="toolbar-group">
    <button data-cmd="ul" title="Daftar berpoin">• List</button>
    <button data-cmd="divider" title="Pembatas">⋯</button>
  </div>
  <div class="toolbar-group">
    <span class="toolbar-label">Sisipkan gambar:</span>
    <button data-cmd="img-left" title="Gambar di kiri, teks di kanan">⇤ Kiri</button>
    <button data-cmd="img-right" title="Gambar di kanan, teks di kiri">Kanan ⇥</button>
    <button data-cmd="img-center" title="Gambar di tengah">⇔ Tengah</button>
    <button data-cmd="img-full" title="Gambar lebar penuh">⬜ Penuh</button>
  </div>
`;

/**
 * Inisialisasi editor pada elemen tertentu.
 * @param {HTMLElement} containerEl - elemen yang akan diisi toolbar + area edit
 * @param {string} initialHtml - konten awal
 * @param {function} onChange - callback(html) setiap kali ada perubahan
 */
export function initEditor(containerEl, initialHtml, onChange) {
  onChangeCallback = onChange;
  containerEl.innerHTML = `
    <div class="editor-toolbar" id="editorToolbar">${TOOLBAR_HTML}</div>
    <div class="editor-area" id="editorArea" contenteditable="true"></div>
  `;
  editorEl = containerEl.querySelector("#editorArea");
  editorEl.innerHTML = initialHtml || "<p>Mulai menulis di sini...</p>";

  containerEl.querySelectorAll(".editor-toolbar button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      switch (cmd) {
        case "bold": exec("bold"); break;
        case "italic": exec("italic"); break;
        case "underline": exec("underline"); break;
        case "highlight": wrapSelectionWithHighlight(); break;
        case "h2": insertHeading(2); break;
        case "h3": insertHeading(3); break;
        case "p": insertParagraph(); break;
        case "quote": insertQuote(); break;
        case "ul": exec("insertUnorderedList"); break;
        case "divider": insertDivider(); break;
        case "img-left": insertImage("left"); break;
        case "img-right": insertImage("right"); break;
        case "img-center": insertImage("center"); break;
        case "img-full": insertImage("full"); break;
      }
    });
  });

  editorEl.addEventListener("input", triggerChange);

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
          triggerChange();
        }
      } catch (err) {
        alert("Gagal mengunggah gambar: " + err.message);
      }
    }
  });

  return editorEl;
}

export function getEditorHtml() {
  return editorEl ? editorEl.innerHTML : "";
}
