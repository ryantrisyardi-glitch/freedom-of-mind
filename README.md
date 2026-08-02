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
      allow create: if
        request.resource.data.text.size() > 0
        && request.resource.data.text.size() < 2000
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() < 80
        && (
          (isSignedIn() && request.resource.data.uid == request.auth.uid) ||
          (!isSignedIn() && request.resource.data.uid == null)
        );
      // "Hapus komentar" di aplikasi sebenarnya BUKAN operasi delete Firestore,
      // melainkan updateDoc() yang mengisi field deletedAt (soft-delete, supaya
      // komentar bisa dipulihkan dari Trash). Karena itu allow update TIDAK BOLEH
      // if false — kalau begitu, admin akan selalu dapat error "Missing or
      // insufficient permissions" saat mencoba menghapus komentar manapun.
      allow delete: if isAdmin() || (isSignedIn() && request.auth.uid == resource.data.uid);
      allow update: if isAdmin() || (isSignedIn() && request.auth.uid == resource.data.uid);
    }

    match /admins/{email} {
      allow read: if true;
      allow write: if isSuperadmin();
    }

    // Pembaca yang login bisa menulis data kunjungan mereka sendiri.
    // Admin bisa membaca semua data pembaca. Superadmin bisa menghapus.
    match /readers/{uid} {
      allow read: if isAdmin();
      allow create, update: if isSignedIn() && request.auth.uid == uid;
      allow delete: if isSuperadmin();
    }

    // Statistik kunjungan halaman (termasuk pengunjung anonim).
    // Semua boleh tulis (increment counter), hanya admin yang bisa baca.
    match /pageViews/{docId} {
      allow read: if isAdmin();
      allow write: if true;
    }

    // Detail per-kunjungan (satu dokumen per pemuatan halaman) — dipakai
    // admin untuk melihat lokasi & jam kunjungan secara rinci, bukan cuma
    // ringkasan harian. Semua boleh tulis (termasuk anonim), hanya admin
    // yang bisa baca; tidak ada yang boleh mengubah/menghapus selain lewat
    // update terbatas (uid/name/title) segera setelah dibuat.
    match /visitLogs/{docId} {
      allow read: if isAdmin();
      allow create: if true;
      allow update: if true; // dipakai untuk melengkapi uid/name/title setelah dibuat
      allow delete: if isAdmin();
    }

    // Riwayat halaman yang dikunjungi per reader per hari.
    match /readerVisits/{docId} {
      allow read: if isAdmin();
      allow create, update: if isSignedIn();
      allow delete: if isSuperadmin();
    }

    // Tautan pendek custom (mis. dibagikan ke Instagram lewat s.html).
    // Siapa saja boleh BACA (supaya s.html bisa redirect untuk pengunjung
    // anonim) dan boleh UPDATE (dipakai buat menaikkan hitungan klik/hits
    // tiap ada yang buka linknya) — tapi hanya admin yang boleh membuat
    // atau menghapus tautannya.
    match /shortlinks/{code} {
      allow read: if true;
      allow update: if true;
      allow create, delete: if isAdmin();
    }
  }
}
```

3. Klik **Publish**.

> ⚠️ **Penting**: Aturan `comments` di atas sudah diperbarui supaya **tamu (belum login) juga bisa berkomentar**, bukan cuma yang login Google, dan ada koleksi baru `visitLogs` untuk detail kunjungan per-jam, serta koleksi baru **`shortlinks`** untuk fitur tautan pendek (dipakai lewat halaman `s.html`, mis. `s.html?c=bab3` yang otomatis redirect ke catatan aslinya). **Aturan `comments` juga baru saja diperbaiki**: `allow update` sebelumnya `if false`, padahal tombol "Hapus komentar" di aplikasi sebenarnya melakukan `updateDoc` (soft-delete, biar bisa dipulihkan dari Trash) — bukan `deleteDoc`. Kombinasi itu bikin admin selalu gagal menghapus komentar dengan error "Missing or insufficient permissions". Kalau situsmu sudah pernah di-setup sebelumnya, salin ulang SELURUH blok Rules di atas ke tab **Rules** di Firebase Console lalu klik **Publish** lagi — perubahan di file ini saja tidak otomatis berlaku, karena Firestore Rules disimpan di server Firebase, bukan di file statis situs.

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

## Aplikasi sebagai PWA (bisa di-"install" seperti app native)

Situs ini sudah dikonfigurasi sebagai **Progressive Web App**: pengunjung bisa menambahkannya ke home screen HP/desktop dan ikon yang muncul adalah ikon buku bertema (bukan ikon browser).

- `manifest.webmanifest` — nama app, warna tema, dan daftar ikon.
- `sw.js` — service worker yang menyimpan cache "app shell" (HTML/CSS/JS) supaya halaman tetap bisa dibuka meski koneksi lambat/putus. **Data (chapter, catatan, komentar) tetap selalu diambil langsung dari Firestore** — service worker ini tidak meng-cache data, jadi kontennya selalu yang paling baru.
- `icons/` — ikon buku tertutup (dipakai sebagai ikon utama app) dan buku terbuka (dipakai untuk shortcut "Tulis catatan baru"). Gaya ikon: sketsa elegan garis tipis, senada dengan warna terracotta/sage di desain situs — bukan ikon 3D.

Cara mencoba "install": buka situs lewat HTTPS (GitHub Pages otomatis HTTPS) di Chrome/Edge desktop atau Chrome/Safari di HP, lalu pilih "Install app" / "Add to Home Screen" dari menu browser.

Kalau suatu saat ingin mengganti ikon, ganti saja file-file di folder `icons/` (ukuran dan nama file harus sama) — tidak perlu mengubah kode.

## Gambar sampul chapter (biar "eye-catching" seperti showcase di homepage)

Homepage sekarang menampilkan chapter sebagai **carousel** — satu chapter besar di tengah ("You are here") dengan ilustrasi sampul di sisi kanan, dan chapter sebelum/sesudahnya mengecil di kiri-kanan. Tampilan ini juga dipakai ulang sebagai banner di atas halaman `chapter.html`.

Saat membuat/mengedit chapter, sekarang ada field tambahan:
- **Tagline pendek** — kalimat singkat penggoda (seperti "Brace for Impact"), ditampilkan di bawah judul.
- **Gambar sampul** — bisa diisi manual dengan URL Cloudinary, atau klik tombol **Upload** di sebelah field tersebut untuk mengunggah gambar langsung dari device (memakai konfigurasi Cloudinary yang sama seperti gambar di dalam catatan).

Kalau gambar sampul belum diisi, akan otomatis dipakai ilustrasi garis tipis bawaan (motif kompas/gunung/ombak, bergiliran sesuai urutan chapter) agar tampilan tetap konsisten dan elegan.

### Tips bikin gambar sampul bergaya "sketsa elegan" (bukan 3D)
Supaya hasilnya konsisten dengan gaya situs (garis tipis, warna terracotta/sage/krem, terasa seperti ilustrasi buku tua), saat membuat gambar lewat AI image generator (Midjourney, DALL·E, dll) coba pakai kombinasi kata kunci seperti:
- `fine line sketch illustration, single weight pen lines, vintage botanical/engraving style`
- `muted earthy palette: warm terracotta, sage green, cream paper background`
- `no shading gradients, no 3D render, flat minimal linework, like an old book illustration`
- Tambahkan subjek sesuai tema chapter, misalnya: `a brain illustration`, `a compass with sparkle accents`, `mountains and a lake reflection`.

Setelah gambar jadi, upload lewat tombol **Upload** di form chapter — selesai.

## Cover paragraf di setiap catatan

Paragraf pertama pada setiap catatan otomatis ditampilkan sedikit lebih besar dengan **huruf kapital drop-cap** di awal (seperti pembuka artikel majalah), supaya setiap catatan punya kesan pembuka yang lebih hidup. Tidak perlu setting apa pun — ini berlaku otomatis ke paragraf pertama yang kamu tulis di editor.

## Tentang posisi gambar (kiri/kanan/tengah/penuh)

Saat menyisipkan gambar dan memilih "Kiri" atau "Kanan", gambar akan mengapit di sisi tersebut dan teks akan mengalir rapi di sebelahnya (seperti artikel majalah/koran) — termasuk di tampilan mobile, lebar gambar otomatis menyesuaikan agar teks di sampingnya tetap nyaman dibaca (bukan cuma satu kata per baris).

Catatan: ini berbeda dari "drag bebas ke posisi mana saja" — gambar tetap mengikuti aliran teks di titik tempat kamu menyisipkannya, hanya posisi kiri/kanan/tengah/lebar yang bisa diatur. Pendekatan ini dipilih supaya tampilan tetap rapi dan stabil di semua ukuran layar, terutama mobile.

## Cut / Copy / Paste saat blok teks di editor

Saat kamu blok (seleksi) kata atau paragraf di dalam editor, akan muncul bubble kecil mengambang tepat di atas teks yang diblok, berisi tombol **Cut**, **Copy**, dan **Paste**. Ini sengaja dibuat karena klik-kanan di area editor sudah dipakai untuk membuka palet warna teks, sehingga menu klik-kanan bawaan browser (yang biasanya berisi cut/copy/paste) tidak muncul lagi di dalam editor — bubble ini menggantikan fungsi tersebut. Shortcut keyboard biasa (Ctrl/Cmd+C, X, V) tetap berfungsi seperti biasa.

## Struktur folder

```
index.html        → halaman utama (showcase carousel semua chapter)
chapter.html       → daftar catatan di dalam satu chapter (dengan banner ilustrasi)
note.html            → tampilan baca satu catatan + komentar
editor.html            → editor tulis/edit catatan (khusus admin)
admin.html               → kelola daftar admin (khusus superadmin)
manifest.webmanifest      → konfigurasi PWA (nama, warna, ikon)
sw.js                       → service worker (cache app shell untuk PWA)
icons/                        → ikon buku (tertutup & terbuka) untuk PWA
css/style.css              → semua gaya visual
js/
  firebase-config.js         → EDIT INI: isi config Firebase & email superadmin
  firebase-core.js             → koneksi inti Firebase (jangan diedit)
  data.js                         → semua operasi baca/tulis Firestore (jangan diedit)
  ui-shared.js                      → navbar, modal (jangan diedit)
  editor.js                           → logic toolbar editor, selection bubble, upload gambar (jangan diedit)
  chapter-art.js                       → ilustrasi sketsa bawaan untuk sampul chapter (jangan diedit)
  pwa-register.js                       → daftarkan service worker (jangan diedit)
  home-page.js, chapter-page.js,
  note-page.js, editor-page.js,
  admin-page.js                         → logic masing-masing halaman (jangan diedit)
```

## Analytics — siapa saja pembacamu & dari mana

Aplikasi ini memiliki **dua lapisan tracking**:

### 1. Google Analytics 4 (semua pengunjung, termasuk anonim)

Untuk mengaktifkan:
1. Buka [analytics.google.com](https://analytics.google.com) → **Start measuring** → buat Property baru
2. Pilih **Web**, masukkan URL GitHub Pages-mu (misal `https://username.github.io/freedom-of-mind`)
3. Selesai setup → salin **Measurement ID** (format: `G-XXXXXXXXXX`)
4. Buka `js/firebase-config.js` → ganti nilai `window.GA_MEASUREMENT_ID` dengan ID-mu

Setelah aktif, GA4 secara otomatis melacak:
- Jumlah pengunjung harian/mingguan/bulanan
- **Lokasi** (kota & negara) pembaca
- **Device** yang dipakai (HP/PC, OS, browser)
- Halaman mana yang paling banyak dibuka (termasuk chapter & catatan mana)
- Durasi baca rata-rata
- Custom event: `view_chapter` (saat chapter dibuka) dan `view_note` (saat catatan dibuka)

### 2. Dashboard Pembaca di admin.html (pembaca yang login)

Setiap pembaca yang login dengan Google tercatat otomatis ke Firestore:
- Nama & foto profil Google-nya
- Email
- Terakhir online (kapan)
- Halaman mana saja yang pernah dibuka
- Berapa halaman yang sudah dikunjungi

Akses: buka `admin.html` → tab **👁 Pembaca**.

> ⚠️ **Penting**: Update Firestore Rules (di bagian Setup awal di atas) dengan versi terbaru yang sudah menyertakan aturan untuk koleksi `readers`.


✅ `js/firebase-config.js` (config & email superadmin)
✅ Menulis/mengedit catatan, chapter (judul/tagline/gambar sampul) lewat antarmuka di browser (tidak menyentuh kode sama sekali)
✅ Mengganti file-file di `icons/` kalau ingin ganti desain ikon PWA (ukuran & nama file harus sama)

## Yang sebaiknya tidak diubah manual
⚠️ Semua file `.html` dan file di `css/`, `js/` (selain `firebase-config.js`), serta `manifest.webmanifest` dan `sw.js` — ini adalah "mesin" aplikasinya.

## Biaya

- **Firebase (Spark, gratis selamanya, tanpa kartu kredit)**: 1 GiB total data tersimpan di Firestore, 50.000 pembacaan/hari, 20.000 penulisan/hari, 10 GiB transfer/bulan. Untuk teks jurnal pribadi (tanpa gambar, karena gambar disimpan di Cloudinary), ini sangat jauh dari cukup — realistisnya tidak akan pernah kena biaya.
- **Cloudinary (gratis, tanpa kartu kredit)**: 25GB penyimpanan gambar + 25GB bandwidth/bulan. Cukup untuk ribuan foto resolusi normal.
- **GitHub Pages**: gratis untuk repository publik.

Praktis, seluruh situs ini bisa berjalan permanen tanpa biaya sepeser pun dan tanpa perlu mendaftarkan kartu kredit di mana pun.
