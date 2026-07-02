# Analisa: Laporan JKT03 Shift 2 Hilang Sebagian Setelah Isi Foto Kondisi Personil

Tanggal analisa: 2026-07-02 · Laporan lapangan: kapal JKT03, Shift 2 (12.00–18.00) —
"laporan yang sudah di-submit langsung hilang sebagian setelah isi foto kondisi personil".

## Ringkasan (TL;DR)

Laporan tidak hilang karena aksi foto itu sendiri. Foto "Kondisi Personil" memakai kamera
native (aplikasi ke background beberapa kali). Saat aplikasi kembali dari kamera, subscription
tombstone `patrol_report_tombstones` melakukan catch-up (refetch/poll 30 detik/reconnect
realtime) dan **menerapkan tombstone penghapusan admin secara tanpa syarat untuk shift yang
sama** — mereset checkpoint `completed` kembali ke `pending`. Laporan terlihat "hilang tepat
setelah isi foto" karena catch-up itu terjadi persis saat resume dari kamera.

Akar penghapusannya sendiri ada di rantai "hapus temuan oleh admin" yang blast radius-nya
terlalu lebar: menghapus SATU temuan ikut menghapus SEMUA baris `patrol_reports` untuk
checkpoint itu (lintas shift/tanggal), menulis tombstone per-baris, lalu guard sisi klien
mereset laporan sah yang masih tampil — termasuk laporan AMAN dan laporan yang dibuat
SETELAH penghapusan.

## Rantai penyebab (berlapis)

### 1. RPC hapus temuan menghapus lintas shift — blast radius terlalu lebar

`supabase/migrations/202605300013_admin_delete_patrol_rpc.sql` (baris 59–116):
`admin_delete_patrol_report_findings(p_ship_id, p_checkpoint_id, p_firestore_id)` mencocokkan
baris dengan `OR`:

```sql
where (v_firestore_uuid is not null and id = v_firestore_uuid)
   or (p_ship_id is not null and p_checkpoint_id is not null
       and ship_id = p_ship_id and checkpoint_id = p_checkpoint_id)
```

Artinya: admin menghapus SATU temuan pada checkpoint X kapal JKT03 →
**semua baris `patrol_reports` untuk (JKT03, checkpoint X) ikut terhapus** — termasuk baris
shift 2 hari ini (walau statusnya AMAN, bukan temuan yang dimaksud), baris shift 1, dan
baris hari-hari sebelumnya. Untuk tiap baris yang terhapus ditulis tombstone dengan
`shift_key` ASLI baris tersebut (mis. `2026-07-02|shift-2-active`), plus satu tombstone
"natural" (`shift_key = NULL`).

Pemanggilnya: `handleDeleteIncident` di `src/context/AppContextRuntime.jsx:10130` (khusus
admin, dari halaman temuan / "Hapus Temuan").

### 2. Guard tombstone sisi klien mereset laporan sah tanpa guard waktu (bug utama sisi klien)

`src/context/AppContextRuntime.jsx:2189-2209` — `shouldApplyPatrolReportTombstoneToCheckpoint`:

```js
// Tombstone dengan shift_key sama persis = penghapusan untuk shift yang sama -> reset.
if (tombstoneShiftKey && checkpointShiftKey === tombstoneShiftKey) return true;
```

Cabang `shift_key` sama ini **tanpa syarat**:
- Tidak ada guard waktu `checkpointAtMs <= deletedAtMs` (padahal cabang natural/beda-shift
  punya, dan trigger DB `block_tombstoned_patrol_report` — migrasi
  `20260531120000_fix_patrol_tombstone_block_stale_only.sql` — SENGAJA meloloskan laporan
  yang dibuat SETELAH `deleted_at`). Asimetri klien vs DB.
- Tidak membedakan `resultType`; laporan **AMAN** ikut direset, padahal yang dihapus admin
  adalah sebuah temuan.

Akibatnya begitu ada tombstone ber-`shift_key` shift 2 hari ini (efek samping poin 1),
SEMUA laporan completed pada checkpoint itu di shift berjalan direset ke pending →
"laporan yang sudah di-submit hilang". Yang hilang hanya checkpoint yang natural key-nya
cocok dengan temuan yang dihapus → cocok dengan gejala "**hilang sebagian**".

Catatan: `tests/pages/patrol-report-tombstone-block-stale-only.test.mjs` justru meng-assert
keberadaan baris unconditional ini, jadi test saat ini MENGUNCI perilaku bug untuk kasus
same-shift.

### 3. Reset memakai timestamp "sekarang" → menang merge & menular ke device lain

`applyPatrolReportTombstones` (`AppContextRuntime.jsx:7070-7105`) mereset via
`resetCheckpointForShift(checkpoint, { pendingOrigin: 'manual-reset' })` yang default-nya
`updatedAt = getTrustedDate().toISOString()` (= SEKARANG, `AppContextRuntime.jsx:967-983`).

Di `mergeCheckpointRecord` (`AppContextRuntime.jsx:2422-2450`), record pending dengan
`pendingOrigin: 'manual-reset'` dan timestamp ≥ record completed **menang merge**. Karena
poll tombstone berulang tiap 30 detik dan tiap kali mereset dengan timestamp baru:

- Row completed yang masih ada / baru ditulis ke `patrol_reports` (trigger DB meloloskannya)
  kalah merge di klien setiap kali datang via realtime → laporan tidak pernah muncul lagi
  sepanjang shift itu.
- Snapshot cloud (`requestCloudSync`) membawa record reset ke device lain → laporan ikut
  hilang di device petugas lain/PIC.
- Submit ulang di shift yang sama pun ikut direset lagi pada poll berikutnya.

### 4. Riwayat (history) ikut bolong

Tombstone per-baris dari poin 1 membawa `shift_key` asli shift-shift lama. Filter
`shouldRemoveHistoryCheckpointForTombstone` (`AppContextRuntime.jsx:2234-2243`, dipakai di
`applyPatrolReportTombstones` baris 7133+) menghapus checkpoint ber-`shift_key` sama dari
`historyEntries` → laporan lama checkpoint itu hilang juga dari Riwayat Shift.

### 5. Kenapa terlihat "tepat setelah isi foto kondisi personil"

Foto kondisi personil = beberapa kali buka kamera native (`Camera.getPhoto`) → WebView ke
background berulang. Selama background: poll tombstone 30 detik tertunda/di-throttle,
channel realtime putus, dan event auth resume memicu re-resolve akses. Saat kembali dari
kamera semuanya catch-up sekaligus:

- `subscribeToPatrolReportTombstones` (`src/services/backend/patrolReports.js:344-398`)
  refetch 500 tombstone terakhir (initial fetch ulang saat efek re-subscribe karena
  `hasOperationalCloudAccess` sempat berubah, plus poll interval yang tertunda menyala).
- `applyPatrolReportTombstones` langsung mengeksekusi reset massal.

Jadi korelasi dengan foto adalah **korelasi waktu resume**, bukan penyebab. Aksi kamera pada
checkpoint lain juga bisa memicu gejala yang sama.

### 6. Penghapusan di server tidak bisa "sembuh sendiri" dan tanpa umpan balik

- Trigger `block_tombstoned_patrol_report` memblokir re-upsert laporan lama dengan
  `RETURN NULL` (silent, tanpa error) — klien (`savePatrolReport`) mengira sukses, cache
  `writeIfChanged` menandai "sudah tertulis", sehingga tidak ada retry ataupun notifikasi.
- Laporan asli (completedAt ≤ deleted_at) memang tidak akan pernah bisa kembali ke DB.

## Skenario runtut yang paling mungkin terjadi di JKT03

1. Selama/di sekitar Shift 2, admin menghapus satu (atau beberapa) temuan pada kapal JKT03
   dari halaman temuan ("Hapus Temuan").
2. RPC menghapus seluruh baris `patrol_reports` checkpoint terkait lintas shift + menulis
   tombstone per baris, termasuk yang ber-`shift_key` `2026-07-02|shift-2-active`.
3. Petugas sedang mengisi foto kondisi personil (kamera native, aplikasi bolak-balik
   background). Saat kembali dari kamera, catch-up tombstone berjalan.
4. Semua laporan completed di checkpoint yang kena tombstone shift-2 direset ke pending →
   petugas melihat sebagian laporan yang sudah di-submit hilang seketika.
5. Submit ulang pada checkpoint itu tampil sebentar lalu hilang lagi (poll 30 detik),
   sampai shift berganti (shift baru = `shift_key` baru, cabang unconditional tak lagi cocok).

## Cara memverifikasi di produksi

```sql
-- 1) Ada tombstone untuk JKT03 dengan shift_key shift 2 hari ini?
select client_event_id, shift_key, checkpoint_id, ship_name, deleted_at
from patrol_report_tombstones
where ship_name ilike '%JKT%03%'
  and (shift_key like '2026-07-02|%' or deleted_at::date = '2026-07-02')
order by deleted_at desc;

-- 2) Baris laporan shift 2 JKT03 yang tersisa (bandingkan dengan yang disubmit petugas)
select checkpoint_name, status, result_type, completed_by, server_updated_at
from patrol_reports
where shift_key = '2026-07-02|shift-2-active' and ship_name ilike '%JKT%03%';
```

Jika query (1) menghasilkan baris dengan `deleted_at` hari ini → diagnosa di atas terkonfirmasi;
checkpoint pada kolom `checkpoint_id` itulah "sebagian" laporan yang hilang.

## Perbaikan yang sudah diimplementasikan

Ketiga lapis di bawah sudah diterapkan pada branch ini (lihat commit fix, bukan commit analisa):

1. **Persempit RPC** `admin_delete_patrol_report_findings` — migrasi baru
   `supabase/migrations/20260702000000_narrow_admin_delete_patrol_findings.sql`. Sekarang:
   - MODE A (presisi): bila `p_firestore_id` (uuid baris) ada → hapus/tombstone HANYA baris itu.
     Jalur natural key dimatikan (`v_firestore_uuid is null`) sehingga baris shift lain aman.
   - MODE B (fallback tanpa uuid): hapus HANYA baris `result_type = 'temuan'` pada
     `(ship_id, checkpoint_id)`. Baris AMAN tidak pernah ikut terhapus.
   - Tombstone natural (`shift_key = NULL`) tetap ditulis untuk anti-resurrection, tapi kini
     aman karena diblokir trigger secara time-guarded dan guard klien juga time-guarded.

2. **Samakan guard klien dengan trigger DB** — `shouldApplyPatrolReportTombstoneToCheckpoint`
   (`src/context/AppContextRuntime.jsx`). Cabang same-shift tanpa syarat dihapus; sekarang
   SEMUA kasus wajib `resultType === 'temuan'` DAN `checkpointAtMs <= deletedAtMs`. Laporan
   AMAN maupun laporan yang dibuat SETELAH penghapusan tidak lagi ikut direset.

3. **Reset tombstone pakai `updatedAt = deletedAt`** (bukan "sekarang") di
   `applyPatrolReportTombstones` (`src/context/AppContextRuntime.jsx`), agar laporan baru
   (completedAt > deletedAt) selalu menang merge dan poll 30 detik tidak terus meremajakan
   record reset yang menutupi submit ulang yang sah.

Test yang mengunci perilaku lama (`tests/pages/patrol-report-tombstone-block-stale-only.test.mjs`)
sudah diperbarui ke perilaku benar dan ditambah assertion untuk migrasi baru. Seluruh 125 test
halaman + 27 test security hijau, dan `npm run build` sukses.

## Catatan lanjutan (di luar scope, belum dikerjakan)

- (Sekunder) Efek re-sync massal `AppContextRuntime.jsx` (efek yang me-loop
  `patrolReportSubscriptionTargets` lalu memanggil `syncPatrolReportToDomain`) menulis ulang
  semua checkpoint completed dari salinan lokal tiap device — device yang salinannya belum
  punya foto (media masih `uploading`) berpotensi menimpa `photo_url` row milik petugas lain
  (race dengan tulisan `ready`). Layak diperbaiki terpisah (tulis hanya laporan milik sendiri /
  bandingkan `client_updated_at_ms` sebelum menimpa).
