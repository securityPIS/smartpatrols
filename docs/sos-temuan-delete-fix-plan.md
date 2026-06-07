<!--
Tujuan: Menjelaskan analisa dan rencana implementasi perbaikan SOS durable serta
        delete temuan lintas view.
Caller: Developer/agent saat audit, regression fix, dan rollout SmartPatrol.
Dependensi: AppContextRuntime, incidentReports, patrolReports, cloudState, Supabase migrations.
Main Functions: Merangkum akar bug, desain perbaikan, acceptance criteria, dan verifikasi.
Side Effects: Tidak ada; dokumen referensi operasional.
-->

# Perbaikan SOS Admin dan Delete Temuan Lintas View

Status: Implemented in progress  
Produk: SmartPatrol SQL  
Tanggal: 7 Juni 2026

## Akar Masalah

Admin tidak menerima SOS karena target penerima dihitung di client dari `usersData`.
Device PETUGAS tidak selalu bisa membaca profil admin akibat RLS `profiles`, sehingga
admin tidak masuk `targetUserIds`. Selain itu SOS sebelumnya hanya dipancarkan lewat
state lokal dan `client_mutations`, tanpa row durable di `sos_alerts`.

Temuan yang dihapus admin masih muncul di Page Temuan PETUGAS karena Page Temuan
menggabungkan beberapa sumber: `incidentsData`, checkpoint patroli, snapshot history,
dan SOS. Tombstone lama hanya mereset checkpoint di Page Patroli. Manual incident juga
tertinggal karena listener `incidents` melakukan merge-only, bukan mengganti slice data
domain dari Supabase.

## Desain Perbaikan

- SOS disimpan durable lewat RPC `create_operational_sos_alert`.
- RPC menghitung target admin/PIC/PETUGAS server-side, tanpa melonggarkan RLS `profiles`.
- RPC menulis `sos_alerts`, fan-out `notifications`, dan signal domain `sos_alerts`.
- Resolve/delete SOS memakai RPC `resolve_operational_sos_alert`; delete ditandai sebagai
  resolved + deleted agar device lain mendapat tombstone, bukan mengandalkan row hilang.
- Tombstone patrol membawa `incident_id` dan `checkpoint_name`.
- Client tombstone cleanup menandai `incidentMeta[incidentId].deleted`, membersihkan
  `incidentsData`, mereset checkpoint, dan membuang checkpoint cocok dari history.
- Listener `incidents` mengganti domain slice yang sebelumnya datang dari Supabase,
  sehingga DELETE manual incident benar-benar hilang dari cache PETUGAS.

## Acceptance Criteria

- Admin menerima SOS alert dan notifikasi untuk SOS dari PETUGAS kapal mana pun.
- SOS tetap bisa dipulihkan setelah refresh/login ulang selama masih aktif.
- Delete admin pada temuan patroli hilang dari Page Patroli dan Page Temuan PETUGAS.
- Delete admin pada temuan manual hilang dari Page Temuan PETUGAS.
- Delete/close SOS berubah resolved atau hidden dari Page Temuan PETUGAS sesuai marker
  durable di `sos_alerts`.
- Tombstone tidak menghapus laporan sah yang dibuat setelah waktu delete admin.

## Verifikasi

Jalankan:

```bash
node --test tests/pages/patrol-report-delete-tombstone.test.mjs
node --test tests/pages/incident-delta-subscription.test.mjs
node --test tests/pages/sos-durable-admin-target.test.mjs
node --test "tests/**/*.test.mjs"
npm.cmd run build
```
