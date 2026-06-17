/*
Tujuan: Memulihkan foto profil user lama yang byte-nya masih ada di Supabase Storage
        tetapi profiles.photo_url-nya kosong/idb:// (akibat bug foto registrasi yang
        tidak pernah disinkronkan ke profiles sebelum perbaikan).
Caller: Admin/developer via `node scripts/relink-user-photos.mjs` (lihat opsi di bawah).
Dependensi: @supabase/supabase-js dan env SUPABASE_URL/VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
Main Functions: Pindai profiles tanpa foto durabel, cari object avatar di media_assets/Storage,
        buat signed URL baru, lalu tulis ke profiles.photo_url (dan segarkan media_assets).
Side Effects: Hanya membaca saat dry-run (default). Dengan --apply menulis profiles & media_assets.

Opsi:
  --apply           Terapkan perubahan (tanpa ini hanya dry-run/laporan).
  --email=<email>   Batasi ke satu user berdasarkan email.
  --force           Ikut proses profil yang photo_url-nya sudah http (re-sign ulang).
  --ttl-days=<n>    TTL signed URL baru (default 30).

Contoh:
  node scripts/relink-user-photos.mjs                 # laporan saja
  node scripts/relink-user-photos.mjs --apply         # perbaiki semua yang ketemu
  node scripts/relink-user-photos.mjs --email=a@b.com --apply
*/

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnvFile(path) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;
    const [key, ...rest] = trimmed.split('=');
    if (!process.env[key]) {
      process.env[key] = rest.join('=').trim().replace(/^["']|["']$/g, '');
    }
  });
}

loadDotEnvFile(resolve(process.cwd(), '.env.local'));
loadDotEnvFile(resolve(process.cwd(), '.env'));

function readFlag(name) {
  return process.argv.includes(`--${name}`);
}

function readArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find(arg => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : fallback;
}

function required(value, label) {
  if (!value) throw new Error(`${label} wajib diisi.`);
  return value;
}

const APPLY = readFlag('apply');
const FORCE = readFlag('force');
const EMAIL_FILTER = readArg('email', '').toLowerCase();
const TTL_SECONDS = Math.max(1, Number(readArg('ttl-days', '30')) || 30) * 24 * 60 * 60;

const supabaseUrl = required(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, 'SUPABASE_URL/VITE_SUPABASE_URL');
const serviceRoleKey = required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const REGISTRATION_BUCKET = 'registration-assets';

// Foto sudah durabel bila berupa URL http(s). idb://, data:, atau kosong = perlu dipulihkan.
function isDurablePhotoUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

// Cari kandidat object avatar untuk satu profil, dari paling andal ke fallback:
//  1) media_assets domain 'registration' milik auth_uid (avatar onboarding/registrasi).
//  2) media_assets apa pun milik auth_uid (owner_id).
//  3) media_assets dengan object_path memuat users/<legacyId>/avatar (avatar blob operasional).
//  4) Listing langsung Storage registration-assets/<auth_uid>/profile.
async function findAvatarObject(profile) {
  const authUid = String(profile.auth_uid || '').trim();
  const legacyId = String(profile.id || '').trim();

  const pickNewest = (rows) => (rows || [])
    .filter(r => r?.bucket && r?.object_path)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;

  if (authUid) {
    const { data: regRows, error: regErr } = await supabase
      .from('media_assets')
      .select('bucket, object_path, domain, created_at')
      .eq('owner_id', authUid)
      .eq('domain', 'registration')
      .order('created_at', { ascending: false });
    if (regErr) throw regErr;
    const reg = pickNewest(regRows);
    if (reg) return { ...reg, via: 'media_assets:registration(owner_id)' };

    const { data: ownerRows, error: ownerErr } = await supabase
      .from('media_assets')
      .select('bucket, object_path, domain, created_at')
      .eq('owner_id', authUid)
      .order('created_at', { ascending: false });
    if (ownerErr) throw ownerErr;
    const owned = pickNewest(ownerRows);
    if (owned) return { ...owned, via: `media_assets:${owned.domain || 'unknown'}(owner_id)` };
  }

  if (legacyId) {
    const { data: pathRows, error: pathErr } = await supabase
      .from('media_assets')
      .select('bucket, object_path, domain, created_at')
      .ilike('object_path', `%users/${legacyId}/avatar%`)
      .order('created_at', { ascending: false });
    if (pathErr) throw pathErr;
    const byPath = pickNewest(pathRows);
    if (byPath) return { ...byPath, via: 'media_assets:object_path(users/<id>/avatar)' };
  }

  if (authUid) {
    const { data: listed, error: listErr } = await supabase.storage
      .from(REGISTRATION_BUCKET)
      .list(`${authUid}/profile`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
    if (listErr && listErr.message && !/not found/i.test(listErr.message)) throw listErr;
    const newest = (listed || [])
      .filter(item => item?.name && !item.name.endsWith('/'))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
    if (newest) {
      return {
        bucket: REGISTRATION_BUCKET,
        object_path: `${authUid}/profile/${newest.name}`,
        domain: 'registration',
        created_at: newest.created_at || null,
        via: 'storage:list(registration-assets/<uid>/profile)',
      };
    }
  }

  return null;
}

async function main() {
  let query = supabase
    .from('profiles')
    .select('id, auth_uid, email, name, photo_url')
    .order('created_at', { ascending: true });
  if (EMAIL_FILTER) query = query.eq('email', EMAIL_FILTER);

  const { data: profiles, error } = await query;
  if (error) throw error;

  const candidates = (profiles || []).filter(p => FORCE || !isDurablePhotoUrl(p.photo_url));

  console.log(`Mode: ${APPLY ? 'APPLY (menulis)' : 'DRY-RUN (laporan saja)'} | TTL signed URL: ${TTL_SECONDS / 86400} hari`);
  console.log(`Total profil: ${(profiles || []).length} | Perlu diperiksa: ${candidates.length}\n`);

  let fixed = 0;
  let missing = 0;
  let skipped = 0;

  for (const profile of candidates) {
    const label = `${profile.name || '(tanpa nama)'} <${profile.email || '-'}> [${profile.id}]`;

    if (FORCE && isDurablePhotoUrl(profile.photo_url)) {
      // Hanya re-sign bila masih ada object asalnya; jika tidak, biarkan URL lama.
    }

    let object;
    try {
      object = await findAvatarObject(profile);
    } catch (err) {
      console.log(`✗ ${label}\n    gagal mencari object: ${err.message}`);
      skipped += 1;
      continue;
    }

    if (!object) {
      console.log(`– ${label}\n    tidak ada byte foto di Storage/media_assets (perlu foto ulang)`);
      missing += 1;
      continue;
    }

    const { data: signData, error: signErr } = await supabase.storage
      .from(object.bucket)
      .createSignedUrl(object.object_path, TTL_SECONDS);
    if (signErr || !signData?.signedUrl) {
      console.log(`✗ ${label}\n    object ${object.bucket}/${object.object_path} gagal di-sign: ${signErr?.message || 'no url'}`);
      skipped += 1;
      continue;
    }

    console.log(`✔ ${label}\n    ditemukan via ${object.via}: ${object.bucket}/${object.object_path}`);

    if (!APPLY) {
      fixed += 1;
      continue;
    }

    const { error: updErr } = await supabase
      .from('profiles')
      .update({ photo_url: signData.signedUrl })
      .eq('id', profile.id);
    if (updErr) {
      console.log(`    gagal update profiles.photo_url: ${updErr.message}`);
      skipped += 1;
      continue;
    }

    // Segarkan media_assets agar cron resign tahu expiry baru (best-effort).
    await supabase
      .from('media_assets')
      .update({
        signed_url: signData.signedUrl,
        signed_url_expires_at: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
      })
      .eq('bucket', object.bucket)
      .eq('object_path', object.object_path);

    console.log('    profiles.photo_url diperbarui.');
    fixed += 1;
  }

  console.log(`\nRingkasan: ${APPLY ? 'diperbaiki' : 'bisa diperbaiki'}=${fixed}, tanpa byte=${missing}, dilewati=${skipped}`);
  if (!APPLY && fixed > 0) {
    console.log('Jalankan ulang dengan --apply untuk menulis perubahan.');
  }
}

main().catch((err) => {
  console.error('Gagal menjalankan relink:', err.message);
  process.exitCode = 1;
});
