// =========================================================
// FIREBASE CORE — init app, auth, firestore, storage
// Modul ini jadi sumber tunggal koneksi Firebase untuk seluruh app.
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

export let app = null;
export let auth = null;
export let db = null;
export let storage = null;
export let ready = false;

export function initFirebaseCore() {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || cfg.apiKey === "GANTI_DENGAN_API_KEY_KAMU") {
    console.warn("Firebase belum dikonfigurasi. Lihat js/firebase-config.js");
    return false;
  }
  try {
    app = initializeApp(cfg);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    ready = true;
    return true;
  } catch (err) {
    console.error("Gagal inisialisasi Firebase:", err);
    return false;
  }
}

export function googleSignIn() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function signOut() {
  return fbSignOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Mengecek apakah email user adalah admin.
 * Superadmin (dari firebase-config.js) selalu true.
 * Selain itu, cek koleksi Firestore "admins" dengan ID dokumen = email.
 */
export async function checkIsAdmin(email) {
  if (!email) return false;
  if (email.toLowerCase() === (window.SUPERADMIN_EMAIL || "").toLowerCase()) {
    return true;
  }
  if (!db) return false;
  try {
    const snap = await getDoc(doc(db, "admins", email.toLowerCase()));
    return snap.exists();
  } catch (err) {
    console.error("Gagal memeriksa status admin:", err);
    return false;
  }
}
