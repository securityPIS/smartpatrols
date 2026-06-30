# Rencana: Deduplikasi Temuan Patroli per Checkpoint

## Context
Saat patroli, ketika petugas menemukan sesuatu di sebuah checkpoint, alur sekarang
selalu membuat **temuan baru** (tap `TEMUAN` → kamera → `PatrolFormView` → isi 3 field).
Akibatnya temuan yang sama (mis. "karat di haluan" yang belum selesai) diisi ulang
sebagai temuan baru tiap patroli/shift → **duplikasi**.

Tujuan: saat tap `TEMUAN` di sebuah checkpoint, jika titik itu sudah punya **temuan lama
yang masih open**, beri petugas pilihan:
- **Temuan Baru** → lanjut alur normal (kamera + form isi temuan).
- **Temuan Lama** → langsung diarahkan ke **detail + form update** temuan tersebut
  (menambah progress), bukan membuat baris baru.

Keputusan desain (sudah dikonfirmasi user):
1. Dialog pilihan **hanya muncul bila ada temuan lama open** di titik itu (kalau tidak ada → langsung alur baru, tanpa friksi).
2. Cakupan cocok: temuan **patroli** (`checkpointId` sama) **dan** temuan **manual**
   (lokasi = nama checkpoint), pada **kapal yang sama**, status **open**.
3. Jika temuan lama open >1 → tampilkan **daftar pilih**; jika tepat 1 → langsung buka detailnya.

## Temuan teknis kunci (hasil eksplorasi)
- Tap `TEMUAN`: `PatrolPage.jsx` → `handleActionClick(id,'temuan')` (`AppContextRuntime.jsx:8392`)
  → `setPendingPatrolCameraCapture({id,type})` → kamera → `handlePatrolCameraCapture` (`:8782`) buka `activeForms[id]`.
- Temuan turunan patroli dibuat oleh `createPatrolIncidentRecord` (`:1184`); membawa
  `checkpointId` (= `checkpoint.id` = `shipId::slug::index`), `shipId`, `isPatrol:true`.
- Daftar gabungan semua temuan: `allIncidents` (`:7404`) = manual (`incidentsData`) +
  `patrolIncidents` (shift berjalan) + `historyPatrolIncidents` (shift lampau) + SOS.
- Status open/closed: `incidentMeta[id]?.status` (default `open`). Helper `getIncidentStatus`
  saat ini **terduplikasi** di `IncidentsPage.jsx:9` — akan dipakai ulang/diangkat ke util.
- Update tanpa duplikasi sudah tersedia: `handleAddProgress(incidentId)` (`:9632`) menyimpan
  progress ke `incidentMeta` + sync ke domain `incidents` (`syncIncidentDetailToDomain`),
  **tidak** membuat baris `patrol_reports` baru. Gate: `canManageIncident(incident)`.
- Detail temuan: `IncidentDetailView.jsx` (tombol "Tambah Update" → `handleAddProgress`).
  - Patrol incident dirender **inline di PatrolPage** (`PatrolPage.jsx:578`, syarat `selectedIncident.isPatrol`).
  - Manual incident dirender di **IncidentsPage** (`showRightPane` butuh `!isPatrol`).
- Pencocokan nama checkpoint: pakai `createCheckpointNameKey` (sudah dipakai di `:8753`).

## Perubahan

### 1. `src/context/AppContextRuntime.jsx`
- **Helper status bersama**: angkat `getIncidentStatus(incident, incidentMeta)` (logika sama
  dengan `IncidentsPage.jsx:9`) ke util/context agar tidak terduplikasi; pakai di langkah berikut.
- **Helper pencari temuan lama open** untuk sebuah checkpoint:
  ```js
  const getOpenFindingsForCheckpoint = useCallback((checkpoint) => {
    if (!checkpoint) return [];
    const cpId = String(checkpoint.id);
    const cpNameKey = createCheckpointNameKey(checkpoint.name || '');
    return allIncidents.filter((inc) => {
      if (getIncidentStatus(inc, incidentMeta) !== 'open') return false;
      if (!canManageIncident(inc)) return false;            // hanya yang bisa di-update
      const byCheckpoint = inc.checkpointId && String(inc.checkpointId) === cpId;
      const byLocation = !inc.isPatrol && !inc.isSOS
        && createCheckpointNameKey(inc.location || '') === cpNameKey
        && (inc.shipName || '') === (checkpoint.shipName || '');
      return byCheckpoint || byLocation;
    });
  }, [allIncidents, incidentMeta, canManageIncident]);
  ```
- **State baru**: `patrolFindingChoice` (`{ checkpointId, openFindings }` | null) dan flag
  `pendingIncidentUpdateOpen` (id temuan yang form update-nya harus dibuka otomatis).
- **Ubah `handleActionClick`** (`:8392`): untuk `type==='temuan'`, cari `getOpenFindingsForCheckpoint`;
  jika ada (>0) → `setPatrolFindingChoice({checkpointId:id, openFindings})` dan **return** (jangan
  buka kamera dulu). Selain itu (aman, atau tidak ada temuan lama) → perilaku lama
  (`setPendingPatrolCameraCapture`).
- **Handler baru**:
  - `chooseNewPatrolFinding()` → `setPatrolFindingChoice(null)` lalu
    `setPendingPatrolCameraCapture({id: choice.checkpointId, type:'temuan'})` (lanjut alur normal).
  - `openFindingUpdate(finding)` → `setSelectedIncident(finding)`;
    set `pendingIncidentUpdateOpen = finding.id`; jika `finding.isPatrol` → tetap di `PatrolPage`
    (detail inline muncul), selain itu `setCurrentPage('incidents')`; `setPatrolFindingChoice(null)`.
  - (Daftar pilih ditangani di modal; modal memanggil `openFindingUpdate` saat item dipilih,
    atau saat hanya 1 temuan.)
- **Export** state/handler baru pada context value (objek return ~`:11600`–`:11860`):
  `patrolFindingChoice`, `setPatrolFindingChoice`, `chooseNewPatrolFinding`, `openFindingUpdate`,
  `pendingIncidentUpdateOpen`, `setPendingIncidentUpdateOpen`.

### 2. `src/components/modals/PatrolFindingChoiceModal.jsx` (baru)
- Modal yang tampil saat `patrolFindingChoice` ≠ null. Mengikuti pola modal yang ada
  (mis. `PatrolCameraModal.jsx`) untuk styling/overlay.
- **Mode pilihan**: dua tombol besar — "Temuan Baru" (→ `chooseNewPatrolFinding`) dan
  "Temuan Lama (N masih open)".
- Saat "Temuan Lama": jika `openFindings.length === 1` → langsung `openFindingUpdate(openFindings[0])`;
  jika >1 → beralih ke **mode daftar** (kartu ringkas: lokasi/deskripsi singkat, pelapor,
  tanggal, badge OPEN) → pilih item → `openFindingUpdate(item)`.
- Tombol tutup → `setPatrolFindingChoice(null)`.

### 3. `src/pages/PatrolPage.jsx`
- Render `<PatrolFindingChoiceModal />` (ambil state via hook context yang relevan).
- Pastikan saat `selectedIncident.isPatrol` detail inline tetap muncul (sudah ada di `:578`).

### 4. `src/components/views/IncidentDetailView.jsx`
- Auto-buka form update: `useEffect` — jika `pendingIncidentUpdateOpen === selectedIncident?.id`,
  `setShowUpdateForm(true)` lalu `setPendingIncidentUpdateOpen(null)`. (Komponen sudah punya
  state internal `showUpdateForm` dan tombol "Tambah Update".)

## Verifikasi
- `npm install` lalu `npm run build` (vite) — pastikan bundel sukses.
- `npm run test:security` (15 test) + test halaman (49 test) tetap hijau.
- Manual end-to-end (web/dev):
  1. Buat temuan di checkpoint A, biarkan **open**.
  2. Di shift berikutnya, tap `TEMUAN` di checkpoint A → **dialog pilihan muncul**.
     - "Temuan Lama" → diarahkan ke detail temuan A dengan **form update terbuka**; simpan progress
       → tidak ada baris temuan baru (cek `allIncidents`/daftar Temuan).
     - "Temuan Baru" → kamera → form isi seperti biasa.
  3. Tap `TEMUAN` di checkpoint B yang **tidak punya** temuan open → **langsung ke kamera**
     (tanpa dialog).
  4. Bila checkpoint A punya >1 temuan open → "Temuan Lama" menampilkan **daftar pilih** dulu.
  5. Verifikasi temuan **manual** dengan lokasi = nama checkpoint juga terdeteksi sebagai
     "temuan lama" pada kapal yang sama.

## Catatan
- Tidak menyentuh skema DB / `patrol_reports`; update memakai jalur progress domain `incidents`
  yang sudah ada (offline-first via outbox tetap berlaku).
- Tetap hormati gate trusted-time & `canManageIncident` yang sudah ada.
