# SYSTEM_MAP - SmartPatrol SQL

> Terakhir diperbarui: 2026-05-22.
> Bahasa pemrograman: JavaScript (React 19 + Vite 8), SQL Postgres, Supabase Edge Functions (Deno).

## Project Summary

| Aspek | Detail |
|---|---|
| Tujuan | PWA patroli keamanan kapal/armada laut untuk checkpoint shift, insiden, SOS, dashboard admin/PIC, user, dan kapal. |
| Runtime | Browser SPA, Android WebView via Capacitor, Supabase Edge Functions. |
| Framework | React 19 + Vite 8 + TailwindCSS 4. |
| Backend | Supabase Auth, Postgres, RLS, Storage, Realtime, Edge Functions. |
| Hosting | Vercel untuk SPA; Supabase local/cloud untuk backend. |
| Offline | localStorage untuk state UI, IndexedDB `smartpatrol-images` untuk foto, IndexedDB `smartpatrol-sql/outbox_mutations` untuk retry mutation SQL. |
| Push | Tidak ada FCM/push background pada fase SQL awal; SOS/notifikasi realtime hanya saat app aktif. |
| Data Awal | Kosong bersih. Admin pertama dibuat lewat `npm run setup:admin`. |

## Core Flow

### Login dan Onboarding

```
LoginPage -> AppContextRuntime.handleLogin
  -> services/backend/auth.loginWithFirebaseEmail (alias kompatibel Supabase Auth)
  -> services/backend/access.resolveOperationalAccess
  -> Supabase Edge Function resolve-operational-access
  -> profiles.enabled + review_state approved
  -> saveAuthSession(localStorage) -> render AppShell

Register
  -> Supabase Auth signUp + metadata onboarding publik
  -> trigger auth.users -> pending_registrations bila sesi email-confirmation belum tersedia
  -> uploadRegistrationPhotoAsset (Supabase Storage registration-assets)
  -> pending_registrations insert idempotent bila sesi registrasi tersedia
  -> Admin approval via approve-pending-registration
  -> profiles upsert role/status/ship assignment
```

### Patrol Checkpoint

```
PatrolPage -> PatrolCameraModal -> imageStore IndexedDB
  -> AppContextRuntime.handleSubmitCheckpoint
  -> createTrustedTimestampRecord (Supabase Edge Function server-time anchor)
  -> savePatrolReport
  -> patrol_reports upsert dengan client_event_id idempotent
  -> Supabase Realtime listener merge ke checkpointsByShip
  -> jika offline/gagal: outbox_mutations antre dan flush saat online
```

### Incident dan SOS

```
Incident form/detail -> saveIncidentReport/deleteIncidentReport
  -> incidents payload JSONB + kolom query utama
  -> Supabase Realtime subscribeToIncidents
  -> offline write masuk outbox

SOSButton -> activeSOSAlert lokal
  -> cloud sync SQL + client_mutations signal
  -> perangkat lain menerima perubahan saat app aktif via Realtime
```

### Trusted Time

```
initializeTrustedTime
  -> native Android elapsedRealtime/performance.now
  -> Supabase Edge Function server-time
  -> anchor serverNowMs + drift detection
  -> offline-trusted/offline-interrupted tetap memakai monotonic timer
```

## Important Files

| Path | Peran |
|---|---|
| `src/context/AppContextRuntime.jsx` | Runtime utama state/UI. Import backend sudah diarahkan ke `src/services/backend/*`. |
| `src/services/backend/app.js` | Singleton Supabase browser client dan start outbox worker. |
| `src/services/backend/auth.js` | Supabase Auth wrapper dengan nama ekspor kompatibel context lama. |
| `src/services/backend/access.js` | Pending registration, approval/revoke/sync access via Edge Functions. |
| `src/services/backend/cloudState.js` | Hydrate/decompose state dari/ke tabel SQL dan Realtime signal. |
| `src/services/backend/patrolReports.js` | Upsert/subscribe `patrol_reports`. |
| `src/services/backend/incidentReports.js` | Upsert/subscribe/delete `incidents`. |
| `src/services/backend/assets.js` | Upload Supabase Storage + signed URL. |
| `src/services/backend/outbox.js` | IndexedDB outbox mutation retry. |
| `src/services/time/trustedTime.js` | Trusted time anchor memakai Supabase Edge Function. |
| `supabase/migrations/202605220001_init_smartpatrol_sql.sql` | Schema Postgres, RLS, Storage policies, Realtime publication. |
| `supabase/functions/*` | Edge Functions server-time, access, approval, revoke, upload URL, provision user. |
| `scripts/setup-admin.mjs` | Bootstrap admin pertama via service role. |
| `vercel.json` | Header keamanan dan SPA rewrite untuk Vercel. |

## SQL Data Model

Tabel utama:

- `profiles`, `pending_registrations`
- `ships`, `ship_personnel_assignments`, `ship_checkpoints`
- `shift_status_records`, `shift_status_items`
- `patrol_reports`, `patrol_report_photos`
- `incidents`, `incident_progress`, `incident_documentation`
- `sos_alerts`, `sos_acknowledgements`
- `notifications`, `media_assets`, `client_mutations`, `audit_events`

Enum:

- `app_role`: `ADMIN`, `PIC`, `PETUGAS`
- `operational_status`: `active`, `off-duty`, `disabled`
- `review_state`: `pending`, `approved`, `rejected`

RLS:

- ADMIN dapat read/write data operasional.
- PIC/PETUGAS hanya dapat membaca/menulis data kapal yang ditugaskan.
- Pending registration hanya owner atau admin.
- Storage `registration-assets` dibatasi owner/admin.
- Storage `operational-assets` dibatasi user operasional approved.

## Local Commands

```bash
npm install
supabase start
supabase db reset
supabase functions serve
npm run setup:admin -- --token=<token> --email=<email> --password=<password>
npm run dev
npm run test:security
npm run build
```

## Known Migration Notes

- `firebaseUid` masih dipakai sebagai nama field kompatibel di context lama, tetapi nilainya dipetakan ke Supabase `auth_uid`.
- `setupNativePushNotifications` sekarang no-op agar Android tidak meminta izin push dan tidak mendaftarkan token.
- `src/context/AppContext.jsx` legacy dihapus agar tidak ada import backend lama.
- Jika schema/flow utama berubah, update file ini pada sesi yang sama.
