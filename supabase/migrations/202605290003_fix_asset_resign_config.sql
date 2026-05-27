/*
Tujuan: Ganti sumber konfigurasi cron resign-assets dari GUC database (ALTER DATABASE — butuh
        superuser, tidak tersedia di Supabase) ke tabel privat yang bisa ditulis role postgres.
Caller: Supabase migration runner.
Dependensi: migration 202605290001 (fungsi trigger_resign_expiring_assets, cron job).
Main Functions:
  - Skema private + tabel private.app_config (key/value), tidak diekspos ke API
  - Ganti public.trigger_resign_expiring_assets() agar baca config dari private.app_config
Side Effects: CREATE SCHEMA private; CREATE TABLE private.app_config.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SETUP (otomatis oleh workflow GitHub Actions, step "Konfigurasi database settings"):
  insert into private.app_config (key, value) values
    ('functions_url', 'https://<PROJECT_REF>.supabase.co/functions/v1'),
    ('cron_secret', '<CRON_SECRET>')
  on conflict (key) do update set value = excluded.value, updated_at = now();
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*/

-- ─────────────────────────────────────────────
-- 1. Skema privat + tabel config (tidak diekspos ke PostgREST)
-- ─────────────────────────────────────────────
create schema if not exists private;

create table if not exists private.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- Kunci akses: hanya bisa dibaca via SECURITY DEFINER function (owner postgres) / service_role.
revoke all on private.app_config from anon, authenticated;
alter table private.app_config enable row level security;

-- ─────────────────────────────────────────────
-- 2. Ganti fungsi pemicu: baca config dari private.app_config
-- ─────────────────────────────────────────────
create or replace function public.trigger_resign_expiring_assets()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_functions_url text;
  v_cron_secret   text;
begin
  select value into v_functions_url from private.app_config where key = 'functions_url';
  select value into v_cron_secret   from private.app_config where key = 'cron_secret';

  v_functions_url := coalesce(nullif(trim(v_functions_url), ''), '');
  v_cron_secret   := coalesce(v_cron_secret, '');

  if v_functions_url = '' then
    raise notice '[resign-cron] private.app_config.functions_url belum dikonfigurasi — resign job dilewati.';
    return;
  end if;

  perform net.http_post(
    url     := v_functions_url || '/resign-expiring-assets',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', v_cron_secret
    ),
    body    := '{}'::jsonb
  );

  raise notice '[resign-cron] HTTP request ke resign-expiring-assets dikirim.';
end;
$$;
