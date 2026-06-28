# Bug: Data yang Dihapus Admin Muncul Lagi (Kapal & History)

**Tanggal:** 2026-06-27
**Branch:** `claude/admin-deletion-bug-6y5eic`
**Pelapor:** admin (alkaboyz88@gmail.com)
**Status:** Analisis selesai — menunggu implementasi

## Gejala

Sebagai role **ADMIN**, kapal/armada dan history (laporan shift) yang sudah dihapus
**muncul kembali** di beberapa permukaan:

- **Dashboard Laporan** (`DailyReportPage`)
- **Notifikasi** (`NotificationsPage`)
- **History** (`HistoryPage`)
- **Page Armada** (`ShipsPage`)

---

## Arsitektur Penghapusan (kondisi sekarang)

Aplikasi memakai pola **tombstone** lewat objek `deletedRecords` di
`src/context/AppContextRuntime.jsx`:

```js
// createDeletedRecordsState() — hanya 4 grup yang dikenal
{
  historyEntries: { [id]: deletedAt },
  incidents:      { [id]: deletedAt },
  ships:          { [id]: deletedAt },
  users:          { [id]: deletedAt },
}
```

Saat admin menghapus:
- **Kapal** → `handleDeleteShip` (≈ baris 9117) menulis tombstone `ships[id]` +
  `setShipsData(filter)`.
- **History** → `handleDeleteHistoryEntry` / `...Bulk` (≈ baris 7243 / 7275) menulis
  tombstone `historyEntries[id]` + `setHistoryEntries(filter)`.

Tombstone **dihormati** di satu tempat saja: fungsi merge blob shared-state
`mergeSharedStateSnapshots()` (≈ baris 3018–3089), via `omitDeletedEntities()`:

```js
historyEntries: omitDeletedEntities(mergeHistoryEntries(...), deletedRecords.historyEntries),
incidentsData:  omitDeletedEntities(mergeIncidentsCollection(...), deletedRecords.incidents),
shipsData:      omitDeletedEntities(mergeEntitiesById(...), deletedRecords.ships),  // mergedShips
usersData:      ... (deletedRecords.users)
notifications:  mergeNotificationsCollection(...),   // ⚠️ TIDAK difilter tombstone
```

`deletedRecords` ikut dipersist lokal (`sanitizeStateForLocalPersistence` menyebar
`...data`) dan ikut diunggah ke cloud (`createCloudSyncStateSnapshot` selalu membawa
`deletedRecords`, dan tidak pernah dipangkas oleh `fitSharedStateToCloudBudget`).
Jadi mekanisme tombstone-nya **ada dan benar** — masalahnya ada di jalur-jalur yang
**melewati** mekanisme ini.

---

## Akar Masalah

### Penyebab #1 — Subscription tabel server menyuntik ulang data tanpa cek tombstone (UTAMA)

Ini penyebab utama "history yang dihapus muncul lagi".

Ada subscription realtime yang menulis **langsung** ke state lokal dengan `mergeHistoryEntries` /
`mergeIncidentsCollection`, **tanpa** `omitDeletedEntities(..., deletedRecords...)`:

**a. `subscribeToShiftHistoryEntries` — `AppContextRuntime.jsx` ≈ baris 10473–10519:**

```js
const serverEntries = rows.map((row) => ({ id: `history-${key}`, ... }));
setHistoryEntries((prev) => mergeHistoryEntries(prev, serverEntries));  // ⚠️ bypass tombstone
```

`shift_history_entries` adalah tabel yang diisi cron server saat shift berakhir. Baris di
sana **tidak ikut terhapus** saat admin menghapus history di klien (yang dihapus hanya
tombstone lokal + blob). Setiap tick realtime / reconnect, baris yang sama disuntik ulang
ke `historyEntries` → entry yang sudah dihapus **hidup lagi**.

Dampak: **History tab** (baca `historyEntries`) dan **Dashboard Laporan** (turunan
history/checkpoints) menampilkan kembali laporan shift yang dihapus.

**b. `subscribeToIncidents` — `AppContextRuntime.jsx` ≈ baris 10424–10469:**

```js
const mergedIncidents = mergeIncidentsCollection(localOnlyIncidents, reconciledDomainIncidents);
return ...; // ⚠️ tidak pernah memfilter deletedRecords.incidents
```

Pola identik: temuan/insiden yang dihapus admin bisa disuntik ulang dari tabel `incidents`.

> **Pola yang harus diingat:** tombstone hanya ditegakkan di merge blob shared-state.
> Setiap subscription tabel server yang menulis ke state lokal **wajib** memfilter ulang
> terhadap `deletedRecords` sebelum `setState`.

### Penyebab #2 — Notifikasi tidak pernah difilter tombstone

`mergeNotificationsCollection` (baris ≈ 3083) adalah satu-satunya koleksi di
`mergeSharedStateSnapshots` yang **tidak** dibungkus `omitDeletedEntities`, dan
`deletedRecords` **tidak punya grup `notifications`** sama sekali
(`createDeletedRecordsState` hanya punya `historyEntries`, `incidents`, `ships`, `users`).

Akibatnya notifikasi yang merujuk entitas terhapus tetap ada selamanya. Record notifikasi
sudah menyimpan referensi yang cukup untuk difilter
(`createNotificationRecord`, baris ≈ 3103):

```js
{ ..., shipName, shiftKey, incidentId, historyId, ... }
```

Dampak: **Notifikasi** masih menampilkan summary shift / temuan / kapal yang sudah dihapus.

### Penyebab #3 — Penghapusan tidak meng-cascade ke record turunan

Tombstone kapal hanya menghapus **record kapal** dari `shipsData`. Record turunan yang
menyemat nama/ID kapal — checkpoints, incidents, history entries, notifikasi — **tidak
ikut dibersihkan**. Jadi meskipun record kapal hilang dari Page Armada, "jejak" kapal
tetap terlihat di Dashboard/Notifikasi/History karena laporan & notifikasi lama masih
merujuk kapal itu.

### Penyebab #4 — Risiko timing: tombstone bisa hilang saat apply snapshot cloud

`applyCloudSharedState` (≈ baris 6716–6724) menggabungkan snapshot cloud dengan
`localSharedStateRef.current`. Ref ini diperbarui lewat `useEffect` (≈ baris 5787,
asinkron setelah render). Bila sebuah snapshot cloud di-apply **sebelum** ref mencerminkan
tombstone yang baru dibuat, union `mergeDeletedRecords(stale, cloud)` bisa **tidak**
mengandung tombstone tersebut, lalu `setDeletedRecords` menimpa state dengan versi tanpa
tombstone → kapal hidup lagi.

Catatan kepercayaan: Penyebab #1 dan #2 **pasti** (terbukti di kode dan menjelaskan
History + Notifikasi). Untuk kapal yang muncul lagi spesifik di **Page Armada**
(`ShipsPage` membaca `shipsData` yang sudah difilter), penyebab paling mungkin adalah #4
(dan #3 untuk permukaan turunan). Perlu konfirmasi runtime singkat, tapi perbaikan di
bawah membuatnya robust terlepas dari timing.

---

## Rencana Perbaikan

Prinsip: **tombstone (`deletedRecords`) adalah sumber kebenaran tunggal.** Setiap jalur
yang menulis ke state lokal harus menghormatinya.

### Fix 1 — Filter tombstone di semua subscription tabel server (prioritas tertinggi)

Tambahkan filter `deletedRecords` di callback subscription sebelum `setState`. Pakai ref
mirror agar callback `deps: []` membaca nilai terbaru (pola sama dengan
`authAccessResolvedUidRef` di CLAUDE.md):

```js
// ref mirror, diupdate via useEffect
const deletedRecordsRef = useRef(deletedRecords);
useEffect(() => { deletedRecordsRef.current = deletedRecords; }, [deletedRecords]);

// a. subscribeToShiftHistoryEntries (≈ baris 10511)
setHistoryEntries((prev) => mergeHistoryEntries(
  prev,
  omitDeletedEntities(serverEntries, deletedRecordsRef.current.historyEntries),
));

// b. subscribeToIncidents (≈ baris 10449)
const mergedIncidents = omitDeletedEntities(
  mergeIncidentsCollection(localOnlyIncidents, reconciledDomainIncidents),
  deletedRecordsRef.current.incidents,
);
```

> Idealnya server juga punya tombstone untuk `shift_history_entries` (mirip
> `patrol_report_tombstones` yang sudah ada) agar penghapusan lintas-device permanen.
> Tapi filter klien di atas sudah menghentikan resurrection yang terlihat user.

### Fix 2 — Tegakkan tombstone untuk notifikasi

Dua opsi (bisa digabung):

1. **Filter turunan (cepat, menyelesaikan gejala):** saat merender/menyusun notifikasi,
   buang yang merujuk entitas terhapus:

   ```js
   function omitNotificationsForDeletedEntities(notifications, deletedRecords, ships) {
     const deletedShipNames = new Set(
       Object.keys(deletedRecords.ships)
         .map((id) => ships.find((s) => s.id === id)?.name)
         .filter(Boolean)
     );
     return notifications.filter((n) =>
       !deletedRecords.historyEntries[n.historyId] &&
       !deletedRecords.incidents[n.incidentId] &&
       !deletedShipNames.has(n.shipName)
     );
   }
   ```

   Terapkan di `mergeSharedStateSnapshots` (ganti baris 3083) sehingga notifikasi ikut
   difilter di setiap merge.

2. **(Opsional) grup tombstone `notifications`:** tambah `notifications: {}` di
   `createDeletedRecordsState` bila admin perlu menghapus notifikasi individual.

### Fix 3 — Cascade penghapusan kapal ke record turunan

Di `handleDeleteShip.onConfirm`, selain tombstone kapal, bersihkan jejaknya:

- Hapus `checkpointsByShip[shipId]`.
- Tombstone history entries milik kapal itu (cocokkan via `shipId`/nama).
- Filter notifikasi dengan `shipName === targetShip.name` (lihat Fix 2).

Ini membuat kapal benar-benar hilang dari **semua** permukaan, bukan hanya Page Armada.

### Fix 4 — Cegah tombstone hilang karena timing

Jadikan `deletedRecords` otoritatif via ref yang diperbarui **sinkron** di dalam handler
delete (bukan hanya via `useEffect`), dan di `applyCloudSharedState` union-kan
`incoming.deletedRecords` dengan `deletedRecordsRef.current` (bukan hanya
`localSharedStateRef.current` yang bisa stale). Dengan begitu tombstone yang baru dibuat
tidak pernah hilang oleh snapshot cloud yang datang bersamaan.

---

## Berkas yang Disentuh

| Berkas | Perubahan |
| --- | --- |
| `src/context/AppContextRuntime.jsx` | Fix 1–4: filter tombstone di subscription, filter notifikasi, cascade delete kapal, ref tombstone otoritatif |
| `src/services/backend/shiftHistory.js` *(opsional)* | Tombstone server untuk `shift_history_entries` (penghapusan permanen lintas-device) |

## Verifikasi

1. **Repro:** sebagai admin hapus 1 history + 1 kapal → tunggu tick realtime / reload.
   Sebelum fix: muncul lagi. Sesudah fix: tetap hilang di Dashboard, Notifikasi, History,
   Armada.
2. Lintas-device: hapus di device A, pastikan tetap hilang di device B setelah sync.
3. `npm run build` dan `npm run test:security` (15 test) + test halaman (49 test) hijau.

## Prinsip Umum (untuk diingat)

- Tombstone `deletedRecords` adalah sumber kebenaran tunggal untuk penghapusan.
- **Setiap** subscription tabel server yang menulis ke state lokal WAJIB memfilter ulang
  terhadap `deletedRecords` sebelum `setState` — jangan hanya andalkan merge blob.
- Penghapusan entitas induk (kapal) harus meng-cascade ke record turunan (checkpoints,
  history, incidents, notifikasi).
- Listener `deps: []` harus membaca state via ref mirror agar tidak memakai closure stale.
