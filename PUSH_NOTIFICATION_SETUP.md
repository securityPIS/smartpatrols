# Perbaikan Push Notification — SmartPatrol

## Diagnosis

In-app notification **berfungsi** (cron → insert `notifications` → trigger kebakaran).
Push ke HP **tidak sampai** karena tiga komponen di bawah belum aktif sejak
fitur push ditambahkan (migrasi 202605300002–300005).

### Rantai dispatch (referensi)

```
pg_cron (notify-checkpoint-pending-* / notify-shift-wrapup-*)
  └─> notify_checkpoint_pending() / notify_shift_wrapup()
        └─> insert_notification_fanout() → INSERT public.notifications
              └─> TRIGGER dispatch_push_after_insert
                    └─> net.http_post({functions_url}/send-push, x-cron-secret)
                          └─> Edge Function send-push → FCM HTTP v1 → device
```

### Tiga komponen yang belum aktif

| # | Komponen | Dampak bila kosong |
|---|---|---|
| 1 | Edge function `send-push` belum di-deploy | HTTP 404 dari pg_net, push tidak terkirim |
| 2 | `private.app_config` kosong (`functions_url` / `cron_secret`) | Trigger skip dispatch senyap (RAISE NOTICE) |
| 3 | GitHub secret `FCM_SERVICE_ACCOUNT` belum di-set | Langkah deploy `send-push` dilewati oleh workflow |

---

## Rencana Perbaikan

### Langkah 1 — Set GitHub Repository Secrets

GitHub → repo `securitypis/smartpatrols` → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Cara mendapatkan | Wajib? |
|---|---|---|
| `FCM_SERVICE_ACCOUNT` | Firebase Console → Project Settings → Service Accounts → **Generate new private key** → salin isi **lengkap** file JSON | **Ya** |
| `CRON_SECRET` | String random panjang. Generate: `openssl rand -hex 32` | **Ya** (buat baru bila belum ada) |
| `APP_URL` | URL produksi app, mis. `https://smartpatrol.example.com` | Dianjurkan (untuk deep-link klik notif) |
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard → Account → Access Tokens | **Ya** (biasanya sudah ada) |
| `SUPABASE_PROJECT_REF` | Supabase Dashboard → Project Settings → General → Reference ID | **Ya** (biasanya sudah ada) |
| `SUPABASE_DB_PASSWORD` | Supabase Dashboard → Project Settings → Database → Password | **Ya** (biasanya sudah ada) |

> **Catatan `FCM_SERVICE_ACCOUNT`**: isi penuh file JSON (mulai `{` sampai `}`).
> Jangan base64, jangan wrap tanda kutip. Workflow otomatis memadatkan ke satu baris via `jq`.

---

### Langkah 2 — Jalankan Workflow Deploy

GitHub → **Actions → "Deploy Supabase" → Run workflow** (tombol kanan atas)

Workflow akan mengeksekusi urutan berikut secara otomatis:

1. `supabase db push` — push migrasi yang belum masuk
2. `supabase secrets set CRON_SECRET` — set secret di edge function
3. `supabase secrets set FCM_SERVICE_ACCOUNT` + `APP_URL` — set secret FCM
4. `supabase functions deploy send-push --no-verify-jwt` — deploy edge function
5. INSERT ke `private.app_config` — isi `functions_url` + `cron_secret` agar trigger bisa dispatch

> Langkah 3–4 **hanya jalan** bila `FCM_SERVICE_ACCOUNT` tidak kosong (kondisi di workflow).
> Bila langkah 3–4 terlewat, push tetap tidak akan berfungsi.

---

### Langkah 3 — Verifikasi Setelah Deploy

Jalankan di **Supabase → SQL Editor** (read-only, aman):

```sql
-- 1) Pastikan config push terisi
SELECT key, left(value, 60) AS value_preview
FROM private.app_config
ORDER BY key;
-- Harus ada baris: functions_url & cron_secret

-- 2) Pastikan cron job aktif
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname LIKE 'notify-%'
ORDER BY jobname;
-- Harus 6 baris (3 checkpoint-pending + 3 shift-wrapup), active = true

-- 3) Cek respons HTTP terakhir dari trigger ke send-push
SELECT status_code, left(content, 300) AS body, created
FROM net._http_response
ORDER BY created DESC
LIMIT 5;
-- Harus status_code = 200; bukan 401 (secret mismatch), 404 (belum deploy), 500 (FCM error)

-- 4) Pastikan token device terdaftar
SELECT count(*) AS tokens, count(DISTINCT user_id) AS users
FROM public.push_subscriptions;
-- Harus > 0; bila 0 → app belum mendaftarkan token (lihat Troubleshooting #5)
```

---

### Langkah 4 — Uji Push Manual

Setelah semua verifikasi hijau, paksa kirim push tanpa menunggu jadwal cron:

```sql
-- Sisipkan notifikasi test untuk user tertentu (ganti 'USER_ID_DI_SINI')
INSERT INTO public.notifications (
  id, target_user_id, type, title, body, tone, read, payload, created_at
) VALUES (
  'test-push-manual-001::USER_ID_DI_SINI',
  'USER_ID_DI_SINI',
  'general',
  '🔔 Test Push Notification',
  'Push berhasil dikirim dari SQL Editor.',
  'info',
  false,
  '{"type":"general","route":"notifications"}'::jsonb,
  now()
);
```

Trigger `dispatch_push_after_insert` akan kebakaran langsung dan mengirim push ke HP.
Cek hasilnya di `net._http_response` beberapa detik setelah insert.

---

## Troubleshooting

### `net._http_response` status 401
**Penyebab**: `CRON_SECRET` edge secret ≠ `private.app_config.cron_secret`.

**Solusi**: Samakan keduanya.
```sql
-- Lihat cron_secret saat ini di app_config
SELECT value FROM private.app_config WHERE key = 'cron_secret';
```
Kemudian set ulang GitHub secret `CRON_SECRET` dengan nilai yang sama, lalu jalankan workflow lagi.

---

### `net._http_response` status 500 / error FCM
**Penyebab**: `FCM_SERVICE_ACCOUNT` invalid atau `project_id` tidak cocok.

**Cek** di Supabase Dashboard → Functions → `send-push` → Logs:
- `FCM_SERVICE_ACCOUNT belum dikonfigurasi` → secret kosong
- `bukan JSON valid` → isi secret rusak (mis. terpotong, ada karakter ekstra)
- `Gagal ambil access token FCM` → service account tidak punya peran Firebase Cloud Messaging sender

**Solusi**: Di Firebase Console → IAM & Admin → pastikan service account punya role **Firebase Cloud Messaging Admin** atau **Firebase Cloud Messaging Sender**.

---

### `net._http_response` kosong (tidak ada baris)
**Penyebab**: `private.app_config.functions_url` kosong → trigger skip dispatch (tidak pernah memanggil `net.http_post`).

**Solusi**: Isi manual di SQL Editor, lalu jalankan workflow:
```sql
INSERT INTO private.app_config (key, value) VALUES
  ('functions_url', 'https://SUPABASE_PROJECT_REF.supabase.co/functions/v1'),
  ('cron_secret', 'CRON_SECRET_SAMA_DENGAN_GITHUB_SECRET')
ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
```

---

### `push_subscriptions` kosong (0 token)
**Penyebab**: Browser/app belum mendaftarkan token FCM.

**Solusi**:
1. Buka app di browser (bukan Incognito)
2. Izinkan notifikasi saat diminta
3. Cek DevTools → Application → Service Workers → `firebase-messaging-sw.js` terdaftar
4. Login ulang agar `setupNativePushNotifications()` dipanggil lagi

---

### In-app juga tidak muncul (cron sama sekali tidak produksi notif)
**Penyebab**: Kondisi data — salah satu dari:
- `ships.custom_checkpoints` kosong / `NULL`
- `profiles.ship_assigned` tidak sama persis dengan `ships.name`
- Tidak ada profil PETUGAS aktif / PIC / ADMIN

**Cek**:
```sql
-- Kapal yang punya custom_checkpoints
SELECT name, jsonb_array_length(custom_checkpoints) AS cp_count
FROM public.ships
WHERE jsonb_typeof(custom_checkpoints) = 'array'
ORDER BY name;

-- Profil yang akan dapat notif
SELECT role, status, ship_assigned, count(*)
FROM public.profiles
WHERE enabled = true AND review_state = 'approved'
GROUP BY role, status, ship_assigned;
```

---

## Jadwal Cron (referensi)

| Job | Waktu UTC | Waktu WIB | Fungsi |
|---|---|---|---|
| `notify-checkpoint-pending-shift-1` | 04:00 | 11:00 | Peringatan 1 jam sbl Shift 1 berakhir |
| `notify-checkpoint-pending-shift-2` | 10:00 | 17:00 | Peringatan 1 jam sbl Shift 2 berakhir |
| `notify-checkpoint-pending-shift-3` | 22:00 | 05:00+1 | Peringatan 1 jam sbl Shift 3 berakhir |
| `notify-shift-wrapup-shift-1` | 05:02 | 12:02 | Ringkasan Shift 1 selesai |
| `notify-shift-wrapup-shift-2` | 11:02 | 18:02 | Ringkasan Shift 2 selesai |
| `notify-shift-wrapup-shift-3` | 23:02 | 06:02+1 | Ringkasan Shift 3 selesai |
