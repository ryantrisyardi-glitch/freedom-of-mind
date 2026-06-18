# Freedom of Mind

Aplikasi jurnal refleksi dengan editor visual (mirip OneNote), sistem login admin, dan komentar Google — seluruhnya berjalan sebagai situs statis yang bisa dihosting gratis di GitHub Pages.

## Cara kerja secara singkat

- **Pembaca** (siapa saja): membuka situs, menjelajah per **Chapter** (misal "Freedom of Mind"), membuka **Catatan** di dalamnya, membaca, berkomentar dengan akun Google, dan membagikan tautan.
- **Admin** (kamu): login dengan akun Google yang sama, lalu muncul tombol-tombol tambahan: "+ Chapter baru", "+ Catatan baru", tombol edit/hapus, dan editor bergaya OneNote untuk menulis dengan tombol Bold/Italic/gambar dsb.
- Semua data (chapter, catatan, komentar) tersimpan di **Firestore** (database cloud gratis dari Firebase) — bukan file di GitHub. Jadi menulis catatan baru tidak perlu commit/push apa pun, tinggal login dan klik "+ Catatan baru".

## Setup awal (sekali saja)

### 1. Buat project Firebase

1. Buka [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → beri nama bebas (gratis, tidak perlu kartu kredit untuk paket dasar/Spark).
2. Di dashboard project, klik ikon `</>` ("Add app" → Web) → beri nama apa saja → Firebase akan menampilkan blok `firebaseConfig`.
3. Salin isi `firebaseConfig` tersebut, tempel ke file `js/firebase-config.js`, menggantikan bagian yang bertuliskan `GANTI_...`.
4. Pastikan `window.SUPERADMIN_EMAIL` di file yang sama berisi `ryan.trisyardi@gmail.com` (sudah diisi secara default).

### 2. Aktifkan Login Google

1. Menu kiri **Authentication** → tab **Sign-in method** → aktifkan provider **Google**.
2. Menu **Authentication** → tab **Settings** → **Authorized domains** → tambahkan domain GitHub Pages-mu, contoh: `namamu.github.io`.

### 3. Aktifkan Firestore (database)

1. Menu **Firestore Database** → **Create database** → pilih mode **production** → pilih lokasi server (boleh `asia-southeast1` / Singapore untuk latensi terbaik dari Indonesia).
2. Masuk tab **Rules**, hapus semua isinya, tempel ini:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }
    function isSuperadmin() {
      return isSignedIn() && request.auth.token.email == "ryan.trisyardi@gmail.com";
    }
    function isAdmin() {
      return isSuperadmin() ||
        (isSignedIn() && exists(/databases/$(database)/documents/admins/$(request.auth.token.email)));
    }

    match /chapters/{chapterId} {
      allow read: if true;
      allow create, update, delete: if isAdmin();
    }

    match /notes/{noteId} {
      allow read: if true;
      allow create, update, delete: if isAdmin();
    }

    match /comments/{commentId} {
      allow read: if true;
      allow create: if isSignedIn()
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.text.size() > 0
        && request.resource.data.text.size() < 2000;
      allow delete: if isSignedIn() && request.auth.uid == resource.data.uid;
      allow update: if false;
    }

    match /admins/{email} {
      allow read: if true;
      allow write: if isSuperadmin();
    }
  }
}
```

3. Klik **Publish**.

### 4. Setup Cloudinary (untuk menyimpan gambar — gratis, tanpa kartu kredit)

Catatan penting: sejak Februari 2026, Firebase Storage **mewajibkan** paket berbayar Blaze (kartu kredit terdaftar) meskipun pemakaiannya sendiri tetap gratis di bawah kuota. Untuk menghindari ini sepenuhnya, situs ini memakai **Cloudinary** — layanan khusus gambar dengan kuota gratis 25GB yang tidak meminta kartu kredit sama sekali.

1. Daftar gratis di [cloudinary.com/users/register/free](https://cloudinary.com/users/register/free).
2. Di halaman **Dashboard**, salin nilai **Cloud name** (terlihat di bagian atas, contoh: `dxyz1234a`).
3. Klik ikon gerigi ⚙️ (**Settings**) di kiri bawah → tab **Upload** → cari bagian **Upload presets** → klik **Add upload preset**.
4. Pada preset baru: ubah **Signing Mode** dari "Signed" menjadi **"Unsigned"** → klik **Save**.
5. Salin nama preset yang baru dibuat (biasanya muncul otomatis seperti `xxxxxxxx`, atau beri nama sendiri misalnya `fom-notes`).
6. Tempel **Cloud name** dan **nama preset** tadi ke `js/firebase-config.js`, pada bagian `window.CLOUDINARY_CONFIG`.

Selesai — gambar akan otomatis terunggah ke Cloudinary saat kamu memakai tombol gambar di editor, dan tetap gratis selama total penyimpanan di bawah 25GB (jurnal pribadi biasanya memakai jauh di bawah itu, ribuan foto baru akan mendekati batas ini).

> Catatan keamanan: "unsigned upload preset" memang didesain untuk dipakai langsung dari kode browser (bukan rahasia seperti API key). Untuk mencegah penyalahgunaan oleh orang luar, preset ini dibatasi hanya menerima file gambar dan maksimal 8MB (sudah diatur di kode `js/editor.js`). Jika suatu saat preset disalahgunakan, kamu bisa menghapus/membuat ulang preset dengan nama baru dari Cloudinary Dashboard.

> Kenapa aturan menulis Firestore (create/update/delete) memeriksa status admin lewat Firestore Rules, bukan lewat kode JavaScript saja? Karena kode JavaScript bisa dilihat dan dimodifikasi siapa saja di browser. Aturan keamanan sungguhan harus ditegakkan di sisi server — itulah fungsi Firestore Rules di atas.

## Cara hosting di GitHub Pages

1. Buat repository baru di GitHub, upload seluruh isi folder ini ke root repo.
2. **Settings** → **Pages** → **Source**: pilih branch `main`, folder `/ (root)`.
3. Tunggu 1-2 menit, situs aktif di `https://namamu.github.io/nama-repo/`.
4. Pastikan domain ini sudah ditambahkan di langkah "Authorized domains" pada bagian Authentication di atas.

## Cara memakai sehari-hari

### Menulis catatan baru
1. Login dengan akun `ryan.trisyardi@gmail.com` lewat tombol "Masuk dengan Google" di kanan atas.
2. Buka chapter yang sesuai (atau buat chapter baru dari halaman utama).
3. Klik "+ Catatan baru" → isi judul → otomatis masuk ke editor.
4. Tulis seperti biasa. Gunakan toolbar di atas: **B** untuk tebal, **I** untuk miring, **H2/H3** untuk judul bagian, tombol gambar (Kiri/Kanan/Tengah/Penuh) untuk menyisipkan gambar di posisi yang kamu mau.
5. Semua perubahan otomatis tersimpan beberapa saat setelah kamu berhenti mengetik (lihat status "tersimpan ✓" di pojok kanan bawah editor). Tidak ada tombol "Publish" terpisah — begitu tersimpan, langsung bisa dibaca publik.
6. Klik "Selesai" untuk kembali ke daftar catatan, atau "👁 Lihat hasil" untuk melihat tampilan baca.

### Memindahkan catatan ke chapter lain
Di dalam editor, ada dropdown di sebelah judul untuk memilih chapter — pilih chapter baru, otomatis berpindah.

### Menambah admin lain
Sebagai superadmin, buka menu "kelola admin" di pojok kanan atas (muncul khusus untuk `ryan.trisyardi@gmail.com`), masukkan email Google orang yang ingin diberi akses, klik "+ Tambah admin".

## Tentang posisi gambar (kiri/kanan/tengah/penuh)

Saat menyisipkan gambar dan memilih "Kiri" atau "Kanan", gambar akan mengapit di sisi tersebut dan teks akan mengalir rapi di sebelahnya (seperti artikel majalah/koran) — termasuk di tampilan mobile, lebar gambar otomatis menyesuaikan agar teks di sampingnya tetap nyaman dibaca (bukan cuma satu kata per baris).

Catatan: ini berbeda dari "drag bebas ke posisi mana saja" — gambar tetap mengikuti aliran teks di titik tempat kamu menyisipkannya, hanya posisi kiri/kanan/tengah/lebar yang bisa diatur. Pendekatan ini dipilih supaya tampilan tetap rapi dan stabil di semua ukuran layar, terutama mobile.

## Struktur folder

```
index.html        → halaman utama (grid semua chapter)
chapter.html       → daftar catatan di dalam satu chapter
note.html            → tampilan baca satu catatan + komentar
editor.html            → editor tulis/edit catatan (khusus admin)
admin.html               → kelola daftar admin (khusus superadmin)
css/style.css              → semua gaya visual
js/
  firebase-config.js         → EDIT INI: isi config Firebase & email superadmin
  firebase-core.js             → koneksi inti Firebase (jangan diedit)
  data.js                         → semua operasi baca/tulis Firestore (jangan diedit)
  ui-shared.js                      → navbar, modal (jangan diedit)
  editor.js                           → logic toolbar editor & upload gambar (jangan diedit)
  home-page.js, chapter-page.js,
  note-page.js, editor-page.js,
  admin-page.js                         → logic masing-masing halaman (jangan diedit)
```

## Yang aman diedit kapan saja
✅ `js/firebase-config.js` (config & email superadmin)
✅ Menulis/mengedit catatan lewat editor di browser (tidak menyentuh kode sama sekali)

## Yang sebaiknya tidak diubah manual
⚠️ Semua file `.html` dan file di `css/`, `js/` (selain `firebase-config.js`) — ini adalah "mesin" aplikasinya.

## Biaya

- **Firebase (Spark, gratis selamanya, tanpa kartu kredit)**: 1 GiB total data tersimpan di Firestore, 50.000 pembacaan/hari, 20.000 penulisan/hari, 10 GiB transfer/bulan. Untuk teks jurnal pribadi (tanpa gambar, karena gambar disimpan di Cloudinary), ini sangat jauh dari cukup — realistisnya tidak akan pernah kena biaya.
- **Cloudinary (gratis, tanpa kartu kredit)**: 25GB penyimpanan gambar + 25GB bandwidth/bulan. Cukup untuk ribuan foto resolusi normal.
- **GitHub Pages**: gratis untuk repository publik.

Praktis, seluruh situs ini bisa berjalan permanen tanpa biaya sepeser pun dan tanpa perlu mendaftarkan kartu kredit di mana pun.
