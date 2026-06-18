// =========================================================
// KONFIGURASI FIREBASE + CLOUDINARY — Freedom of Mind
// =========================================================
// PANDUAN LENGKAP ADA DI README.md
//
// Ringkasan cepat (Firebase — untuk login & database):
// 1. https://console.firebase.google.com -> New project (gratis)
// 2. Tambah Web App (ikon </>) -> salin config -> tempel di bawah
// 3. Authentication -> Sign-in method -> aktifkan Google
// 4. Authentication -> Settings -> Authorized domains -> tambah domain GitHub Pages-mu
// 5. Firestore Database -> Create database (mode production) -> isi Rules (lihat README.md)
//
// Ringkasan cepat (Cloudinary — untuk simpan gambar, GRATIS tanpa kartu kredit):
// 1. https://cloudinary.com/users/register/free -> daftar gratis
// 2. Di Dashboard, salin "Cloud name" -> tempel di bawah
// 3. Settings (ikon gerigi) -> Upload -> Upload presets -> "Add upload preset"
//    -> Signing Mode pilih "Unsigned" -> Save -> salin nama presetnya -> tempel di bawah

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyArTM9PdSTE_pWM1_8PEIxgcY_BECvtQOo",
  authDomain: "freedom-of-mind-c17f3.firebaseapp.com",
  projectId: "freedom-of-mind-c17f3",
  storageBucket: "freedom-of-mind-c17f3.firebasestorage.app",
  messagingSenderId: "968141178296",
  appId: "1:968141178296:web:f8d5f9da1bad932230fb4d"
};

// Email superadmin pertama — selalu punya akses penuh meskipun belum
// terdaftar di koleksi "admins" Firestore. Ini jaring pengaman supaya
// kamu tidak pernah terkunci dari panel admin.
window.SUPERADMIN_EMAIL = "ryan.trisyardi@gmail.com";

// Konfigurasi Cloudinary — tempat gambar disimpan (gratis 25GB, tanpa kartu kredit)
window.CLOUDINARY_CONFIG = {
  cloudName: "duhnlnhuj",
  uploadPreset: "freedom-of-mind"
};
