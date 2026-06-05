# Plan: Migrasi Hero/Full-View Image ke Cloudflare R2 (Optimasi Egress)

## Context

Setelah optimasi egress DB (commit `a91eea3` "perf(sync): reduce realtime DB egress",
per-table fetch + delta merge), penyumbang egress Supabase yang tersisa kemungkinan besar
adalah **download aset gambar dari Supabase Storage** — karena 1 hero image (~500 KB–2 MB)
jauh lebih besar dari payload realtime DB.

Fakta penting: **egress Supabase Storage masuk ke kuota egress yang sama** (free plan 5 GB/bulan).
Setiap kali device membuka foto patroli/insiden, byte-nya dihitung ke kuota.

Keunggulan Cloudflare R2: **egress = $0 selamanya**. Memindahkan varian berat
(`heroUrl` = full view) ke R2 = byte terberat keluar dari hitungan kuota Supabase
**dan** gratis di sisi R2.

### Strategi: pindahkan yang berat, pertahankan yang ringan

| Varian | Ukuran | Frekuensi view | Tujuan |
|--------|--------|----------------|--------|
| `thumbUrl` | kecil (~20–60 KB) | sangat sering (list) | **tetap Supabase** (RLS sederhana, sering di-cache) |
| `heroUrl` / full view | besar (~500 KB–2 MB) | jarang (tap detail) | **pindah ke R2** (byte terberat → egress gratis) |
| `photoUrl` (base) | bervariasi | sedang | **pindah ke R2** (umumnya dipakai sebagai full view) |

Memindahkan hanya hero/full + base `photoUrl` ke R2 sambil menyimpan thumbnail di Supabase
memindahkan beban byte terberat tanpa merombak seluruh pipeline akses.

---

## Arsitektur Saat Ini (yang harus dipahami sebelum edit)

```text
Upload (client):
  prepareCloudPhotoUrl / prepareCloudVariantUrl  (AppContextRuntime.jsx:5712, 6104)
    -> uploadCloudDataUrlAsset                    (assets.js:94)
      -> uploadDataUrlAsset                       (assets.js:63)
        -> supabase.storage.from(bucket).upload() (direct, pakai anon session)
        -> createSignedUrl(TTL 30 hari)           (assets.js:46)
        -> insert media_assets                    (assets.js:79)

Download (client):
  <img src={heroUrl}>  -> GET signed URL Supabase Storage  -> EGRESS SUPABASE

Maintenance:
  resign-expiring-assets (Edge Function, pg_cron harian)
    -> scan media_assets expiry < now+48h, re-sign TTL 30 hari
    -> update media_assets.signed_url + profiles.photo_url

Delete:
  deleteStorageAsset (assets.js:139)
    -> regex parse URL Supabase -> storage.remove() + delete media_assets row
```

Bucket: `operational-assets`, `registration-assets`. Variabel kunci:
`SIGNED_URL_TTL_SECONDS = 30 hari` (`assets.js:15`).

Catatan: `media_assets` (migration `202605220001`) punya kolom
`bucket, object_path, owner_id, ship_id, domain, mime_type, byte_size, signed_url,
signed_url_expires_at`, unik `(bucket, object_path)`.

---

## Keputusan Arsitektur: Download Path

Ini keputusan paling penting karena menentukan kompleksitas & TTL.

### Opsi A — R2 Presigned GET (S3 API)
- Edge Function menerbitkan presigned GET URL untuk tiap aset.
- **Batas: TTL maksimum 7 hari** (batas SigV4 untuk presigned URL).
- URL disimpan di payload `patrol_reports.heroUrl` → akan kedaluwarsa < TTL Supabase saat ini (30 hari) → butuh re-sign agresif + re-sign harus menulis ulang payload report (yang sekarang TIDAK dilakukan oleh `resign-expiring-assets`).
- **Tidak direkomendasikan** sebagai utama: menambah utang teknis pada re-sign.

### Opsi B — Cloudflare Worker + Custom Domain + Token (REKOMENDASI)
- Worker terikat ke R2 bucket, dilayani di custom domain (mis. `media.smartpatrol.app`).
- URL **stabil/permanen** (mis. `https://media.smartpatrol.app/<path>?t=<hmac-token>`).
- Worker memvalidasi token HMAC (atau cek Supabase JWT) saat request → akses terkontrol.
- **Tidak perlu re-sign cron untuk aset R2** → URL tidak pernah kedaluwarsa.
- Egress dilayani Cloudflare = gratis.

**Plan ini memilih Opsi B.** Opsi A didokumentasikan sebagai fallback bila Worker
ditunda. Upload tetap lewat Supabase Edge Function (kredensial R2 disimpan sebagai
secret Supabase) sehingga **tidak ada kredensial R2 di browser**.

---

## Prasyarat (Ops — di luar kode, lakukan sekali)

1. **Cloudflare R2**
   - Buat bucket `smartpatrol-operational` (private, bukan public).
   - Buat R2 API Token (Access Key ID + Secret) dengan akses Object Read & Write ke bucket.
   - Catat `R2_ACCOUNT_ID`, endpoint S3: `https://<account_id>.r2.cloudflarestorage.com`.
2. **CORS R2** — izinkan `PUT` dari origin app (untuk upload langsung browser → R2):
   ```json
   [{ "AllowedOrigins": ["https://<app-origin>", "capacitor://localhost", "http://localhost:5173"],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["content-type"],
      "MaxAgeSeconds": 3600 }]
   ```
3. **Cloudflare Worker** (download path) — bind R2 bucket, deploy ke custom domain
   `media.<domain>`. Secret Worker: `MEDIA_TOKEN_SECRET` (HMAC).
4. **Secret Supabase Edge Functions** (untuk upload presign):
   ```bash
   supabase secrets set R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
     R2_BUCKET=smartpatrol-operational R2_PUBLIC_BASE_URL=https://media.<domain> \
     MEDIA_TOKEN_SECRET=<same-as-worker>
   ```
5. **Env client** — flag aktivasi bertahap:
   ```bash
   VITE_ENABLE_R2_MEDIA=1          # master switch
   VITE_R2_PUBLIC_BASE_URL=https://media.<domain>
   ```

Biaya R2 (referensi): storage $0.015/GB-bln; egress $0; free tier 10 GB storage,
1 jt Class A (write), 10 jt Class B (read) per bulan.

---

## Fase 0 — Baseline Sebelum Edit

Ukur dulu agar klaim tidak berdasar asumsi.

1. Supabase Dashboard → Observability → Storage egress (7 hari terakhir).
2. DevTools Network pada device penerima, buka 10 detail laporan berfoto:
   - total transferred dari domain `*.supabase.co/storage/...`
   - pisahkan ukuran hero vs thumb.
3. Catat ke `baseline-storage-egress-before.md`:
   - egress storage/hari
   - rata-rata ukuran hero, thumb
   - jumlah foto per shift

---

## Fase 1 — Skema & Flag (aman, tanpa perubahan perilaku)

### 1.1 — Kolom `storage_provider` di `media_assets`

**File:** `supabase/migrations/<ts>_add_media_storage_provider.sql`

```sql
alter table public.media_assets
  add column if not exists storage_provider text not null default 'supabase';

comment on column public.media_assets.storage_provider is
  'supabase | r2 — menentukan backend penyimpanan & jalur delete/resign.';

create index if not exists media_assets_provider_idx
  on public.media_assets(storage_provider);
```

Kenapa: `deleteStorageAsset` dan `resign-expiring-assets` perlu tahu backend agar tidak
salah memanggil API Supabase Storage untuk objek R2.

### 1.2 — Helper deteksi URL R2 + flag client

**File:** `src/services/backend/assets.js`

```js
const R2_PUBLIC_BASE_URL = import.meta.env.VITE_R2_PUBLIC_BASE_URL || '';
const isR2MediaEnabled = import.meta.env.VITE_ENABLE_R2_MEDIA === '1' && Boolean(R2_PUBLIC_BASE_URL);

function isR2Url(url) {
  return Boolean(R2_PUBLIC_BASE_URL) && typeof url === 'string' && url.startsWith(R2_PUBLIC_BASE_URL);
}
```

---

## Fase 2 — Upload Path (Edge Function presign + client PUT ke R2)

Prinsip: **browser tidak pegang kredensial R2.** Edge Function menerbitkan presigned PUT
(SigV4 S3) ke R2; client meng-`PUT` blob langsung ke R2.

### 2.1 — Edge Function `create-r2-upload-url`

**File:** `supabase/functions/create-r2-upload-url/index.ts`

Mirror guard auth dari `create-upload-url/index.ts` (cek `findProfileForUser` +
`enabled`/`review_state`). Gunakan AWS SDK v3 S3 presigner (jalan di Deno via npm
specifier) atau implementasi SigV4 ringan.

```ts
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner';
import { findProfileForUser, getAuthUser, handleOptions, jsonResponse, readJsonBody, sanitizeString } from '../_shared/smartpatrol.ts';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
  },
});

function segment(value: unknown, fallback = 'item') {
  return sanitizeString(value, 120).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/(^-|-$)/g, '') || fallback;
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const user = await getAuthUser(request);
    const profile = await findProfileForUser(user);
    if (!profile || profile.enabled !== true || profile.review_state !== 'approved') {
      throw new Error('permission-denied');
    }
    const body = await readJsonBody(request);
    const path = String(body.path || '').split('/').map((s: string, i: number) => segment(s, `part-${i + 1}`)).join('/');
    const contentType = sanitizeString(body.contentType || 'application/octet-stream', 100);
    if (!path) throw new Error('path-required');

    const uploadUrl = await getSignedUrl(
      r2,
      new PutObjectCommand({ Bucket: Deno.env.get('R2_BUCKET')!, Key: path, ContentType: contentType }),
      { expiresIn: 300 }, // presigned PUT cukup 5 menit
    );

    return jsonResponse({ uploadUrl, path, publicBaseUrl: Deno.env.get('R2_PUBLIC_BASE_URL') });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'r2 upload url failed';
    return jsonResponse({ error: message }, message === 'unauthenticated' ? 401 : 403);
  }
});
```

### 2.2 — Helper upload R2 di client

**File:** `src/services/backend/assets.js`

```js
// Token download stabil dibuat server-side oleh Worker/Edge; client cukup menyusun
// URL publik final dari path + token yang dikembalikan helper signing.
export async function uploadDataUrlAssetToR2({ dataUrl, path, ownerId = null, shipId = null, domain = 'operational' }) {
  const supabase = ensureSupabaseClient();
  const blob = dataUrlToBlob(dataUrl);

  // 1) Minta presigned PUT dari Edge Function (kredensial R2 tetap di server).
  const { data: signed, error: signErr } = await supabase.functions.invoke('create-r2-upload-url', {
    body: { path, contentType: blob.type || 'application/octet-stream' },
  });
  if (signErr) throw signErr;

  // 2) PUT langsung ke R2 (zero egress, tidak lewat Supabase).
  const putRes = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  if (!putRes.ok) throw new Error(`r2-put-failed-${putRes.status}`);

  // 3) Catat ke media_assets dengan provider r2 (untuk delete/audit). URL publik stabil.
  const publicUrl = buildR2PublicUrl(signed.publicBaseUrl, signed.path);
  await supabase.from('media_assets').upsert({
    bucket: 'r2', object_path: signed.path, owner_id: ownerId, ship_id: shipId,
    domain, mime_type: blob.type || null, byte_size: blob.size, storage_provider: 'r2',
    signed_url: publicUrl, signed_url_expires_at: null, // stabil, tidak perlu resign
  }, { onConflict: 'bucket,object_path' }).throwOnError();

  return publicUrl;
}
```

`buildR2PublicUrl` menempelkan token download HMAC (lihat Fase 3) bila skema token dipakai;
bila Worker memvalidasi JWT Supabase, URL cukup `<<base>>/<<path>>`.

### 2.3 — `WITH_REQUEST_TIMEOUT` wajib

`supabase.functions.invoke('create-r2-upload-url')` **wajib** dibungkus timeout
(pola `withRequestTimeout` di `services/backend/access.js`, lihat CLAUDE.md) supaya
jaringan jelek tidak menggantung pipeline upload → menggagalkan submit/foto.

---

## Fase 3 — Download Path (Cloudflare Worker, URL stabil)

**File:** `workers/media-r2/src/index.ts` (deploy via `wrangler`, repo terpisah/folder)

```ts
export interface Env {
  MEDIA_BUCKET: R2Bucket;        // binding R2
  MEDIA_TOKEN_SECRET: string;    // HMAC secret (sama dgn Edge Function)
}

async function verifyToken(path: string, token: string, secret: string): Promise<boolean> {
  // HMAC-SHA256(path) == token. Token tidak kedaluwarsa (URL stabil); akses dicabut
  // dengan menghapus objek, bukan rotasi token. Bila butuh expiry, sertakan exp di path.
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(path));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => ({'+':'-','/':'_','=':''}[c]!));
  return token === expected;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const token = url.searchParams.get('t') || '';
    if (!path || !(await verifyToken(path, token, env.MEDIA_TOKEN_SECRET))) {
      return new Response('forbidden', { status: 403 });
    }
    const obj = await env.MEDIA_BUCKET.get(path);
    if (!obj) return new Response('not found', { status: 404 });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('cache-control', 'public, max-age=31536000, immutable'); // aset immutable per-path
    headers.set('etag', obj.httpEtag);
    return new Response(obj.body, { headers });
  },
};
```

Catatan keamanan:
- Token HMAC mencegah enumerasi bucket; objek hanya bisa diakses bila tahu path **dan** token.
- `cache-control immutable` aman karena path aset unik per upload (sudah ada
  `checkpointId/hero/<hash>` di `createCloudAssetPath`). Edge cache Cloudflare ikut menekan
  Class B reads.
- Bila butuh kontrol akses per-role lebih ketat, ganti `verifyToken` dengan verifikasi
  Supabase JWT (Worker memanggil `auth/v1/user`) — trade-off: tiap GET butuh roundtrip auth.

---

## Fase 4 — Routing varian: hero/full → R2, thumb → Supabase

### 4.1 — `prepareCloudVariantUrl` memilih backend per peran varian

**File:** `src/context/AppContextRuntime.jsx`

`prepareCloudVariantUrl` (≈6104) dan `uploadPatrolReportDomainMedia` (≈6109) saat ini
memanggil `prepareCloudPhotoUrl` yang selalu lewat `uploadCloudDataUrlAsset` (Supabase).
Tambahkan parameter tujuan:

```js
// thumb -> Supabase (kecil, RLS), hero/photo -> R2 (besar, egress gratis)
const prepareCloudVariantUrl = useCallback(async (variantUrl, pathSegments, target = 'r2') => {
  if (!variantUrl) return null;
  if (!isLocalOnlyAssetUrl(variantUrl)) return variantUrl;
  return prepareCloudPhotoUrl(variantUrl, [...pathSegments, variantUrl], { target });
}, [prepareCloudPhotoUrl]);
```

Di `uploadPatrolReportDomainMedia`:

```js
heroUrl: await prepareCloudVariantUrl(checkpointReport.heroUrl,  [...,'hero'],  'r2'),
thumbUrl: await prepareCloudVariantUrl(checkpointReport.thumbUrl, [...,'thumb'], 'supabase'),
// photoUrl base (full view) -> 'r2'
```

### 4.2 — `prepareCloudPhotoUrl` cabang backend

**File:** `src/context/AppContextRuntime.jsx` (≈5712)

Di titik upload (≈5753), pilih fungsi berdasar `options.target` + flag `isR2MediaEnabled`:

```js
const uploadFn = (options.target === 'r2' && isR2MediaEnabled)
  ? () => uploadDataUrlAssetToR2({ dataUrl, path: createCloudAssetPath(...pathSegments) })
  : () => uploadCloudDataUrlAsset({ dataUrl, path: createCloudAssetPath(...pathSegments) });
const uploadPromise = uploadFn();
```

Cache, in-flight dedup, dan retry queue yang sudah ada tetap berlaku — hanya target
upload yang bercabang. **Kontrak fungsi tidak berubah** (tetap kembalikan URL string).

### 4.3 — Incident hero juga ke R2

`AppContextRuntime.jsx:5908-5921` (`incident.heroUrl`/`thumbUrl`) ikut pola yang sama:
hero → `'r2'`, thumb → `'supabase'`.

---

## Fase 5 — Delete & Re-sign sadar-provider

### 5.1 — `deleteStorageAsset` bercabang provider

**File:** `src/services/backend/assets.js` (≈139)

```js
export async function deleteStorageAsset(photoUrl) {
  if (!photoUrl || typeof photoUrl !== 'string') return;
  const supabase = ensureSupabaseClient();

  if (isR2Url(photoUrl)) {
    // R2: hapus lewat Edge Function (kredensial server). Path diturunkan dari URL publik.
    const objectPath = photoUrl.slice(R2_PUBLIC_BASE_URL.length).replace(/^\/+/, '').split('?')[0];
    try { await supabase.functions.invoke('delete-r2-asset', { body: { path: objectPath } }); } catch (_) {}
    try { await supabase.from('media_assets').delete().eq('bucket', 'r2').eq('object_path', objectPath); } catch (_) {}
    return;
  }
  // ... jalur Supabase lama (regex /storage/v1/object/...) tetap apa adanya.
}
```

Tambah Edge Function `delete-r2-asset` (auth admin/pemilik + `DeleteObjectCommand` ke R2).

### 5.2 — `resign-expiring-assets` lewati provider r2

**File:** `supabase/functions/resign-expiring-assets/index.ts`

Tambah filter `.eq('storage_provider', 'supabase')` (atau
`.neq('storage_provider', 'r2')`) pada query `media_assets` (baris 48-52) agar objek R2
(URL stabil, `signed_url_expires_at = null`) tidak ikut di-scan/re-sign.

---

## Fase 6 — Backfill Aset Lama (opsional, belakangan)

Aset lama tetap di Supabase. Dua pilihan:
1. **Biarkan** — aset lama habis egress-nya seiring waktu; aset baru sudah hemat. Paling aman.
2. **Backfill job** — Edge Function batch: unduh objek Supabase → PUT ke R2 → update
   `patrol_reports.payload.heroUrl`/`incidents.payload.heroUrl` + `media_assets`. Berisiko
   (menulis ulang payload report) → jadwalkan terpisah dengan test ketat.

Rekomendasi patch pertama: **pilih opsi 1.**

---

## Rollback / Feature Flag

- Master switch `VITE_ENABLE_R2_MEDIA`. Bila `0`, semua upload kembali ke Supabase;
  aset R2 yang sudah ada tetap terbaca (URL stabil, tidak bergantung flag client).
- Karena hanya **upload baru** yang berpindah, mematikan flag tidak merusak aset lama.
- Worker & R2 read-only saat flag off — tidak ada sisi efek destruktif.

---

## Ringkasan File yang Dimodifikasi / Ditambah

| File | Perubahan |
|------|-----------|
| `supabase/migrations/<ts>_add_media_storage_provider.sql` | **baru** — kolom `storage_provider` |
| `supabase/functions/create-r2-upload-url/index.ts` | **baru** — presign PUT R2 (auth-guarded) |
| `supabase/functions/delete-r2-asset/index.ts` | **baru** — hapus objek R2 |
| `supabase/functions/resign-expiring-assets/index.ts` | filter `storage_provider != 'r2'` |
| `workers/media-r2/src/index.ts` | **baru** — Cloudflare Worker download + token |
| `src/services/backend/assets.js` | helper `isR2Url`, `uploadDataUrlAssetToR2`, `buildR2PublicUrl`, delete bercabang |
| `src/context/AppContextRuntime.jsx` | `prepareCloudPhotoUrl`/`prepareCloudVariantUrl` cabang target; hero/photo → R2, thumb → Supabase |

File yang **tidak** disentuh: `cloudState.js`, `patrolReports.js`, `incidentReports.js`,
`outbox.js` (egress DB sudah ditangani patch sebelumnya).

---

## Urutan Commit

```text
commit 1: feat(media): kolom storage_provider + flag R2 (no-op tanpa env)
commit 2: feat(media): Edge Function create-r2-upload-url + helper upload R2 client
commit 3: feat(media): Cloudflare Worker download R2 + token HMAC
commit 4: feat(media): route hero/full-view & base photo ke R2, thumb tetap Supabase
commit 5: feat(media): delete & resign sadar-provider + delete-r2-asset
```

- Commit 1 aman digabung/duluan (tanpa env R2, perilaku tak berubah).
- Commit 2–4 adalah inti; aktif hanya saat `VITE_ENABLE_R2_MEDIA=1`.
- Commit 5 menutup siklus hidup (hapus/maintenance) — penting sebelum produksi penuh.

---

## Verifikasi Otomatis

```bash
npm install
npm run build
npm run test:security
node --test tests/pages/*.test.mjs
```

Test baru:

1. `tests/pages/r2-asset-routing.test.mjs`
   - `prepareCloudVariantUrl(target='r2')` saat flag on → pakai `uploadDataUrlAssetToR2`
   - `target='supabase'` (thumb) → tetap `uploadCloudDataUrlAsset`
   - flag off → semua varian jatuh ke Supabase
   - `isR2Url` membedakan URL R2 vs Supabase dengan benar

2. `tests/pages/r2-delete-routing.test.mjs`
   - `deleteStorageAsset(r2Url)` → invoke `delete-r2-asset`, tidak panggil `storage.remove`
   - `deleteStorageAsset(supabaseUrl)` → jalur lama, tidak invoke R2

3. Worker unit test (`workers/media-r2`): token valid → 200; token salah → 403; objek hilang → 404.

---

## Verifikasi Fungsional Wajib

1. **Submit laporan berfoto (flag on):**
   - hero & base photo ter-upload ke R2 (cek Network: PUT ke `*.r2.cloudflarestorage.com`)
   - thumb tetap ke Supabase Storage
   - URL hero yang tersimpan di payload berbentuk `https://media.<domain>/...`
   - **tidak macet skeleton** saat ambil foto kedua (pola bug CLAUDE.md tetap terjaga)
2. **Buka detail di device lain:** hero termuat dari domain Worker (R2), egress Supabase
   tidak bertambah untuk hero.
3. **Offline → online:** foto lokal (`idb://`) ter-flush; upload R2 retry queue jalan;
   tidak ada duplikat.
4. **Admin hapus temuan:** objek R2 terhapus (atau diantre `delete-r2-asset`), `media_assets`
   row terhapus, foto tidak resurrect.
5. **Flag off mendadak:** aset R2 lama tetap termuat; upload baru kembali ke Supabase tanpa error.
6. **Token salah / tebak path:** Worker balas 403 (akses terkontrol).

---

## Cara Ukur Egress Setelah Migrasi

1. Supabase Dashboard → Observability → Storage egress, bandingkan 7 hari sebelum vs sesudah.
2. Cloudflare R2 dashboard → Metrics: requests (Class B) + egress (harus naik di R2, $0).
3. DevTools Network device penerima: total byte dari `supabase.co/storage` (turun) vs
   `media.<domain>` (naik).

---

## Estimasi Penghematan & Catatan Jujur

| Sumber egress | Sebelum | Sesudah R2 |
|---------------|---------|------------|
| Hero / full-view view | Supabase (kuota) | R2 ($0, tidak masuk kuota) |
| Base `photoUrl` | Supabase | R2 |
| Thumbnail (list) | Supabase | Supabase (tetap, tapi kecil) |
| DB realtime sync | sudah dioptimasi (~84% turun) | tidak berubah |

Estimasi realistis:
- Bila hero/full mendominasi egress storage, sisa egress Supabase bisa turun **50–80% lagi**
  di atas optimasi DB sebelumnya.
- **Jangan klaim "egress nol".** Thumbnail, hydrate cold-start, dan trafik non-media tetap
  memakai egress Supabase.
- Class B reads R2 bukan nol (operasi), tapi masih dalam free tier untuk skala SmartPatrol
  saat ini, dan **egress byte-nya gratis** — itu inti penghematannya.
- Klaim final harus berdasar angka Observability Supabase + metrics R2 setelah ≥7 hari operasi.

### Risiko utama
1. **Direct-PUT CORS** dari WebView Capacitor (`capacitor://localhost`) — wajib diuji di
   device Android nyata, bukan hanya browser.
2. **Token download** — bila `MEDIA_TOKEN_SECRET` bocor, path bisa diakses; rotasi secret =
   semua URL token lama invalid (perlu re-derive). Pertimbangkan verifikasi JWT bila data
   foto sangat sensitif.
3. **Dua sumber kebenaran storage** — `media_assets.storage_provider` harus selalu benar agar
   delete/resign tidak salah backend. Test routing (di atas) menjaga ini.
