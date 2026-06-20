// =========================================================
// NOTE PAGE — render satu catatan, share bar, komentar
// =========================================================

import { initApp, onAuthReady, currentUser, currentIsAdmin, showConfirm } from "./ui-shared.js";
import { getNote, getChapter, addComment, deleteComment, listenComments } from "./data.js";
import { auth, googleSignIn } from "./firebase-core.js";

function getNoteId() {
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

function formatWaktu(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

let note, chapter;

function renderShareBar() {
  const url = location.href;
  const title = note.judul;
  document.getElementById("shareBar").innerHTML = `
    <span class="share-bar__label">Bagikan:</span>
    <button class="share-btn" id="copyLinkBtn">salin tautan</button>
    <a class="share-btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(title + " — " + url)}">WhatsApp</a>
    <a class="share-btn" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}">X / Twitter</a>
    <a class="share-btn" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}">Facebook</a>
  `;
  document.getElementById("copyLinkBtn").addEventListener("click", async (e) => {
    await navigator.clipboard.writeText(url);
    const btn = e.target;
    const orig = btn.textContent;
    btn.textContent = "tersalin ✓";
    setTimeout(() => (btn.textContent = orig), 1800);
  });
}

function renderAuthArea() {
  const area = document.getElementById("authArea");
  if (!area) return;
  if (!auth) {
    area.innerHTML = `<p class="comments__signin-hint">Komentar belum aktif — konfigurasi Firebase terlebih dahulu.</p>`;
    return;
  }
  if (currentUser) {
    area.innerHTML = `
      <div class="user-chip">
        <img src="${currentUser.photoURL || ""}" alt="">
        <span>${currentUser.displayName}</span>
      </div>
    `;
    renderCommentForm();
  } else {
    area.innerHTML = `<button class="btn-google" id="signInBtn">Masuk dengan Google untuk berkomentar</button>`;
    document.getElementById("signInBtn").addEventListener("click", async () => {
      try { await googleSignIn(); } catch (err) { alert("Gagal masuk: " + err.message); }
    });
    const slot = document.getElementById("commentFormSlot");
    if (slot) slot.innerHTML = "";
  }
}

function renderCommentForm() {
  const slot = document.getElementById("commentFormSlot");
  if (!slot) return;
  slot.innerHTML = `
    <div class="comment-form">
      <textarea id="commentText" placeholder="Tulis tanggapanmu di sini..." maxlength="2000"></textarea>
      <div class="comment-form__row">
        <button class="btn btn-primary" id="submitCommentBtn">Kirim komentar</button>
      </div>
    </div>
  `;
  document.getElementById("submitCommentBtn").addEventListener("click", async () => {
    const textarea = document.getElementById("commentText");
    const btn = document.getElementById("submitCommentBtn");
    const text = textarea.value.trim();
    if (!text) return;
    btn.disabled = true;
    try {
      await addComment({
        noteId: note.id,
        uid: currentUser.uid,
        name: currentUser.displayName,
        photoURL: currentUser.photoURL || "",
        text,
      });
      textarea.value = "";
    } catch (err) {
      alert("Gagal mengirim komentar: " + err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

function renderComments(list) {
  const el = document.getElementById("commentList");
  if (!el) return;
  if (list.length === 0) {
    el.innerHTML = `<p class="comments__empty">Belum ada komentar. Jadilah yang pertama menanggapi.</p>`;
    return;
  }
  el.innerHTML = list.map((c) => `
    <div class="comment" data-comment-id="${c.id}">
      <img src="${c.photoURL || ""}" alt="" onerror="this.style.visibility='hidden'">
      <div class="comment__body">
        <div class="comment__header">
          <span class="comment__name">${escapeHtml(c.name || "Anonim")}</span>
          <span class="comment__time">${formatWaktu(c.createdAt)}</span>
          ${currentIsAdmin ? `<button class="comment__delete-btn btn-icon btn-danger btn" data-comment-id="${c.id}" title="Hapus komentar">🗑</button>` : ""}
        </div>
        <p class="comment__text">${escapeHtml(c.text || "")}</p>
      </div>
    </div>
  `).join("");

  // Pasang event listener hapus komentar (admin only)
  el.querySelectorAll(".comment__delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ok = await showConfirm("Hapus komentar ini? Komentar akan dipindahkan ke Trash.");
      if (!ok) return;
      try {
        await deleteComment(btn.dataset.commentId);
      } catch (err) {
        alert("Gagal menghapus: " + err.message);
      }
    });
  });
}

async function init() {
  const noteId = getNoteId();
  const root = document.getElementById("notePage");
  if (!noteId) {
    root.innerHTML = `<div class="empty-state">Catatan tidak ditemukan. <a href="index.html">Kembali</a></div>`;
    return;
  }
  try {
    note = await getNote(noteId);
  } catch (err) {
    root.innerHTML = `<div class="empty-state">Gagal memuat. ${err.message}</div>`;
    return;
  }
  if (!note) {
    root.innerHTML = `<div class="empty-state">Catatan tidak ditemukan. <a href="index.html">Kembali</a></div>`;
    return;
  }
  chapter = await getChapter(note.chapterId).catch(() => null);
  document.title = note.judul + " — Freedom of Mind";

  document.getElementById("breadcrumb").innerHTML = `
    <a href="index.html">← semua chapter</a>
    ${chapter ? ` · <a href="chapter.html?id=${chapter.id}">${escapeHtml(chapter.judul)}</a>` : ""}
  `;

  const tagsHtml = (note.tag || []).map((t) => `<span>#${escapeHtml(t)}</span>`).join(" ");

  root.innerHTML = `
    <div class="note-page__meta">
      <span>${formatTanggal(note.updatedAt)}</span>
      ${tagsHtml ? `<span>${tagsHtml}</span>` : ""}
    </div>
    <h1>${escapeHtml(note.judul)}</h1>
    <div class="note-content">${note.contentHtml || ""}</div>
    <div class="share-bar" id="shareBar"></div>
    <section class="comments">
      <h3>Tanggapan pembaca</h3>
      <div class="comments__auth" id="authArea"></div>
      <div id="commentFormSlot"></div>
      <div class="comment-list" id="commentList"></div>
    </section>
  `;

  renderShareBar();
  renderAuthArea();
  listenComments(note.id, renderComments, (err) => {
    document.getElementById("commentList").innerHTML = `<p class="comments__empty">Gagal memuat komentar: ${err.message}</p>`;
  });
}

(async () => {
  await initApp();
  onAuthReady(() => { renderAuthArea(); });
  await init();
})();


function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatTanggal(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function formatWaktu(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

let note, chapter;

function renderShareBar() {
  const url = location.href;
  const title = note.judul;
  document.getElementById("shareBar").innerHTML = `
    <span class="share-bar__label">Bagikan:</span>
    <button class="share-btn" id="copyLinkBtn">salin tautan</button>
    <a class="share-btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(title + " — " + url)}">WhatsApp</a>
    <a class="share-btn" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}">X / Twitter</a>
    <a class="share-btn" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}">Facebook</a>
  `;
  document.getElementById("copyLinkBtn").addEventListener("click", async (e) => {
    await navigator.clipboard.writeText(url);
    const btn = e.target;
    const orig = btn.textContent;
    btn.textContent = "tersalin ✓";
    setTimeout(() => (btn.textContent = orig), 1800);
  });
}

function renderAuthArea() {
  const area = document.getElementById("authArea");
  if (!area) return;
  if (!auth) {
    area.innerHTML = `<p class="comments__signin-hint">Komentar belum aktif — konfigurasi Firebase terlebih dahulu.</p>`;
    return;
  }
  if (currentUser) {
    area.innerHTML = `
      <div class="user-chip">
        <img src="${currentUser.photoURL || ""}" alt="">
        <span>${currentUser.displayName}</span>
      </div>
    `;
    renderCommentForm();
  } else {
    area.innerHTML = `<button class="btn-google" id="signInBtn">Masuk dengan Google untuk berkomentar</button>`;
    document.getElementById("signInBtn").addEventListener("click", async () => {
      try { await googleSignIn(); } catch (err) { alert("Gagal masuk: " + err.message); }
    });
    const slot = document.getElementById("commentFormSlot");
    if (slot) slot.innerHTML = "";
  }
}

function renderCommentForm() {
  const slot = document.getElementById("commentFormSlot");
  if (!slot) return;
  slot.innerHTML = `
    <div class="comment-form">
      <textarea id="commentText" placeholder="Tulis tanggapanmu di sini..." maxlength="2000"></textarea>
      <div class="comment-form__row">
        <button class="btn btn-primary" id="submitCommentBtn">Kirim komentar</button>
      </div>
    </div>
  `;
  document.getElementById("submitCommentBtn").addEventListener("click", async () => {
    const textarea = document.getElementById("commentText");
    const btn = document.getElementById("submitCommentBtn");
    const text = textarea.value.trim();
    if (!text) return;
    btn.disabled = true;
    try {
      await addComment({
        noteId: note.id,
        uid: currentUser.uid,
        name: currentUser.displayName,
        photoURL: currentUser.photoURL || "",
        text,
      });
      textarea.value = "";
    } catch (err) {
      alert("Gagal mengirim komentar: " + err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

function renderComments(list) {
  const el = document.getElementById("commentList");
  if (!el) return;
  if (list.length === 0) {
    el.innerHTML = `<p class="comments__empty">Belum ada komentar. Jadilah yang pertama menanggapi.</p>`;
    return;
  }
  el.innerHTML = list.map((c) => `
    <div class="comment">
      <img src="${c.photoURL || ""}" alt="" onerror="this.style.visibility='hidden'">
      <div class="comment__body">
        <span class="comment__name">${escapeHtml(c.name || "Anonim")}</span>
        <span class="comment__time">${formatWaktu(c.createdAt)}</span>
        <p class="comment__text">${escapeHtml(c.text || "")}</p>
      </div>
    </div>
  `).join("");
}

async function init() {
  const noteId = getNoteId();
  const root = document.getElementById("notePage");
  if (!noteId) {
    root.innerHTML = `<div class="empty-state">Catatan tidak ditemukan. <a href="index.html">Kembali</a></div>`;
    return;
  }
  try {
    note = await getNote(noteId);
  } catch (err) {
    root.innerHTML = `<div class="empty-state">Gagal memuat. ${err.message}</div>`;
    return;
  }
  if (!note) {
    root.innerHTML = `<div class="empty-state">Catatan tidak ditemukan. <a href="index.html">Kembali</a></div>`;
    return;
  }
  chapter = await getChapter(note.chapterId).catch(() => null);
  document.title = note.judul + " — Freedom of Mind";

  document.getElementById("breadcrumb").innerHTML = `
    <a href="index.html">← semua chapter</a>
    ${chapter ? ` · <a href="chapter.html?id=${chapter.id}">${escapeHtml(chapter.judul)}</a>` : ""}
  `;

  const tagsHtml = (note.tag || []).map((t) => `<span>#${escapeHtml(t)}</span>`).join(" ");

  root.innerHTML = `
    <div class="note-page__meta">
      <span>${formatTanggal(note.updatedAt)}</span>
      ${tagsHtml ? `<span>${tagsHtml}</span>` : ""}
    </div>
    <h1>${escapeHtml(note.judul)}</h1>
    <div class="note-content">${note.contentHtml || ""}</div>
    <div class="share-bar" id="shareBar"></div>
    <section class="comments">
      <h3>Tanggapan pembaca</h3>
      <div class="comments__auth" id="authArea"></div>
      <div id="commentFormSlot"></div>
      <div class="comment-list" id="commentList"></div>
    </section>
  `;

  renderShareBar();
  renderAuthArea();
  listenComments(note.id, renderComments, (err) => {
    document.getElementById("commentList").innerHTML = `<p class="comments__empty">Gagal memuat komentar: ${err.message}</p>`;
  });
}

(async () => {
  await initApp();
  onAuthReady(() => { renderAuthArea(); });
  await init();
})();
