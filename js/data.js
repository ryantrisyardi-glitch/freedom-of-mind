// =========================================================
// DATA LAYER — semua operasi baca/tulis ke Firestore
// Koleksi:
//   chapters: { id, judul, deskripsi, urutan, createdAt }
//   notes:    { id, chapterId, judul, contentJson, contentHtml, tag[], urutan, createdAt, updatedAt }
//   comments: { id, noteId, uid, name, photoURL, text, createdAt }
//   admins:   { id = email, addedBy, addedAt }
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
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---------- Chapters ----------

export async function getAllChapters() {
  const snap = await getDocs(query(collection(db, "chapters"), orderBy("urutan", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getChapter(chapterId) {
  const snap = await getDoc(doc(db, "chapters", chapterId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createChapter({ judul, deskripsi }) {
  const all = await getAllChapters();
  const maxUrutan = all.reduce((m, c) => Math.max(m, c.urutan || 0), 0);
  return addDoc(collection(db, "chapters"), {
    judul,
    deskripsi: deskripsi || "",
    urutan: maxUrutan + 1,
    createdAt: serverTimestamp(),
  });
}

export async function updateChapter(chapterId, data) {
  return updateDoc(doc(db, "chapters", chapterId), data);
}

export async function deleteChapter(chapterId) {
  return deleteDoc(doc(db, "chapters", chapterId));
}

// ---------- Notes ----------

export async function getNotesByChapter(chapterId) {
  const snap = await getDocs(
    query(collection(db, "notes"), where("chapterId", "==", chapterId), orderBy("urutan", "asc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAllNotes() {
  const snap = await getDocs(query(collection(db, "notes"), orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
    contentHtml: "<p>Mulai menulis di sini...</p>",
    urutan: maxUrutan + 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateNote(noteId, data) {
  return updateDoc(doc(db, "notes", noteId), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteNote(noteId) {
  return deleteDoc(doc(db, "notes", noteId));
}

export async function moveNoteToChapter(noteId, newChapterId) {
  return updateDoc(doc(db, "notes", noteId), { chapterId: newChapterId, updatedAt: serverTimestamp() });
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
  });
}

export function listenComments(noteId, onChange, onError) {
  const q = query(collection(db, "comments"), where("noteId", "==", noteId), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
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
