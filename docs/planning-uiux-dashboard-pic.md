# Planning UI/UX Dashboard PIC

Status: Draft v1  
Produk: SmartPatrol  
Tanggal: 7 April 2026  
Konteks: disusun berdasarkan modul aktif pada `Patroli`, `Temuan`, `Riwayat`, `Notifikasi`, `Armada`, dan state utama aplikasi saat ini.

## 1. Latar Belakang

Saat ini kebutuhan operasional PIC sudah tersebar di beberapa halaman:

- `Patroli` untuk monitoring checkpoint dan progres shift aktif.
- `Temuan` untuk pelaporan dan tindak lanjut incident.
- `Riwayat` untuk evaluasi shift yang sudah lewat.
- `Notifikasi` untuk alert dan inbox operasional.
- `Armada` untuk data kapal, personel, checkpoint, dan jadwal penugasan.

Struktur ini sudah cukup untuk operasional per fitur, tetapi belum memberi satu layar ringkas yang membantu PIC mengambil keputusan cepat. PIC membutuhkan dashboard yang bisa dipindai dalam beberapa detik untuk menjawab pertanyaan inti:

- Apa yang harus saya perhatikan sekarang?
- Shift ini aman atau bermasalah?
- Temuan mana yang belum ditindaklanjuti?
- Apakah coverage petugas cukup?
- Apakah ada risiko missed checkpoint, pergantian shift, atau kekurangan personel?

## 2. Tujuan Dashboard PIC

Dashboard PIC harus menjadi command center operasional harian untuk pengawasan patroli, penanganan temuan, dan kesiapan petugas.

Tujuan utama:

1. Menyatukan seluruh fokus kerja PIC dalam satu halaman utama.
2. Mempercepat identifikasi kondisi kritis tanpa harus berpindah halaman.
3. Memudahkan PIC mengambil aksi cepat terhadap patroli, temuan, dan penugasan.
4. Menjadi entry point utama setelah PIC login.

## 3. Profil Pengguna

### Persona Utama

PIC kapal atau area operasi yang bertanggung jawab terhadap:

- pelaksanaan patroli pada shift aktif
- tindak lanjut temuan
- kesiapan personel
- transisi shift
- dokumentasi dan pengawasan operasional armada yang diawasi

### Karakteristik Penggunaan

- Sering membuka aplikasi dalam situasi cepat dan penuh distraksi.
- Lebih membutuhkan status dan keputusan daripada data mentah.
- Membutuhkan tampilan yang padat namun mudah dipindai.
- Sering bekerja di perangkat mobile, tetapi tetap membutuhkan versi desktop yang kuat untuk supervisi lebih detail.

## 4. Pertanyaan Utama Yang Harus Dijawab Dalam 5 Detik

Saat PIC membuka dashboard, tampilan harus langsung menjawab:

1. Shift apa yang sedang berjalan dan berapa sisa waktunya?
2. Berapa checkpoint yang sudah selesai, temuan, dan missed?
3. Temuan open mana yang paling mendesak?
4. Siapa petugas yang sedang on-duty dan siapa yang belum melapor?
5. Apakah ada alert penting: missed checkpoint, kekurangan kru, dokumen penting, atau pergantian shift?

## 5. Prinsip UI/UX

### 5.1 Prinsip Informasi

- Prioritaskan alert dan aksi, bukan dekorasi.
- Data penting harus tampil di atas fold pertama.
- Satu area hanya punya satu fungsi utama.
- Informasi kritis memakai penanda warna dan ikon yang konsisten.

### 5.2 Prinsip Interaksi

- PIC harus bisa menindaklanjuti kondisi penting maksimal dalam 1 sampai 2 klik.
- Quick action harus muncul di dekat data yang relevan.
- Hindari perpindahan halaman jika aksi bisa dilakukan dari panel samping, drawer, atau modal ringan.

### 5.3 Prinsip Visual

- Mood: command center maritim, tenang, profesional, responsif.
- Basis warna mengikuti tampilan aplikasi saat ini: navy gelap sebagai surface utama.
- Cyan untuk live, aktif, dan normal.
- Amber untuk warning dan temuan yang butuh perhatian.
- Merah hanya untuk status critical atau missed.
- Gunakan kepadatan informasi yang rapi, bukan card mosaic yang ramai.

## 6. Ruang Lingkup Dashboard PIC

Dashboard harus mencakup fokus perhatian PIC berikut:

- patroli shift aktif
- temuan open dan progres tindak lanjut
- pengaturan jadwal petugas
- status shift dan handover
- kondisi armada yang menjadi tanggung jawab PIC
- notifikasi dan alert operasional
- ringkasan performa patroli harian atau mingguan

Hal yang tidak menjadi fokus utama dashboard PIC:

- manajemen akun global seluruh user
- administrasi penuh armada lintas organisasi
- pengaturan kredensial sistem

## 7. Struktur Informasi Dashboard

### 7.1 Desktop Layout

Gunakan layout 3 area utama dengan priority strip di atas.

```text
+----------------------------------------------------------------------------+
| Header Command Bar                                                         |
| Kapal/Area | Shift Aktif | Countdown | Cuaca | Status Online | Notifikasi  |
+----------------------------------------------------------------------------+
| Priority Strip                                                             |
| Critical Alert | Temuan Open | Missed | Pergantian Shift | Coverage Kru    |
+----------------------+-------------------------------+----------------------+
| Kolom Kiri           | Kolom Tengah                  | Kolom Kanan          |
| KPI Operasi          | Live Patrol Monitor           | Action Panel         |
| Ringkasan Shift      | Status checkpoint             | Temuan prioritas     |
| Armada Snapshot      | Progress timeline             | Jadwal petugas       |
|                      | Aktivitas terakhir            | Quick actions        |
+----------------------------------------------------------------------------+
| Bottom Section                                                             |
| Tren 7/30 hari | Riwayat ringkas | Hotspot temuan | Handover note          |
+----------------------------------------------------------------------------+
```

### 7.2 Mobile Layout

Urutan konten mobile:

1. Header ringkas
2. Priority strip horizontal scroll
3. KPI operasi hari ini
4. Temuan prioritas
5. Live patrol monitor
6. Jadwal petugas dan shift
7. Notifikasi terakhir
8. Riwayat dan tren ringkas

Pendekatan mobile:

- gunakan stack vertical
- area kritis tetap di atas
- quick action dibuat sticky atau floating di bawah
- panel detail dibuka sebagai bottom sheet atau full-screen drawer

## 8. Modul Utama

| Modul | Tujuan | Isi Utama | Aksi Utama |
|---|---|---|---|
| Header Command Bar | Memberi konteks operasional saat ini | nama kapal/area, tanggal, shift aktif, countdown, cuaca, status online | buka notifikasi, ganti scope kapal jika diizinkan |
| Priority Strip | Menarik perhatian ke isu yang paling penting | temuan open, checkpoint missed, checkpoint pending, petugas kurang, shift ending soon | buka detail item terkait |
| KPI Operasi Hari Ini | Menyediakan gambaran cepat kondisi patroli | total checkpoint, selesai, aman, temuan, missed, petugas on-duty | buka detail ringkasan |
| Live Patrol Monitor | Memantau eksekusi patroli berjalan | daftar checkpoint aktif, status per titik, petugas terakhir, waktu update terakhir | buka detail checkpoint, follow up |
| Temuan Prioritas | Menampilkan temuan yang butuh aksi PIC | daftar temuan open/in progress, severity, lokasi, usia temuan, last update | assign, tambah progress, close |
| Jadwal Petugas | Mengelola kesiapan personel | shift saat ini, shift berikutnya, standby, coverage gap, konflik jadwal | ubah roster, konfirmasi penugasan |
| Armada Snapshot | Merangkum status armada yang diawasi | status kapal, rute, jumlah kru aktif, jumlah checkpoint, dokumen penting | buka detail armada |
| Inbox Operasional | Menyatukan alert dan notifikasi operasional | notifikasi baru, assignment changed, incident update, shift reminder | tandai dibaca, buka sumber notifikasi |
| Tren dan Evaluasi | Mendukung supervisi dan evaluasi | completion rate, temuan berulang, lokasi paling rawan, missed terbanyak | buka riwayat, filter periode |
| Handover Panel | Mendukung pergantian shift | catatan shift, pending issue, item yang harus diteruskan | simpan catatan handover |

## 9. Detail Konten Per Modul

### 9.1 Header Command Bar

Komponen:

- nama aplikasi dan role `PIC`
- nama kapal atau area tanggung jawab
- tanggal dan jam lokal
- shift aktif
- countdown sisa shift
- cuaca ringkas
- indikator online atau offline
- ikon notifikasi dengan unread counter

Nilai UX:

- memberi orientasi instan
- meminimalkan kebutuhan pindah ke halaman lain hanya untuk cek konteks kerja

### 9.2 Priority Strip

Priority strip harus menampilkan maksimal 5 alert agar tetap fokus.

Prioritas urutan:

1. temuan critical atau overdue
2. checkpoint missed
3. checkpoint pending menjelang akhir shift
4. kekurangan coverage petugas
5. pergantian shift kurang dari 15 atau 30 menit

Setiap alert harus berisi:

- label singkat
- angka
- warna status
- aksi cepat `lihat`

### 9.3 KPI Operasi Hari Ini

KPI inti:

- total checkpoint shift aktif
- checkpoint selesai
- checkpoint aman
- checkpoint dengan temuan
- checkpoint missed
- jumlah petugas on-duty
- jumlah temuan open

Catatan UX:

- KPI cukup 5 sampai 7 item
- jangan semua dibuat sama dominan
- 1 KPI utama adalah progres patroli shift aktif

### 9.4 Live Patrol Monitor

Konten:

- list checkpoint shift aktif
- status: pending, completed aman, completed temuan, missed
- nama petugas yang mengisi
- waktu update terakhir
- penanda titik tambahan shift

Interaksi:

- klik item membuka detail checkpoint di panel samping
- filter cepat: `semua`, `pending`, `temuan`, `missed`
- pencarian titik patroli

### 9.5 Temuan Prioritas

Konten:

- lokasi
- kapal
- deskripsi singkat
- reporter
- foto thumbnail
- severity
- status
- last update
- umur temuan

Interaksi:

- tambah progress
- ubah status
- tutup temuan
- buka kronologi lengkap

Catatan:

- temuan dari patroli dan temuan manual harus tampak dalam satu board
- gunakan chip status yang konsisten: `open`, `in progress`, `closed`

### 9.6 Jadwal Petugas dan Shift

Konten:

- petugas on-duty sekarang
- petugas untuk shift berikutnya
- petugas standby
- personel yang belum terkonfirmasi
- coverage gap
- konflik jadwal atau overlap

Interaksi:

- assign atau remove petugas
- atur tanggal mulai dan selesai
- tandai siap handover
- lihat beban shift berikutnya

Catatan penting:

Saat ini pengaturan personel masih banyak berada di modul armada. Dashboard PIC harus menarik versi operasionalnya ke satu tempat, terbatas hanya untuk scope armada yang diawasi PIC.

### 9.7 Armada Snapshot

Konten:

- nama kapal
- status kapal
- rute atau lokasi sandar
- jumlah kru aktif
- jumlah checkpoint
- dokumen penting
- status UPP atau NON UPP

Interaksi:

- buka detail armada
- lihat dokumen yang akan jatuh tempo
- lihat checkpoint konfigurasi kapal

### 9.8 Inbox Operasional

Konten:

- notifikasi terbaru
- unread count
- kategori notifikasi
- timestamp
- pengirim

Kategori utama:

- incident update
- checkpoint pending
- checkpoint missed
- shift reminder
- assignment changed

### 9.9 Tren dan Evaluasi

Konten:

- completion rate 7 hari
- jumlah temuan per shift
- missed checkpoint per kapal
- lokasi temuan paling sering
- petugas atau shift yang sering memerlukan follow up

Interaksi:

- filter periode
- filter kapal
- buka riwayat detail

## 10. User Flow Prioritas

### Flow 1: PIC Membuka Dashboard Saat Shift Berjalan

1. PIC login.
2. Dashboard terbuka di scope kapal yang menjadi tanggung jawabnya.
3. PIC melihat priority strip dan KPI shift aktif.
4. Jika ada alert, PIC klik alert dan masuk ke detail terkait.
5. PIC mengambil aksi tanpa harus berpindah jauh dari dashboard.

### Flow 2: PIC Menindaklanjuti Temuan Open

1. PIC melihat kartu temuan prioritas.
2. PIC memilih temuan dengan severity tertinggi atau paling lama open.
3. Panel detail muncul di sisi kanan atau bottom sheet.
4. PIC menambah progress, assign personel, atau menutup temuan.
5. Dashboard memperbarui summary dan notifikasi secara real-time.

### Flow 3: PIC Mengecek Kesiapan Pergantian Shift

1. Countdown shift mendekati akhir.
2. Priority strip menampilkan alert handover.
3. PIC membuka panel jadwal petugas.
4. PIC memastikan shift berikutnya sudah terisi dan coverage cukup.
5. PIC meninjau pending checkpoint dan handover note.

## 11. Komponen UI Yang Direkomendasikan

Komponen inti:

- command header
- alert chip strip
- KPI block
- live list dengan status badge
- priority incident board
- roster panel
- compact timeline
- mini trend chart
- handover note panel
- quick action toolbar

Pola interaksi:

- panel kanan untuk detail desktop
- bottom sheet untuk detail mobile
- sticky summary bar untuk progress shift
- segmented control untuk filter `hari ini`, `shift ini`, `open`, `closed`

## 12. State dan Edge Case

### 12.1 Empty State

Contoh empty state:

- tidak ada temuan open
- tidak ada alert aktif
- semua checkpoint selesai
- jadwal shift berikutnya belum diatur

UX requirement:

- empty state tetap informatif
- selalu sertakan arahan aksi berikutnya jika memang ada tindakan yang bisa dilakukan

### 12.2 Loading State

Gunakan skeleton untuk:

- KPI
- live patrol list
- temuan prioritas
- jadwal petugas

### 12.3 Offline State

Karena aplikasi punya konteks offline/local-first, dashboard harus:

- tetap bisa membaca data terakhir yang tersimpan
- memberi indikator jelas bahwa data mungkin belum sinkron
- menandai aksi yang tertunda sinkronisasi

### 12.4 Data Padat

Jika temuan atau checkpoint terlalu banyak:

- tampilkan maksimum 5 item prioritas dulu
- sisanya masuk tombol `lihat semua`
- gunakan grouping berdasarkan status atau severity

## 13. Responsiveness

### Desktop

- layout 3 kolom
- panel detail tetap terbuka
- cocok untuk supervisi dan review detail

### Tablet

- layout 2 kolom
- roster dan detail bisa bergantian
- priority strip tetap horizontal

### Mobile

- layout satu kolom
- detail dibuka sebagai bottom sheet atau halaman penuh
- sticky summary di bawah untuk progres dan quick actions

## 14. Bahasa Visual dan Design System

### Warna

- background utama: navy gelap
- surface sekunder: biru gelap dengan kontras lembut
- cyan: aktif, live, info
- emerald: aman atau normal
- amber: warning, temuan open, pending
- rose/red: missed dan critical

### Tipografi

- heading kuat dan ringkas
- label utilitarian, bukan copy marketing
- angka KPI menggunakan gaya yang mudah dipindai

### Ikonografi

- konsisten memakai ikon status dan aksi yang sudah digunakan aplikasi saat ini
- hindari ikon dekoratif yang tidak membantu scanning

## 15. Pemetaan Dengan Data Yang Sudah Ada

Dashboard PIC dapat memanfaatkan state yang sudah tersedia:

| Kebutuhan Dashboard | Sumber Data Saat Ini |
|---|---|
| shift aktif, countdown, progress patroli | `currentShiftMeta`, `currentShiftSchedule`, `checkpoints` |
| rekap aman, temuan, missed | `checkpoints`, `historyEntries` |
| temuan open dan closed | `incidentsData`, `incidentMeta` |
| notifikasi operasional | `notifications`, `visibleNotifications`, `unreadNotificationCount` |
| kapal aktif dan armada | `shipsData`, `operationalShip`, `activeShip` |
| kru aktif dan roster | `usersData`, `personnel`, `personnelNextMonth`, `personnelSchedules` |
| riwayat evaluasi | `historyEntries` |

Catatan implementasi:

- role `PIC` sudah tersedia
- PIC sudah punya hak kelola tertentu untuk temuan
- data jadwal personel masih perlu diproyeksikan ulang agar lebih cocok untuk dashboard PIC

## 16. Ruang Lingkup Rilis

### Versi 1

Fokus:

- header command bar
- priority strip
- KPI operasi hari ini
- live patrol monitor
- temuan prioritas
- inbox operasional

### Versi 2

Fokus:

- jadwal petugas terintegrasi penuh
- handover panel
- trend dan evaluasi 7 atau 30 hari
- multi-kapal untuk PIC yang memegang lebih dari satu armada

### Versi 3

Fokus:

- insight prediktif
- rekomendasi coverage shift
- temuan berulang otomatis
- reminder dokumen dan kesiapan armada

## 17. Kriteria Keberhasilan UX

Dashboard dianggap berhasil jika:

1. PIC dapat memahami kondisi shift aktif dalam kurang dari 5 detik.
2. PIC dapat membuka dan menindaklanjuti temuan prioritas dalam maksimal 2 interaksi.
3. PIC dapat melihat risiko coverage personel tanpa masuk ke modul armada penuh.
4. PIC tidak perlu berpindah ke lebih dari satu halaman lain untuk operasi harian utama.
5. Informasi yang paling kritis selalu muncul di area teratas dashboard.

## 18. Rekomendasi Implementasi Di Repo Ini

Tahap implementasi yang disarankan:

1. Tambahkan halaman baru `DashboardPICPage.jsx`.
2. Jadikan halaman ini sebagai landing default untuk role `PIC`.
3. Ambil data dari context yang sudah ada tanpa refactor besar lebih dulu.
4. Buat komponen terpisah untuk:
   - `PicCommandHeader`
   - `PicPriorityStrip`
   - `PicOpsKpi`
   - `PicPatrolMonitor`
   - `PicIncidentBoard`
   - `PicRosterPanel`
   - `PicInboxPanel`
   - `PicTrendPanel`
5. Setelah struktur stabil, baru satukan quick actions dan polish layout responsive.

## 19. Kesimpulan

Dashboard PIC harus diposisikan sebagai pusat pengawasan operasional, bukan halaman statistik biasa. Fokus utamanya adalah membantu PIC membaca kondisi real-time, mengidentifikasi risiko, dan mengambil tindakan cepat terkait patroli, temuan, jadwal petugas, dan transisi shift. Dengan pendekatan ini, SmartPatrol akan terasa lebih siap dipakai untuk supervisi lapangan sehari-hari.
