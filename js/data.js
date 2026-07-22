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
  Timestamp,
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

/**
 * Publish: ubah status menjadi 'published' dan catat waktu publish.
 * publishDate opsional: Date/string yang dipilih editor secara manual.
 * Jika tidak diisi, gunakan waktu publish sekarang (server time).
 */
export async function publishNote(noteId, publishDate) {
  const publishedAt = publishDate ? Timestamp.fromDate(new Date(publishDate)) : serverTimestamp();
  return updateDoc(doc(db, "notes", noteId), {
    status: "published",
    publishedAt,
    updatedAt: serverTimestamp(),
  });
}

/** Ubah tanggal publish yang sudah ada (tanpa mengubah status). */
export async function setPublishedDate(noteId, publishDate) {
  return updateDoc(doc(db, "notes", noteId), {
    publishedAt: Timestamp.fromDate(new Date(publishDate)),
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

/**
 * Upload gambar ke Cloudinary.
 * @param {File} file
 * @param {(percent:number)=>void} [onProgress] - dipanggil berkala dengan angka 0-100
 *   selama proses unggah berlangsung (dipakai untuk progress bar di UI).
 */
export function uploadToCloudinary(file, onProgress) {
  const cfg = window.CLOUDINARY_CONFIG;
  if (!cfg || cfg.cloudName === "GANTI_CLOUD_NAME") {
    return Promise.reject(new Error("Cloudinary belum dikonfigurasi. Lihat README.md."));
  }
  if (file.size > 8 * 1024 * 1024) {
    return Promise.reject(new Error("Ukuran gambar maksimal 8 MB."));
  }

  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", cfg.uploadPreset);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`);

    xhr.upload.addEventListener("progress", (e) => {
      if (!onProgress) return;
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.onload = () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(data.secure_url);
      } else {
        reject(new Error(data.error?.message || "Upload gagal"));
      }
    };
    xhr.onerror = () => reject(new Error("Upload gagal — periksa koneksi internet."));
    xhr.send(fd);
  });
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

// =========================================================
// BACKUP & RESTORE — seluruh chapter + catatan (publish, draft,
// maupun yang ada di Trash), untuk jaga-jaga kalau Firestore
// bermasalah / ter-hack / terhapus tanpa sengaja.
// =========================================================

/** Ambil SEMUA chapter apa adanya (termasuk yang di Trash), tanpa filter. */
async function getAllChaptersRaw() {
  const snap = await getDocs(collection(db, "chapters"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Ambil SEMUA catatan apa adanya (draft, published, maupun di Trash). */
async function getAllNotesRaw() {
  const snap = await getDocs(collection(db, "notes"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Firestore Timestamp tidak bisa langsung disimpan sebagai JSON — dikonversi
// dulu ke penanda { __ts__: "<ISO string>" }, dan dikembalikan lagi jadi
// Timestamp asli saat restore.
function serializeForBackup(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "object" && typeof value.toDate === "function") {
    return { __ts__: value.toDate().toISOString() };
  }
  if (Array.isArray(value)) return value.map(serializeForBackup);
  if (typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value)) out[k] = serializeForBackup(value[k]);
    return out;
  }
  return value;
}

function deserializeFromBackup(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(deserializeFromBackup);
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === "__ts__") {
      return Timestamp.fromDate(new Date(value.__ts__));
    }
    const out = {};
    for (const k of keys) out[k] = deserializeFromBackup(value[k]);
    return out;
  }
  return value;
}

/**
 * Buat satu snapshot backup lengkap (semua chapter + semua catatan, apa pun
 * statusnya) dalam bentuk objek yang siap di-JSON.stringify dan diunduh.
 */
export async function backupAllData() {
  const [chapters, notes] = await Promise.all([getAllChaptersRaw(), getAllNotesRaw()]);
  return {
    app: "freedom-of-mind",
    kind: "full-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    counts: { chapters: chapters.length, notes: notes.length },
    chapters: serializeForBackup(chapters),
    notes: serializeForBackup(notes),
  };
}

/**
 * Pulihkan chapter + catatan dari objek backup (hasil backupAllData / file
 * JSON yang diunduh sebelumnya). Setiap dokumen ditulis kembali dengan ID
 * ASLI-nya (setDoc replace penuh, bukan merge), jadi persis seperti kondisi
 * saat backup dibuat. Dokumen yang saat ini ada di Firestore tapi TIDAK ada
 * di file backup TIDAK disentuh/dihapus — restore ini bersifat menambah &
 * menimpa berdasarkan ID, bukan mengganti seluruh koleksi.
 * onProgress(done, total) dipanggil setelah tiap dokumen selesai ditulis.
 */
export async function restoreAllData(backup, onProgress) {
  if (!backup || !Array.isArray(backup.chapters) || !Array.isArray(backup.notes)) {
    throw new Error("Format file backup tidak dikenali (harus hasil dari fitur Backup di sini).");
  }
  const total = backup.chapters.length + backup.notes.length;
  let done = 0;

  for (const c of backup.chapters) {
    const { id, ...rest } = c;
    if (!id) continue;
    await setDoc(doc(db, "chapters", id), deserializeFromBackup(rest));
    done++;
    if (onProgress) onProgress(done, total);
  }
  for (const n of backup.notes) {
    const { id, ...rest } = n;
    if (!id) continue;
    await setDoc(doc(db, "notes", id), deserializeFromBackup(rest));
    done++;
    if (onProgress) onProgress(done, total);
  }

  return { chaptersRestored: backup.chapters.length, notesRestored: backup.notes.length };
}
