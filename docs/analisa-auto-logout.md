# Analisa Bug: Auto-Logout Acak Saat Sesi Aktif

## 1. Ringkasan Gejala
Petugas yang **sedang aktif** tiba-tiba ter-logout secara acak di tengah pemakaian — bukan saat cold start, bukan setelah idle lama. User terlempar ke layar login dan harus login ulang penuh.

**Scope:** terutama role `PETUGAS`. Logout terjadi *selama sesi berjalan*, dipicu oleh data sync di latar belakang.

## 2. Akar Masalah

### 2.1 Validator yang terlalu cepat menendang
`src/context/AppContextRuntime.jsx:10625-10678` — sebuah `useEffect` yang jalan **setiap kali** salah satu dependensinya berubah (`assignedShipForCurrentUser`, `authAccessStatus`, `currentUserRecord`, `usersData`, `shipsData`, dll). Saat kondisi "buruk" terdeteksi, ia **langsung** menendang tanpa menunggu state mengendap:

| Baris | Aksi | Kondisi |
|------|------|---------|
| `10648` | `resetAuthSession('Sesi cloud Anda telah berakhir...')` | `!firebaseAuthUser`/`!authAccessEnabled` & definitif |
| `10652` | `handleLogout('Akses operasional ... nonaktif...')` | `authAccessStatus === 'restricted'` |
| `10656` | `handleLogout('Registrasi ... ditolak...')` | `authAccessStatus === 'rejected'` |
| `10660` | `handleLogout('Registrasi ... menunggu approval...')` | `authAccessStatus === 'pending'` |
| `10666` | `handleLogout('Petugas off-duty atau tanpa penugasan...')` | `!canUserAccessApplication(activeUser)` |
| `10676` | `handleLogout('...tidak lagi terdaftar di armada aktif')` | PETUGAS & `!assignedShipForCurrentUser` |

**Krusial:** check yang paling rawan *transient* (`10652`–`10676`) memakai `handleLogout`, yang memanggil `logoutFirebaseUser()` → `supabase.auth.signOut()` (`src/services/backend/auth.js:97-108`). Jadi tendangan transient ini melakukan **sign-out keras ke server** — user wajib login ulang penuh. Inilah kenapa gejalanya "logout acak" yang nyata, bukan sekadar flicker UI.

### 2.2 Nilai turunan bisa "buruk" sesaat (race antar slice state async)
Nilai yang dibaca validator berasal dari **beberapa sumber async yang update di waktu berbeda**:

1. `assignedShipForCurrentUser` (`5477-5479`) = `resolveAssignedShipForUser(currentUserRecord, shipsData)`. Fungsi ini (`3388-3401`) mengembalikan `null` bila `user.status !== 'active'`, `shipAssigned` kosong, atau user belum ada di `ship.personnel`.
2. `canUserAccessApplication` (`3407-3411`): PETUGAS butuh `shipAssigned && status === 'active'`.
3. `currentUserRecord` (`5110-5158`): bila `authAccessState.access` ada, record **dibangun ulang** dari `authAccessState.profile` (`5143-5145`, `buildOperationalUserRecordFromAccess`) — sumber yang **berbeda** dari `usersData`.

**Pemicu update saat sesi aktif:**
- **Realtime cloud sync** (`src/services/backend/cloudState.js`, `subscribeToCloudAppState`): setiap perubahan tabel `profiles`/`ships` memicu refetch penuh, lalu `applyCloudSharedState` **mengganti total** `usersData` & `shipsData` (`AppContextRuntime.jsx:6656-6657`). Karena dua slice ini di-emit terpisah, ada jendela di mana `usersData` (penugasan baru) sudah berubah tapi `shipsData.personnel` belum (atau sebaliknya) → `assignedShipForCurrentUser` sesaat `null` → **tendang di 10676**.
- **Re-resolve operational access**: setiap event auth (mis. `TOKEN_REFRESHED` rutin) membuat objek `firebaseAuthUser` baru → effect `10448-10501` jalan lagi → `setAuthAccessState(baru)` → `currentUserRecord` dihitung ulang dari `authAccessState.profile`. Bila profile dari edge function sesaat berbeda dari `usersData`, `status`/`shipAssigned` ikut flip → **tendang di 10666/10676**. Edge function `supabase/functions/resolve-operational-access/index.ts` juga bisa mengembalikan `status:'pending'` bila baris profile/registration belum `approved` → **tendang di 10660**.

### 2.3 Guard yang ada hanya menutup cold start, bukan re-sync
`isWaitingForAssignedFleetSync` (`5480-5486`) memakai `shouldDeferPetugasFleetValidation` (`src/utils/userManagement.js:161-181`). Guard ini **hanya** menahan tendangan ketika `!cloudSyncBootstrapped` — yaitu **hanya saat hidrasi awal**. Setelah bootstrap sekali, guard ini permanen `false`, sehingga **re-sync realtime berikutnya tidak terlindungi** dan transient `assignedShip=null` langsung menendang di `10676`.

Normalisasi juga "agresif": baris profile tanpa `status`/`ship_assigned` jatuh ke `off-duty`/`null` (`cloudState.js:201-202`; `AppContextRuntime.jsx:3158`), memperbesar peluang nilai turunan jatuh ke "buruk" saat data sesaat tidak lengkap.

> **Kalibrasi:** hipotesis "baris parsial karena korupsi jaringan" lemah — `.select('*')` mengembalikan baris penuh. Akar yang kredibel adalah **race antar slice async + validator yang bertindak atas state transient dengan hard sign-out**, bukan data korup.

## 3. Konsistensi dengan pola yang sudah dikenal
Ini varian dari pola "macet di skeleton setelah take foto" (CLAUDE.md / commit `deffdbe`): event resume/refresh untuk **UID yang sama** tidak boleh diperlakukan seperti perubahan status nyata, dan **sesi hangat harus divalidasi ulang di latar belakang — bukan diputus atas state transient**. Jalur cloud-session di `10646-10648` sudah menerapkan gerbang "definitif" (`authAccessResolvedUid === currentUid` sebelum reset). Jalur data-driven (`10666`/`10676`) **belum** punya gerbang setara — di situlah bug-nya.

## 4. Rekomendasi Perbaikan (untuk tahap implementasi berikutnya)
1. **Konfirmasi sebelum tendang (debounce/settle).** Untuk check `10652`–`10676`, jangan panggil `handleLogout` seketika. Set timer tertunda (≈3–5 dtk via `ref`, mengikuti idiom ref di file ini seperti `authAccessRetryRef`) dan batalkan bila kondisi pulih pada emit sync berikutnya. Hanya tendang bila kondisi **bertahan** setelah settle.
2. **Perluas gerbang fleet-sync ke re-sync live.** Longgarkan `shouldDeferPetugasFleetValidation` agar juga menahan saat transisi realtime (mis. `shipsData` baru diganti dan `assignedShip` sesaat null padahal `usersData` petugas masih `status==='active' && shipAssigned`).
3. **Jangan bangun ulang `currentUserRecord` dari `authAccessState.profile` yang bertentangan** dengan record cached yang masih valid — merge field, jangan default mentah ke `off-duty`/`null`.
4. **Selaraskan severity.** Check transient sebaiknya `resetAuthSession` (lokal) lalu re-validasi, bukan `handleLogout` (hard `signOut`) yang sulit dipulihkan.

## 5. Cara Verifikasi (saat fix diterapkan)
Reproduksi: dari sesi admin lain, ubah penugasan kapal petugas saat petugas tsb aktif; amati apakah validator menendang pada jendela re-sync. Setelah fix: tendangan hanya terjadi bila kondisi **bertahan melewati settle window**, dan perubahan penugasan yang sah tetap diproses tanpa logout mendadak.
