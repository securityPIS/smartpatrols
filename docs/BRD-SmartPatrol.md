# Business Requirements Document (BRD)

# SmartPatrol — Aplikasi Patroli Keamanan Armada Kapal

| Informasi Dokumen | Detail |
|---|---|
| Nama Produk | SmartPatrol |
| Jenis Dokumen | Business Requirements Document (BRD) |
| Versi | 1.0 |
| Tanggal | 17 Juli 2026 |
| Status | Baseline (as-built) — mendokumentasikan kebutuhan bisnis dari sistem yang telah berjalan |
| Penyusun | Tim SmartPatrol |
| Referensi | `SYSTEM_MAP.md`, `docs/user_guideline.md`, `README.md`, `AGENTS.md` |

> Catatan: SmartPatrol telah diimplementasikan dan beroperasi. Dokumen ini menjadi baseline kebutuhan bisnis: acuan bersama bagi manajemen, operasional, dan tim pengembang untuk evaluasi fitur berjalan maupun perencanaan pengembangan berikutnya.

---

## 1. Ringkasan Eksekutif

SmartPatrol adalah aplikasi patroli keamanan dan operasional armada kapal berbasis PWA (Progressive Web App) dan aplikasi Android (Capacitor). Aplikasi digunakan oleh petugas keamanan (security/kru) di atas kapal, pengawas lapangan (PIC), dan administrator pusat (Admin HQ) untuk:

1. Mencatat hasil patroli titik pemeriksaan (checkpoint) per shift secara digital, lengkap dengan foto, koordinat GPS, dan stempel waktu server terpercaya (trusted time).
2. Mengelola temuan/insiden dari pelaporan awal, pembaruan progres penanganan, sampai penutupan laporan.
3. Menyediakan tombol darurat SOS yang membunyikan alarm di seluruh perangkat kapal terkait dan dashboard Admin HQ secara realtime.
4. Mengelola armada kapal, dokumen kapal, dan rotasi penugasan kru bulanan.
5. Menyajikan Laporan Harian (dashboard analitik) per kapal per shift bagi PIC dan Admin.

Tiga prinsip produk yang menjadi pembeda utama:

- **Offline-first** — patroli di tengah laut tanpa sinyal tetap berjalan; seluruh laporan dan foto tersimpan lokal dan tersinkron otomatis saat koneksi pulih, tanpa kehilangan data.
- **Trusted time & audit** — waktu laporan tidak bergantung jam perangkat; sistem mendeteksi manipulasi jam (clock tampering) dan memberi label audit pada setiap laporan.
- **Sinkronisasi realtime** — Admin dan PIC memantau hasil checkpoint, insiden, dan SOS lintas perangkat secara langsung.

---

## 2. Latar Belakang dan Permasalahan Bisnis

Pengawasan keamanan armada kapal (HSSE) sebelumnya mengandalkan pencatatan manual (kertas/WhatsApp) dengan sejumlah kelemahan bisnis:

| # | Permasalahan | Dampak Bisnis |
|---|---|---|
| P-01 | Bukti patroli manual mudah dimanipulasi (jam laporan, kelengkapan ronda) | Audit HSSE tidak dapat diandalkan; kedisiplinan personel sulit dievaluasi |
| P-02 | Area operasi laut minim sinyal; aplikasi konvensional gagal menyimpan laporan | Kehilangan data patroli; petugas enggan memakai sistem digital |
| P-03 | Temuan/insiden dilaporkan lewat kanal tidak terstruktur (chat, telepon) | Tindak lanjut tidak terlacak; insiden berulang tanpa riwayat penanganan |
| P-04 | Tidak ada mekanisme darurat terpusat dari kapal ke HQ | Respons keadaan darurat (perompakan, kebakaran, medis) lambat |
| P-05 | Rotasi kru dan dokumen kapal dikelola manual dan tersebar | Kesalahan penugasan; dokumen sertifikasi sulit diakses kru |
| P-06 | Manajemen tidak punya visibilitas harian atas kinerja patroli lintas armada | Keputusan operasional lambat dan tidak berbasis data |

SmartPatrol dibangun untuk menjawab keenam permasalahan tersebut dalam satu platform.

---

## 3. Tujuan Bisnis dan Indikator Keberhasilan

### 3.1 Tujuan Bisnis

| ID | Tujuan |
|---|---|
| GOAL-01 | Menjamin akuntabilitas patroli: setiap titik pemeriksaan pada setiap shift tercatat berstatus jelas (AMAN / TEMUAN / MISSED) |
| GOAL-02 | Menjamin integritas bukti patroli: waktu, foto, dan lokasi laporan dapat diaudit dan tahan manipulasi |
| GOAL-03 | Menghilangkan kehilangan data di area tanpa sinyal melalui operasi offline-first |
| GOAL-04 | Mempercepat siklus penanganan temuan/insiden dari pelaporan hingga penutupan yang terdokumentasi |
| GOAL-05 | Mempercepat eskalasi keadaan darurat dari kapal ke seluruh pihak terkait secara realtime |
| GOAL-06 | Menyederhanakan administrasi armada: rotasi kru bulanan, dokumen kapal, dan pemantauan posisi |
| GOAL-07 | Memberi manajemen visibilitas harian atas kinerja patroli, kehadiran, dan insiden lintas armada |
| GOAL-08 | Menjaga biaya operasional platform tetap rendah (efisiensi egress database, ukuran payload, dan infrastruktur cloud terkelola) |

### 3.2 Indikator Keberhasilan (KPI)

| ID | Indikator | Target |
|---|---|---|
| KPI-01 | Cakupan pencatatan checkpoint per shift (aman + temuan + missed = total titik) | 100% shift terfinalisasi otomatis |
| KPI-02 | Laporan patroli berlabel audit "Verified (Server-Trusted)" | ≥ 95% dari seluruh laporan online |
| KPI-03 | Kehilangan data laporan yang disubmit saat offline | 0 (nol) setelah perangkat kembali online |
| KPI-04 | Waktu broadcast SOS ke perangkat sekapal dan Admin HQ (saat online) | Realtime (orde detik) |
| KPI-05 | Temuan yang ditutup dengan bukti foto perbaikan dan konklusi | 100% dari temuan berstatus closed |
| KPI-06 | Registrasi pengguna baru yang aktif tanpa persetujuan Admin | 0 (nol) — seluruh akses melalui approval |
| KPI-07 | Ketersediaan fungsi inti patroli saat perangkat offline | 100% (status shift, checkpoint, foto, antre laporan) |

---

## 4. Ruang Lingkup

### 4.1 Dalam Lingkup (In-Scope)

1. Aplikasi SPA/PWA responsif (mobile bottom-nav, desktop sidebar + dual-pane) dan pembungkus Android APK (Capacitor).
2. Registrasi publik, persetujuan akun oleh Admin, autentikasi, dan kontrol akses berbasis peran (ADMIN, PIC, PETUGAS).
3. Pelaksanaan patroli checkpoint per kapal per shift, termasuk status kehadiran shift, foto terkompresi, GPS snapshot, dan trusted time.
4. Manajemen temuan/insiden: pelaporan (dari checkpoint maupun manual), pembaruan progres, penutupan, dan penghapusan oleh Admin.
5. Sistem darurat SOS dengan alarm lintas perangkat dan acknowledgement.
6. Manajemen armada: data kapal, titik checkpoint kustom per kapal, dokumen kapal, kru bulan berjalan dan bulan depan, serta posisi kapal di peta.
7. Manajemen pengguna: profil, peran, instansi asal (BUJP/TNI/POLRI/INTERNAL), status operasional, dan rotasi penugasan.
8. Riwayat patroli per shift (arsip otomatis) dan Laporan Harian (dashboard analitik ADMIN/PIC).
9. Notifikasi in-app dan web push (temuan, progres, SOS, pengingat checkpoint tertunda, rangkuman, penutupan shift).
10. Mode offline-first: penyimpanan lokal, antrean mutasi (outbox), sinkronisasi otomatis, dan pemulihan media foto.
11. Audit waktu terpercaya dengan deteksi manipulasi jam perangkat dan label audit per laporan.

### 4.2 Di Luar Lingkup (Out-of-Scope)

| # | Item | Keterangan |
|---|---|---|
| OS-01 | Push notification background native Android (FCM native) | Dinonaktifkan pada versi ini; notifikasi push berjalan sebagai web push (browser/PWA) dan realtime in-app |
| OS-02 | Asisten AI / bot Telegram untuk tanya-jawab operasional | Baru berupa rencana (`docs/telegram_ai_integration_plan.md`); belum menjadi kebutuhan rilis ini |
| OS-03 | Integrasi HRIS/payroll, absensi biometrik | Kehadiran dicatat sebatas status shift patroli |
| OS-04 | Pelacakan posisi kapal berbasis AIS/VMS eksternal | Posisi kapal diambil dari GPS snapshot laporan patroli terakhir |
| OS-05 | Aplikasi iOS native | Target platform saat ini: browser/PWA dan Android |
| OS-06 | Multi-bahasa | Antarmuka berbahasa Indonesia |
| OS-07 | Migrasi/impor data dari sistem Firebase lama | Data awal produksi dimulai kosong bersih |

---

## 5. Pemangku Kepentingan (Stakeholder)

| Stakeholder | Peran terhadap Sistem | Kepentingan Utama |
|---|---|---|
| Manajemen HSSE / Keamanan Korporat | Sponsor bisnis | Kepatuhan audit, penurunan insiden, akuntabilitas personel |
| Admin HQ | Pengguna (role ADMIN) | Kelola user, armada, kru; pantau seluruh operasi; audit disiplin |
| PIC / Supervisor Lapangan | Pengguna (role PIC) | Pantau armada binaan, kelola tindak lanjut dan penutupan temuan |
| Petugas Keamanan / Kru Kapal | Pengguna (role PETUGAS) | Kemudahan lapor patroli di lapangan, termasuk saat offline |
| Instansi personel (BUJP, TNI, POLRI, Internal) | Sumber personel | Kejelasan penugasan dan rekam kinerja personel |
| Tim Pengembang & Operasional TI | Pelaksana teknis | Kejelasan kebutuhan, batasan biaya cloud, keamanan data |

---

## 6. Peran Pengguna dan Hak Akses

### 6.1 Definisi Peran

| Peran | Deskripsi | Cakupan Data |
|---|---|---|
| **PETUGAS** (Security/Kru) | Personel lapangan di atas kapal | Hanya kapal tempat dirinya ditugaskan |
| **PIC** (Supervisor) | Pengawas lapangan yang membina kapal/shift tertentu | Kapal binaannya; akses patroli sama seperti petugas plus pengelolaan temuan |
| **ADMIN** (HQ) | Administrator pusat | Seluruh data operasional lintas armada |

### 6.2 Matriks Hak Akses

| Kemampuan | PETUGAS | PIC | ADMIN |
|---|:---:|:---:|:---:|
| Isi status kehadiran shift (tap-in) | ✔ | ✔ | — |
| Lapor checkpoint AMAN/TEMUAN | ✔ | ✔ | — |
| Lapor insiden manual (Lapor Baru) | ✔ | ✔ | ✔ |
| Update progres temuan | ✔* | ✔ | ✔ |
| Tutup laporan temuan (closing) | ✘ | ✔ | ✔ |
| Hapus temuan / riwayat / SOS | ✘ | ✘ | ✔ |
| Tombol darurat SOS | ✔ | ✔ | ✔ |
| Lihat Riwayat patroli | ✔ (kapalnya) | ✔ (binaan) | ✔ (semua) |
| Laporan Harian (dashboard) | ✘ | ✔ | ✔ |
| Kelola armada (kapal, checkpoint kustom, dokumen) | ✘ | ✘ | ✔ |
| Kelola pengguna & approve registrasi | ✘ | ✘ | ✔ |
| Rotasi/assignment kru ke kapal | ✘ | ✘ | ✔ |
| Unduh dokumen kapal | ✔ (kapalnya) | ✔ | ✔ |

\* Petugas dapat menambah progres pada temuan lama di checkpoint yang sama melalui alur "Temuan Lama"; kewenangan menutup laporan tetap pada PIC/Admin.

Halaman awal setelah login menyesuaikan peran: PETUGAS masuk ke halaman Patroli; ADMIN dan PIC masuk ke Laporan Harian.

### 6.3 Onboarding Pengguna

1. Calon pengguna melakukan registrasi publik dari halaman Login (data diri, instansi, foto).
2. Akun masuk antrean **Pending Registrations** dan belum dapat mengakses area operasional.
3. Admin memvalidasi, menetapkan peran dan penugasan kapal, lalu menyetujui (approve) atau menolak (reject).
4. Hanya akun berstatus `approved` dan `enabled` yang dapat beroperasi; pencabutan akses (disable/revoke) berlaku efektif ke seluruh perangkat pengguna tersebut.
5. Admin pertama dibuat melalui prosedur bootstrap khusus oleh tim TI (bukan dari registrasi publik).

---

## 7. Gambaran Proses Bisnis Utama

### 7.1 Siklus Patroli Harian per Shift

```
Jadwal shift (WIB): Shift 1 06:00–12:00 | Shift 2 12:00–18:00 | Shift 3 18:00–06:00

Petugas buka halaman Patroli
  → wajib set Status Shift ("Hadir & Patroli" / "Istirahat")  [halaman terkunci sebelum tap-in]
  → daftar titik checkpoint kapal tampil sesuai konfigurasi kapal
  → petugas memeriksa titik satu per satu:
      AMAN   : catatan singkat, foto opsional
      TEMUAN : wajib deskripsi kejadian + penyebab + tindak lanjut awal + foto
  → setiap laporan otomatis membawa: identitas pelapor, trusted time, GPS snapshot, konteks kapal
  → akhir shift: sistem otomatis mengarsipkan ke Riwayat
      - titik terisi → tercatat AMAN/TEMUAN
      - titik tak sempat diperiksa → MISSED
      - papan patroli di-reset untuk shift berikutnya
  → laporan yang terlambat tersinkron (outbox offline) tetap memperbaiki arsip riwayat shift terkait
```

### 7.2 Siklus Penanganan Temuan/Insiden

```
Sumber temuan:
  (a) checkpoint berstatus TEMUAN — otomatis masuk daftar Temuan
  (b) "Lapor Baru" manual dari halaman Temuan (lokasi standar atau kustom)

Saat petugas menandai TEMUAN pada titik yang masih punya temuan terbuka:
  → sistem menawarkan pilihan "Temuan Lama" (tambah progres pada kasus berjalan)
    atau "Temuan Baru" (buka kasus baru)  — mencegah duplikasi kasus

Penanganan:
  → PIC/Admin (dan petugas untuk kasus berjalan) menambah "Update Progress"
    berkali-kali (komentar + foto) hingga masalah selesai
  → Penutupan (closing) hanya oleh PIC/Admin: wajib foto perbaikan akhir + keterangan konklusi
  → Notifikasi temuan otomatis menjangkau PIC & petugas sekapal serta seluruh Admin
  → Admin dapat menghapus temuan; penghapusan berlaku permanen lintas perangkat
    (anti muncul kembali dari cache perangkat lain)
```

### 7.3 Keadaan Darurat (SOS)

```
Petugas menekan tombol SOS (header/sidebar) → konfirmasi cepat anti-salah-pencet
  → GPS perangkat dibaca dan alert tercatat permanen di server
  → sirine frekuensi tinggi berbunyi otomatis di semua perangkat yang login
    pada kapal tersebut dan pada dashboard Admin HQ
  → lokasi GPS + nama pelapor di-broadcast realtime + notifikasi push
  → alarm di tiap perangkat hanya berhenti setelah pengguna menekan "Terima & Mengerti"
    (acknowledgement tercatat)
  → penutupan/penghapusan alert oleh Admin tersinkron ke seluruh perangkat
```

### 7.4 Administrasi Armada dan Rotasi Kru (Admin)

```
Kelola kapal: data kapal (nama, tipe, IMO, rute, kargo, status operasional, posisi, foto)
  → atur daftar titik checkpoint kustom per kapal (baseline 21 titik standar tersedia)
  → unggah dokumen kapal (sertifikat keselamatan, izin berlayar, manual) — kru dapat mengunduh
Kelola kru: tetapkan personel bulan berjalan dan rencana bulan depan per kapal
  → penetapan kru bersifat atomik: status petugas (active/off-duty) dan akses data kapal
    berubah konsisten dalam satu transaksi
  → petugas tanpa penugasan otomatis berstatus off-duty dan tidak melihat data kapal mana pun
```

### 7.5 Pemantauan Manajemen (Laporan Harian)

```
ADMIN/PIC membuka Laporan Harian
  → rekap per kapal per shift: jumlah AMAN / TEMUAN / MISSED, tingkat kehadiran,
    kondisi cuaca, dan label audit waktu
  → tab On Going menampilkan progres shift berjalan secara live
  → peta posisi terakhir tiap kapal (dari GPS laporan patroli terbaru)
  → filter rentang tanggal, navigasi riwayat, dan detail hingga level checkpoint/foto
```

---

## 8. Kebutuhan Fungsional

Prioritas memakai skala MoSCoW: **M** (Must have), **S** (Should have), **C** (Could have).

### 8.1 Autentikasi, Registrasi, dan Akses (FR-AUTH)

| ID | Kebutuhan | Prioritas |
|---|---|:---:|
| FR-AUTH-01 | Sistem menyediakan registrasi publik dengan data profil, instansi asal (BUJP/TNI/POLRI/INTERNAL), dan foto | M |
| FR-AUTH-02 | Akun baru berstatus pending dan tidak dapat mengakses area operasional sebelum disetujui Admin | M |
| FR-AUTH-03 | Admin dapat menyetujui/menolak registrasi serta menetapkan peran dan penugasan kapal saat approval | M |
| FR-AUTH-04 | Login email + password; sesi bertahan (auto refresh token) hingga logout eksplisit | M |
| FR-AUTH-05 | Validasi akses operasional dilakukan server-side pada setiap pemulihan sesi (status enabled + approved) | M |
| FR-AUTH-06 | Pencabutan akses (disable/revoke/reject) menutup sesi pengguna terkait di seluruh perangkat saat online | M |
| FR-AUTH-07 | Gangguan jaringan/transien tidak boleh mengeluarkan (logout) pengguna dari sesi patroli; sesi hanya berubah atas jawaban definitif server | M |
| FR-AUTH-08 | Halaman awal pasca-login menyesuaikan peran (PETUGAS → Patroli; ADMIN/PIC → Laporan Harian) | S |

### 8.2 Patroli dan Checkpoint (FR-PAT)

| ID | Kebutuhan | Prioritas |
|---|---|:---:|
| FR-PAT-01 | Halaman patroli terkunci hingga petugas menyatakan status kehadiran shift ("Hadir & Patroli"/"Istirahat") | M |
| FR-PAT-02 | Daftar titik checkpoint per kapal mengikuti konfigurasi checkpoint kustom kapal tersebut; tersedia baseline 21 titik standar (Haluan, Buritan, Anjungan, Kamar Mesin, dsb.) | M |
| FR-PAT-03 | Hasil pemeriksaan AMAN: keterangan singkat dengan foto opsional | M |
| FR-PAT-04 | Hasil pemeriksaan TEMUAN: wajib deskripsi kejadian, penyebab, tindak lanjut awal, dan foto | M |
| FR-PAT-05 | Pengambilan foto terintegrasi kamera perangkat; foto dikompresi otomatis (varian hero/thumbnail) untuk efisiensi penyimpanan dan jaringan | M |
| FR-PAT-06 | Setiap laporan checkpoint otomatis menyematkan identitas pelapor, waktu terpercaya (trusted time), GPS snapshot perangkat, dan konteks kapal | M |
| FR-PAT-07 | Submit laporan berfungsi penuh saat offline: laporan dan foto diantre lokal lalu tersinkron otomatis saat online, tanpa duplikasi (idempotent) | M |
| FR-PAT-08 | Progres shift berjalan (x dari y titik) terlihat oleh petugas sekapal, PIC, dan Admin secara realtime | M |
| FR-PAT-09 | Jika titik memiliki temuan terbuka sebelumnya, sistem menawarkan pilihan menambah progres temuan lama atau membuka temuan baru | S |
| FR-PAT-10 | Kegagalan sinkronisasi laporan yang bersifat penolakan server (bukan offline) ditampilkan ke pengguna dengan penyebabnya, tidak gagal diam-diam | M |
| FR-PAT-11 | Petugas yang penugasannya tidak cocok/tidak dapat diakses mendapat pesan status yang jelas ("Kapal Tidak Dapat Diakses" / "Memuat data kapal"), bukan layar kosong | S |

### 8.3 Shift dan Riwayat (FR-SHF)

| ID | Kebutuhan | Prioritas |
|---|---|:---:|
| FR-SHF-01 | Hari operasional terbagi tiga shift (WIB): 06:00–12:00, 12:00–18:00, 18:00–06:00; sistem tetap mengenali skema shift lama untuk data historis | M |
| FR-SHF-02 | Pergantian shift memicu pengarsipan otomatis: titik terisi masuk Riwayat, titik tak terperiksa berstatus MISSED, papan patroli di-reset untuk shift berikutnya | M |
| FR-SHF-03 | Finalisasi riwayat shift dihitung server-side (terjadwal) agar konsisten untuk semua perangkat | M |
| FR-SHF-04 | Laporan yang terlambat tersinkron setelah shift berakhir tetap memperbarui arsip riwayat shift terkait | M |
| FR-SHF-05 | Riwayat menampilkan rekap per shift per kapal (aman/temuan/missed, petugas, kehadiran) dengan detail hingga level checkpoint dan foto | M |
| FR-SHF-06 | Admin dapat menghapus entri riwayat; penghapusan permanen dan tidak boleh "hidup kembali" dari cache/perangkat lain | M |

### 8.4 Manajemen Temuan/Insiden (FR-INC)

| ID | Kebutuhan | Prioritas |
|---|---|:---:|
| FR-INC-01 | Checkpoint berstatus TEMUAN otomatis tercatat sebagai insiden di halaman Temuan | M |
| FR-INC-02 | Pengguna dapat membuat laporan insiden manual ("Lapor Baru") dengan lokasi standar atau kustom, deskripsi, penyebab, tindak lanjut, dan foto | M |
| FR-INC-03 | Insiden terbuka dapat diberi pembaruan progres berkali-kali (komentar + foto) hingga selesai | M |
| FR-INC-04 | Penutupan insiden hanya oleh PIC/Admin dengan foto bukti perbaikan akhir dan keterangan konklusi | M |
| FR-INC-05 | Status insiden (open/closed) dan riwayat progres tersinkron realtime ke seluruh pihak berkepentingan | M |
| FR-INC-06 | Notifikasi insiden baru/progres menjangkau PIC dan petugas sekapal serta seluruh Admin (Admin tetap menerima meski datanya tidak terlihat oleh pelapor) | M |
| FR-INC-07 | Admin dapat menghapus insiden; penghapusan membersihkan seluruh permukaan terkait (halaman Patroli, Temuan, Riwayat, notifikasi) di semua perangkat | M |

### 8.5 Darurat SOS (FR-SOS)

| ID | Kebutuhan | Prioritas |
|---|---|:---:|
| FR-SOS-01 | Tombol SOS selalu terjangkau (header/sidebar) dengan konfirmasi cepat untuk mencegah pemicu tak sengaja | M |
| FR-SOS-02 | Pemicu SOS membaca GPS perangkat dan mencatat alert secara permanen di server (tahan restart/pindah perangkat) | M |
| FR-SOS-03 | Alarm/sirine berbunyi otomatis di semua perangkat yang login pada kapal terkait dan pada Admin HQ, disertai identitas pelapor dan lokasi | M |
| FR-SOS-04 | Alarm berhenti per perangkat hanya setelah pengguna menekan "Terima & Mengerti"; acknowledgement tercatat | M |
| FR-SOS-05 | Penerima SOS ditentukan server-side agar Admin selalu menjadi target walau tidak terlihat di data pelapor | M |
| FR-SOS-06 | Admin dapat menutup/menghapus alert SOS; status tersinkron ke seluruh perangkat | M |

### 8.6 Manajemen Armada (FR-SHP)

| ID | Kebutuhan | Prioritas |
|---|---|:---:|
| FR-SHP-01 | Admin mengelola data kapal: nama, tipe (Oil/Chemical Tanker, Gas/Bulk Carrier), nomor IMO, rute, jenis & jumlah kargo, status operasional, koordinat, dan foto | M |
| FR-SHP-02 | Admin mengatur daftar titik checkpoint kustom per kapal (tambah/ubah/hapus, deskripsi tugas per titik) | M |
| FR-SHP-03 | Admin mengunggah dokumen kapal (sertifikasi, izin, manual) dengan judul, tanggal, dan keterangan; kru kapal dapat melihat/mengunduh | M |
| FR-SHP-04 | Admin menetapkan kru bulan berjalan dan rencana kru bulan depan per kapal (mendukung rotasi bulanan yang mulus) | M |
| FR-SHP-05 | Penetapan kru bersifat atomik dan konsisten: perubahan daftar kru kapal dan status/penugasan profil petugas terjadi bersamaan; kondisi setengah-jadi tidak boleh terjadi | M |
| FR-SHP-06 | Petugas hanya dapat melihat/mengakses data kapal penugasannya; pencocokan nama kapal toleran terhadap perbedaan spasi/kapitalisasi | M |
| FR-SHP-07 | Peta lokasi armada menampilkan posisi terakhir tiap kapal dari GPS laporan patroli terbaru | S |
| FR-SHP-08 | Admin dapat menghapus kapal dari armada aktif; arsip riwayat/insiden lama kapal tetap tersimpan | S |

### 8.7 Manajemen Pengguna dan Kru (FR-USR)

| ID | Kebutuhan | Prioritas |
|---|---|:---:|
| FR-USR-01 | Admin melihat dan mengelola profil pengguna: data diri, kontak, kontak darurat, instansi, alamat kantor, foto | M |
| FR-USR-02 | Admin mengelola peran (ADMIN/PIC/PETUGAS) dan status operasional (active/off-duty/disabled) pengguna | M |
| FR-USR-03 | Antrean Pending Registrations menampilkan pendaftar baru realtime dengan aksi approve/reject | M |
| FR-USR-04 | Admin dapat membuat akun operasional secara langsung (provisioning) tanpa registrasi publik | S |
| FR-USR-05 | Status petugas mengikuti penugasan otomatis: memiliki kapal → active; tanpa kapal → off-duty; disabled hanya oleh keputusan Admin | M |

### 8.8 Laporan Harian / Dashboard (FR-RPT)

| ID | Kebutuhan | Prioritas |
|---|---|:---:|
| FR-RPT-01 | Laporan Harian (khusus ADMIN/PIC) merangkum operasional per kapal per shift: aman/temuan/missed, kehadiran petugas, cuaca, dan label audit waktu | M |
| FR-RPT-02 | Tab On Going menampilkan progres shift berjalan lintas armada secara live | M |
| FR-RPT-03 | Filter rentang tanggal dan navigasi periode untuk analisis historis | S |
| FR-RPT-04 | Peta posisi terakhir armada terintegrasi di dashboard | S |
| FR-RPT-05 | Kondisi cuaca terkini per lokasi kapal ditampilkan sebagai konteks operasional (sumber data cuaca eksternal) | C |

### 8.9 Notifikasi (FR-NTF)

| ID | Kebutuhan | Prioritas |
|---|---|:---:|
| FR-NTF-01 | Notifikasi in-app tersedia untuk: temuan baru, progres/penutupan temuan, SOS, dan pemberitahuan administratif | M |
| FR-NTF-02 | Web push (browser/PWA) terkirim untuk notifikasi penting walau aplikasi tidak sedang dibuka | S |
| FR-NTF-03 | Pengingat terjadwal otomatis: checkpoint tertunda (per kapal), rangkuman checkpoint tertunda, dan wrap-up akhir shift ke Admin, PIC, dan petugas sekapal | M |
| FR-NTF-04 | Notifikasi bertarget: hanya pihak berkepentingan (sekapal + Admin) yang menerima; tanpa kebocoran data ke kapal lain | M |
| FR-NTF-05 | Notifikasi yang merujuk data yang sudah dihapus Admin ikut dibersihkan (kecuali notifikasi audit penghapusan) | S |

### 8.10 Offline dan Sinkronisasi (FR-SYN)

| ID | Kebutuhan | Prioritas |
|---|---|:---:|
| FR-SYN-01 | Seluruh fungsi inti patroli (status shift, checkpoint, foto, temuan) dapat dijalankan tanpa koneksi internet | M |
| FR-SYN-02 | Mutasi data saat offline diantre di penyimpanan lokal (outbox) dan otomatis dikirim ulang saat koneksi pulih | M |
| FR-SYN-03 | Antrean memakai ID idempotent agar submit berulang untuk titik yang sama menimpa antrean, bukan menduplikasi | M |
| FR-SYN-04 | Foto yang tersimpan lokal saat offline diunggah ulang otomatis saat online dan tautannya dipulihkan pada laporan terkait tanpa jendela foto kosong | M |
| FR-SYN-05 | Perangkat lain (Admin/PIC/petugas sekapal) menerima pembaruan data secara realtime; terdapat mekanisme pemulihan (watchdog) bila kanal realtime terlewat | M |
| FR-SYN-06 | Data yang dihapus Admin tidak boleh muncul kembali akibat sinkronisasi ulang dari perangkat lama (mekanisme tombstone anti-resurrection); laporan baru yang sah setelah penghapusan tetap diterima | M |
| FR-SYN-07 | Sinkronisasi dirancang hemat kuota/egress: pembaruan delta per domain, bukan pengambilan penuh berulang | S |

### 8.11 Audit Waktu dan Integritas (FR-AUD)

| ID | Kebutuhan | Prioritas |
|---|---|:---:|
| FR-AUD-01 | Waktu laporan diambil dari jangkar waktu server terpercaya, bukan jam perangkat; sinkronisasi berkala (± tiap 5 menit) | M |
| FR-AUD-02 | Sistem mendeteksi manipulasi jam perangkat (clock tampering) memakai pembanding waktu server dan penghitung monotonic perangkat | M |
| FR-AUD-03 | Setiap laporan berlabel audit: Verified (Server-Trusted) / Pending-Sync (offline, menunggu verifikasi) / Suspicious-Tampered (terindikasi manipulasi) — terlihat oleh Admin/PIC | M |
| FR-AUD-04 | Saat waktu perangkat belum terverifikasi atau terdeteksi berubah, sistem memberi peringatan dan menahan aksi patroli hingga sinkronisasi ulang | M |
| FR-AUD-05 | Aksi administratif penting (approval, assignment, penghapusan) terekam sebagai jejak audit | S |

---

## 9. Kebutuhan Non-Fungsional

| ID | Kategori | Kebutuhan |
|---|---|---|
| NFR-01 | Ketersediaan offline | Fungsi inti patroli tersedia 100% tanpa jaringan; data tersimpan aman di penyimpanan lokal perangkat hingga tersinkron |
| NFR-02 | Keandalan data | Tidak ada kehilangan laporan yang sudah disubmit (offline maupun online); kegagalan tulis server tidak boleh diam-diam |
| NFR-03 | Kinerja | Aplikasi responsif di perangkat Android kelas menengah-bawah di lapangan; foto dikompresi sebelum simpan/unggah; pembaruan data memakai delta realtime, bukan muat ulang penuh |
| NFR-04 | Efisiensi biaya | Pola sinkronisasi meminimalkan egress database (proyeksi kolom eksplisit, delta per domain, watchdog watermark; polling hanya sebagai pemulihan) |
| NFR-05 | Keamanan akses | Kontrol akses berlapis di sisi server (row-level security) per peran dan per kapal; klien tidak dipercaya untuk otorisasi |
| NFR-06 | Keamanan data | Kredensial/kunci layanan hanya di server; berkas media diakses via URL bertanda tangan; header keamanan web (CSP dsb.) diterapkan di hosting |
| NFR-07 | Integritas audit | Stempel waktu tahan manipulasi jam perangkat; label audit tidak dapat diubah pengguna lapangan |
| NFR-08 | Kompatibilitas | Browser modern (PWA) dan Android WebView (APK Capacitor); UI responsif mobile-first (bottom-nav) dan desktop (sidebar, dual-pane) |
| NFR-09 | Kegunaan | Alur lapangan satu tangan, minim ketikan; pesan kegagalan dalam bahasa Indonesia yang menjelaskan penyebab dan tindakan |
| NFR-10 | Skalabilitas | Penambahan kapal/kru tidak mengubah arsitektur; beban realtime per kapal terisolasi (subscription per kapal/shift) |
| NFR-11 | Auditabilitas operasional | Riwayat shift terfinalisasi otomatis dan konsisten lintas perangkat; jejak audit administratif tersedia untuk penelusuran |
| NFR-12 | Keterujian | Regresi kritis (keamanan akses, sinkronisasi offline, tombstone, waktu terpercaya) dijaga suite test otomatis (test keamanan dan test halaman) |
| NFR-13 | Zona waktu | Seluruh perhitungan shift dan pelaporan memakai zona waktu Asia/Jakarta (WIB) |

---

## 10. Aturan Bisnis

| ID | Aturan |
|---|---|
| BR-01 | Hari operasional terdiri dari 3 shift WIB: 06:00–12:00, 12:00–18:00, 18:00–06:00 (lintas tengah malam) |
| BR-02 | Petugas wajib menyatakan status kehadiran shift sebelum dapat mengisi checkpoint |
| BR-03 | Laporan TEMUAN wajib menyertakan foto serta uraian kejadian, penyebab, dan tindak lanjut; laporan AMAN boleh tanpa foto |
| BR-04 | Checkpoint yang tidak diperiksa hingga shift berakhir otomatis berstatus MISSED dan tercatat di riwayat |
| BR-05 | Penutupan (closing) temuan hanya oleh PIC/Admin, wajib foto perbaikan akhir dan keterangan konklusi |
| BR-06 | Penghapusan data operasional (temuan, riwayat, SOS, kapal, user) adalah kewenangan eksklusif Admin |
| BR-07 | Pengguna baru tidak mendapatkan akses operasional sebelum disetujui Admin; peran dan penugasan ditetapkan saat approval |
| BR-08 | Petugas hanya dapat mengakses data kapal penugasannya; PIC sesuai binaan; Admin seluruh armada |
| BR-09 | Petugas dengan penugasan kapal berstatus `active`; tanpa penugasan `off-duty`; `disabled` hanya melalui keputusan Admin |
| BR-10 | Rotasi kru direncanakan per bulan: daftar kru bulan berjalan dan bulan depan dikelola terpisah agar pergantian akhir bulan mulus |
| BR-11 | Waktu sah laporan adalah waktu server terpercaya; laporan offline berstatus menunggu verifikasi hingga tersinkron; indikasi manipulasi jam diberi label untuk audit |
| BR-12 | Alarm SOS pada tiap perangkat hanya berhenti setelah pengguna menekan tombol penerimaan; penerimaan tercatat sebagai bukti respons |
| BR-13 | Laporan sah yang dibuat SETELAH suatu penghapusan Admin harus tetap diterima; hanya sinkronisasi ulang data lama (stale) yang ditolak |
| BR-14 | Gangguan jaringan tidak boleh menggugurkan sesi kerja petugas; hanya keputusan definitif server (dicabut/ditolak/di-disable) yang mengakhiri akses |

---

## 11. Kebutuhan Data dan Integrasi

### 11.1 Entitas Data Utama

| Entitas | Isi Ringkas |
|---|---|
| Profil pengguna | Identitas, peran, instansi, status operasional, penugasan kapal, kontak darurat, foto |
| Registrasi tertunda | Antrean pendaftar baru menunggu keputusan Admin |
| Kapal | Identitas kapal, tipe, IMO, rute, kargo, status, posisi, foto, daftar checkpoint kustom, kru bulan ini & bulan depan |
| Dokumen kapal | Metadata + berkas dokumen (sertifikat, izin, manual) |
| Status shift | Pernyataan kehadiran petugas per shift |
| Laporan patroli | Hasil per checkpoint per shift per kapal (status, uraian, foto, GPS, trusted time, pelapor) |
| Riwayat shift | Arsip finalisasi per shift per kapal (aman/temuan/missed + snapshot checkpoint) |
| Insiden | Kasus temuan + rangkaian progres + dokumentasi + status open/closed |
| Alert SOS | Kejadian darurat + lokasi + pelapor + daftar acknowledgement |
| Notifikasi | Pesan bertarget per pengguna + langganan push |
| Jejak audit & tombstone | Rekam aksi administratif dan penanda penghapusan permanen |

### 11.2 Integrasi dan Platform

| Komponen | Layanan | Peran Bisnis |
|---|---|---|
| Backend terkelola | Supabase (Auth, Postgres + RLS, Storage, Realtime, Edge Functions, penjadwal pg_cron) | Autentikasi, otorisasi berlapis, data operasional, media, realtime, proses terjadwal (finalisasi shift, pengingat) |
| Hosting frontend | Vercel | Distribusi aplikasi web/PWA + header keamanan |
| Aplikasi Android | Capacitor (WebView) + plugin Kamera, Geolocation, Network | Distribusi APK; akses kamera & GPS native |
| Push notification | Firebase Cloud Messaging (web push, kunci VAPID) | Notifikasi saat aplikasi tidak dibuka (browser/PWA) |
| Data cuaca | Open-Meteo API (publik) | Konteks cuaca pada laporan harian/patroli |
| Peta | Leaflet + tile OpenStreetMap | Visualisasi posisi armada |
| Penyimpanan lokal perangkat | localStorage + IndexedDB (foto & outbox mutasi) | Fondasi offline-first |

---

## 12. Asumsi dan Ketergantungan

| ID | Asumsi / Ketergantungan |
|---|---|
| AS-01 | Setiap petugas memiliki perangkat Android/browser modern dengan kamera dan GPS yang berfungsi |
| AS-02 | Konektivitas di laut bersifat intermiten; desain mengasumsikan offline berjam-jam adalah kondisi normal, bukan pengecualian |
| AS-03 | Organisasi menyediakan Admin HQ yang aktif memproses approval registrasi dan rotasi kru |
| AS-04 | Ketersediaan layanan pihak ketiga: Supabase, Vercel, FCM, Open-Meteo; gangguan layanan tersebut menurunkan fungsi online namun tidak menghentikan patroli offline |
| AS-05 | Penetapan kebijakan shift (3 shift WIB) berlaku seragam untuk seluruh armada |
| AS-06 | Perangkat pengguna memiliki ruang penyimpanan lokal memadai untuk foto offline; sistem memantau kuota penyimpanan |
| AS-07 | Data produksi dimulai kosong (tanpa migrasi dari sistem lama); admin pertama dibuat lewat prosedur bootstrap TI |

---

## 13. Batasan (Constraints)

| ID | Batasan |
|---|---|
| CT-01 | Notifikasi push background native Android nonaktif pada rilis ini; push berjalan sebagai web push (PWA/browser) dan alarm realtime in-app saat aplikasi aktif |
| CT-02 | Posisi kapal bukan pelacakan kontinu; hanya posisi terakhir dari GPS laporan patroli |
| CT-03 | Biaya infrastruktur ditekan pada tier layanan terkelola; pola akses data wajib hemat egress (aturan efisiensi sinkronisasi mengikat pengembangan selanjutnya) |
| CT-04 | Aplikasi berbahasa Indonesia; zona waktu operasional tunggal (WIB) |
| CT-05 | Perubahan skema/kebijakan basis data produksi hanya melalui migrasi maju (tanpa reset data produksi) |

---

## 14. Risiko dan Mitigasi

| ID | Risiko | Dampak | Mitigasi (terpasang/berjalan) |
|---|---|---|---|
| RSK-01 | Perangkat offline lama membawa data basi yang menimpa data valid saat sinkron | Kehilangan/duplikasi data operasional | ID idempotent, pembandingan sebelum tulis, tombstone dengan guard waktu, penolakan snapshot kosong menimpa data valid |
| RSK-02 | Manipulasi jam perangkat untuk memalsukan waktu patroli | Audit tidak sahih | Jangkar waktu server + deteksi drift/tamper + label audit Suspicious |
| RSK-03 | Kegagalan jaringan saat proses kamera/resume membuat aplikasi macet atau logout | Petugas gagal lapor, frustrasi pengguna | Timeout pada seluruh panggilan penggerbang UI, sesi hangat tidak diblokir skeleton, retry mandiri (self-heal), sesi hanya berakhir atas keputusan definitif server |
| RSK-04 | Penghapusan oleh Admin "hidup kembali" dari cache perangkat lain | Data terhapus muncul lagi, kebingungan operasional | Mekanisme tombstone anti-resurrection lintas permukaan (patroli, temuan, riwayat, notifikasi) |
| RSK-05 | Lonjakan biaya egress database seiring bertambahnya armada | Biaya operasional membengkak | Sinkronisasi delta per domain, proyeksi kolom, watchdog watermark, kompresi foto |
| RSK-06 | Ketergantungan pada layanan pihak ketiga (Supabase/Vercel/FCM) | Gangguan fungsi online | Desain offline-first menjaga operasi inti; antrean outbox menunda tulis hingga layanan pulih |
| RSK-07 | Kesalahan penugasan kru menyebabkan petugas kehilangan akses kapal | Patroli terhenti | Transaksi assignment atomik + guard server terhadap state-sync lama + pesan status akses yang jelas di UI |
| RSK-08 | Registrasi liar / akun tidak berhak masuk area operasional | Kebocoran data operasional | Gerbang approval Admin + validasi akses server-side setiap sesi + pencabutan akses efektif lintas perangkat |

---

## 15. Kriteria Penerimaan (Tingkat Bisnis)

| ID | Kriteria |
|---|---|
| AC-01 | Petugas dapat menyelesaikan seluruh siklus patroli satu shift (tap-in → isi seluruh checkpoint → arsip otomatis) tanpa bantuan pihak lain, termasuk dalam kondisi offline penuh |
| AC-02 | Laporan yang disubmit saat offline muncul utuh (teks + foto) di perangkat Admin/PIC setelah perangkat pelapor kembali online, tanpa duplikasi |
| AC-03 | Setiap shift yang berakhir menghasilkan arsip riwayat dengan penjumlahan aman + temuan + missed = total titik kapal |
| AC-04 | Temuan dapat dibuat, diberi minimal dua kali progres, dan ditutup oleh PIC dengan foto akhir; seluruh tahapan terlihat realtime oleh Admin |
| AC-05 | SOS yang dipicu petugas membunyikan alarm di perangkat lain yang login pada kapal yang sama dan di Admin HQ, menampilkan pelapor + lokasi; alarm berhenti hanya setelah "Terima & Mengerti" |
| AC-06 | Pengguna yang memundurkan/memajukan jam perangkat lalu membuat laporan menghasilkan label audit Suspicious/peringatan sinkronisasi, terlihat oleh Admin |
| AC-07 | Akun baru tidak dapat mengakses area operasional sebelum approval Admin; setelah di-disable, sesi pengguna tersebut berakhir di seluruh perangkatnya |
| AC-08 | Data yang dihapus Admin tidak muncul kembali di perangkat mana pun setelah sinkronisasi; laporan baru pasca-penghapusan tetap diterima |
| AC-09 | Admin dapat menyelesaikan rotasi kru bulan depan untuk satu kapal dalam satu alur di halaman Armada, dan petugas terdampak langsung mendapat/kehilangan akses sesuai penugasan |
| AC-10 | Laporan Harian menampilkan rekap per kapal per shift (aman/temuan/missed, kehadiran, cuaca, label audit) untuk rentang tanggal yang dipilih |

---

## 16. Glosarium

| Istilah | Definisi |
|---|---|
| Checkpoint | Titik pemeriksaan patroli pada kapal (mis. Anjungan, Kamar Mesin, Buritan) |
| AMAN / TEMUAN / MISSED | Status hasil checkpoint: normal / bermasalah / tidak sempat diperiksa hingga shift berakhir |
| Shift | Periode jaga patroli; 3 shift per hari (WIB) |
| Tap-in / Status Shift | Pernyataan kehadiran petugas sebelum mulai patroli ("Hadir & Patroli"/"Istirahat") |
| Insiden / Temuan | Kasus masalah yang membutuhkan tindak lanjut hingga penutupan |
| Closing | Penutupan laporan temuan oleh PIC/Admin dengan bukti foto akhir dan konklusi |
| SOS | Alarm darurat lintas perangkat (perompakan, kebakaran, medis, dsb.) |
| Trusted Time | Waktu server terpercaya yang menjadi acuan sah stempel waktu laporan |
| Clock Tampering | Manipulasi jam perangkat yang dideteksi dan dilabeli sistem |
| Offline-first | Prinsip desain: seluruh fungsi inti berjalan tanpa internet, sinkron menyusul |
| Outbox | Antrean mutasi data lokal yang dikirim ulang otomatis saat online |
| Tombstone | Penanda penghapusan permanen agar data terhapus tidak muncul kembali dari cache lama |
| PIC | Person In Charge — supervisor lapangan pembina kapal/shift |
| Admin HQ | Administrator pusat dengan kewenangan penuh |
| BUJP | Badan Usaha Jasa Pengamanan (penyedia personel keamanan) |
| UPP / NON UPP | Klasifikasi status kapal dalam armada |
| RLS | Row-Level Security — kontrol akses per baris data di sisi server |
| PWA | Progressive Web App — aplikasi web yang dapat dipasang dan bekerja offline |

---

## 17. Lampiran — Ringkasan Arsitektur Solusi

```
Perangkat Petugas/PIC/Admin
  (PWA browser / APK Android Capacitor: kamera, GPS, deteksi jaringan)
        │
        ├─ Penyimpanan lokal: localStorage (state), IndexedDB (foto, outbox mutasi)
        │     └─ Offline-first: laporan & foto diantre → auto-flush saat online
        │
        ▼
  Supabase (backend terkelola)
        ├─ Auth: sesi & identitas
        ├─ Postgres + RLS: data operasional, otorisasi per peran/kapal
        ├─ Storage: foto laporan, avatar, dokumen kapal (signed URL)
        ├─ Realtime: broadcast perubahan (patroli, temuan, SOS, notifikasi)
        ├─ Edge Functions: waktu server (trusted time), resolusi akses,
        │                  approval registrasi, provisioning, kirim push
        └─ pg_cron: finalisasi riwayat shift, pengingat checkpoint tertunda,
                    rangkuman & wrap-up shift
        │
        ├─ FCM (web push) → notifikasi saat aplikasi tidak dibuka
        ├─ Open-Meteo → data cuaca laporan harian
        └─ Vercel → hosting SPA + header keamanan

Kualitas dijaga oleh suite test otomatis: keamanan akses (RLS/auth/trusted time)
dan perilaku halaman (sinkronisasi offline, tombstone, finalisasi shift).
```

---

*Dokumen ini disusun berdasarkan kondisi sistem per Juli 2026. Perubahan kebutuhan bisnis selanjutnya dikelola melalui revisi dokumen ini (versi berikutnya) dan disinkronkan dengan `SYSTEM_MAP.md`.*
