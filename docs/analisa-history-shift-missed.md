# Analisa: Hasil Submit Patroli Hilang (Jadi "Missed") Saat Snapshot History Pergantian Shift

Tanggal analisa: 2026-07-05 · Gejala lapangan: submit patroli selama shift terlihat normal,
tetapi saat pergantian shift dan sistem menyimpan snapshot ke history, banyak laporan yang
sudah di-submit tercatat sebagai **missed** di Riwayat Shift.

## Ringkasan (TL;DR)

Snapshot history dibuat oleh **dua penulis yang tidak saling menunggu**:

1. **Server** — `pg_cron` menjalankan `finalize_shift()` **tepat pada detik shift berakhir**
   (05:00/11:00/23:00 UTC), membaca tabel `patrol_reports` **apa adanya saat itu**.
2. **Klien** — efek reconcile di `AppContextRuntime.jsx` membangun entri history lokal dari
   `checkpointsByShip` device itu sendiri untuk **semua kapal**, lalu menyebarkannya via
   cloud state sync yang dibatasi kuota.

Laporan yang di-submit petugas sering **belum berada di `patrol_reports` saat cron menembak**
(antre di outbox IndexedDB, WebView di background sehingga timer flush beku, jaringan kapal
lambat, socket menggantung), sementara di layar petugas semuanya tampak "sudah tersubmit"
karena UI membaca state lokal. Akibatnya snapshot server menghitung checkpoint itu **missed**.
Sebelum migration `20260704114027`, entri yang sudah terbentuk **tidak pernah diperbarui**
(`on conflict do nothing`) sehingga missed itu permanen. Setelah migration tersebut entri bisa
sembuh sendiri saat laporan telat masuk — tetapi masih ada beberapa celah yang membuat laporan
tidak pernah sampai / tidak pernah cocok, dirinci di bawah.

## Arsitektur alur data (siapa menulis apa)

```
Submit petugas (handleSubmitPatrol, AppContextRuntime.jsx:8691)
  ├─ state lokal checkpoint → 'completed'  (UI langsung terlihat normal)
  ├─ prequeue baris ke outbox IndexedDB    (durableQueueOnly, :8797)
  │    └─ flush outbox → upsert patrol_reports (outbox.js:150, patrolReports.js:108)
  └─ panggilan sync kedua di-SKIP oleh cache writeIfChanged (:6598-6609)
       → SATU-SATUNYA jalur baris laporan ke DB adalah flush outbox

Akhir shift
  ├─ SERVER : cron finalize-shift-N (tepat di detik akhir shift)
  │    └─ finalize_shift_for_ship() → snapshot shift_history_entries
  │         match laporan per checkpoint via nama ternormalisasi ATAU id runtime
  └─ KLIEN  : efek reconcile (AppContextRuntime.jsx:8301)
       └─ buildHistoryEntry() per kapal dari STATE LOKAL device tsb
            checkpoint yang bukan 'completed' → dikunci 'missed' (:1553-1562)

Tampilan Riwayat
  └─ mergeHistoryEntries(lokal, server) — checkpoint 'completed' menang atas 'missed'
     (mergeCheckpointRecord :2393; prioritas completed=3 > missed=2)
```

Konsekuensi penting dari arsitektur ini: **device petugas yang submit selalu terlihat benar**
(state lokalnya completed dan menang merge), sedangkan **device lain (PIC/admin/petugas shift
berikutnya) melihat snapshot server apa adanya** — di sanalah "banyak missed" terlihat.

## Akar masalah

### AM-1 (utama): Cron finalize menembak TEPAT di detik akhir shift, tanpa grace period

`supabase/migrations/202605280001_add_shift_history_cron.sql:264-294` — jadwal
`0 5 * * *`, `0 11 * * *`, `0 23 * * *` = persis 12:00/18:00/06:00 WIB.

Laporan yang di-submit menjelang akhir shift hampir pasti belum sampai ke `patrol_reports`:

- Baris laporan hanya ditulis lewat **flush outbox** (prequeue di
  `AppContextRuntime.jsx:8797` + cache `writeIfChanged` di `:6598-6609` membuat tulisan
  langsung di-skip). Flush pertama dijadwalkan 250 ms, tapi bila gagal, backoff eksponensial
  sampai **5 menit** (`outbox.js:14-15`).
- Flush hanya berjalan saat app **terbuka di foreground**: pemicunya cuma event `online`,
  interval 60 detik, dan enqueue (`outbox.js:183-190`). WebView Android yang di-background
  **membekukan timer** — tidak ada listener `resume`/`appStateChange`/`visibilitychange`
  yang memicu flush saat app dibuka lagi.
- Jaringan kapal buruk: pola socket menggantung bermenit-menit sudah terdokumentasi
  (CLAUDE.md, bug skeleton). Petugas wajar menutup app tepat saat shiftnya selesai —
  antrean outbox ikut "tidur" bersama app-nya.

Snapshot server pun menghitung semua laporan yang belum sampai sebagai **missed**.

### AM-2: Sebelum 2026-07-04, entri history yang terlanjur salah TIDAK pernah dikoreksi

Versi awal `finalize_shift` memakai `on conflict (shift_key, ship_id) do nothing`
(`202605280001:238`, dipertahankan `202605290002:181`). Laporan telat yang akhirnya masuk
ke `patrol_reports` **tidak pernah memperbarui** entri history → missed permanen.

Migration `20260704114027_refresh_shift_history_on_late_patrol_report.sql` (kemarin) sudah
memperbaiki ini: `finalize_shift_for_ship` kini `on conflict do update`, plus trigger
`refresh_shift_history_after_late_patrol_report` yang me-rebuild entri saat baris
`status='completed'` masuk setelah jam akhir shift. **Semua kejadian sebelum migration ini
diterapkan di produksi tetap salah dan tidak akan sembuh sendiri** (rebuild hanya terpicu
oleh baris baru).

> Verifikasi pertama yang harus dilakukan: pastikan migration `20260704114027` benar-benar
> sudah ter-apply di project produksi (lihat bagian "Query verifikasi").

### AM-3: Laporan telat bisa TIDAK PERNAH sampai ke DB (celah yang tersisa setelah fix 07-04)

Trigger penyembuh hanya bekerja bila baris laporan akhirnya tiba. Jalur-jalur yang membuatnya
tidak pernah tiba:

1. **Outbox menunggu app dibuka lagi** — tidak ada flush on-resume (AM-1). Kalau petugas
   baru membuka app beberapa hari kemudian (atau uninstall/clear data), laporan hilang total.
2. **Blok senyap trigger tombstone** (`202605300014_block_finding_reupsert_time_window.sql`):
   - Cabang 1: `client_event_id` identik. `client_event_id` deterministik
     `shiftKey|shipId|checkpointId` (`patrolReports.js:40-46`) — begitu admin menghapus satu
     temuan, **submit ulang APAPUN pada checkpoint+shift yang sama** (termasuk laporan AMAN
     baru) punya `client_event_id` yang sama dengan tombstone → diblok `RETURN NULL` tanpa error.
   - Cabang 2: natural key + `shift_key` sama, **tanpa guard waktu** — laporan sah yang dibuat
     SETELAH penghapusan tetap diblok (asimetri dengan guard klien yang sudah diperbaiki di
     `AppContextRuntime.jsx:2190-2213`).
   - Karena blok bersifat senyap (upsert "sukses" 0 baris), `savePatrolReport` mengira berhasil,
     item outbox **dihapus**, dan cache `writeIfChanged` menandai sudah tertulis → tidak ada
     retry, tidak ada notifikasi. (Sudah tercatat sebagai temuan #6 di
     `docs/analisa-jkt03-shift2-laporan-hilang.md`, belum diperbaiki.)
3. **Logout/ganti akun saat pergantian shift** — outbox IndexedDB tidak per-user; flush setelah
   ganti sesi bergantung pada akses akun berikutnya; bila akun berikutnya tak punya akses kapal
   itu, upsert ditolak RLS berulang-ulang.

### AM-4: Matching snapshot server rapuh terhadap perubahan definisi checkpoint

`finalize_shift_for_ship` mencocokkan laporan ke checkpoint via
(`20260704114027:94-104`):

- nama ternormalisasi (`lower + trim + spasi tunggal`) **sama persis**, ATAU
- `checkpoint_id` = rekonstruksi `shipId::slug::index` dari `ships.custom_checkpoints` SAAT INI.

Bila admin **mengganti nama** checkpoint setelah laporan dibuat → nama tidak cocok DAN slug/id
berubah → laporan dianggap tidak ada → **missed**. Bila admin **menyisipkan/mengubah urutan**
checkpoint → `index` bergeser → fallback id gagal untuk semua titik di bawahnya (nama masih
menyelamatkan bila tidak di-rename). Lebih parah: laporan completed yang tidak cocok dengan
checkpoint manapun **dibuang diam-diam** dari snapshot — padahal jalur klien sengaja
mempertahankan "orphan" semacam ini (`AppContextRuntime.jsx:1080-1103`). Trigger penyembuh
juga tidak menolong karena rebuild memakai matcher yang sama.

### AM-5: Race tepat di batas shift — laporan kebagian shift_key shift berikutnya

`handleSubmitPatrol` memakai `shiftKey: currentShiftMeta.key` (`AppContextRuntime.jsx:8751`)
= shift yang aktif **saat tombol submit ditekan**. Patroli yang dikerjakan 11:58 tapi
di-submit 12:00:30 tercatat ber-`shift_key` shift 2 → di history shift 1 checkpoint itu
**missed**, laporannya "pindah" ke shift 2. Menjelaskan pola "checkpoint terakhir selalu missed".

### AM-6 (sekunder): Entri klien "all-missed" untuk kapal yang tidak dipegang device

Efek reconcile (`AppContextRuntime.jsx:8301-8357`) membangun entri history untuk **SEMUA
kapal di `shipsData`** dari state lokal device yang kebetulan melewati pergantian shift —
termasuk kapal yang device itu tidak pernah pegang datanya (default semua pending → semua
missed). Entri palsu ini:

- memicu notifikasi "Ada checkpoint missed" yang menyesatkan (`:8378-8394`);
- ikut tersebar via cloud state sync (`app_state`) yang **dibatasi kuota** —
  `CLOUD_SYNC_HISTORY_LIMIT_PER_SHIP=12`, `TOTAL=24`, terdegradasi sampai 8/4/2/**0** saat
  payload besar (`:3840-3872`) — sehingga entri BENAR milik device petugas bisa tergusur
  dan tidak pernah sampai ke device PIC;
- untuk shift yang sepenuhnya offline (server tidak membuat entri karena tidak ada satu pun
  baris laporan), entri all-missed ini justru jadi satu-satunya yang terlihat di device lain.

Merge memang memihak `completed` (`mergeCheckpointRecord`), jadi entri palsu tidak menimpa
data benar **yang sudah ada di device yang sama** — masalahnya adalah data benar itu sering
tidak pernah tiba di device pemirsa (kuota sync, server snapshot salah).

## Skenario runtut yang paling mungkin di lapangan

1. Shift 2 (12:00–18:00). Petugas patroli normal; menjelang 17:30–18:00 beberapa titik
   di-submit. UI hijau semua — padahal sebagian baris masih di outbox (sinyal jelek /
   app sempat ke background saat ambil foto).
2. 18:00:00 WIB — cron `finalize-shift-2` menembak. Baris yang belum sampai dihitung missed.
   Entri `shift_history_entries` tertulis dengan `missed_count` tinggi.
3. Petugas menutup app begitu shift selesai → outbox tidak pernah flush malam itu.
4. PIC/admin membuka Riwayat → melihat "banyak missed". Device petugas sendiri kalau dibuka
   justru terlihat benar (state lokal menang merge) → laporan bug terdengar kontradiktif:
   "submit normal, tapi history missed".
5. (Pra-07-04) Saat petugas membuka app esoknya, laporan akhirnya masuk `patrol_reports`,
   tapi entri history TIDAK di-update (`do nothing`) → missed permanen.
   (Pasca-07-04) Entri sembuh — kecuali laporan tersangkut AM-3/AM-4.

## Query verifikasi di produksi

```sql
-- 0) Pastikan fix 07-04 ter-apply: trigger & fungsi harus ada
select tgname from pg_trigger
where tgrelid = 'public.patrol_reports'::regclass and not tgisinternal;
-- harus memuat: refresh_shift_history_after_late_patrol_report_trg

-- 1) Entri history yang "missed" padahal ada baris completed yang cocok longgar
--    (bukti AM-2/AM-4: baris ada tapi snapshot bilang missed)
select h.shift_key, h.ship_id, h.missed_count, h.finalized_at,
       cp->>'name' as missed_name, r.checkpoint_name, r.status,
       r.created_at as report_created_at
from shift_history_entries h
cross join lateral jsonb_array_elements(h.checkpoints) cp
join patrol_reports r
  on r.shift_key = h.shift_key and r.ship_id = h.ship_id
 and r.status = 'completed'
 and regexp_replace(lower(btrim(r.checkpoint_name)), '\s+', ' ', 'g')
     = regexp_replace(lower(btrim(cp->>'name')), '\s+', ' ', 'g')
where cp->>'status' = 'missed'
order by h.finalized_at desc;

-- 2) Bukti keterlambatan (AM-1): laporan completed yang barisnya BARU dibuat
--    setelah entri history difinalisasi
select r.shift_key, r.ship_name, r.checkpoint_name,
       r.created_at as row_created, h.finalized_at
from patrol_reports r
join shift_history_entries h
  on h.shift_key = r.shift_key and h.ship_id = r.ship_id
where r.status = 'completed' and r.created_at > h.finalized_at
order by r.created_at desc limit 50;

-- 3) Blok senyap tombstone (AM-3.2): tombstone yang menutup checkpoint+shift sama
select t.shift_key, t.ship_name, t.checkpoint_name, t.deleted_at
from patrol_report_tombstones t
where t.deleted_at > now() - interval '14 days'
order by t.deleted_at desc;

-- 4) Riwayat eksekusi cron finalize
select jobname, status, return_message, start_time
from cron.job_run_details d join cron.job j using (jobid)
where j.jobname like 'finalize-shift%'
order by start_time desc limit 30;
```

## Rencana perbaikan

### P0 — menghilangkan sumber missed terbesar

1. **Grace period cron finalize** (migration baru).
   Geser jadwal ke +15 menit setelah akhir shift: `15 5 * * *`, `15 11 * * *`, `15 23 * * *`
   (12:15/18:15/06:15 WIB). Aman karena `finalize_shift` kini idempotent (`do update`) dan
   `date_key` dihitung dari tanggal Jakarta yang tidak berubah dalam window +15 menit
   (shift-3 tetap `date - 1` karena 23:15 UTC = 06:15 WIB hari+1). Laporan yang tersinkron
   dalam 15 menit pertama tidak akan pernah tercatat missed.

2. **Flush outbox saat app kembali hidup** (`src/services/backend/outbox.js` +
   `capacitorBridge`). Tambah pemicu flush pada: `visibilitychange → visible`, event Capacitor
   `appStateChange(isActive)` / `resume`, dan setelah auth session pulih. Ini satu-satunya
   cara laporan yang mengantre saat app ditutup segera terkirim begitu app dibuka.

3. **Robustkan matcher `finalize_shift_for_ship`** (migration baru):
   - tambah jalur match ke-3: `checkpoint_id` laporan diawali `shipId::slug::` (abaikan
     index) — tahan reorder;
   - **jangan buang laporan orphan**: setelah loop checkpoint, laporan `completed` pada
     shift+kapal itu yang tidak ter-match checkpoint manapun di-append ke snapshot sebagai
     entri completed tambahan (naikkan `total_count`), meniru perilaku klien
     (`AppContextRuntime.jsx:1080-1103`). Hasil patroli tidak boleh lenyap hanya karena
     admin me-rename/menyusun ulang titik.

4. **Indikator "laporan belum terkirim" + peringatan akhir shift** (klien).
   Ekspos jumlah item outbox `patrol_report.upsert` yang tertunda; saat `shiftEndingSoonAt`
   (15 menit sebelum akhir shift) dan antrean > 0, tampilkan banner "X laporan belum
   tersinkron — jangan tutup aplikasi / cari sinyal". Mencegah perilaku "tutup app tepat
   jam ganti shift" mengubur laporan.

### P1 — menutup jalur "laporan tidak pernah sampai"

5. **Time-guard trigger tombstone** (migration baru, samakan dengan guard klien
   `AppContextRuntime.jsx:2190-2213`): cabang 1 & 2 di
   `block_tombstoned_patrol_report` hanya boleh memblok bila
   `completedAt <= deleted_at`; cabang 4 (window 1 jam) hanya untuk `result_type='temuan'`
   DAN `completedAt <= deleted_at` bila completedAt tersedia. Laporan AMAN baru pada
   checkpoint yang temuannya pernah dihapus admin tidak boleh ikut terblok senyap.

6. **Sweeper penyembuh berkala** (migration baru): cron tambahan tiap jam yang me-rebuild
   `finalize_shift_for_ship` untuk shift-shift 48 jam terakhir yang punya baris
   `patrol_reports` lebih baru dari `finalized_at` entri history-nya. Menyembuhkan entri
   yang triggernya terlewat (mis. trigger belum ter-deploy saat baris masuk, atau baris
   masuk lewat jalur yang tak menembakkan trigger).

7. **Backfill satu kali** entri lama yang salah: jalankan `finalize_shift_for_ship` untuk
   seluruh (shift_key, ship_id) di `shift_history_entries` 30 hari terakhir yang terdeteksi
   query verifikasi #1 → history lama yang bolong ikut terkoreksi.

8. **Grace batas shift saat submit** (klien, `handleSubmitPatrol`): bila submit terjadi
   ≤ 5 menit setelah pergantian shift DAN checkpoint tersebut masih berstatus milik shift
   sebelumnya di state (form dibuka sebelum batas), pakai shift_key shift sebelumnya
   (konsisten dengan `occurredAtTrustedMs` foto/form). Menghapus pola "titik terakhir
   selalu missed".

### P2 — kebersihan & observabilitas

9. **Batasi reconcile klien ke kapal operasional** (`AppContextRuntime.jsx:8339`):
   jangan fabrikasi entri all-missed untuk kapal yang device-nya tidak punya satu pun data
   lokal — biarkan snapshot server (yang kini lebih andal) mengisi. Mengurangi notifikasi
   missed palsu dan polusi kuota cloud sync.
10. **Isi `crew_snapshot` di snapshot server** dari `shift_status_records`/profiles agar
    entri server setara dengan entri klien (kolomnya sudah ada, selalu kosong).
11. **Alarm data**: query harian (cron + notifikasi admin) yang menghitung entri history
    dengan missed yang punya baris completed cocok (query verifikasi #1 ≠ 0 ⇒ regresi).
12. **Perbaiki umpan balik blok senyap**: RPC/upsert yang diblok trigger sebaiknya
    mengembalikan baris via `returning` + klien memeriksa `data.length === 0` untuk
    menandai laporan "ditolak server" alih-alih menghapus item outbox.

### Urutan eksekusi yang disarankan

| Tahap | Item | Sentuhan |
|-------|------|----------|
| 1 | P0-1 grace cron + P0-3 matcher + P1-5 time-guard tombstone | 1 migration SQL |
| 2 | P0-2 flush on-resume + P0-4 banner outbox | klien (outbox.js, capacitorBridge, PatrolPage) |
| 3 | P1-6 sweeper + P1-7 backfill | 1 migration SQL + 1 script sekali jalan |
| 4 | P1-8 grace submit + P2-9 reconcile scoped | klien (AppContextRuntime.jsx) |
| 5 | P2-10..12 | menyusul terpisah |

## Rencana test

- **SQL (migration)**: test idempotensi `finalize_shift_for_ship` — (a) laporan masuk
  sebelum finalize → completed; (b) masuk sesudah → trigger rebuild → completed;
  (c) rename checkpoint setelah submit → tetap completed via jalur orphan; (d) reorder
  checkpoint → tetap completed via prefix-match; (e) tombstone temuan + submit AMAN baru
  di shift sama → TIDAK diblok.
- **Klien (tests/pages)**: (a) submit 30 detik setelah batas shift dengan form dibuka
  sebelum batas → shift_key shift lama; (b) reconcile tidak membuat entri untuk kapal tanpa
  data lokal; (c) `mergeHistoryEntries` server-missed vs lokal-completed → completed menang
  (regresi yang sudah ada, dikunci); (d) outbox flush terpanggil saat `visibilitychange`.
- **Manual**: simulasi jaringan mati 5 menit terakhir shift → tutup app → buka lagi setelah
  ganti shift → riwayat harus menampilkan laporan (bukan missed) setelah flush + rebuild.

## Catatan

- Kepastian akar masalah per kejadian butuh query verifikasi di project produksi
  (`hsquavmbeaawywpebafw` — tidak terjangkau dari sesi analisa ini). Jalankan minimal
  query #0 (fix 07-04 ter-apply?) dan #2 (bukti keterlambatan) sebelum mengeksekusi P1-7.
- RLS `shift_history_service_write` saat ini `for all using(true) with check(true)` —
  praktis SEMUA user terautentikasi bisa menulis/menghapus history. Tidak terkait langsung
  gejala ini, tapi layak dipersempit ke service role saja saat menyentuh migration history
  berikutnya.
