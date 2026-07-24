// =========================================================
// NOTE PAGE — render satu catatan, share bar, komentar
// =========================================================

import { initAnalytics, updateAnalyticsTitle, getVisitorLocation } from "./analytics.js";
import { initApp, onAuthReady, currentUser, currentIsAdmin, showConfirm } from "./ui-shared.js";
import { getNote, getChapter, addComment, deleteComment, listenComments, publishNote, unpublishNote } from "./data.js";
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
        <span>${escapeHtml(currentUser.displayName)}</span>
      </div>
    `;
  } else {
    area.innerHTML = `
      <p class="comments__signin-hint">
        Berkomentar sebagai tamu di bawah, atau
        <button class="btn-google-inline" id="signInBtn">masuk dengan Google</button> supaya nama & fotomu tersimpan.
      </p>
    `;
    document.getElementById("signInBtn")?.addEventListener("click", async () => {
      try { await googleSignIn(); } catch (err) { alert("Gagal masuk: " + err.message); }
    });
  }
  renderCommentForm();
}

function getGuestName() {
  try { return localStorage.getItem("fom-guest-name") || ""; } catch { return ""; }
}
function setGuestName(name) {
  try { localStorage.setItem("fom-guest-name", name); } catch { /* abaikan */ }
}

function renderCommentForm() {
  const slot = document.getElementById("commentFormSlot");
  if (!slot) return;
  const isGuest = !currentUser;
  slot.innerHTML = `
    <div class="comment-form">
      ${isGuest ? `<input type="text" id="commentGuestName" class="comment-form__name" placeholder="Nama kamu (boleh nama panggilan)" maxlength="60" value="${escapeHtml(getGuestName())}">` : ""}
      <textarea id="commentText" placeholder="Tulis tanggapanmu di sini..." maxlength="2000"></textarea>
      <div class="comment-form__row">
        <button class="btn btn-primary" id="submitCommentBtn">Kirim komentar</button>
        ${isGuest ? `<span class="comment-form__hint">Dikirim sebagai tamu — lokasi kota/negara (dari IP) ikut tersimpan untuk statistik.</span>` : ""}
      </div>
    </div>
  `;
  document.getElementById("submitCommentBtn").addEventListener("click", async () => {
    const textarea = document.getElementById("commentText");
    const nameInput = document.getElementById("commentGuestName");
    const btn = document.getElementById("submitCommentBtn");
    const text = textarea.value.trim();
    if (!text) return;

    let name = currentUser ? currentUser.displayName : (nameInput?.value.trim() || "Tamu");
    if (isGuest && nameInput) setGuestName(nameInput.value.trim());

    btn.disabled = true;
    btn.textContent = "Mengirim…";
    try {
      const location = await getVisitorLocation().catch(() => null);
      await addComment({
        noteId: note.id,
        uid: currentUser ? currentUser.uid : null,
        name,
        photoURL: currentUser ? (currentUser.photoURL || "") : "",
        text,
        location,
      });
      textarea.value = "";
    } catch (err) {
      alert("Gagal mengirim komentar: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Kirim komentar";
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
      ${c.photoURL
        ? `<img src="${c.photoURL}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'comment__avatar-fallback',textContent:'👤'}))">`
        : `<div class="comment__avatar-fallback">👤</div>`}
      <div class="comment__body">
        <div class="comment__header">
          <span class="comment__name">${escapeHtml(c.name || "Anonim")}</span>
          ${!c.uid ? `<span class="comment__guest-badge">Tamu</span>` : ""}
          <span class="comment__time">${formatWaktu(c.createdAt)}</span>
          ${currentIsAdmin ? `<button class="comment__delete-btn btn-icon btn-danger btn" data-comment-id="${c.id}" title="Hapus komentar">🗑</button>` : ""}
        </div>
        <p class="comment__text">${escapeHtml(c.text || "")}</p>
      </div>
    </div>
  `).join("");

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

  const isDraft = note.status === "draft" || !note.status;

  // Blokir akses pembaca jika masih draft
  if (isDraft && !currentIsAdmin) {
    root.innerHTML = `
      <div class="empty-state">
        <div style="font-size:2rem;margin-bottom:12px;">🔒</div>
        <p>Tulisan ini belum dipublikasikan dan tidak tersedia untuk umum.</p>
        <p><a href="index.html">← Kembali ke beranda</a></p>
      </div>`;
    return;
  }

  chapter = await getChapter(note.chapterId).catch(() => null);
  document.title = note.judul + " — Freedom of Mind";
  updateAnalyticsTitle(note.judul);
  if (window.gtag) window.gtag("event", "view_note", { note_title: note.judul, note_id: noteId });

  document.getElementById("breadcrumb").innerHTML = `
    <a href="index.html">← semua chapter</a>
    ${chapter ? ` · <a href="chapter.html?id=${chapter.id}">${escapeHtml(chapter.judul)}</a>` : ""}
  `;

  const tagsHtml = (note.tag || []).map((t) => `<span>#${escapeHtml(t)}</span>`).join(" ");

  // Draft banner untuk admin
  const draftBannerHtml = isDraft && currentIsAdmin ? `
    <div class="draft-banner" id="draftBanner">
      <span class="draft-banner__icon">📝</span>
      <span class="draft-banner__text">
        Ini adalah <strong>preview draft</strong> — tulisan belum tayang untuk publik.
      </span>
      <div class="draft-banner__actions">
        <a class="btn" href="editor.html?id=${note.id}">✎ Edit</a>
        <button class="btn btn-publish" id="quickPublishBtn">Publish →</button>
      </div>
    </div>
  ` : "";

  // Edit/publish shortcut bar untuk admin pada note yang sudah published
  const adminBarHtml = !isDraft && currentIsAdmin ? `
    <div class="draft-banner" style="background:#f2f9f2;border-color:#b8d8b8;color:#4a6a4a;" id="adminBar">
      <span class="draft-banner__icon">🌿</span>
      <span class="draft-banner__text">Tulisan ini sudah <strong>Published</strong> dan tampil ke publik.</span>
      <div class="draft-banner__actions">
        <a class="btn" href="editor.html?id=${note.id}">✎ Edit</a>
        <button class="btn btn-unpublish" id="quickUnpublishBtn">↩ Ke Draft</button>
      </div>
    </div>
  ` : "";

  root.innerHTML = `
    ${draftBannerHtml}
    ${adminBarHtml}
    <div class="note-page__meta">
      <span>${formatTanggal(note.publishedAt || note.createdAt)}</span>
      ${tagsHtml ? `<span>${tagsHtml}</span>` : ""}
    </div>
    <h1>${escapeHtml(note.judul)}</h1>
    <div class="note-content">${note.contentHtml || ""}</div>
    ${!isDraft ? `
    <div class="share-bar" id="shareBar"></div>
    <section class="comments">
      <h3>Tanggapan pembaca</h3>
      <div class="comments__auth" id="authArea"></div>
      <div id="commentFormSlot"></div>
      <div class="comment-list" id="commentList"></div>
    </section>` : ""}
  `;

  // Handler quick publish dari banner
  document.getElementById("quickPublishBtn")?.addEventListener("click", async (e) => {
    const btn = e.target;
    btn.disabled = true; btn.textContent = "Mempublish…";
    try {
      await publishNote(note.id);
      note.status = "published";
      // Reload halaman agar tampilan berubah ke mode published
      location.reload();
    } catch (err) {
      alert("Gagal publish: " + err.message);
      btn.disabled = false; btn.textContent = "Publish →";
    }
  });

  // Handler quick unpublish dari banner
  document.getElementById("quickUnpublishBtn")?.addEventListener("click", async (e) => {
    const btn = e.target;
    btn.disabled = true; btn.textContent = "Memproses…";
    try {
      await unpublishNote(note.id);
      note.status = "draft";
      location.reload();
    } catch (err) {
      alert("Gagal: " + err.message);
      btn.disabled = false; btn.textContent = "↩ Ke Draft";
    }
  });

  if (!isDraft) {
    renderShareBar();
    renderAuthArea();
    listenComments(note.id, renderComments, (err) => {
      document.getElementById("commentList").innerHTML = `<p class="comments__empty">Gagal memuat komentar: ${err.message}</p>`;
    });
  }
}

(async () => {
  await initApp();
  initAnalytics();
  onAuthReady(() => {
    renderAuthArea();
    init();
  });
})();
