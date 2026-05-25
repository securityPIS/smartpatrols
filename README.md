# SmartPatrol SQL

Versi ini adalah salinan terisolasi dari SmartPatrol yang dipindahkan dari Firebase ke stack SQL:

- Frontend: React 19 + Vite 8 + TailwindCSS 4
- Backend: Supabase Auth, Postgres, RLS, Storage, Realtime, Edge Functions
- Hosting target: Vercel
- Offline-first: localStorage + IndexedDB image store + IndexedDB outbox `smartpatrol-sql`
- Data awal: kosong bersih, tanpa import data produksi dan tanpa seed demo

## Jalankan Lokal

```bash
npm install
supabase start
supabase db reset
supabase functions serve
npm run dev
```

Isi `.env.local` dari `.env.example` setelah `supabase start` menampilkan local URL, anon key, dan service role key.

## Bootstrap Admin Pertama

```bash
npm run setup:admin -- --token=<SMARTPATROL_SETUP_TOKEN> --email=admin@example.com --password=<minimal-8-karakter> --name="Admin SmartPatrol"
```

Script ini memakai `SUPABASE_SERVICE_ROLE_KEY`, jadi hanya jalankan di mesin dev/staging yang aman.

## Build dan Test

```bash
npm run test:security
npm run build
```

## Catatan Migrasi

- Project Firebase lama di `C:\dev\SmartPatrol` tidak disentuh.
- FCM/push background Android dimatikan pada versi ini. SOS dan notifikasi fase awal hanya realtime in-app via Supabase Realtime saat aplikasi aktif.
- Field internal seperti `firebaseUid` masih dipertahankan sebagai compatibility alias untuk `auth_uid` agar context lama tidak harus direwrite besar-besaran dalam satu langkah; tidak ada dependency runtime Firebase.
- File SQL/RLS utama ada di `supabase/migrations/202605220001_init_smartpatrol_sql.sql`.
- Edge Functions ada di `supabase/functions/*`.
