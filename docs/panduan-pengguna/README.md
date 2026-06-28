# Panduan Pengguna SmartPatrol (Per Role)

Kumpulan panduan pengguna **SmartPatrol** yang dipisah berdasarkan peran (role) operasional.
Pilih dokumen sesuai role akun Anda. Untuk panduan gabungan/menyeluruh, lihat
[`../user_guideline.md`](../user_guideline.md).

## Daftar Panduan

| Role | Dokumen | Untuk siapa |
|---|---|---|
| 🛡️ **Petugas** | [panduan-petugas.md](panduan-petugas.md) | Security/kru lapangan yang menjalankan patroli di kapal yang ditugaskan. |
| 👁️ **PIC** | [panduan-pic.md](panduan-pic.md) | Supervisor/pengawas yang memantau armada dan menutup laporan temuan. |
| 🏢 **Admin** | [panduan-admin.md](panduan-admin.md) | Administrator HQ yang mengelola user, kapal, penugasan kru, dan dashboard. |

## Ringkasan Hak Akses per Role

| Kemampuan | Petugas | PIC | Admin |
|---|:---:|:---:|:---:|
| Menjalankan patroli & isi checkpoint | ✅ (kapal ditugaskan) | ✅ (kapal ditugaskan) | — |
| Lapor temuan / insiden baru | ✅ | ✅ | ✅ |
| Tekan tombol SOS darurat | ✅ | ✅ | ✅ |
| Update progres tindak lanjut insiden | ✅ | ✅ | ✅ |
| **Tutup (closing) laporan insiden** | ❌ | ✅ | ✅ |
| Lihat **Laporan Harian (Daily Report)** | ❌ | ✅ | ✅ |
| Pantau **semua armada** | ❌ (hanya kapal sendiri) | ✅ | ✅ |
| Kelola **Armada/Kapal** (checkpoint, dokumen) | ❌ | ❌ | ✅ |
| Kelola **User** & approval registrasi | ❌ | ❌ | ✅ |
| **Assign/rotasi kru** ke kapal | ❌ | ❌ | ✅ |
| Hapus laporan / temuan | ❌ | ❌ | ✅ |

> Catatan: Petugas & PIC hanya melihat data kapal tempat mereka di-*assign* (dijaga oleh
> Row Level Security). Akun baru harus di-*approve* Admin sebelum bisa masuk area operasional.

## Versi PDF Bergambar (dengan ilustrasi antarmuka)

Tersedia juga panduan **PDF per role** yang dilengkapi **ilustrasi tampilan layar** beserta
anotasi "👆 KLIK" (elemen yang ditekan) dan "✅ HASIL" (yang muncul) di setiap langkah:

| Role | PDF |
|---|---|
| 🛡️ Petugas | [pdf/panduan-petugas.pdf](pdf/panduan-petugas.pdf) |
| 👁️ PIC | [pdf/panduan-pic.pdf](pdf/panduan-pic.pdf) |
| 🏢 Admin | [pdf/panduan-admin.pdf](pdf/panduan-admin.pdf) |

> Catatan: mockup layar pada PDF adalah **ilustrasi yang dibangun ulang dari token desain asli
> aplikasi** (tema gelap `#070b19`/`#0b1229`, aksen cyan, bottom-nav, tombol SOS) — bukan tangkapan
> layar live, karena layar operasional berada di balik login Supabase + approval admin + assignment
> kapal yang tidak dapat diakses tanpa backend aktif. Tampilan produksi aktual dapat sedikit berbeda.

### Membangun ulang PDF

```bash
# butuh playwright-core + Chromium (di lingkungan web sudah tersedia di /opt/pw-browsers)
npm install --no-save playwright-core
node docs/panduan-pengguna/build-pdf.mjs
# output -> docs/panduan-pengguna/pdf/panduan-{petugas,pic,admin}.pdf
```

Edit konten/langkah ada di [`build-pdf.mjs`](build-pdf.mjs) (objek `ROLES`); mockup layar ada di
fungsi `screen*()`. Skrip otomatis mendeteksi Chromium di `PLAYWRIGHT_BROWSERS_PATH`.

### Memakai SCREENSHOT ASLI aplikasi (jalankan di mesin lokal)

Sesi Claude Code di web memiliki *network policy* yang **memblokir** akses ke Supabase dan host
aplikasi (proxy menolak dengan 403), sehingga login & capture layar asli **tidak bisa** dilakukan
dari sana. Lakukan langkah ini di **mesin lokal** (internet normal):

```bash
# 1) Pasang Playwright (sekalian unduh Chromium)
npm install playwright          # atau: npm i playwright-core && npx playwright install chromium

# 2) Siapkan kredensial (file ini TIDAK di-commit)
cp docs/panduan-pengguna/.env.capture.example docs/panduan-pengguna/.env.capture
#   lalu isi SMARTPATROL_URL + email/password admin & petugas

# 3) Tangkap screenshot asli, lalu bangun ulang PDF
node docs/panduan-pengguna/capture-screens.mjs --build
```

Hasil screenshot tersimpan di `pdf/screens/<role>/step-N.png` dan **otomatis dipakai** oleh
`build-pdf.mjs` (langkah tanpa screenshot tetap memakai mockup sebagai fallback).

**Keamanan (produksi):** [`capture-screens.mjs`](capture-screens.mjs) bersifat **non-destruktif** —
hanya login, navigasi, membuka layar/modal, dan **menyorot** tombol target. Skrip **tidak pernah
menekan** aksi yang menulis/mengirim data (submit status shift, AMAN/TEMUAN, **SOS**, approve user,
assign kru, tutup/hapus temuan), sehingga tidak mengubah data nyata atau memicu alarm SOS.

> Catatan role: akun PIC belum tersedia, jadi panduan PIC tetap memakai mockup. Tambahkan
> `SP_PIC_EMAIL`/`SP_PIC_PASSWORD` di `.env.capture` dan sebuah alur `capturePic()` bila ingin
> PIC juga memakai screenshot asli.

## Konsep yang Berlaku untuk Semua Role

- **Offline-First** — laporan & foto tetap bisa dibuat tanpa internet; tersinkron otomatis saat online.
- **Trusted Time** — semua laporan diberi cap waktu server terpercaya, bukan jam HP, untuk mencegah manipulasi.
- **Realtime Sync** — checkpoint, insiden, SOS, dan notifikasi diperbarui langsung lintas perangkat.

_Dokumen V1.0 — disusun per role._
