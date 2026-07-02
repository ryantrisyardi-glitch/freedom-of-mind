// =========================================================
// DATA LAYER — semua operasi baca/tulis ke Firestore
// Koleksi:
//   chapters: { id, judul, deskripsi, gambar, tagline, urutan, createdAt, deletedAt }
//   notes:    { id, chapterId, judul, contentHtml, tag[], urutan, createdAt, updatedAt, deletedAt }
//   comments: { id, noteId, uid, name, photoURL, text, createdAt }
//   admins:   { id = email, addedBy, addedAt }
//
// Soft delete: deletedAt == null  -> aktif (tampil normal)
//              deletedAt = waktu  -> di Trash (masih ada, bisa di-restore)
// Penghapusan permanen hanya terjadi lewat fungsi *Forever(), dipanggil
// manual oleh admin dari halaman Trash.
// =========================================================

import { db } from "./firebase-core.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const QUICK_NOTES_NAME = "Quick Notes";

// ---------- Chapters ----------

/** Hanya chapter aktif (belum dihapus), diurutkan. Filter deletedAt di klien
 *  supaya tidak butuh composite index tambahan di Firestore. */
export async function getAllChapters() {
  const snap = await getDocs(query(collection(db, "chapters"), orderBy("urutan", "asc")));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => !c.deletedAt);
}

export async function getTrashedChapters() {
  const snap = await getDocs(collection(db, "chapters"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => !!c.deletedAt);
}

export async function getChapter(chapterId) {
  const snap = await getDoc(doc(db, "chapters", chapterId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createChapter({ judul, deskripsi, gambar, tagline }) {
  const all = await getAllChapters();
  const maxUrutan = all.reduce((m, c) => Math.max(m, c.urutan || 0), 0);
  return addDoc(collection(db, "chapters"), {
    judul,
    deskripsi: deskripsi || "",
    gambar: gambar || "",
    tagline: tagline || "",
    urutan: maxUrutan + 1,
    createdAt: serverTimestamp(),
    deletedAt: null,
  });
}

export async function updateChapter(chapterId, data) {
  return updateDoc(doc(db, "chapters", chapterId), data);
}

/**
 * Mencari (atau membuat jika belum ada) chapter "Quick Notes" —
 * tujuan default saat catatan dipindahkan keluar dari chapter yang dihapus.
 */
export async function getOrCreateQuickNotesChapter() {
  const all = await getAllChapters();
  const existing = all.find((c) => c.judul === QUICK_NOTES_NAME);
  if (existing) return existing;
  const ref = await createChapter({
    judul: QUICK_NOTES_NAME,
    deskripsi: "Catatan tanpa bagian khusus.",
  });
  return { id: ref.id, judul: QUICK_NOTES_NAME, deskripsi: "Catatan tanpa bagian khusus." };
}

/**
 * Soft-delete sebuah chapter.
 * mode "moveNotes": catatan di dalamnya dipindah ke Quick Notes, lalu chapter masuk Trash.
 * mode "trashNotes": catatan di dalamnya ikut di-soft-delete (masuk Trash juga).
 */
export async function deleteChapter(chapterId, mode = "moveNotes") {
  const notes = await getNotesByChapter(chapterId);

  if (mode === "moveNotes" && notes.length > 0) {
    const quickNotes = await getOrCreateQuickNotesChapter();
    await Promise.all(
      notes.map((n) => updateDoc(doc(db, "notes", n.id), { chapterId: quickNotes.id, updatedAt: serverTimestamp() }))
    );
  } else if (mode === "trashNotes" && notes.length > 0) {
    await Promise.all(
      notes.map((n) => updateDoc(doc(db, "notes", n.id), { deletedAt: serverTimestamp() }))
    );
  }

  return updateDoc(doc(db, "chapters", chapterId), { deletedAt: serverTimestamp() });
}

export async function restoreChapter(chapterId) {
  return updateDoc(doc(db, "chapters", chapterId), { deletedAt: null });
}

export async function deleteChapterForever(chapterId) {
  return deleteDoc(doc(db, "chapters", chapterId));
}

// ---------- Notes ----------

export async function getNotesByChapter(chapterId) {
  const snap = await getDocs(
    query(collection(db, "notes"), where("chapterId", "==", chapterId), orderBy("urutan", "asc"))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((n) => !n.deletedAt && (n.status === "published" || !n.status));
}

export async function getAllNotes() {
  const snap = await getDocs(query(collection(db, "notes"), orderBy("updatedAt", "desc")));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((n) => !n.deletedAt);
}

export async function getTrashedNotes() {
  const snap = await getDocs(collection(db, "notes"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((n) => !!n.deletedAt);
}

export async function getNote(noteId) {
  const snap = await getDoc(doc(db, "notes", noteId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createNote({ chapterId, judul, tag }) {
  const existing = await getNotesByChapter(chapterId);
  const maxUrutan = existing.reduce((m, n) => Math.max(m, n.urutan || 0), 0);
  return addDoc(collection(db, "notes"), {
    chapterId,
    judul: judul || "Catatan baru",
    tag: tag || [],
    contentHtml: "",
    status: "draft",
    urutan: maxUrutan + 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deletedAt: null,
  });
}

export async function updateNote(noteId, data) {
  return updateDoc(doc(db, "notes", noteId), { ...data, updatedAt: serverTimestamp() });
}

/** Soft-delete: masuk Trash, belum benar-benar hilang. */
export async function deleteNote(noteId) {
  return updateDoc(doc(db, "notes", noteId), { deletedAt: serverTimestamp() });
}

export async function restoreNote(noteId) {
  return updateDoc(doc(db, "notes", noteId), { deletedAt: null });
}

/** Penghapusan permanen — hanya dipanggil manual dari halaman Trash. */
export async function deleteNoteForever(noteId) {
  return deleteDoc(doc(db, "notes", noteId));
}

export async function moveNoteToChapter(noteId, newChapterId) {
  return updateDoc(doc(db, "notes", noteId), { chapterId: newChapterId, updatedAt: serverTimestamp() });
}

/** Publish: ubah status menjadi 'published' dan catat waktu publish */
export async function publishNote(noteId) {
  return updateDoc(doc(db, "notes", noteId), {
    status: "published",
    publishedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Kembali ke draft: ubah status menjadi 'draft' */
export async function unpublishNote(noteId) {
  return updateDoc(doc(db, "notes", noteId), {
    status: "draft",
    updatedAt: serverTimestamp(),
  });
}

/**
 * Ambil semua notes dalam chapter untuk ADMIN (termasuk draft).
 * Untuk pembaca biasa, gunakan getNotesByChapter yang hanya mengembalikan published.
 */
export async function getNotesByChapterForAdmin(chapterId) {
  const snap = await getDocs(
    query(collection(db, "notes"), where("chapterId", "==", chapterId), orderBy("urutan", "asc"))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((n) => !n.deletedAt);
}

// ---------- Cloudinary Upload ----------

export async function uploadToCloudinary(file) {
  const cfg = window.CLOUDINARY_CONFIG;
  if (!cfg || cfg.cloudName === "GANTI_CLOUD_NAME") {
    throw new Error("Cloudinary belum dikonfigurasi. Lihat README.md.");
  }
  if (file.size > 8 * 1024 * 1024) throw new Error("Ukuran gambar maksimal 8 MB.");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", cfg.uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, {
    method: "POST", body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Upload gagal");
  return data.secure_url;
}

// ---------- Comments ----------

export async function addComment({ noteId, uid, name, photoURL, text }) {
  return addDoc(collection(db, "comments"), {
    noteId,
    uid,
    name,
    photoURL: photoURL || "",
    text,
    createdAt: serverTimestamp(),
    deletedAt: null,
  });
}

export async function deleteComment(commentId) {
  return updateDoc(doc(db, "comments", commentId), { deletedAt: serverTimestamp() });
}

export function listenComments(noteId, onChange, onError) {
  const q = query(collection(db, "comments"), where("noteId", "==", noteId), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(c => !c.deletedAt)), onError);
}

// ---------- Admins ----------

export async function getAllAdmins() {
  const snap = await getDocs(collection(db, "admins"));
  return snap.docs.map((d) => d.id);
}

export async function addAdmin(email, addedBy) {
  return setDoc(doc(db, "admins", email.toLowerCase()), {
    addedBy,
    addedAt: serverTimestamp(),
  });
}

export async function removeAdmin(email) {
  return deleteDoc(doc(db, "admins", email.toLowerCase()));
}

// =========================================================
// READERS — siapa saja yang membaca (hanya yang login)
// Dokumen: readers/{uid}
// Fields: uid, name, email, photoURL, lastSeen, lastPage,
//         lastPath, pages (map of path → true)
// =========================================================

export async function getAllReaders() {
  const snap = await getDocs(
    query(collection(db, "readers"), orderBy("lastSeen", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deleteReader(uid) {
  await deleteDoc(doc(db, "readers", uid));
}

// =========================================================
// PAGE VIEWS — statistik kunjungan (semua pengunjung termasuk anonim)
// Dokumen: pageViews/{YYYY-MM-DD_pageKey}
// =========================================================

export async function getPageViewStats(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = startDate.toISOString().slice(0, 10);
  const snap = await getDocs(
    query(collection(db, "pageViews"), where("date", ">=", startStr), orderBy("date", "desc"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getPopularPages(limitN = 15) {
  const snap = await getDocs(
    query(collection(db, "pageViews"), orderBy("views", "desc"), limit(limitN * 5))
  );
  const byPath = {};
  snap.docs.forEach(d => {
    const v = d.data();
    if (!byPath[v.path]) {
      byPath[v.path] = { path: v.path, title: v.title, type: v.type || "other",
        views: 0, uniqueVisitors: 0, totalReadSeconds: 0, readSessions: 0 };
    }
    byPath[v.path].views            += v.views             || 0;
    byPath[v.path].uniqueVisitors   += v.uniqueVisitors    || 0;
    byPath[v.path].totalReadSeconds += v.totalReadSeconds  || 0;
    byPath[v.path].readSessions     += v.readSessions      || 0;
    // Prefer non-fallback title (yang sudah diupdate oleh updateAnalyticsTitle)
    if (v.title && v.title.length > 3 && !v.title.startsWith("chapter ") && !v.title.startsWith("note ")) {
      byPath[v.path].title = v.title;
    }
  });
  return Object.values(byPath).sort((a, b) => b.views - a.views).slice(0, limitN);
}

export { increment };
