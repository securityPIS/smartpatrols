# Panduan Pengguna SmartPatrol — Role: PIC (Supervisor / Pengawas)

> Untuk: PIC yang mengawasi armada, menindaklanjuti, dan menutup laporan temuan.
> Role lain: [Petugas](panduan-petugas.md) · [Admin](panduan-admin.md) · [Indeks](README.md)

---

## 1. Siapa Anda di Sistem Ini

Sebagai **PIC (Person In Charge)**, Anda adalah pengawas lapangan. Anda memiliki **semua
kemampuan Petugas**, ditambah wewenang pengawasan:
- Memantau hasil patroli dan insiden di kapal yang Anda awasi.
- **Menutup (closing) laporan insiden** — wewenang yang tidak dimiliki Petugas.
- Mengakses dashboard **Laporan Harian (Daily Report)**.

**Batasan akses Anda:**
- Hanya kapal tempat Anda di-*assign* (sama seperti Petugas, dijaga oleh RLS).
- **Tidak bisa** mengelola User, approval registrasi, atau assign kru — itu wewenang Admin.
- **Tidak bisa** menambah kapal atau mengubah definisi checkpoint kapal.

---

## 2. Navigasi Aplikasi (Tampilan PIC)

PIC memakai urutan menu "privileged" yang berfokus pengawasan. Di HP, **Bottom Navigation**:

| Menu | Fungsi |
|---|---|
| 📄 **Laporan** | Riwayat laporan patroli per shift (menu pertama). |
| ⚠️ **Temuan** | Daftar insiden — tempat Anda memberi progres & menutup laporan. |
| 📊 **Report** | **Laporan Harian (Daily Report)** — rekap analitik shift. |
| 🔔 **Notif** | Notifikasi temuan, checkpoint pending, dan wrap-up shift. |
| 🔴 **SOS** | Tombol darurat di tengah navigasi. |

> PIC tetap bisa menjalankan patroli (mengisi checkpoint) pada kapal yang ditugaskan,
> sama seperti Petugas. Lihat [panduan Petugas](panduan-petugas.md) untuk alur patroli & SOS.

---

## 3. Tugas Utama PIC

### 3.1. Memantau Temuan Masuk
- Buka menu **Temuan**. Setiap checkpoint berhasil "TEMUAN" otomatis masuk ke daftar insiden.
- Notifikasi temuan dari petugas sekapal akan menarget Anda (sebagai PIC kapal tersebut).
- Pada layar lebar (desktop), gunakan tampilan *dual-pane*: daftar di kiri, detail di kanan.

### 3.2. Memberi Update Progres
Jika sebuah temuan butuh penanganan bertahap (mis. suku cadang menunggu, perbaikan berjalan):
1. Buka detail Insiden.
2. Tekan **"Update Progress"** dan isi perkembangan + foto bila perlu.
3. Ulangi sesuai kebutuhan hingga masalah benar-benar selesai.

### 3.3. Menutup (Closing) Laporan Insiden — **Khusus PIC/Admin**
Hanya **PIC dan Admin** yang dapat menutup laporan:
1. Buka detail Insiden yang sudah tertangani.
2. Tekan **"Tutup Laporan"**.
3. **Wajib** menyertakan **foto perbaikan akhir** dan **keterangan konklusi**.

> Jika tombol "Tutup Laporan" tidak muncul padahal Anda PIC: pastikan insiden tersebut
> berada di kapal tempat Anda di-*assign*. PIC hanya berwenang atas kapalnya sendiri.

### 3.4. Laporan Harian (Daily Report)
Menu **Report** memberi rekap operasional per Kapal per Shift:
- Rangkuman log patroli (aman/temuan/missed), status insiden, kehadiran, dan konteks cuaca.
- Gunakan untuk evaluasi shift dan pelaporan ke Admin/HQ.

### 3.5. Menanggapi SOS
Saat petugas menekan SOS, alarm berbunyi di perangkat PIC dan dashboard Admin:
- Modal merah menampilkan nama pelapor dan lokasi GPS.
- Koordinasikan respons, lalu tekan **"Terima & Mengerti"** untuk menghentikan alarm.

---

## 4. Audit & Integritas Waktu

Manfaatkan label audit waktu saat meninjau laporan petugas:
- **Verified** — laporan online dengan waktu server akurat.
- **Pending-Sync** — dibuat offline, menunggu koneksi.
- **Suspicious / Tampered** — jam perangkat petugas terindikasi dimanipulasi → bahan evaluasi disiplin.

---

## 5. FAQ PIC

**Q: Tombol "Tutup Laporan" tidak muncul.**
> Pastikan insiden berada di kapal tempat Anda di-*assign*. PIC hanya berwenang atas kapalnya.

**Q: Saya tidak melihat kapal/insiden tertentu.**
> Anda hanya melihat kapal yang ditugaskan kepada Anda. Untuk memantau armada lain, minta Admin.

**Q: Bisakah saya menyetujui registrasi atau assign kru?**
> Tidak. Manajemen user, approval, dan rotasi kru adalah wewenang Admin.

**Q: Notifikasi temuan tidak masuk.**
> Pastikan akun Anda `approved` dan terdaftar sebagai PIC kapal terkait. Periksa juga koneksi/izin notifikasi.

**Q: Apakah saya tetap bisa ikut patroli?**
> Ya. PIC dapat mengisi checkpoint pada kapal yang ditugaskan, persis seperti Petugas.
