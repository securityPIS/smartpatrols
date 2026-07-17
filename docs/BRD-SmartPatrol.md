# Business Requirements Document (BRD) — SmartPatrol

| Informasi Dokumen | Detail |
|---|---|
| Nama Aplikasi/Solusi | SmartPatrol |
| Jenis Dokumen | Business Requirements Document (BRD) |
| Versi | 1.0 |
| Tanggal | 17 Juli 2026 |
| Status | Baseline |

---

# A. BUSINESS REQUIREMENT

## A.1 Identifikasi Proses Bisnis

| Item | Keterangan |
|---|---|
| Nama/Kode Proses Bisnis | **14.6.3 Mengelola teknologi pengamanan yang fit for purpose dalam lingkungan perusahaan** |
| Proses Bisnis Kritikal | **Tidak** |
| Nama Aplikasi/Solusi | SmartPatrol |
| Fungsi/Unit Pemilik | Security / HSSE |
| Kanal Pengguna | Aplikasi mobile (Android/PWA) untuk petugas lapangan; dashboard web untuk PIC dan Admin HQ |

## A.2 Latar Belakang

Perusahaan membutuhkan teknologi pengamanan yang **fit for purpose** untuk mendukung pengelolaan patroli keamanan armada kapal (proses bisnis 14.6.3). Praktik pencatatan patroli yang berjalan secara manual (kertas/pesan instan) belum memenuhi standar teknologi pengamanan yang memadai, dengan kendala utama:

1. Bukti pelaksanaan patroli (jam ronda, kelengkapan titik pemeriksaan, foto) mudah dimanipulasi sehingga audit keamanan tidak dapat diandalkan.
2. Area operasi laut minim sinyal menyebabkan pencatatan digital konvensional gagal menyimpan data dan berujung kehilangan laporan.
3. Temuan/insiden dilaporkan melalui kanal tidak terstruktur sehingga tindak lanjut tidak terlacak sampai tuntas.
4. Tidak tersedia mekanisme eskalasi keadaan darurat yang cepat dan terpusat dari kapal ke Headquarters.
5. Administrasi armada, dokumen kapal, dan rotasi penugasan kru dikelola manual dan tersebar.
6. Manajemen tidak memiliki visibilitas harian yang berbasis data atas kinerja patroli lintas armada.

SmartPatrol dihadirkan sebagai teknologi pengamanan yang sesuai kebutuhan lingkungan perusahaan (mobile, offline-first, dan tahan audit) untuk menutup keenam kesenjangan tersebut dalam satu platform terpadu.

## A.3 Tujuan Bisnis

| ID | Tujuan Bisnis |
|---|---|
| GOAL-01 | Menyediakan teknologi pengamanan patroli yang fit for purpose bagi operasi armada perusahaan |
| GOAL-02 | Menjamin akuntabilitas patroli: setiap titik pemeriksaan pada setiap shift tercatat dengan status jelas (AMAN / TEMUAN / MISSED) |
| GOAL-03 | Menjamin integritas bukti patroli (waktu, foto, lokasi) yang tahan manipulasi dan dapat diaudit |
| GOAL-04 | Menghilangkan kehilangan data di area tanpa sinyal melalui kemampuan operasi offline-first |
| GOAL-05 | Mempercepat siklus penanganan temuan/insiden dari pelaporan hingga penutupan yang terdokumentasi |
| GOAL-06 | Mempercepat eskalasi keadaan darurat dari kapal ke pihak terkait dan Headquarters |
| GOAL-07 | Menyederhanakan administrasi armada: rotasi kru, dokumen kapal, dan pemantauan posisi |
| GOAL-08 | Memberi manajemen visibilitas harian atas kinerja patroli, kehadiran, dan insiden lintas armada |

## A.4 Deskripsi Kebutuhan Bisnis

Perusahaan membutuhkan solusi teknologi pengamanan yang mampu:

1. **Digitalisasi patroli terjadwal** — mencatat hasil pemeriksaan setiap titik (checkpoint) per kapal per shift, dilengkapi foto, lokasi GPS, dan stempel waktu yang sah, menggantikan pencatatan manual.
2. **Operasi tanpa ketergantungan koneksi** — tetap dapat digunakan penuh oleh petugas di tengah laut tanpa sinyal, dengan sinkronisasi otomatis dan tanpa kehilangan data saat koneksi pulih.
3. **Integritas waktu dan audit** — memastikan waktu laporan bersumber dari waktu terpercaya (bukan jam perangkat) serta mendeteksi dan menandai indikasi manipulasi jam untuk kepentingan audit dan kedisiplinan personel.
4. **Manajemen temuan/insiden end-to-end** — mendukung pelaporan, pembaruan progres berulang, dan penutupan laporan yang terdokumentasi lengkap dengan kewenangan yang jelas.
5. **Penanganan keadaan darurat (SOS)** — menyediakan mekanisme darurat yang menyalakan alarm lintas perangkat sekapal dan ke Headquarters secara langsung disertai lokasi dan identitas pelapor.
6. **Administrasi armada dan personel** — mengelola data kapal, titik pemeriksaan per kapal, dokumen kapal, serta rotasi penugasan kru bulanan.
7. **Kontrol akses berbasis peran** — membatasi akses data sesuai peran (Admin, PIC, Petugas) dan penugasan kapal, dengan proses persetujuan (approval) untuk pengguna baru.
8. **Pemantauan manajerial** — menyajikan laporan harian per kapal per shift (kinerja patroli, kehadiran, insiden) sebagai dasar pengambilan keputusan operasional.

### Ringkasan Kebutuhan Bisnis (Business Requirement List)

| ID | Kebutuhan Bisnis |
|---|---|
| BR-01 | Petugas dapat melaksanakan dan mencatat patroli checkpoint per shift secara digital, termasuk hasil AMAN dan TEMUAN beserta foto |
| BR-02 | Sistem tetap berfungsi penuh saat offline dan menyinkronkan data secara otomatis tanpa kehilangan atau duplikasi laporan |
| BR-03 | Setiap laporan memakai waktu terpercaya dan diberi label audit; indikasi manipulasi jam perangkat terdeteksi dan tercatat |
| BR-04 | Temuan/insiden dapat dilaporkan, diperbarui progresnya, dan ditutup dengan bukti oleh pihak berwenang (PIC/Admin) |
| BR-05 | Tersedia fitur darurat SOS yang membunyikan alarm lintas perangkat sekapal dan ke Admin HQ beserta lokasi pelapor |
| BR-06 | Admin dapat mengelola armada (kapal, titik pemeriksaan, dokumen) dan melakukan rotasi penugasan kru bulanan |
| BR-07 | Akses data dibatasi berdasarkan peran dan penugasan kapal; pengguna baru wajib melalui persetujuan Admin |
| BR-08 | Manajemen memperoleh laporan harian per kapal per shift (aman/temuan/missed, kehadiran, insiden) untuk pemantauan operasional |
| BR-09 | Riwayat patroli setiap shift terarsip otomatis, konsisten, dan dapat ditelusuri untuk keperluan audit |

## A.5 Ruang Lingkup Bisnis

### Termasuk Lingkup

- Pelaksanaan dan pencatatan patroli checkpoint per kapal per shift (mobile, offline-first).
- Manajemen temuan/insiden (pelaporan, progres, penutupan) dan keadaan darurat (SOS).
- Administrasi armada: data kapal, titik pemeriksaan kustom, dokumen kapal, rotasi kru bulanan.
- Manajemen pengguna dan kontrol akses berbasis peran (Admin, PIC, Petugas) dengan persetujuan registrasi.
- Riwayat patroli per shift dan laporan harian (dashboard) bagi PIC dan Admin.
- Notifikasi operasional (temuan, SOS, pengingat checkpoint, rangkuman shift).
- Audit waktu terpercaya dan pelabelan integritas laporan.

### Di Luar Lingkup

- Integrasi HRIS/payroll dan sistem absensi biometrik.
- Pelacakan posisi kapal kontinu berbasis AIS/VMS eksternal (posisi diambil dari GPS laporan patroli terakhir).
- Asisten AI/bot untuk tanya-jawab operasional (masih tahap rencana).
- Aplikasi iOS native dan antarmuka multi-bahasa (saat ini Android/PWA berbahasa Indonesia).

## A.6 Pemangku Kepentingan (Stakeholder)

| Stakeholder | Peran terhadap Proses Bisnis |
|---|---|
| Manajemen HSSE / Keamanan Korporat | Pemilik kepentingan bisnis; kepatuhan audit dan penurunan insiden |
| Admin HQ | Mengelola user, armada, dan kru; memantau seluruh operasi |
| PIC (Supervisor Lapangan) | Memantau armada binaan; mengelola tindak lanjut dan penutupan temuan |
| Petugas Keamanan / Kru Kapal | Pelaksana patroli di lapangan (termasuk kondisi offline) |
| Instansi Personel (BUJP, TNI, POLRI, Internal) | Sumber personel yang ditugaskan |
| Unit TI / Pengembang | Penyedia dan pemelihara solusi teknologi |

## A.7 Manfaat yang Diharapkan (Expected Benefit)

| ID | Manfaat |
|---|---|
| BEN-01 | Bukti patroli yang sahih dan tahan manipulasi sebagai dasar audit keamanan yang andal |
| BEN-02 | Nihil kehilangan data patroli di area tanpa sinyal (operasi offline-first) |
| BEN-03 | Waktu tanggap keadaan darurat lebih cepat melalui eskalasi SOS realtime ke seluruh pihak terkait |
| BEN-04 | Penanganan temuan lebih terkontrol dan terdokumentasi hingga penutupan |
| BEN-05 | Efisiensi administrasi armada dan rotasi kru; dokumen kapal mudah diakses kru |
| BEN-06 | Visibilitas harian bagi manajemen untuk pengambilan keputusan operasional berbasis data |
| BEN-07 | Peningkatan kedisiplinan dan akuntabilitas personel keamanan |

## A.8 Kriteria Keberhasilan (Success Criteria / KPI)

| ID | Indikator | Target |
|---|---|---|
| KPI-01 | Cakupan pencatatan checkpoint per shift (aman + temuan + missed = total titik) | 100% shift terfinalisasi otomatis |
| KPI-02 | Laporan berlabel audit "Verified (Server-Trusted)" | ≥ 95% dari laporan online |
| KPI-03 | Kehilangan data laporan yang disubmit saat offline | 0 (nol) setelah perangkat online |
| KPI-04 | Broadcast SOS ke perangkat sekapal dan Admin HQ (saat online) | Realtime (orde detik) |
| KPI-05 | Temuan ditutup dengan bukti foto perbaikan dan konklusi | 100% dari temuan berstatus closed |
| KPI-06 | Registrasi pengguna baru yang aktif tanpa persetujuan Admin | 0 (nol) |
| KPI-07 | Ketersediaan fungsi inti patroli saat perangkat offline | 100% |

## A.9 Asumsi dan Batasan

**Asumsi**

- Setiap petugas memiliki perangkat Android/browser modern dengan kamera dan GPS berfungsi.
- Konektivitas di laut bersifat intermiten; offline berjam-jam adalah kondisi normal, bukan pengecualian.
- Organisasi menyediakan Admin HQ yang aktif memproses approval registrasi dan rotasi kru.
- Kebijakan 3 shift (WIB) berlaku seragam untuk seluruh armada.

**Batasan**

- Notifikasi push background native Android nonaktif pada rilis ini; notifikasi berjalan sebagai web push (PWA/browser) dan alarm realtime in-app saat aplikasi aktif.
- Posisi kapal bukan pelacakan kontinu, melainkan posisi terakhir dari GPS laporan patroli.
- Aplikasi berbahasa Indonesia dengan zona waktu operasional tunggal (WIB).

---

*Dokumen ini memuat bagian A. Business Requirement. Bagian lanjutan (Functional Requirement, Non-Functional Requirement, dan lainnya) mengikuti template BRD yang berlaku dan disusun pada tahap berikutnya.*
