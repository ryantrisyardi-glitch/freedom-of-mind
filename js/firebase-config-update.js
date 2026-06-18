// =========================================================
// KONFIGURASI FIREBASE — Freedom of Mind
// =========================================================
// PANDUAN LENGKAP ADA DI README.md
//
// Ringkasan cepat:
// 1. https://console.firebase.google.com -> New project (gratis)
// 2. Tambah Web App (ikon </>) -> salin config -> tempel di bawah
// 3. Authentication -> Sign-in method -> aktifkan Google
// 4. Authentication -> Settings -> Authorized domains -> tambah domain GitHub Pages-mu
// 5. Firestore Database -> Create database (mode production) -> isi Rules (lihat README.md)
// 6. Storage -> Get started (mode production) -> isi Rules (lihat README.md)
// 7. Di Firestore, buat koleksi "admins" -> dokumen dengan ID = email kamu
//    (lihat README.md bagian "Setup admin pertama")

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
