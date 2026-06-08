# Analisa & Rencana Perbaikan Bug Notifikasi SmartPatrol

> Dokumen ini **hanya analisa + rencana perbaikan** (rujukan). Belum ada perubahan kode/migration/konfigurasi server yang diterapkan. Implementasi dieksekusi terpisah saat diminta.
>
> Tanggal: 2026-06-08 · Branch: `claude/confident-gauss-W9S5E`

## Ringkasan eksekutif

Dilaporkan dua bug yang **berbeda akar masalahnya**:

| # | Gejala | Akar masalah | Sifat perbaikan |
|---|--------|--------------|------------------|
| **1** | Notifikasi in-app "temuan" tidak masuk ke **admin** (dan PIC lintas-kapal) | Penerima notifikasi diresolusi **di sisi klien** dari `usersData`, padahal `usersData` di device petugas dibatasi RLS hanya ke profil sekapal. Admin tak punya kapal → tak pernah ditarget. | Kode (RPC server-side + ubah `getShipRecipients`) |
| **2** | **Push** notification tidak masuk ke **semua** role di **browser/PWA** | Web Push FCM secara kode sudah benar; kegagalan menyeluruh hampir pasti **konfigurasi/secret** (app_config / FCM service account / env Firebase). | Konfigurasi server (runbook) |

Keduanya saling lepas: memperbaiki #1 membuat admin/PIC **ditarget**, tetapi push baru benar-benar sampai setelah #2 (infrastruktur push) dibetulkan.

---

## Bug #1 — Notifikasi temuan tidak sampai ke admin/PIC

### Alur saat ini (penargetan di sisi klien)

1. Petugas submit temuan → `handleSubmitPatrol` (`src/context/AppContextRuntime.jsx:8208-8223`) atau "Lapor Baru" → `handleSubmitIncident` (`:8457-8470`). Keduanya membuat notifikasi `type: 'incident_created'` dengan:
   ```js
   targetUserIds: getShipRecipients(operationalShipName, { includeAdmins: true, includePic: true, includePetugas: true })
   ```
2. `getShipRecipients` (`AppContextRuntime.jsx:6921-6938`) menentukan penerima dengan **mengiterasi `usersData`**:
   ```js
   usersData.forEach((user) => {
     if (includeAdmins && user.role === ACCESS_ROLES.ADMIN) recipients.add(user.id);
     if (shipName && includePic && user.role === ACCESS_ROLES.PIC && user.shipAssigned === shipName) recipients.add(user.id);
     if (shipName && includePetugas && user.role === ACCESS_ROLES.PETUGAS && user.shipAssigned === shipName && user.status === 'active') recipients.add(user.id);
   });
   ```
3. Notifikasi disimpan ke cloud per-penerima (fan-out) lewat `persistNotificationRecords` → `notificationRecordToRows` (`src/services/backend/cloudState.js:404-432`, upsert `:471-480`). Satu baris `notifications` per `target_user_id`.
4. Penerima membaca via fetch + **Supabase Realtime** (`cloudState.js:842`, subscribe tabel `notifications`), lalu UI menyaring dengan `visibleNotifications` (`AppContextRuntime.jsx:5548-5555`) berdasarkan `targetUserIds ∩ notificationRecipientIds`.

### Akar masalah (keyakinan tinggi)

`usersData` dihidrasi dari tabel `profiles` (`cloudState.js:509-515` `fetchProfilesRows`) **di bawah RLS** `profiles_read_operational` (`supabase/migrations/202605220001_init_smartpatrol_sql.sql:475-483`):

```sql
using (
  public.is_admin()
  or auth_uid = auth.uid()
  or id = auth.uid()::text
  or (public.has_operational_access() and ship_assigned = public.current_profile_ship())
)
```

Untuk seorang **petugas**, RLS hanya membuka: profil dirinya + profil **sekapal** (`ship_assigned = current_profile_ship()`).

- **Admin tidak punya `ship_assigned`.** Ini ditegaskan oleh aturan akses operasional: `tests/security/sql-access.test.mjs:10-23` membuktikan `computeOperationalAccessEnabled({ role: ADMIN/PIC, shipAssigned: '' }) === true` — admin/PIC valid **tanpa** kapal. `current_profile_ship()` untuk admin mengembalikan string kosong, dan `'' = '<kapal-petugas>'` selalu `false`.
- Akibatnya **admin tidak pernah muncul di `usersData` milik petugas** → `getShipRecipients({ includeAdmins:true })` tidak menambahkan id admin → **tidak ada baris `notifications` dengan `target_user_id = admin.id`**.

Konsekuensinya admin tidak menerima temuan **baik in-app maupun push**:

- **In-app:** Walau RLS baca `notifications_read_target` (`init:668-676`) mengizinkan admin membaca semua baris via `public.is_admin()`, **baris yang menarget admin tidak pernah dibuat**. Saat realtime memicu re-fetch, `reconstructNotificationsFromRows` (`cloudState.js:437-466`) membangun `targetUserIds` dari baris yang ada — tanpa id admin — sehingga `visibleNotifications` menyaringnya keluar untuk admin.
- **Push:** Trigger `dispatch_push_after_insert` (`migrations/202605300003_add_push_subscriptions.sql:122-124`) hanya jalan saat ada INSERT baris menarget user. Tak ada baris admin → tak ada push admin.

**PIC lintas-kapal** terkena pola serupa: `getShipRecipients` hanya menambahkan PIC dengan `shipAssigned === shipName`, jadi PIC yang mengawasi kapal lain tidak pernah ditarget.

### Bukti pembanding — kenapa SOS berhasil tapi temuan tidak

Jalur **SOS** meresolusi penerima **di server** lewat fungsi `SECURITY DEFINER` `create_operational_sos_alert()` (`supabase/migrations/20260607032725_durable_sos_and_cross_surface_delete.sql:126-141`), yang bisa melihat **semua** admin/PIC tanpa terhalang RLS, lalu meng-INSERT baris notifikasi untuk tiap penerima (`:206-249`). Jalur temuan/incident memakai resolusi **klien** yang lumpuh oleh RLS — inilah sumber perbedaannya.

### Rencana perbaikan Bug #1 (RPC penerima server-side)

Ambil daftar penerima supervisor (ADMIN + PIC) **dari server** lewat RPC `SECURITY DEFINER`, lalu klien memakai id tersebut saat membangun `targetUserIds`. Ini mencakup **admin + PIC lintas-kapal**, **tanpa** memperluas RLS `profiles` (tidak membocorkan PII profil), dan **tanpa risiko duplikat** karena klien tetap satu-satunya pembuat baris (dedupe `baseId` lama tetap berlaku).

**1) Migration baru** — `supabase/migrations/<timestamp>_supervisor_recipient_ids.sql` (timestamp harus > `20260607032725` agar urutan migrasi benar):

```sql
-- Kembalikan id semua supervisor (ADMIN + PIC) aktif untuk penargetan notifikasi.
-- SECURITY DEFINER agar lintas-kapal tanpa memperluas RLS profiles (tanpa bocor PII);
-- digerbang has_operational_access() supaya hanya user operasional yang bisa memanggil.
create or replace function public.get_supervisor_recipient_ids()
returns setof text
language sql
security definer
set search_path = public
stable
as $$
  select p.id
  from public.profiles p
  where public.has_operational_access()
    and p.enabled = true
    and p.review_state = 'approved'
    and p.status <> 'disabled'
    and p.role in ('ADMIN','PIC')
$$;

grant execute on function public.get_supervisor_recipient_ids() to authenticated;
```

**2) Helper klien** — tambahkan di `src/services/backend/cloudState.js` (mengikuti pola pemanggilan RPC yang ada, mis. `fetchCloudSyncWatermarks` yang memakai `supabase.rpc(...)`):

```js
// Id supervisor (ADMIN + PIC) untuk penargetan notifikasi; resolusi server-side karena
// profil admin/PIC lintas-kapal tidak terlihat klien di bawah RLS profiles.
export async function fetchSupervisorRecipientIds() {
  if (!isCloudSyncEnabled) return [];
  const supabase = ensureSupabaseClient();
  const { data, error } = await supabase.rpc('get_supervisor_recipient_ids');
  if (error) {
    console.warn('Gagal memuat penerima supervisor (RPC)', error);
    return [];
  }
  // setof text → array of string (atau array baris {get_supervisor_recipient_ids}); normalisasi.
  return (Array.isArray(data) ? data : [])
    .map((row) => (typeof row === 'string' ? row : row?.get_supervisor_recipient_ids))
    .filter(Boolean);
}
```

**3) Perubahan di `src/context/AppContextRuntime.jsx`:**
- Tambah ref `supervisorRecipientIdsRef = useRef([])`.
- Tambah effect yang memanggil `fetchSupervisorRecipientIds()` saat `hasOperationalCloudAccess` siap (dependensi: `[hasOperationalCloudAccess]`; opsional refresh ringan saat profiles berubah via realtime). Simpan hasilnya ke ref.
- Di `getShipRecipients` (~baris 6921-6938), tambahkan di awal:
  ```js
  const supervisors = supervisorRecipientIdsRef.current || [];
  // ... di dalam: saat includeAdmins/includePic, gabungkan id supervisor dari ref
  ```
  Karena ref hanya berisi ADMIN+PIC, paling sederhana: bila `includeAdmins || includePic`, lakukan `supervisors.forEach(id => recipients.add(id))`. (Petugas tetap diresolusi dari `usersData` seperti sekarang; logika sekapal yang sudah ada tidak diubah.) Jika ingin presisi peran, RPC bisa dipecah menjadi dua (admin vs pic) — tidak wajib untuk perbaikan ini.

> **Catatan staleness:** id supervisor di-prefetch sekali per sesi (plus refresh saat realtime profiles). Supervisor baru yang ditambahkan saat sesi berjalan baru ikut tertarget setelah refresh — dapat diterima untuk kasus ini.

### Alternatif yang dipertimbangkan (tidak dipilih)

- **Perluas RLS `profiles`** dengan `or (has_operational_access() and role = 'ADMIN')`. Paling sederhana (1 migration, tanpa ubah klien), **tetapi**: (a) tidak menutup PIC lintas-kapal, (b) memaparkan PII profil admin (email/telepon) ke seluruh user operasional. Ditolak demi privasi & kelengkapan.
- **Trigger AFTER INSERT "CC admins"** pada `notifications`. Tanpa ubah klien, tapi logika trigger (rekursi guard, penyalinan `payload.baseId`, daftar tipe) lebih rumit dan rawan salah. Disimpan sebagai opsi cadangan.
- **Fan-out penuh server-side** (trigger pada `incidents`/`patrol_reports` seperti SOS). Paling "benar" secara arsitektur, tapi perlu penanganan duplikat vs jalur klien yang ada (penyamaan `baseId` lintas JS/SQL) — lebih besar dari yang dibutuhkan.

---

## Bug #2 — Push tidak masuk ke semua user (browser/PWA)

### Arsitektur push saat ini

Push diimplementasikan sebagai **Web Push berbasis FCM** (Firebase JS SDK + service worker), **bukan** push native Capacitor/Android — lihat header `src/services/native/pushNotifications.js:1-9`. Rantai pengiriman:

```
Login operasional → setupNativePushNotifications() (pushNotifications.js:42-116)
  → izin notifikasi + register /firebase-messaging-sw.js + ambil FCM token
  → upsertPushSubscription() simpan token ke tabel push_subscriptions (pushSubscriptions.js:11-23)
INSERT baris notifications (klien) 
  → trigger dispatch_push_for_notification (migrations/202605300003:71-124)
  → net.http_post ke Edge Function /send-push
      → cek x-cron-secret (functions/send-push/index.ts:31-39)
      → query token by user_id (index.ts:55-62)
      → sendToToken() via FCM HTTP v1 (functions/_shared/fcm.ts:151-192)
  → FCM kirim ke perangkat (SW menampilkan saat tab tidak terlihat)
```

Kode jalur web push tampak **benar**. Kegagalan **untuk semua user sekaligus** hampir pasti **konfigurasi/secret**, bukan bug logika.

### Titik kegagalan kandidat (urut dari paling mungkin mematikan semua user)

1. **`private.app_config` kosong** (`functions_url` / `cron_secret`). Trigger hanya `raise notice` lalu `return` tanpa memanggil `/send-push` (`migrations/202605300003:85-94`, observability di `202605300004:34-39`). → **tidak ada push untuk siapa pun.**
2. **Secret Edge Function** `FCM_SERVICE_ACCOUNT` (JSON service account) atau `CRON_SECRET` tidak di-set / rusak / mismatch → `/send-push` melempar/`401` (`functions/_shared/fcm.ts:25-65`, `functions/send-push/index.ts:31-39`).
3. **Env klien** `VITE_FIREBASE_*` / `VITE_FCM_VAPID_KEY` kosong pada build terdeploy → `isPushConfigured()` `false` → `setupNativePushNotifications` mengembalikan NOOP (`pushNotifications.js:34-51`) → `push_subscriptions` **kosong**.
4. Izin notifikasi browser ditolak, atau service worker `/firebase-messaging-sw.js` tidak ter-load (404/scope salah).

### Runbook diagnosa & perbaikan Bug #2

Jalankan berurutan di Supabase (SQL Editor + Edge Function logs). Setiap langkah menunjuk titik yang harus dibetulkan.

**A. Apakah token tersimpan?**
```sql
select user_id, left(fcm_token,12) as tok, user_agent, created_at
from public.push_subscriptions
order by created_at desc
limit 50;
```
- **Kosong** → masalah sisi klien (langkah #3/#4): set env `VITE_FIREBASE_*` & `VITE_FCM_VAPID_KEY` di build, redeploy, login ulang, cek console browser untuk `"Gagal mengambil FCM token"` / `"Setup web push (FCM) gagal"`. Pastikan `/firebase-messaging-sw.js` dapat diakses.
- **Ada isi** → lanjut B.

**B. Apakah dispatch trigger terkonfigurasi?**
```sql
select key, left(value,60) as val
from private.app_config
where key in ('functions_url','cron_secret');
```
Jika `functions_url` kosong/hilang, set (ganti placeholder):
```sql
insert into private.app_config(key, value) values
  ('functions_url', 'https://<PROJECT_REF>.supabase.co/functions/v1'),
  ('cron_secret',   '<nilai-sama-dengan-CRON_SECRET-di-edge>')
on conflict (key) do update set value = excluded.value;
```

**C. Apakah `/send-push` ter-deploy & secret valid?**
- Pastikan Edge Function `send-push` ter-deploy.
- Pastikan secret-nya tersetel: `FCM_SERVICE_ACCOUNT` (JSON service account penuh & valid), `CRON_SECRET` (harus sama dengan `private.app_config.cron_secret`), serta `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (untuk query `push_subscriptions`).
- Uji end-to-end — INSERT notifikasi tes untuk user yang punya token, lalu pantau log `send-push`:
  ```sql
  insert into public.notifications(id, target_user_id, type, title, body, read, tone, payload, created_at)
  values ('test-push-' || extract(epoch from now())::text || '::<USER_ID>',
          '<USER_ID>', 'test', 'Tes Push', 'Halo', false, 'info', '{}'::jsonb, now());
  ```
  Log yang diharapkan: `[send-push] token ditemukan { tokenCount }` lalu `[send-push] selesai { sent }`.
  - `tokenCount: 0` → token tersimpan di `user_id` berbeda dari `target_user_id`, atau user belum punya token.
  - FCM `401/403` → `FCM_SERVICE_ACCOUNT` tidak valid.
  - `401` sebelum proses → `x-cron-secret` mismatch (`CRON_SECRET` ≠ `app_config.cron_secret`).

**D. Pengiriman di browser.** Pastikan izin notifikasi `granted` dan SW `/firebase-messaging-sw.js` ter-register. Saat tab **terlihat**, web push memang **sengaja** tidak menampilkan notifikasi sistem (ditangani in-app via Realtime untuk hindari dobel — `pushNotifications.js:16-20,87-104`). Uji dengan tab **tersembunyi/tertutup**.

> Catatan: setelah Bug #1 diperbaiki, push untuk **admin/PIC** baru mungkin karena barisnya kini dibuat; namun seluruh push (termasuk petugas) tetap bergantung pada infrastruktur di runbook ini.

---

## Catatan tambahan (follow-up opsional, di luar perbaikan utama)

- **`target_role` selalu `null`.** `notificationRecordToRows` menyetel `target_role: null` (`cloudState.js:422`), sehingga klausa RLS `target_role = public.current_profile_role()` pada `notifications_read_target` (`init:674`) menjadi **dead-code**. Bukan penyebab bug (akses admin sudah lewat `is_admin()`), tapi sebaiknya dirapikan: isi `target_role` atau hapus klausa yang tak terpakai.

---

## Verifikasi (untuk tahap implementasi nanti)

- Build & test: `npm install` (kontainer fresh sering belum ada deps) → `npm run build` → `npm run test:security` (15 test) → test halaman (49 test). Migration SQL tidak menyentuh jalur JS; pastikan build & test tetap hijau.
- **Bug #1 end-to-end:**
  1. Terapkan migration, lalu cek RPC: `select public.get_supervisor_recipient_ids();` → berisi id admin & PIC.
  2. Login petugas → submit temuan.
  3. SQL: `select id, target_user_id, type from public.notifications where type='incident_created' order by created_at desc limit 10;` → harus ada baris dengan `target_user_id` = id **admin** dan **PIC**.
  4. Login admin/PIC (sesi/perangkat lain) → notifikasi temuan tampil in-app (via Realtime), dan (setelah Bug #2 beres) push masuk saat tab tersembunyi.
- **Bug #2:** ikuti runbook A–D; sukses ditandai log `send-push` `selesai { sent >= 1 }` dan notifikasi muncul di perangkat saat tab tersembunyi.

## Risiko & pertimbangan

- RPC `SECURITY DEFINER` hanya mengembalikan **id** (opaque) dan digerbang `has_operational_access()` → tidak membuka PII profil, tidak memperluas RLS `profiles`.
- Perubahan klien minimal dan sinkron saat dipanggil (id supervisor di-prefetch ke ref).
- Bug #2 sebagian besar adalah konfigurasi server; pastikan nilai `CRON_SECRET` konsisten antara `private.app_config` dan secret Edge Function.
