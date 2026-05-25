/*
Tujuan: Bootstrap admin pertama SmartPatrol SQL menggunakan Supabase service role.
Caller: Developer lokal/staging melalui `npm run setup:admin`.
Dependensi: @supabase/supabase-js dan env SUPABASE_SERVICE_ROLE_KEY/SMARTPATROL_SETUP_TOKEN.
Main Functions: Membuat/menemukan akun Auth admin dan upsert profiles role ADMIN.
Side Effects: Menulis Supabase Auth dan tabel public.profiles.
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

function readArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find(arg => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : fallback;
}

function required(value, label) {
  if (!value) {
    throw new Error(`${label} wajib diisi.`);
  }
  return value;
}

const setupToken = readArg('token', process.env.SMARTPATROL_SETUP_TOKEN || '');
required(process.env.SMARTPATROL_SETUP_TOKEN, 'SMARTPATROL_SETUP_TOKEN');
if (setupToken !== process.env.SMARTPATROL_SETUP_TOKEN) {
  throw new Error('Setup token tidak cocok.');
}

const supabaseUrl = required(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, 'SUPABASE_URL/VITE_SUPABASE_URL');
const serviceRoleKey = required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
const email = required(readArg('email', process.env.SMARTPATROL_ADMIN_EMAIL || ''), '--email atau SMARTPATROL_ADMIN_EMAIL');
const password = required(readArg('password', process.env.SMARTPATROL_ADMIN_PASSWORD || ''), '--password atau SMARTPATROL_ADMIN_PASSWORD');
const name = readArg('name', process.env.SMARTPATROL_ADMIN_NAME || 'SmartPatrol Admin');

if (password.length < 8) {
  throw new Error('Password admin minimal 8 karakter.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function findAuthUserByEmail(targetEmail) {
  let page = 1;
  while (page < 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find(user => user.email?.toLowerCase() === targetEmail.toLowerCase());
    if (found) return found;
    if (data.users.length < 100) return null;
    page += 1;
  }
  return null;
}

const existingUser = await findAuthUserByEmail(email);
const authUser = existingUser || (await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: {
    display_name: name,
    name,
  },
})).data.user;

if (!authUser?.id) {
  throw new Error('Gagal membuat/membaca user admin Supabase.');
}

const { error: profileError } = await supabase.from('profiles').upsert({
  id: authUser.id,
  auth_uid: authUser.id,
  email,
  name,
  role: 'ADMIN',
  status: 'active',
  review_state: 'approved',
  enabled: true,
  type: 'INTERNAL',
  worker_number: '',
  source: 'setup-admin',
}, { onConflict: 'id' });

if (profileError) throw profileError;

console.log(`Admin SmartPatrol SQL siap: ${email} (${authUser.id})`);
