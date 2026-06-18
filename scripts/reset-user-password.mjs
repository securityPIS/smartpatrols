/*
Tujuan: Reset password akun Supabase Auth user existing berdasarkan email (operasi admin).
Caller: Admin via `node scripts/reset-user-password.mjs` atau workflow
        ".github/workflows/reset-password.yml" (service role key tidak pernah keluar dari CI).
Dependensi: @supabase/supabase-js dan env SUPABASE_URL/VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
Main Functions: Cari user di auth.users via email, lalu admin.updateUserById({ password }).
Side Effects: Dry-run (default) hanya mengonfirmasi user ditemukan. --apply benar-benar mengubah password.

Opsi:
  --email=<email>      Wajib. Email user yang passwordnya akan direset.
  --password=<string>  Wajib untuk --apply. Password baru (minimal 8 karakter).
  --apply               Terapkan perubahan (tanpa ini hanya dry-run/cek user).

Contoh:
  node scripts/reset-user-password.mjs --email=a@b.com                          # cek saja
  node scripts/reset-user-password.mjs --email=a@b.com --password=Xx@123456 --apply
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
const EMAIL = required(readArg('email', ''), '--email').toLowerCase();
const NEW_PASSWORD = readArg('password', '');

if (APPLY && NEW_PASSWORD.length < 8) {
  throw new Error('--password wajib diisi (minimal 8 karakter) saat --apply.');
}

const supabaseUrl = required(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, 'SUPABASE_URL/VITE_SUPABASE_URL');
const serviceRoleKey = required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findAuthUserByEmail(targetEmail) {
  let page = 1;
  while (page < 50) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find(user => user.email?.toLowerCase() === targetEmail.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
  return null;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (mengubah password)' : 'DRY-RUN (cek user saja)'}`);

  const user = await findAuthUserByEmail(EMAIL);
  if (!user) {
    console.log(`✗ Tidak ditemukan user Supabase Auth dengan email ${EMAIL}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`✔ User ditemukan: ${user.email} [${user.id}]`);

  if (!APPLY) {
    console.log('Dry-run selesai. Jalankan ulang dengan --password=<baru> --apply untuk reset password.');
    return;
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    password: NEW_PASSWORD,
  });
  if (updateError) throw updateError;

  console.log(`Password untuk ${user.email} berhasil direset.`);
}

main().catch((err) => {
  console.error('Gagal reset password:', err.message);
  process.exitCode = 1;
});
