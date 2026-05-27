/*
Tujuan: Tambah kolom signed_url ke media_assets dan jadwalkan cron harian re-sign URL yang kedaluwarsa.
Caller: Supabase migration runner.
Dependensi: pg_cron, pg_net, tabel media_assets, edge function resign-expiring-assets.
Main Functions:
  - Tambah kolom signed_url ke media_assets
  - Fungsi public.trigger_resign_expiring_assets() memanggil edge function via net.http_post
  - Cron job harian 01:00 UTC (08:00 WIB)
Side Effects: ALTER TABLE media_assets; INSERT ke cron.job.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SETUP SATU KALI SETELAH DEPLOY (wajib oleh admin):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Set database settings (ganti nilai sesuai project):

   ALTER DATABASE postgres
     SET "app.supabase_functions_url" = 'https://YOUR-PROJECT-REF.supabase.co/functions/v1';

   ALTER DATABASE postgres
     SET "app.cron_secret" = 'GANTI-DENGAN-RANDOM-STRING-PANJANG';

   SELECT pg_reload_conf();

2. Set env var CRON_SECRET (nilai sama dengan step 1) di:
   Supabase Dashboard → Edge Functions → resign-expiring-assets → Secrets
   Atau via CLI: supabase secrets set CRON_SECRET=NILAI-YANG-SAMA

3. Deploy edge function:
   supabase functions deploy resign-expiring-assets
*/

-- ─────────────────────────────────────────────
-- 1. Kolom signed_url di media_assets
-- ─────────────────────────────────────────────
ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS signed_url text;

COMMENT ON COLUMN public.media_assets.signed_url IS
  'Signed URL Supabase Storage aktif saat ini. Di-refresh otomatis oleh cron resign-expiring-assets.';

-- ─────────────────────────────────────────────
-- 2. pg_net (aktif default di Supabase Cloud)
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─────────────────────────────────────────────
-- 3. Fungsi pemicu: baca config → panggil edge function
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_resign_expiring_assets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_functions_url text := coalesce(
    nullif(trim(current_setting('app.supabase_functions_url', true)), ''), ''
  );
  v_cron_secret text := coalesce(
    current_setting('app.cron_secret', true), ''
  );
BEGIN
  IF v_functions_url = '' THEN
    RAISE NOTICE '[resign-cron] app.supabase_functions_url belum dikonfigurasi — resign job dilewati.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_functions_url || '/resign-expiring-assets',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', v_cron_secret
    ),
    body    := '{}'::jsonb
  );

  RAISE NOTICE '[resign-cron] HTTP request ke resign-expiring-assets dikirim.';
END;
$$;

-- ─────────────────────────────────────────────
-- 4. Hapus cron lama (idempotent)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('resign-expiring-assets');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─────────────────────────────────────────────
-- 5. Daftarkan cron: setiap hari 01:00 UTC (08:00 WIB)
-- ─────────────────────────────────────────────
SELECT cron.schedule(
  'resign-expiring-assets',
  '0 1 * * *',
  $$SELECT public.trigger_resign_expiring_assets()$$
);
