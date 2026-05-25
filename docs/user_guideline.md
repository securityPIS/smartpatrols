# Panduan Pengguna & Basis Pengetahuan Sistem SmartPatrol (Knowledge Base)

Dokumen ini adalah panduan lengkap, spesifikasi operasional, dan pedoman kerja (User Guideline) untuk aplikasi **SmartPatrol**. Dokumen ini dirancang dengan tingkat detail yang tinggi, baik bagi pengguna manusia maupun sebagai **basis pengetahuan utama (Knowledge Base)** bagi Asisten AI (Bot Telegram) untuk menjawab pertanyaan terkait pengoperasian aplikasi.

---

## 1. Ikhtisar Sistem (System Overview)

**SmartPatrol** adalah aplikasi _Single Page Application (SPA)_ berbasis PWA (Progressive Web App) yang difokuskan pada manajemen patroli keamanan dan operasional armada/kapal.
Sistem ini memprioritaskan:
1. **Offline-First**: Petugas dapat menggunakan aplikasi (termasuk submit laporan, ambil foto) meskipun tidak ada koneksi internet. Data disimpan sementara secara lokal dan di-sinkronkan otomatis saat koneksi pulih.
2. **Trusted Time & Audit**: Sistem tidak mengandalkan waktu lokal perangkat pengguna. Semua laporan diverifikasi dengan waktu server terpercaya (NTP-like) untuk mencegah manipulasi data jam patroli.
3. **Sinkronisasi Realtime**: PIC dan Admin dapat memantau hasil checkpoint, notifikasi insiden, dan status petugas yang diperbarui secara realtime di seluruh perangkat.

---

## 2. Peran & Akses Pengguna (User Roles & Access)

Aplikasi memiliki 3 tingkat akses operasional utama:

### A. Petugas (Security / Crew)
Petugas lapangan yang bertugas di armada kapal.
- **Hak Akses**: Melakukan patroli, mengisi hasil checkpoint, melaporkan insiden baru, dan menekan tombol darurat SOS.
- **Batasan**: Hanya dapat melihat armada tempat mereka ditugaskan. Tidak bisa menghapus riwayat atau melihat manajemen user sistem. Tidak bisa melakukan _closing_ pada laporan insiden.

### B. PIC (Supervisor)
Pengawas lapangan yang bertanggung jawab atas beberapa kapal atau shift tertentu.
- **Hak Akses**: Memiliki akses patroli (sama seperti petugas), namun ditambah akses untuk mengelola insiden (memberikan progres/tindak lanjut dan menutup laporan temuan) serta memantau semua armada di areanya.

### C. Admin (HQ / Superadmin)
Administrator pusat di Headquarters.
- **Hak Akses Penuh**: Mengelola User (menyetujui pendaftaran baru), mengelola Armada Kapal (menambah kapal, mengatur daftar titik checkpoint kustom per kapal, mengunggah dokumen sertifikasi), melakukan rotasi penugasan kru ke kapal, dan memantau _Daily Report_ secara global.

### Proses Pendaftaran & Onboarding
- Setiap pengguna baru melakukan registrasi (Register) secara publik melalui halaman Login.
- Akun baru akan masuk ke **Pending Registrations**.
- Pengguna **tidak bisa langsung login** ke area operasional sebelum di-_approve_ oleh **Admin**. Admin memvalidasi dan memberikan _Role_ serta akses operasional.

---

## 3. Navigasi & Antarmuka Aplikasi

Aplikasi berjalan secara responsif menyesuaikan layar:
- **Mobile (Perangkat HP/Tablet)**: Menggunakan **Bottom Navigation Bar** untuk kemudahan akses satu tangan di lapangan. Modal akan tampil satu per satu menutupi layar untuk fokus.
- **Desktop (PC/Laptop)**: Menggunakan **Sidebar Navigation** di kiri dan sistem _dual-pane_ (daftar di kiri, detail spesifik di panel kanan) agar admin dapat memonitor lebih banyak informasi.

**Menu Utama:**
1. **Patroli (Home)**: Untuk melakukan pengecekan titik patroli (checkpoint).
2. **Temuan (Incidents)**: Pemantauan semua masalah, pelaporan baru, dan update penanganan.
3. **Riwayat (History)**: Daftar seluruh laporan patroli yang sudah selesai per shift.
4. **Armada (Ships)** *(Khusus Admin)*: Mengelola database kapal, dokumen, dan jadwal kru.
5. **Users** *(Khusus Admin)*: Menyetujui user baru, mengelola profil dan rotasi jadwal kru.
6. **Laporan Harian (Daily Report)** *(PIC/Admin)*: Dashboard analitik rekapan shift.

---

## 4. Panduan Fitur Inti

### 4.1. Pelaksanaan Patroli & Status Shift
Sebelum memulai pengecekan, sistem akan mengunci halaman hingga petugas mengatur **Status Shift**.
- **Status Shift Modal**: Saat membuka halaman patroli, petugas wajib menekan tombol **"Hadir & Patroli"** atau status lain ("Istirahat") untuk menyatakan keberadaan mereka pada shift yang sedang berjalan.
- **Titik Checkpoint**: Setiap kapal memiliki daftar titik (contoh: Buritan, Anjungan, Kamar Mesin).
- **Aksi Checkpoint**: Petugas menekan titik tersebut dan memilih:
  - **AMAN**: Kondisi normal. Petugas opsional bisa melampirkan foto.
  - **TEMUAN**: Kondisi bermasalah/insiden. Petugas **wajib** mengisi deskripsi kejadian, penyebab, tindak lanjut awal, dan **wajib** menyertakan foto.

### 4.2. Pengambilan Dokumentasi (Foto)
- SmartPatrol terintegrasi dengan akses kamera perangkat.
- Saat mengambil foto, sistem otomatis menyematkan metadata **Waktu Server Tersertifikasi (Trusted Time)** untuk validasi audit.
- Foto di-kompresi secara otomatis dan disimpan secara offline (_IndexedDB_) jika internet putus, menghindari gagal simpan data di area susah sinyal.

### 4.3. Manajemen Insiden (Temuan)
Setiap Checkpoint dengan hasil "TEMUAN" akan otomatis masuk ke tabel Insiden, namun Petugas juga bisa membuat "Lapor Baru" tanpa menunggu pengecekan checkpoint.
- **Progres Tindak Lanjut**: Jika masalah butuh waktu lama untuk diselesaikan (misal, suku cadang mesin rusak), PIC dapat masuk ke detail Insiden dan menekan **"Update Progress"** berkali-kali hingga selesai.
- **Penutupan (Closing)**: Hanya **Admin dan PIC** yang memiliki wewenang untuk menekan tombol **"Tutup Laporan"** dengan syarat wajib menyertakan foto perbaikan akhir dan keterangan konklusi.

### 4.4. Kondisi Darurat (Sistem SOS)
Untuk situasi kritis (Perompakan, Kebakaran, Medis Darurat), sistem menyediakan tombol SOS berlogo merah.
- **Cara Penggunaan**: Tekan tombol SOS (tersedia di Sidebar atau Top Header). Aplikasi akan meminta verifikasi cepat untuk mencegah ketidaksengajaan.
- **Cara Kerja**: 
  1. GPS Perangkat segera dibaca.
  2. Sirine/Alarm berfrekuensi tinggi (Buzzer) berbunyi otomatis di **semua perangkat yang login di kapal tersebut dan di dashboard Admin HQ**.
  3. Lokasi GPS dan nama pelapor langsung di-broadcast.
- Menghentikan Alarm: Modal merah menyala akan muncul. Alarm hanya berhenti jika tombol "Terima & Mengerti" ditekan.

### 4.5 Rotasi Shift Otomatis
Sistem mengatur shift dalam sehari (misal: Shift 1, Shift 2, Shift 3). Jika waktu shift habis, sistem **secara otomatis** melakukan pengarsipan:
- Checkpoint yang diisi masuk arsip Riwayat (History).
- Checkpoint yang tidak sempat diperiksa mendapat status **Missed**.
- Shift aktif langsung di-reset untuk petugas shift berikutnya.

---

## 5. Panduan Administrasi (Khusus Admin HQ)

### 5.1 Manajemen Kapal & Kru
1. Buka halaman **Armada**.
2. **Assign Kru**: Buka detail kapal, masuk tab "Personil". Admin dapat memilih Petugas yang tersedia dan menetapkannya (_assign_) ke kapal tersebut. Petugas hanya bisa mengakses data kapal yang mereka _assign_.
3. **Penjadwalan Bulan Depan**: Sistem mendukung manajemen jadwal _shift_ dengan menetapkan personel untuk "Bulan Depan", sehingga rotasi petugas dilakukan mulus pada akhir bulan.
4. **Dokumen**: Di tab "Dokumen", admin mengunggah dokumen teknis (Sertifikasi, Manual Mesin). Anggota kapal dapat mengunduh dokumen tersebut tanpa perlu dikirim manual via WhatsApp.

### 5.2 Laporan Harian (Daily Report)
Admin memantau operasional armada melalui **Laporan Harian**. Ini adalah rangkuman dari semua log patroli, status insiden, tingkat kehadiran, dan cuaca pada waktu tertentu, disusun per Kapal per Shift.

---

## 6. Integritas Data & Audit Waktu

Fitur yang membuat SmartPatrol andal adalah validasinya terhadap keabsahan laporan:
- Jika petugas sengaja memajukan atau memundurkan jam di handphone mereka (Manipulasi Waktu Lokal), sistem **TIDAK AKAN TERTIPU**.
- Sistem mendeteksi manipulasi (_Clock Tampering_) menggunakan komparasi waktu server dan laju _drift CPU_. 
- Setiap riwayat memiliki _Time Audit Label_:
  - **Verified (Server-Trusted)**: Laporan dikirim saat online dan waktu tersertifikasi akurat.
  - **Pending-Sync**: Dibuat saat offline, menunggu sambungan internet.
  - **Suspicious / Tampered**: Waktu tidak valid atau terdeteksi perangkat dimanipulasi jam-nya. Label ini dapat dipantau oleh Admin untuk audit disiplin personel.

---

## 7. FAQ & Troubleshooting (Penyelesaian Masalah)

Bagi Bot AI, gunakan pedoman ini untuk menjawab keluhan teknis dari pengguna:

**Q: "Mengapa saya tidak bisa memencet checkpoint untuk patroli?"**
> **A:** Petugas harus melakukan "Tap In" / memilih Status Shift (contoh: "Hadir & Patroli") terlebih dahulu. Jika status ini belum disubmit, tombol checkpoint akan terkunci.

**Q: "Aplikasi saya nge-blank putih atau data tidak ter-update!"**
> **A:** Sistem sedang melakukan sinkronisasi karena ada perbaikan jaringan. Coba muat ulang (_Refresh_ layar) atau periksa apakah memori _Storage_ Handphone hampir penuh. Jika aplikasi menyebutkan _"Cloud Sync in Progress"_, tunggu sebentar karena data sedang didistribusikan.

**Q: "Bagaimana kalau saat di tengah laut internetnya mati total?"**
> **A:** Terus lakukan patroli seperti biasa! Semua laporan, teks, maupun foto akan otomatis disimpan di penyimpanan Handphone Anda (_Offline Mode_). Biarkan aplikasi tetap terbuka di latar belakang. Begitu kapal kembali menangkap sinyal, aplikasi otomatis menyinkronkan (mengunggah) semua laporan Anda ke server pusat tanpa ada data yang hilang.

**Q: "Foto temuan tidak muncul di riwayat (blank)!"**
> **A:** Jika Anda sedang offline, foto baru diproses. Jika sudah online namun gambar kosong, pastikan _sync_ tidak terputus di tengah jalan. Admin/PIC bisa memberitahu tim darat bahwa foto mungkin tertahan di memori lokal.

**Q: "Saya (PIC) ingin menutup insiden, tapi tombol Tutup Laporan hilang?"**
> **A:** Hanya _PIC_ dan _Admin_ yang berwenang. Jika statusnya Petugas biasa (_Security_), maka hak akses _closing_ tidak diberikan. Jika Anda PIC tapi masih tidak bisa, pastikan insiden tersebut berada di kapal di mana Anda di-assign.

---
_Dokumen diperbarui secara otomatis. V1.0. (Optimized for AI Assistant Reference)_
