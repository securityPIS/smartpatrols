# Panduan Perbaikan: Push Notification Tidak Terkirim

> Tanggal diagnosis: 2026-06-09  
> Akar masalah yang dikonfirmasi: workflow **Deploy Supabase** (satu-satunya eksekusi, 7 Juni 2026) gagal pada detik ke-13 karena **semua GitHub Secrets kosong** → `send-push` tidak pernah di-deploy, `private.app_config` tidak pernah diisi → trigger push no-op → tidak ada push untuk siapa pun.

Perbaikan ini **tidak membutuhkan perubahan kode**. Cukup:
1. Isi GitHub Secrets yang wajib (dan opsional untuk push)
2. Jalankan ulang workflow Deploy Supabase

---

## Langkah 1 — Isi GitHub Repository Secrets

Buka: **GitHub → repo `smartpatrols` → Settings → Secrets and variables → Actions → New repository secret**

### Secrets wajib (workflow gagal tanpa ini)

| Secret | Cara mendapatkan |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard → klik foto profil pojok kiri bawah → **Access Tokens** → Generate new token |
| `SUPABASE_PROJECT_REF` | Supabase Dashboard → **Project Settings → General** → kolom **Reference ID** (mis. `abcdefghijklmnop`) |
| `SUPABASE_DB_PASSWORD` | Supabase Dashboard → **Project Settings → Database** → kolom **Database password** (yang Anda set saat membuat project) |
| `CRON_SECRET` | String acak panjang buatan sendiri. Generate contoh: buka terminal, ketik `openssl rand -base64 32`, salin hasilnya. **Catat nilainya** — dipakai ulang di langkah verifikasi. |

### Secrets untuk push notification (opsional tapi wajib agar push berjalan)

| Secret | Cara mendapatkan |
|---|---|
| `FCM_SERVICE_ACCOUNT` | Firebase Console → Project **smartpatrols-353d8** → **Project Settings → Service accounts → Generate new private key** → download file JSON → buka file → salin **seluruh isi** (dari `{` sampai `}` termasuk) → paste sebagai nilai secret. **Jangan potong.** Pastikan `"project_id": "smartpatrols-353d8"` di dalam JSON-nya — harus cocok dengan config client. |
| `APP_URL` | URL produksi aplikasi Anda, mis. `https://smartpatrol.example.com`. Dipakai sebagai deep-link saat notifikasi diklik. |

> **Penting tentang `FCM_SERVICE_ACCOUNT`:** Secret ini harus berisi JSON yang valid dan lengkap dengan field `client_email`, `private_key`, dan `project_id`. Nilai yang terpotong atau mengandung "smart-quote" (`"` bukan `"`) akan menyebabkan error `FCM_SERVICE_ACCOUNT bukan JSON valid` di log `send-push` dan `sent: 0`.

---

## Langkah 2 — Jalankan ulang workflow Deploy Supabase

1. Buka tab **Actions** di repo GitHub.
2. Di sisi kiri, klik **Deploy Supabase**.
3. Klik tombol **Run workflow** (pojok kanan atas area tabel) → **Run workflow** lagi untuk konfirmasi.
4. Tunggu semua langkah hijau (± 2-3 menit).

### Langkah-langkah yang seharusnya berhasil kali ini

| # | Langkah | Tanda berhasil |
|---|---------|----------------|
| 1 | Validasi secrets tersedia | ✅ Tidak ada `::error::` |
| 2 | Link ke project Supabase | ✅ |
| 3 | Rekonsiliasi migrasi (repair) | ✅ atau skipped (no-op) |
| 4 | Push database migrations | ✅ `supabase db push` tanpa error |
| 5 | Set edge function secret CRON_SECRET | ✅ |
| 6 | Set edge function secret FCM_SERVICE_ACCOUNT | ✅ (hanya jalan bila secret di-set) |
| 7 | Deploy edge function send-push | ✅ (hanya jalan bila FCM_SERVICE_ACCOUNT di-set) |
| 8 | Deploy edge function lain | ✅ |
| 9 | Konfigurasi database (private.app_config) | ✅ `HTTP 200` / `"Konfigurasi database berhasil."` |

Jika langkah 9 menampilkan `::warning::Gagal tulis private.app_config`, isi manual lewat Supabase SQL Editor (lihat bawah).

---

## Langkah 3 — Verifikasi pasca-deploy

### A. Cek `private.app_config` (SQL Editor Supabase)

```sql
select key, left(value, 60) as value_preview from private.app_config;
```

Harus ada dua baris: `functions_url` dan `cron_secret`.

Jika kosong, isi manual:
```sql
insert into private.app_config (key, value) values
  ('functions_url', 'https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1'),
  ('cron_secret',   '<nilai-CRON_SECRET-yang-sama>')
on conflict (key) do update set value = excluded.value, updated_at = now();
```

### B. Cek apakah `send-push` ter-deploy

Buka Supabase Dashboard → **Edge Functions**. Fungsi `send-push` harus muncul dengan status deployed.

### C. Cek token FCM tersimpan

```sql
select user_id, left(fcm_token, 12) as tok, user_agent, created_at
from public.push_subscriptions
order by created_at desc
limit 20;
```

- **Ada isi** → token tersimpan, lanjut langkah D.
- **Kosong** → user belum login ulang setelah deploy, atau izin notifikasi browser ditolak. Minta user login ulang dan izinkan notifikasi saat diminta.

### D. Uji end-to-end (insert notifikasi tes)

Ganti `<USER_ID>` dengan `id` dari kolom `user_id` di atas:

```sql
insert into public.notifications(id, target_user_id, type, title, body, read, tone, payload, created_at)
values (
  'test-push-' || extract(epoch from now())::text || '::<USER_ID>',
  '<USER_ID>',
  'test',
  'Tes Push',
  'Push notification berfungsi!',
  false,
  'info',
  '{}'::jsonb,
  now()
);
```

Pastikan tab browser penerima **tidak aktif di depan** (minimize atau buka tab lain) saat melakukan insert.

### E. Baca log `send-push`

Supabase Dashboard → **Edge Functions → send-push → Logs**.

| Log yang dilihat | Arti | Tindakan |
|---|---|---|
| `[send-push] selesai { sent: 1 }` | ✅ Berhasil | - |
| `token ditemukan { tokenCount: 0 }` | Token tidak ada untuk user | Cek langkah C |
| `FCM_SERVICE_ACCOUNT bukan JSON valid` | Secret JSON rusak/terpotong | Generate ulang private key di Firebase Console, set ulang secret, re-deploy |
| `unauthorized` | `x-cron-secret` tidak cocok | Pastikan `private.app_config.cron_secret` = `CRON_SECRET` secret Edge Function |
| Tidak ada baris `[send-push]` sama sekali | Fungsi belum ter-deploy atau trigger tidak memanggil | Cek langkah A & B |

---

## Ringkasan penyebab + perbaikan

```
Penyebab:  GitHub Secrets kosong saat workflow jalan (7 Jun 2026)
           → Workflow gagal di step "Validasi secrets tersedia"
           → send-push tidak ter-deploy
           → private.app_config tidak terisi
           → trigger dispatch_push_for_notification() → no-op (tidak memanggil send-push)
           → TIDAK ADA push yang terkirim

Perbaikan: Isi 4 secrets wajib + FCM_SERVICE_ACCOUNT + APP_URL
           → Jalankan ulang workflow "Deploy Supabase"
           → Verifikasi via SQL + Edge Function logs
```

---

## Lihat juga

- [`docs/web-push-setup.md`](web-push-setup.md) — arsitektur web push, playbook diagnosis lengkap, kasus nyata yang pernah terjadi ("FCM_SERVICE_ACCOUNT bukan JSON valid")
- [`docs/analisa-bug-notifikasi.md`](analisa-bug-notifikasi.md) — analisa mendalam dua bug notifikasi (push + in-app ke admin/PIC)
- [`.github/workflows/deploy-supabase.yml`](../.github/workflows/deploy-supabase.yml) — workflow deployment
