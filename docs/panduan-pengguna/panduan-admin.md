# Panduan Pengguna SmartPatrol — Role: ADMIN (HQ / Superadmin)

> Untuk: administrator pusat yang mengelola user, armada, penugasan kru, dan dashboard global.
> Role lain: [Petugas](panduan-petugas.md) · [PIC](panduan-pic.md) · [Indeks](README.md)

---

## 1. Siapa Anda di Sistem Ini

Sebagai **Admin**, Anda memegang **hak akses penuh** atas seluruh sistem SmartPatrol:
- Menyetujui pendaftaran user baru dan menetapkan role.
- Mengelola armada/kapal: titik checkpoint kustom, dokumen, jadwal.
- Melakukan rotasi penugasan kru ke kapal.
- Memantau seluruh armada dan **Laporan Harian** secara global.
- Menutup/menghapus laporan insiden dan temuan.

Berbeda dari Petugas/PIC, Admin **tidak dibatasi per kapal** — Anda melihat semua data operasional.

---

## 2. Navigasi Aplikasi (Tampilan Admin)

Admin memakai menu "privileged" plus menu administrasi. Di desktop tersedia **Sidebar** dan
tampilan *dual-pane* untuk memonitor banyak informasi sekaligus.

| Menu | Fungsi |
|---|---|
| 📄 **Laporan** | Riwayat laporan patroli seluruh armada per shift. |
| ⚠️ **Temuan** | Pemantauan, penutupan, dan penghapusan insiden. |
| 📊 **Report** | **Laporan Harian (Daily Report)** global per Kapal/Shift. |
| 🔔 **Notif** | Notifikasi sistem, temuan, dan SOS. |
| 🚢 **Armada** | Kelola kapal, checkpoint, dokumen, dan jadwal kru. |
| 👥 **Users** | Approval registrasi, kelola profil & rotasi kru. |
| 🔴 **SOS** | Tombol darurat. |

---

## 3. Tugas Administrasi Utama

### 3.1. Approval & Onboarding User Baru
1. User baru registrasi publik → masuk antrean **Pending Registrations**.
2. Buka halaman **Users** → tinjau pendaftar.
3. **Approve** sambil menetapkan **Role** (Petugas / PIC / Admin) dan status operasional.
4. Setelah disetujui, user dapat masuk area operasional.

> User yang belum di-*approve* **tidak bisa login ke area operasional**, berapa kali pun mencoba.
> Status akun: `pending` → `approved` (atau `rejected`). Status operasional: `active` / `off-duty` / `disabled`.

### 3.2. Manajemen Armada/Kapal
Buka halaman **Armada**:
- **Tambah/Edit Kapal** — buat data kapal baru.
- **Titik Checkpoint Kustom** — tentukan daftar titik patroli per kapal (mis. Buritan, Anjungan,
  Kamar Mesin). **Ini sumber kebenaran checkpoint** yang dilihat petugas. Kapal tanpa checkpoint
  akan tampak "0/0" di sisi petugas.
- **Dokumen** — di tab "Dokumen", unggah berkas teknis (sertifikasi, manual mesin). Kru kapal
  dapat mengunduhnya langsung tanpa kirim manual.

### 3.3. Assign & Rotasi Kru
Di detail kapal, tab **Personil/Kru**:
1. **Assign Kru** — pilih Petugas/PIC yang tersedia dan tetapkan ke kapal. Hanya kru yang
   di-*assign* yang bisa mengakses data kapal tersebut (dijaga RLS).
2. **Jadwal Bulan Depan** — tetapkan personel "Bulan Depan" agar rotasi akhir bulan mulus.
3. Penugasan bersifat **atomik**: perubahan kru kapal dan profil petugas diperbarui dalam satu
   transaksi agar tidak terjadi state yang tidak sinkron.

> Penting: nama kapal pada profil petugas (`ship_assigned`) harus sama dengan nama kapal pada
> laporan. Selisih ejaan/spasi bisa membuat petugas tidak melihat checkpoint — gunakan assignment
> resmi lewat halaman ini, jangan ubah manual.

### 3.4. Laporan Harian (Daily Report)
Menu **Report** memberi rekap global: log patroli (aman/temuan/missed), status insiden, tingkat
kehadiran, dan konteks cuaca, disusun per Kapal per Shift. Gunakan untuk audit dan pelaporan HQ.

### 3.5. Menutup & Menghapus Temuan/Insiden
- **Tutup Laporan** — seperti PIC, dengan foto perbaikan akhir + konklusi.
- **Hapus Temuan/Insiden** — Admin dapat menghapus. Sistem menulis *tombstone* durable agar temuan
  yang dihapus **tidak muncul kembali** di perangkat lain setelah sinkronisasi.

### 3.6. Menanggapi SOS
SOS dari petugas mana pun menarget Admin HQ secara server-side (bahkan bila profil admin tidak
terlihat di daftar petugas). Alarm berbunyi di dashboard; tekan **"Terima & Mengerti"** untuk berhenti.

---

## 4. Audit & Integritas Waktu

Admin adalah pengawas disiplin data. Pantau label audit pada riwayat:
- **Verified (Server-Trusted)** — laporan online dengan waktu tersertifikasi akurat.
- **Pending-Sync** — dibuat offline, menunggu koneksi.
- **Suspicious / Tampered** — perangkat petugas terindikasi manipulasi jam (*clock tampering*).
  Sistem mendeteksi lewat komparasi waktu server dan *drift* CPU — gunakan untuk audit disiplin.

---

## 5. Bootstrap Admin Pertama (Teknis)

Admin pertama dibuat lewat skrip service-role, bukan registrasi publik:

```bash
npm run setup:admin -- --token=<SETUP_TOKEN> --email=admin@example.com --password=<min-8-char> --name="Admin SmartPatrol"
```

> Jalankan hanya di mesin dev/staging yang aman karena memakai `SUPABASE_SERVICE_ROLE_KEY`.
> Detail teknis ada di [`../../README.md`](../../README.md) dan [`../../SYSTEM_MAP.md`](../../SYSTEM_MAP.md).

---

## 6. FAQ Admin

**Q: User baru tidak bisa login.**
> Pastikan sudah di-*approve* di halaman Users, role & status operasional sudah ditetapkan,
> dan akun `enabled` + `review_state = approved`.

**Q: Petugas mengeluh checkpoint kosong (0/0) padahal sudah di-*assign*.**
> Periksa apakah kapal memiliki **checkpoint kustom**. Pastikan nama kapal pada penugasan
> sama persis dengan data kapal — gunakan halaman Armada untuk assign, jangan edit manual.

**Q: Temuan yang sudah saya hapus muncul lagi.**
> Sistem memakai *tombstone* agar tidak resurrect. Jika masih muncul, pastikan perangkat
> pelaku sudah sinkron; hapus lewat jalur resmi (detail insiden), bukan manipulasi data.

**Q: Notifikasi cron (checkpoint pending / wrap-up) tidak muncul.**
> Pastikan kapal punya `custom_checkpoints` dan migrasi terbaru sudah ter-apply. Notifikasi
> bergantung pada definisi checkpoint kapal, bukan tabel kosong.

**Q: Bisakah Admin ikut patroli langsung?**
> Fokus Admin adalah pengawasan & administrasi (menu Laporan/Temuan/Report/Armada/Users).
> Patroli lapangan dijalankan Petugas/PIC pada kapal yang ditugaskan.
