# Analisis & Rencana Solusi Egress Tinggi (PostgREST + Realtime)

> Status: Draft analisis — belum ada perubahan kode. Dokumen ini memetakan **akar
> masalah** dan **rencana perbaikan bertahap** untuk menurunkan egress Supabase.

## 1. Data dari Dashboard (1 hari, 05 Jun 2026)

| Tipe Egress         | Porsi  | Volume       |
|---------------------|--------|--------------|
| **PostgREST**       | 61.4%  | **194.5 MB** |
| **Realtime**        | 38.4%  | **121.5 MB** |
| Storage             | 0.1%   | 473.8 KB     |
| Auth                | 0.1%   | 163.0 KB     |
| Functions           | 0.0%   | 77.5 KB      |
| Shared Pooler       | 0.0%   | 4.2 KB       |

**~316 MB dalam SATU hari** hanya dari dua kategori, padahal datanya kecil
(beberapa kapal, beberapa ratus laporan). Free Plan = 5 GB/bulan; dengan laju ini
satu hari saja sudah ~6% kuota, dan akan habis dalam ±2 minggu jika pemakaian naik.
PostgREST + Realtime mendominasi total — sisanya nyaris nol. Artinya masalahnya
**bukan upload foto/storage**, melainkan **pola sinkronisasi state**.

## 2. Akar Masalah PostgREST Egress (194.5 MB)

### 2.1 Polling penuh tiap 8 detik (penyebab DOMINAN)
`src/context/AppContextRuntime.jsx:9979`

```js
const refreshIntervalId = window.setInterval(() => {
  if (!isNavigatorOnline()) return;
  if (document.visibilityState === 'hidden') return;
  runRefresh('interval', { preferServer: true, clearWhenEmpty: false });
}, 8000); // <-- tiap 8 detik
```

`runRefresh` → `refreshCloudSharedState` (`:6645`) → `fetchCloudAppState` →
`hydrateStateFromSql` (`cloudState.js:426`) yang menarik **SELURUH snapshot**:

```js
fetchProfilesRows   // select('*').limit(500)
fetchShipsRows      // select('*').limit(200)  -- JSON berat (personnel, schedules, documents, custom_checkpoints)
fetchPatrolReportRows // select('*').limit(500) -- kolom payload jsonb berat
fetchIncidentRows   // select('*').limit(200)  -- payload jsonb
fetchSosAlertRows   // select('*').limit(20)
fetchNotificationRows // select('*').limit(120)
```

Hitung dampaknya per **satu** client yang membuka app:
- 8 detik → **450 fetch penuh/jam** → **~10.800 fetch penuh/hari** (jika app terbuka seharian).
- Walau realistis app tidak terbuka 24 jam, 1–2 jam aktif = **±450–900 snapshot penuh**.
- Bila 1 snapshot ≈ 100–300 KB (6 tabel, `select('*')`, payload jsonb), maka
  **1 client aktif 1 jam ≈ 45–135 MB**. Beberapa device → langsung ratusan MB.

Ini sendirian menjelaskan mayoritas 194.5 MB.

### 2.2 `select('*')` + duplikasi kolom `payload`
Semua fetch memakai `select('*')`, yang menarik:
- Kolom `payload` jsonb yang **menduplikasi hampir semua field** baris (lihat
  `mapReportToRow` `patrolReports.js:48` — `payload: { ...report, ... }`).
- Kolom JSON berat di `ships` (personnel, personnel_next_month, personnel_schedules,
  custom_checkpoints, documents, sos_recipient_ship_ids).

Tidak ada **projection kolom** dan tidak ada **filter delta** (`updated_at >`),
jadi setiap fetch menarik ulang seluruh dataset walau tidak ada yang berubah.

### 2.3 Amplifikasi `client_mutations` → re-hydrate penuh
`cloudState.js:568`

```js
.on('postgres_changes', { event: '*', ..., table: 'client_mutations' }, () => {
  scheduleFetch(null, { full: true });   // <-- full hydrate semua tabel
})
```

Setiap `writeStateToSql` (`:664`) dan setiap `publishCloudSyncSignal` (`:705`)
meng-`insert` baris `client_mutations`. Setiap insert itu **memicu full re-hydrate
(`select('*')` 6 tabel) di SETIAP client** yang sedang terhubung. Dengan N client,
satu mutasi = N full snapshot. Ini efek N×M klasik.

### 2.4 Subscription tumpang tindih (data sama ditarik 2–3×)
- `subscribeToCloudAppState` menarik `patrol_reports` **dan** `incidents` lewat
  full snapshot.
- `subscribeToPatrolReports` (`patrolReports.js:87`) menarik `patrol_reports` lagi
  (terfilter shift/ship) di channel terpisah.
- `subscribeToIncidents` (`incidentReports.js:123`) menarik `incidents` lagi.

Jadi tabel yang sama di-fetch oleh beberapa jalur independen.

### 2.5 Badai retry signal
`AppContextRuntime.jsx:9863` `runSignalRefresh` melakukan **hingga 5 retry**, tiap
retry = satu `refreshCloudSharedState` (full fetch) lagi, untuk tiap signal yang masuk.

## 3. Akar Masalah Realtime Egress (121.5 MB)

### 3.1 `REPLICA IDENTITY FULL` di SEMUA tabel (amplifier utama)
`supabase/migrations/202605220001_init_smartpatrol_sql.sql:755-761`

```sql
alter table public.profiles        replica identity full;
alter table public.ships           replica identity full;
alter table public.patrol_reports  replica identity full;
alter table public.incidents       replica identity full;
alter table public.sos_alerts      replica identity full;
alter table public.notifications   replica identity full;
alter table public.client_mutations replica identity full;
```

Dengan `replica identity full`, setiap `UPDATE`/`DELETE` mengirim **baris lama
PENUH + baris baru PENUH** lewat Realtime — termasuk kolom `payload` jsonb dan
JSON berat `ships`. Ini **menggandakan** ukuran tiap event realtime.

### 3.2 Listener `event: '*'` tanpa filter mengirim baris penuh ke semua client
`subscribeToCloudAppState` (`cloudState.js:567`) membuka 7 listener
(`profiles`, `ships`, `patrol_reports`, `incidents`, `sos_alerts`, `notifications`,
`client_mutations`) dengan `event: '*'` dan **tanpa filter kolom/baris**. Setiap
perubahan baris dikirim utuh ke **setiap** client yang subscribe, relevan atau tidak.

### 3.3 `client_mutations` sebagai bus sinkronisasi di DUA channel
Setiap state-sync/signal menulis `client_mutations`, yang di-broadcast ke semua
client melalui **dua** channel sekaligus:
- `smartpatrol-sql-state` (`cloudState.js:567`) — memicu full re-hydrate.
- `smartpatrol-sql-signal` (`cloudState.js:609`) — payload signal bisa memuat
  objek besar (mis. `activeSOSAlert`).

### 3.4 Channel duplikat untuk tabel yang sama
- `patrol_reports`: channel `smartpatrol-sql-state` **dan** `patrol-reports-<shift>-<ship>`.
- `incidents`: channel `smartpatrol-sql-state` **dan** `incidents`.

Baris yang sama dikirim ke client lebih dari sekali per perubahan.

### 3.5 Tabel JSON berat ikut realtime
`ships` (dan `incidents`/`patrol_reports` dengan `payload`) ada di publication.
Satu update kapal mem-broadcast seluruh JSON personnel/schedules/documents — dikali
old+new karena `replica identity full` (poin 3.1).

## 4. Rencana Solusi (Bertahap, dari dampak tertinggi)

### Tahap A — Quick Wins (dampak terbesar, risiko rendah)
Target: pangkas **~80–90%** egress. Bisa diselesaikan cepat.

1. **Hapus/turunkan polling 8 detik** (`AppContextRuntime.jsx:9979`).
   Karena sudah ada Realtime + signal + refresh pada `focus`/`online`/`visibility`,
   polling interval ini **redundan**. Opsi:
   - Hapus total interval, ATAU
   - Naikkan ke 5–10 **menit** sebagai jaring pengaman saja, ATAU
   - Jadikan "heartbeat ringan": cek satu nilai `max(updated_at)` murah, fetch penuh
     hanya bila ada perubahan.
   > Ini perubahan satu baris dengan dampak terbesar.

2. **Ganti `select('*')` → projection kolom eksplisit** di semua fetcher
   (`cloudState.js:335-378`, `patrolReports.js:108`, `incidentReports.js:138`).
   Buang kolom `payload` dari hasil read bila field-nya sudah tersedia di kolom
   reguler; kalau payload tetap perlu, pilih hanya field yang dipakai UI.

3. **Stop re-hydrate penuh dari `client_mutations`** (`cloudState.js:568`).
   `client_mutations` seharusnya hanya jadi **sinyal**, bukan pemicu `select('*')`
   6 tabel. Ganti jadi: refetch **hanya tabel yang relevan** (sudah ada
   `scheduleFetch('patrol_reports')` dll untuk listener per-tabel) atau pakai
   payload signal untuk patch in-place tanpa fetch.

4. **Batasi retry signal** (`AppContextRuntime.jsx:9880`) dari 5 → 1–2, dengan
   backoff lebih panjang.

### Tahap B — Hilangkan Redundansi (dampak menengah)
1. **Satukan jalur subscription**. Pilih SATU sumber kebenaran per tabel:
   - Entah `subscribeToCloudAppState` (snapshot global), ATAU
   - Subscription per-domain (`subscribeToPatrolReports`, `subscribeToIncidents`).
   Jangan keduanya menarik tabel yang sama. Hapus duplikasi channel (poin 3.4).

2. **Pakai delta in-place, jangan refetch**. Listener per-tabel
   (`patrolReports.js`) sudah menerapkan pola apply `event.new` ke state lokal tanpa
   refetch — terapkan pola yang sama untuk `incidents`, `notifications`, `ships`,
   `profiles`, sehingga event realtime cukup memutakhirkan baris yang berubah saja.

3. **Tambah filter Realtime** (server-side) pada channel agar client hanya menerima
   baris relevan (mis. `filter: shift_key=eq...`, `ship_id=eq...`) — mengurangi
   jumlah event yang dikirim ke tiap client.

### Tahap C — Perbaikan Struktural (butuh migration)
1. **Turunkan `REPLICA IDENTITY` dari `FULL` → `DEFAULT`** (primary key saja) untuk
   tabel yang tidak butuh nilai kolom lama di event (`patrol_reports`, `incidents`,
   `profiles`, `notifications`, `client_mutations`). Ini langsung memangkas ukuran
   tiap event realtime ~50%.
   > Cek dulu: logika client tidak boleh bergantung pada `event.old.<kolom non-PK>`.
   > `subscribeToPatrolReports` memakai `oldRow.id` (PK) — aman. Verifikasi penghapusan
   > tombstone & filter `rowBelongsToSubscription` sebelum mengubah.

2. **Pisahkan kolom JSON berat dari realtime**. Jangan broadcast kolom `payload`
   /`documents`/`personnel*` lewat Realtime. Caranya: pertahankan publication hanya
   untuk kolom ringan, atau pisah tabel "metadata ringan" (di-realtime) vs "payload
   berat" (di-fetch on-demand saat user membuka detail).

3. **Pertimbangkan keluarkan `ships`/`profiles` dari Realtime** bila jarang berubah —
   cukup refetch saat `focus`/`visibility` atau saat ada signal khusus.

4. **Heartbeat berbasis `updated_at`/kursor**: simpan `max(updated_at)` per tabel di
   client; fetch hanya baris dengan `updated_at > cursor` (delta), bukan seluruh
   `limit(500)` tiap kali.

## 5. Estimasi Dampak

| Aksi | Perkiraan penurunan egress |
|------|----------------------------|
| A1 (hapus polling 8s) | **PostgREST −70–85%** |
| A2 (projection kolom) | PostgREST −20–40% tambahan pada fetch yang tersisa |
| A3 (stop full re-hydrate dari client_mutations) | PostgREST + Realtime −10–20% |
| B1/B2 (satukan jalur + delta in-place) | PostgREST −10–20% tambahan |
| C1 (`replica identity default`) | **Realtime −~50%** |
| C2/C3 (JSON berat keluar dari realtime) | Realtime −20–40% tambahan |

Target realistis setelah Tahap A saja: **dari ~316 MB/hari → di bawah ~50 MB/hari**.
Setelah Tahap C: **kemungkinan < 10–20 MB/hari** untuk beban pemakaian saat ini.

## 6. Urutan Implementasi yang Disarankan
1. **A1** dulu (satu baris, dampak terbesar) → ukur 1 hari di dashboard.
2. **A3 + A2** → ukur lagi.
3. **C1** (migration `replica identity default`) → ukur penurunan Realtime.
4. **B + C2/C3** sebagai optimasi lanjutan jika masih perlu.

> Setiap tahap **idempotent dan dapat dirilis terpisah**. Ukur ulang di dashboard
> "Egress per day" setelah tiap tahap untuk memvalidasi sebelum lanjut.

## 7. Checklist Verifikasi (jangan sampai regresi)
- [ ] Submit laporan checkpoint masih muncul lintas-device dalam beberapa detik.
- [ ] Hapus temuan (tombstone) masih terpropagasi (lihat `subscribeToPatrolReportTombstones`).
- [ ] SOS aktif masih realtime.
- [ ] Notifikasi masuk masih realtime.
- [ ] Tidak macet di skeleton saat resume (pola commit `deffdbe` di `CLAUDE.md`).
- [ ] `npm run build` + `npm run test:security` + test halaman tetap hijau.
- [ ] Cek kembali "Egress per day" Supabase H+1 tiap tahap.

## 8. Referensi File
- Polling 8 detik: `src/context/AppContextRuntime.jsx:9979`
- `refreshCloudSharedState` / `fetchCloudAppState`: `AppContextRuntime.jsx:6645`, `cloudState.js:630`
- Full hydrate `select('*')`: `src/services/backend/cloudState.js:335-438`
- `client_mutations` → full re-hydrate: `cloudState.js:567-596`
- Channel signal kedua: `cloudState.js:605-628`
- Subscription per-domain: `patrolReports.js:87`, `incidentReports.js:123`
- `replica identity full` + publication: `supabase/migrations/202605220001_init_smartpatrol_sql.sql:755-807`
</content>
</invoke>
