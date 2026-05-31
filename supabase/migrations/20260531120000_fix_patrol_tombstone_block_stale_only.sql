-- Tujuan: Hentikan kehilangan laporan patroli SAH akibat trigger anti-resurrection yang
--   terlalu agresif. Trigger hanya boleh memblokir RE-UPSERT BASI (laporan yang dibuat
--   sebelum admin menghapusnya), BUKAN patrol baru di checkpoint yang sama.
-- Caller: Supabase db push; trigger BEFORE INSERT/UPDATE patrol_reports.
-- Dependensi: public.patrol_reports, public.patrol_report_tombstones, public.patrol_report_completed_at.
-- Main Functions: block_tombstoned_patrol_report (versi final — hanya guard berbasis waktu).
-- Side Effects: TIDAK ADA penghapusan data. Murni mengganti body fungsi + menonaktifkan trigger liar.
--
-- Latar belakang (akar "user submit laporan malah hilang"):
--   Versi sebelumnya (migrasi 202605300014, "cabang 4") memblokir SEMUA temuan baru di
--   (ship_id, checkpoint_id) selama 1 JAM setelah tombstone APA PUN, tanpa peduli
--   shift_key/timestamp. Karena BEFORE-trigger RETURN NULL membatalkan baris TANPA error,
--   klien mengira submit sukses padahal baris tak pernah masuk DB -> laporan hilang diam-diam
--   di semua device. RPC admin_delete juga menulis tombstone "natural" (shift_key=NULL),
--   sehingga setiap checkpoint yang PERNAH dihapus admin jadi "beracun" untuk laporan baru.
--
--   Prinsip benar (cermin logika klien shouldApplyPatrolReportTombstoneToCheckpoint):
--   sebuah laporan adalah RE-UPSERT BASI dari temuan yang dihapus HANYA bila waktu
--   penyelesaian patrol-nya <= waktu admin menghapus (deleted_at). Patrol BARU selalu
--   terjadi SETELAH deleted_at, jadi timestamp-nya > deleted_at dan WAJIB lolos. Dengan
--   guard ini, re-upsert basi dari device lama tetap diblokir, tapi laporan sah tak hilang.

-- patrol_report_completed_at: timestamp penyelesaian patrol dari payload.completedAt atau
-- occurred_at_trusted_ms. Idempotent re-declare agar migrasi self-contained.
create or replace function public.patrol_report_completed_at(
  p_payload jsonb,
  p_occurred_at_trusted_ms bigint
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_completed_text text;
begin
  v_completed_text := nullif(p_payload ->> 'completedAt', '');

  if v_completed_text is not null then
    begin
      return v_completed_text::timestamptz;
    exception
      when others then
        null;
    end;
  end if;

  if p_occurred_at_trusted_ms is not null and p_occurred_at_trusted_ms > 0 then
    return to_timestamp(p_occurred_at_trusted_ms::double precision / 1000.0);
  end if;

  return null;
end;
$$;

-- Trigger final: HANYA blokir re-upsert basi (timestamp patrol <= deleted_at tombstone).
-- Tidak ada lagi blanket 1 jam, tidak ada lagi blok tanpa-syarat berbasis natural key/shift_key.
create or replace function public.block_tombstoned_patrol_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed_at timestamptz;
begin
  v_completed_at := public.patrol_report_completed_at(
    new.payload,
    new.occurred_at_trusted_ms
  );

  -- Tanpa timestamp yang bisa diparse, kita TIDAK bisa membedakan laporan basi dari laporan
  -- baru. Pilih fail-open (loloskan) agar laporan sah tidak hilang; resurrection temuan basi
  -- (kasus langka tanpa completedAt/occurred_at) sudah dimitigasi reset tombstone sisi klien.
  if v_completed_at is null then
    return new;
  end if;

  if exists (
    select 1
    from public.patrol_report_tombstones t
    where (
        -- client_event_id identik (deterministik per shift|ship|checkpoint).
        t.client_event_id = new.client_event_id
        -- atau natural key checkpoint sama (mencakup tombstone natural shift_key=NULL
        -- maupun per-row dengan shift_key asli; lintas-shift basi pun tertangkap).
        or (t.ship_id = new.ship_id and t.checkpoint_id = new.checkpoint_id)
      )
      -- Guard kunci: hanya BASI (dibuat <= waktu hapus admin). Patrol BARU > deleted_at lolos.
      and v_completed_at <= t.deleted_at
  ) then
    return null;
  end if;

  return new;
end;
$$;

-- Trigger sudah terdaftar di migrasi 202605300007 (block_tombstoned_patrol_report_trg);
-- di sini hanya mengganti body fungsi.

-- Nonaktifkan trigger liar purge_tombstoned_patrol_finding_surfaces secara defensif. File
-- migrasinya sudah di-revert dari repo, TAPI bila sempat ter-db-push ke produksi, ia masih
-- meng-cascade-delete public.incidents dan menulis ulang public.shift_history_entries setiap
-- kali tombstone ditulis (dengan blanket 1 jam yang sama) -> ikut menghilangkan laporan.
-- DROP IF EXISTS aman walau objek tidak pernah ada.
drop trigger if exists purge_tombstoned_patrol_finding_surfaces_trg on public.patrol_report_tombstones;
drop function if exists public.purge_tombstoned_patrol_finding_surfaces();
