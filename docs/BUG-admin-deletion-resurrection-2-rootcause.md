# Bug (Lanjutan): Kapal & History yang Dihapus Admin Muncul Lagi — Akar Masalah Pasti

**Tanggal:** 2026-06-28
**Branch:** `claude/admin-deletion-bug-6y5eic`
**Lanjutan dari:** `docs/BUG-admin-deletion-resurrection.md`
**Status:** Analisis akar masalah selesai (deterministik, terbukti di kode)

## Jawaban singkat: Ya, berhubungan langsung

Bukti dari screenshot (kapal TEST-001/TEST-002 di dashboard REPORT, dan history
1 April–17 Juni yang tetap muncul) **mengonfirmasi** hipotesis di dokumen pertama, dan
sekaligus mempertajamnya menjadi **satu akar masalah deterministik**:

> **Cloud tidak punya konsep "penghapusan".** Tombstone (`deletedRecords`) hanya hidup di
> `localStorage` tiap device dan **tidak pernah** diunggah ke cloud. Tabel-tabel SQL di
> cloud (`ships`, `shift_history_entries`, `notifications`, `incidents`) bersifat
> **upsert-only** dan selalu di-hydrate ulang **utuh** — sehingga data yang "dihapus" admin
> hidup lagi setiap sinkronisasi. Lebih parah, subscription `shift_history_entries` menulis
> langsung ke `historyEntries` **melewati filter tombstone**, jadi history yang dihapus
> muncul lagi **bahkan di device yang menghapusnya**.

Karena kartu per-kapal di **dashboard REPORT** dan **notifikasi** itu **diturunkan dari /
merujuk** history entries + nama kapal, kapal yang dihapus pun ikut muncul lagi di sana —
meskipun record kapalnya sendiri sudah hilang dari Page Armada.

---

## Rantai Bukti (file:baris)

### 1. Tombstone tidak pernah sampai ke cloud

`saveCloudAppState` hanya memanggil `writeStateToSql`, yang **men-dekomposisi** state ke
tabel SQL (`profiles`, `ships`, dst). Tidak ada field `deletedRecords` yang ditulis ke
mana pun di cloud.

- `src/services/backend/cloudState.js:1149` `saveCloudAppState` → `writeStateToSql`
- `src/services/backend/cloudState.js:1114-1126` ships **upsert** `onConflict: 'id'` — hanya
  kapal yang masih ada di `shipsData`. Kapal yang dihapus **tidak ikut dihapus** dari tabel
  `public.ships`; ia hanya berhenti di-upsert → **baris servernya tetap hidup**.

Akibat: `deletedRecords` adalah state **lokal per-device** saja
(`savePersistedState` → `localStorage`). Cloud tidak tahu apa-apa soal penghapusan.

### 2. Hydrate dari SQL membangun ulang semua data, tanpa tombstone

`buildStatePayload` menyusun state cloud dari baris tabel — memuat **seluruh** kapal &
notifikasi, dan **tidak menyertakan** `deletedRecords`:

- `src/services/backend/cloudState.js:831-846`
  - `shipsData: shipRows.map(shipToState)` — semua baris `public.ships` (termasuk yang
    "dihapus").
  - `notifications: reconstructNotificationsFromRows(notifRows)` — semua notifikasi.
  - `historyEntries: []` — history TIDAK dari sini; lihat poin #3.
- `src/services/backend/cloudState.js:680-686` `fetchShipsRows` → `select * from ships limit 200`.

### 3. Subscription `shift_history_entries` menyuntik ulang & melewati tombstone (penyebab utama history)

- `src/services/backend/shiftHistory.js:22-53` — saat mount **fetch SEMUA** baris
  `shift_history_entries` (limit 500), dan **setiap INSERT** men-fetch ulang semua.
  Tidak ada kapabilitas delete, tidak ada filter tombstone.
- `src/context/AppContextRuntime.jsx:10511`
  ```js
  setHistoryEntries((prev) => mergeHistoryEntries(prev, serverEntries)); // ⚠️ tanpa omitDeletedEntities
  ```
  Ini `setHistoryEntries` **langsung**, **tidak** lewat `mergeSharedStateSnapshots`, jadi
  `deletedRecords.historyEntries` **tidak pernah** diperiksa. History yang dihapus hidup
  lagi bahkan di device yang menghapus.

> Tabel `shift_history_entries` diisi cron server (`finalize_shift`,
> `migrations/202605280001_add_shift_history_cron.sql`). Penghapusan di klien tidak pernah
> menyentuh tabel ini.

### 4. Dashboard REPORT per-kapal diturunkan dari history (kenapa kapal muncul di dashboard)

Kartu di image 1 (REPORT) **bukan** dibaca dari `shipsData`, melainkan dikelompokkan dari
`historyEntries` berdasarkan **nama kapal**:

- `src/pages/DailyReportPage.jsx:600-606` `reportEntries` = `historyEntries`.
- `src/pages/DailyReportPage.jsx:640-663` `perShipBreakdown` group by `entry.ship`
  (nama kapal); `shifts += 1` → itulah "1 SHIFT TERCATAT" pada kartu TEST-001.

Jadi selama satu history entry bernama "TEST-001" masih hidup (akibat poin #3), kartu
"TEST-001" tetap muncul di dashboard — **walau record kapalnya sudah dihapus**.
Bucket "Tidak diketahui/Tanpa Kapal" muncul untuk entry yang nama kapalnya tak ter-resolve.

### 5. Notifikasi tidak pernah difilter tombstone

- `src/context/AppContextRuntime.jsx:3083` `mergeNotificationsCollection(...)` — satu-satunya
  koleksi di `mergeSharedStateSnapshots` tanpa `omitDeletedEntities`.
- `createDeletedRecordsState` tak punya grup `notifications`
  (`AppContextRuntime.jsx:2819-2826`).
- Notifikasi summary shift dibuat cron server
  (`migrations/202605300002_add_notification_summary_cron.sql`) → di-hydrate ulang dari
  tabel `notifications`, tak pernah dihapus.

### 6. Tidak ada delete server-side untuk ships / shift_history

Pola delete admin sudah ada untuk patrol_reports & sos_alerts saja:
- `migrations/202605300006_admin_delete_policies.sql` → hanya `patrol_reports_admin_delete`
  & `sos_alerts_admin_delete`.
- `migrations/202605300013_admin_delete_patrol_rpc.sql` (`admin_delete_patrol_report_findings`),
  `migrations/202605300007_patrol_report_tombstones.sql` (tombstone realtime lintas-device).

**Tidak ada** padanan untuk `ships` maupun `shift_history_entries`. Catatan: skema
`shift_history_entries.ship_id` punya `references public.ships(id) on delete cascade`
(`migrations/202605280001:24`) — artinya **jika** baris `ships` dihapus server-side,
history terkait ikut terhapus otomatis. Tapi karena klien tak pernah men-DELETE baris
`ships`, cascade ini tak pernah jalan.

---

## Kenapa terlihat "permanen" walau di device yang sama

- History: poin #3 — subscription menulis langsung tanpa cek tombstone → selalu kembali.
- Dashboard kapal: poin #4 — turunan history → ikut kembali.
- Notifikasi: poin #5 — tak pernah difilter.
- Page Armada (record kapal): difilter tombstone lokal di device penghapus, **tetapi**
  hidup lagi di device lain / saat `localStorage` hilang / akun baru, karena cloud tak
  pernah tahu kapal itu dihapus (poin #1, #2). Untuk lintas-device, ini pasti kambuh.

---

## Rencana Perbaikan (berlapis, prioritas dari atas)

Prinsip: **penghapusan harus menjadi fakta di server (otoritatif), bukan sekадар filter
lokal.** Cermin pola `patrol_report_tombstones` yang sudah terbukti.

### FIX A — Server-side delete + tombstone untuk `shift_history_entries` (prioritas 1, akar history)

1. Migration baru: tabel `shift_history_tombstones` (atau kolom `deleted_at` pada
   `shift_history_entries`) + RPC `admin_delete_shift_history(p_history_key text)` /
   `admin_delete_shift_history_range(p_start date, p_end date)` `security definer`, dibatasi
   role ADMIN (cermin `admin_delete_patrol_rpc.sql` + `admin_delete_policies.sql`).
2. Tambahkan tabel tombstone ke `supabase_realtime` agar penghapusan tersebar lintas-device
   (cermin `migrations/202605300010_tombstone_realtime_and_shipname.sql`).
3. Klien: `handleDeleteHistoryEntry` / `...Bulk` memanggil RPC ini (lewat outbox bila
   offline), bukan hanya tombstone lokal. `subscribeToShiftHistoryEntries` mem-fetch
   tombstone juga dan **memfilter** sebelum `setHistoryEntries`.

### FIX B — Filter tombstone di jalur subscription langsung (mitigasi cepat, bisa rilis dulu)

Tanpa menunggu migration, hentikan resurrection yang terlihat user dengan memfilter di
klien (pakai ref mirror agar listener `deps: []` membaca nilai terbaru — pola
`authAccessResolvedUidRef`):

```js
const deletedRecordsRef = useRef(deletedRecords);
useEffect(() => { deletedRecordsRef.current = deletedRecords; }, [deletedRecords]);

// AppContextRuntime.jsx:10511 (shift history)
setHistoryEntries((prev) => mergeHistoryEntries(
  prev,
  omitDeletedEntities(serverEntries, deletedRecordsRef.current.historyEntries),
));

// AppContextRuntime.jsx:10449 (incidents subscription — pola sama)
const mergedIncidents = omitDeletedEntities(
  mergeIncidentsCollection(localOnlyIncidents, reconciledDomainIncidents),
  deletedRecordsRef.current.incidents,
);
```

> Catatan: cocokkan tombstone via **`key` stabil** (`shipToken|shift_key`), bukan hanya
> `id`, agar entry versi klien dan versi server (yang id-nya dihitung dari key sama) tetap
> ter-suppress.

### FIX C — Penghapusan kapal harus men-DELETE baris server `ships` (prioritas 1, akar kapal lintas-device)

1. Tambah RPC/policy `admin_delete_ship(p_ship_id text)` (cermin pola admin delete), atau
   ubah `writeStateToSql` agar menghitung selisih kapal lokal vs server lalu **menghapus**
   baris `ships` yang tak lagi ada (`delete ... where id = any(removed)`), dibatasi ADMIN.
2. Karena `shift_history_entries.ship_id ... on delete cascade`, menghapus baris `ships`
   otomatis membersihkan history kapal itu di server — menyelesaikan dashboard & history
   sekaligus untuk kapal yang dihapus.
3. `handleDeleteShip` memanggil jalur delete server (lewat outbox bila offline), tidak hanya
   tombstone blob lokal.

### FIX D — Tegakkan tombstone untuk notifikasi

1. Filter notifikasi yang merujuk entitas terhapus saat merge/render
   (`shipName` cocok kapal terhapus, `historyId`/`incidentId` ada di tombstone). Ganti
   `AppContextRuntime.jsx:3083` agar dibungkus filter ini.
2. Server: notifikasi cron untuk kapal/history yang sudah dihapus tidak lagi terbentuk
   setelah Fix C (kapal hilang) — atau tambahkan delete notifikasi terkait di RPC delete.

### FIX E — (Opsional, kebersihan) Persist tombstone ke cloud sebagai jaring pengaman

Jika delete server-side belum bisa dijalankan untuk semua domain, simpan `deletedRecords`
ke cloud (mis. tabel `client_tombstones` atau kolom JSON pada snapshot) lalu sertakan di
`buildStatePayload` sehingga device baru pun mewarisi tombstone. Ini mitigasi, bukan
pengganti delete server-side.

---

## Prioritas & Dampak

| Prioritas | Fix | Menyelesaikan |
| --- | --- | --- |
| P1 | A + C (server delete: history & ships) | Akar masalah, permanen, lintas-device |
| P1 (cepat) | B (filter subscription) | History/temuan tak muncul lagi di device penghapus — bisa rilis lebih dulu |
| P2 | D (notifikasi) | Notifikasi entitas terhapus hilang |
| P3 | E (tombstone ke cloud) | Jaring pengaman device baru |

## Berkas yang Disentuh

| Berkas | Perubahan |
| --- | --- |
| `supabase/migrations/<baru>_admin_delete_shift_history.sql` | Tabel/kolom tombstone + RPC + policy + realtime (Fix A) |
| `supabase/migrations/<baru>_admin_delete_ship.sql` | RPC/policy delete `ships` (Fix C) |
| `src/services/backend/shiftHistory.js` | Fetch tombstone + dukung delete (Fix A) |
| `src/services/backend/cloudState.js` | DELETE baris `ships` yang dihapus; (opsional) tombstone ke cloud (Fix C/E) |
| `src/context/AppContextRuntime.jsx` | Ref tombstone + filter di subscription history/incidents; panggil RPC delete; filter notifikasi (Fix B/C/D) |

## Verifikasi

1. **Repro:** sebagai admin hapus kapal TEST-001 + history 1 April–17 Juni → reload / tunggu
   tick realtime. Sebelum fix: muncul lagi (sesuai screenshot). Sesudah fix: hilang di
   Dashboard REPORT, History, Notifikasi, Armada.
2. **Lintas-device:** hapus di device A → pastikan hilang juga di device B setelah sync
   (membuktikan delete server-side bekerja, bukan sekadar filter lokal).
3. **Device bersih:** clear `localStorage`/akun baru → data terhapus tetap tidak muncul.
4. `npm run build`, `npm run test:security` (15) + test halaman (49) hijau.

## Prinsip Umum (perbarui catatan)

- Cloud adalah sumber kebenaran berbasis tabel SQL; **penghapusan wajib jadi operasi server**
  (DELETE / tombstone server), bukan hanya state lokal.
- Tiap tabel SQL yang punya cron writer (shift_history_entries, notifications) butuh jalur
  penghapusan + propagasi tombstone realtime (cermin `patrol_report_tombstones`).
- Tiap subscription tabel server yang menulis ke state lokal WAJIB memfilter `deletedRecords`
  sebelum `setState`.
- Dashboard REPORT & notifikasi adalah **turunan** history/nama kapal — memperbaiki sumber
  (history & ships) otomatis memperbaiki permukaan turunan.
