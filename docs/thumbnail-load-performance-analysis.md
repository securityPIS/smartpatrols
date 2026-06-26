# Analisa: Thumbnail Laporan Berat di-Load

**Tanggal:** 2026-06-26
**Gejala:** Di halaman LAPORAN (dan HISTORY), thumbnail foto di kanan tiap baris
"gambarnya ada tapi berat sekali untuk di-load".

---

## Ringkasan (TL;DR)

Thumbnail berat **bukan** karena ukuran thumbnail-nya besar. Sistem varian
sudah membuat thumbnail kecil 64px WebP. Masalahnya: di banyak record
`item.thumbUrl` **kosong**, sehingga `AsyncImage` jatuh ke
`fallbackSrc={item.photoUrl}` — yaitu **foto resolusi penuh** (bisa 1-3 MB) —
dan menjejalkannya ke kotak 48px. Setiap baris jadi mengunduh + men-decode
foto utuh, dan semuanya terjadi serentak.

---

## Bagaimana sistem thumbnail seharusnya bekerja

1. Saat foto diambil, `saveImagePhotoSet()` membuat 3 varian:
   - `full` (penuh)
   - `hero` 500px (`HERO_VARIANT_MAX_EDGE = 500`)
   - `thumb` 64px (`THUMB_VARIANT_MAX_EDGE = 64`)
   - File: `src/utils/imageVariants.js:12-13`, `51-67`
2. Ketiganya disimpan ke IndexedDB lokal dengan key turunan
   (`${base}@hero`, `${base}@thumb`) — `src/utils/imageStore.js:72-105`.
3. Saat sync, varian di-upload terpisah ke cloud dan `thumbUrl` jadi URL https
   kecil — `src/context/AppContextRuntime.jsx:6399-6415`.
4. List menampilkan thumb 64px di kotak 48px (`w-12 h-12`) → harusnya ringan.

Render di list:
```jsx
// src/pages/PatrolPage.jsx:312  &  src/pages/HistoryPage.jsx:377
<AsyncImage src={item.thumbUrl} fallbackSrc={item.photoUrl}
            className="w-full h-full object-cover" alt="Thumb" />
```

---

## Akar Masalah

### 1. Fallback ke foto penuh saat `thumbUrl` kosong (PENYEBAB UTAMA)

Logika `AsyncImage` (`src/components/AsyncImage.jsx:64-72`):

```js
let result = await this.resolveSingleSource(src);          // thumbUrl
if (!result && fallbackSrc && fallbackSrc !== src) {
  result = await this.resolveSingleSource(fallbackSrc);    // photoUrl PENUH
}
```

Kalau `thumbUrl` kosong/gagal → otomatis ambil `photoUrl` resolusi penuh,
lalu dipaksa muat di kotak 48px. Unduhan jaringan besar + decode berat ×
banyak baris = list terasa berat.

### 2. Kenapa `thumbUrl` sering kosong

**a. Penulisan dua-tahap yang bisa putus**
(`src/context/AppContextRuntime.jsx:6452-6465`, `6483-6502`):

- `pendingReport` ditulis **lebih dulu** dengan `thumbUrl: stripLocalAssetUrlSync(...)`
  → **null**. Varian lokal (`idb://`) sengaja di-strip agar tidak bocor ke cloud
  (lihat komentar `compactMediaAuditRecordForCloudSync`,
  `src/context/AppContextRuntime.jsx:4211-4216`).
- `readyReport` dengan `thumbUrl` **https** baru ditulis **setelah** upload media
  selesai.
- Jika tahap kedua tidak pernah selesai (capture saat offline, app ditutup,
  jaringan jelek), record di cloud **permanen** menyimpan
  `thumbUrl = null` + `photoUrl = https full`. Setiap device yang membuka list
  lalu mengunduh foto penuh. (Stempel waktu di screenshot 12.19-12.29 oleh
  "Lutfi" cocok dengan record sinkron-dari-device-lain.)

**b. Record lama** dibuat sebelum fitur varian ada → tidak punya `thumbUrl`.

### 3. Foto penuh = byte penuh, tanpa resize

Foto disimpan sebagai signed URL Supabase (`src/services/backend/assets.js:77`,
`createSignedUrl`). Fallback mengambil **object asli** tanpa transform/resize,
jadi benar-benar full-resolution.

### 4. Tidak ada lazy-load / batas konkurensi (pemberat)

`<img>` di `src/components/AsyncImage.jsx:98` tidak punya `loading="lazy"` /
`decoding="async"`, dan tiap baris me-resolve serentak saat mount (tanpa
virtualisasi). Saat banyak baris jatuh ke fallback foto penuh, semuanya
mengunduh + decode bersamaan.

---

## Rekomendasi Perbaikan (urut dampak)

| # | Perbaikan | Dampak | Risiko | Lokasi |
|---|-----------|--------|--------|--------|
| 1 | **Resize via Supabase transform** — saat `thumbUrl` kosong, fallback pakai signed URL ter-resize (`transform: { width, height }`), bukan byte penuh | Tinggi (atasi akar masalah tanpa migrasi data) | Rendah | `AsyncImage` / `assets.js` |
| 2 | **Lazy-load + async decode** — tambah `loading="lazy"`, `decoding="async"`, `width/height` pada `<img>` | Sedang | Sangat rendah | `src/components/AsyncImage.jsx:98` |
| 3 | **Retry flush `thumbUrl`** — masukkan penulisan `thumbUrl` https ke antrian retry agar record cloud tidak permanen tanpa thumbnail | Sedang (cegah record baru bermasalah) | Sedang | `AppContextRuntime.jsx:6483-6502` |

**Saran urutan kerja:** kerjakan **#1 + #2** dulu — dampak terbesar dengan
risiko rendah, dan langsung memperbaiki record lama/bermasalah tanpa migrasi.
**#3** mencegah record baru ikut bermasalah ke depan.

---

## File yang relevan

- `src/components/AsyncImage.jsx` — render + logika fallback
- `src/utils/imageVariants.js` — pembuatan varian thumb/hero
- `src/utils/imageStore.js` — simpan/muat varian di IndexedDB
- `src/services/backend/assets.js` — upload + signed URL
- `src/context/AppContextRuntime.jsx` — sync dua-tahap & upload varian ke cloud
- `src/pages/PatrolPage.jsx`, `src/pages/HistoryPage.jsx` — pemakaian `AsyncImage` di list
