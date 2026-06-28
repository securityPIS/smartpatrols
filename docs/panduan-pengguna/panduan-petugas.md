# Panduan Pengguna SmartPatrol — Role: PETUGAS (Security / Kru)

> Untuk: petugas keamanan/kru lapangan yang menjalankan patroli di kapal yang ditugaskan.
> Role lain: [PIC](panduan-pic.md) · [Admin](panduan-admin.md) · [Indeks](README.md)

---

## 1. Siapa Anda di Sistem Ini

Sebagai **Petugas**, Anda adalah ujung tombak operasional di lapangan. Tugas utama Anda:
- Menjalankan patroli dan mengisi hasil setiap titik checkpoint.
- Melaporkan temuan/insiden yang Anda jumpai.
- Menekan tombol **SOS** saat keadaan darurat.

**Batasan akses Anda:**
- Hanya bisa melihat dan mengakses **kapal tempat Anda di-*assign*** oleh Admin.
- **Tidak bisa** menutup (closing) laporan insiden — itu wewenang PIC/Admin.
- **Tidak bisa** menghapus riwayat, mengelola user, atau mengelola armada.
- **Tidak punya** menu Laporan Harian (Daily Report).

---

## 2. Masuk Pertama Kali (Onboarding)

1. Buka aplikasi → halaman **Login**.
2. Jika belum punya akun, tekan **Register** dan lengkapi data (nama, email, foto, nomor pekerja).
3. Akun Anda akan berstatus **Pending** — **Anda belum bisa langsung masuk**.
4. **Admin** akan memvalidasi, memberi role **Petugas**, dan menugaskan Anda ke sebuah kapal.
5. Setelah disetujui dan di-*assign*, login Anda akan membuka area patroli.

> Jika setelah login muncul "Kapal Tidak Dapat Diakses" atau titik patroli kosong (0/0),
> kemungkinan Anda belum di-*assign* ke kapal atau nama kapal belum sinkron — hubungi Admin.

---

## 3. Navigasi Aplikasi (Tampilan Petugas)

Di HP, gunakan **Bottom Navigation** dengan urutan menu khusus petugas:

| Menu | Fungsi |
|---|---|
| 🏠 **Patroli** | Halaman utama: status shift & pengisian checkpoint. |
| ⚠️ **Temuan** | Daftar insiden + tombol "Lapor Baru". |
| 📄 **Laporan** | Riwayat laporan patroli per shift. |
| 🔔 **Notif** | Notifikasi (checkpoint pending, wrap-up shift, dll). Ada badge jumlah belum dibaca. |
| 🔴 **SOS** | Tombol darurat di tengah navigasi (selalu tampil). |

---

## 4. Alur Kerja Harian Anda

### 4.1. Mulai Shift — Wajib "Tap In" Dulu
Saat membuka halaman **Patroli**, halaman akan **terkunci** sampai Anda menetapkan **Status Shift**.
- Tekan **"Hadir & Patroli"** untuk menyatakan Anda bertugas, atau status lain seperti **"Istirahat"**.
- **Tombol checkpoint tidak akan aktif** sebelum status shift di-submit.

### 4.2. Mengisi Checkpoint
Setiap kapal punya daftar titik (mis. Buritan, Anjungan, Kamar Mesin). Tekan satu titik, lalu pilih:

- **AMAN** — kondisi normal. Foto **opsional**.
- **TEMUAN** — ada masalah. **Wajib** mengisi: deskripsi kejadian, penyebab, tindak lanjut awal, dan **wajib menyertakan foto**.

Setiap titik yang sudah diisi akan tercatat sebagai *completed* dan tersinkron ke PIC/Admin.

### 4.3. Mengambil Foto Dokumentasi
- Aplikasi memakai kamera perangkat.
- Foto otomatis diberi cap **Waktu Server Terpercaya** (Trusted Time) untuk audit.
- Foto dikompresi otomatis; jika offline, foto disimpan lokal dan diunggah saat online.

### 4.4. Melapor Temuan/Insiden
Selain lewat checkpoint "TEMUAN", Anda bisa membuat laporan langsung:
- Buka menu **Temuan** → **"Lapor Baru"** → isi detail + foto.
- Anda **bisa menambahkan progres/update** pada insiden, tetapi **tidak bisa menutup** laporannya.

### 4.5. Keadaan Darurat — Tombol SOS
Untuk situasi kritis (perompakan, kebakaran, medis darurat):
1. Tekan tombol **SOS** merah, lalu konfirmasi cepat (mencegah salah pencet).
2. GPS perangkat langsung dibaca dan disiarkan bersama nama Anda.
3. Alarm berbunyi otomatis di **semua perangkat di kapal itu dan di dashboard Admin HQ**.
4. Alarm berhenti hanya ketika penerima menekan **"Terima & Mengerti"**.

---

## 5. Bekerja Tanpa Internet (Offline)

SmartPatrol dirancang untuk area susah sinyal:
- **Terus patroli seperti biasa** — laporan teks & foto disimpan di HP Anda.
- **Biarkan aplikasi tetap terbuka** di latar belakang.
- Begitu sinyal kembali, semua laporan **otomatis terunggah** tanpa data hilang.
- Status laporan offline ditandai **"Pending-Sync"** sampai berhasil terkirim.

> Jangan tutup paksa aplikasi saat offline jika masih ada laporan menunggu sync —
> tunggu sampai aplikasi menunjukkan sudah tersinkron.

---

## 6. Rotasi Shift Otomatis

Sistem membagi hari menjadi beberapa shift (Shift 1/2/3). Saat shift berakhir, otomatis:
- Checkpoint yang sudah diisi → diarsipkan ke **Riwayat**.
- Checkpoint yang belum sempat diperiksa → diberi status **Missed**.
- Shift di-reset untuk petugas berikutnya.

---

## 7. Catatan Integritas Waktu (Penting untuk Disiplin)

Sistem **tidak tertipu** oleh manipulasi jam HP. Setiap laporan diberi label audit:
- **Verified** — dikirim online dengan waktu akurat.
- **Pending-Sync** — dibuat offline, menunggu koneksi.
- **Suspicious / Tampered** — jam perangkat terdeteksi dimanipulasi (bisa dipantau Admin).

Selalu gunakan waktu otomatis di HP Anda agar laporan tidak ter-flag mencurigakan.

---

## 8. FAQ Petugas

**Q: Kenapa tombol checkpoint tidak bisa ditekan?**
> Anda belum memilih Status Shift. Tekan "Hadir & Patroli" dulu.

**Q: Titik patroli kosong (0/0) / "Kapal Tidak Dapat Diakses".**
> Anda mungkin belum di-*assign* ke kapal, atau nama kapal belum sinkron. Hubungi Admin.

**Q: Internet mati total di tengah laut, bagaimana?**
> Lanjut patroli. Semua tersimpan offline dan terunggah otomatis saat sinyal kembali.

**Q: Foto temuan tampil kosong di riwayat.**
> Jika baru offline, foto masih diproses. Jika sudah online namun tetap kosong, pastikan sync tidak terputus; beri tahu PIC/Admin.

**Q: Saya ingin menutup insiden tetapi tidak ada tombol "Tutup Laporan".**
> Penutupan adalah wewenang PIC/Admin. Petugas hanya bisa melapor dan memberi progres.

**Q: Aplikasi blank putih / data tidak update.**
> Sistem sedang sinkronisasi. Muat ulang layar, dan pastikan storage HP tidak penuh.
