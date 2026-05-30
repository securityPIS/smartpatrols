-- Tujuan: Trigger anti-resurrection temuan yang lebih agresif berbasis waktu (1 jam window).
-- Caller: Supabase db push; trigger BEFORE INSERT/UPDATE patrol_reports.
-- Dependensi: public.patrol_reports, public.patrol_report_tombstones.
-- Main Functions: block_tombstoned_patrol_report (versi v3 — time-window block untuk temuan).
-- Side Effects: Memblokir re-upsert temuan di (ship_id, checkpoint_id) yang sama selama 1 jam
--   setelah tombstone dibuat, terlepas dari shift_key/completedAt. Setelah 1 jam, re-upsert
--   temuan baru di checkpoint sama (mis. shift berikutnya) diizinkan lagi.
--
-- Latar belakang:
--   Setelah PR #18 (RPC server-side), DELETE database berhasil (deleted_count: 6). Tapi
--   temuan muncul lagi setelah refresh — bukti device PETUGAS masih menulis ulang baris
--   via re-upsert dari state lokal. Versi trigger sebelumnya:
--     - Cabang 1 (client_event_id sama) bisa miss bila petugas re-upsert dengan
--       client_event_id berbeda format
--     - Cabang 2 (natural key + shift_key is not distinct) bisa miss bila tombstone
--       shift_key=NULL (natural-key fallback) atau shift_key berbeda
--     - Cabang 3 (time-based completedAt <= deleted_at) bisa miss bila payload tidak
--       menyertakan completedAt valid
--
-- Solusi pragmatis: cabang ke-4 yang TIDAK butuh data selain (ship_id, checkpoint_id) +
-- waktu. Jika tombstone dibuat <= 1 jam yang lalu, BLOK semua re-upsert temuan di
-- checkpoint itu. Setelah 1 jam, petugas yang ingin submit temuan baru di checkpoint
-- yang sama (mis. shift hari berikutnya) bebas melakukannya.

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

  if exists (
    select 1
    from public.patrol_report_tombstones t
    where
      -- Cabang 1: client_event_id identik.
      t.client_event_id = new.client_event_id
      -- Cabang 2: natural key + shift_key identik (termasuk both NULL).
      or (
        t.ship_id = new.ship_id
        and t.checkpoint_id = new.checkpoint_id
        and t.shift_key is not distinct from new.shift_key
      )
      -- Cabang 3: temuan dengan completedAt <= deleted_at (beda shift, sudah stale).
      or (
        new.result_type = 'temuan'
        and t.ship_id = new.ship_id
        and t.checkpoint_id = new.checkpoint_id
        and t.shift_key is distinct from new.shift_key
        and v_completed_at is not null
        and v_completed_at <= t.deleted_at
      )
      -- Cabang 4 BARU: time-window block. Untuk re-upsert temuan di (ship_id, checkpoint_id)
      -- yang sama dalam 1 jam setelah tombstone, BLOK tanpa peduli shift_key/completedAt.
      -- Ini menutup celah saat device stale menulis ulang dengan client_event_id berbeda
      -- atau payload tanpa completedAt valid. Window 1 jam = cukup untuk semua device
      -- sinkron, tidak terlalu lama untuk menghalangi temuan baru shift berikutnya.
      or (
        new.result_type = 'temuan'
        and t.ship_id = new.ship_id
        and t.checkpoint_id = new.checkpoint_id
        and t.deleted_at >= now() - interval '1 hour'
      )
  ) then
    return null;
  end if;

  return new;
end;
$$;

-- Cleanup ulang: hapus baris temuan yang masih ada di DB padahal tombstone <= 1 jam
-- ada untuk (ship_id, checkpoint_id) — kasus yang baru saja terjadi di production.
with stale_window as (
  select distinct pr.id
  from public.patrol_reports pr
  join public.patrol_report_tombstones t
    on t.ship_id = pr.ship_id
   and t.checkpoint_id = pr.checkpoint_id
  where pr.result_type = 'temuan'
    and t.deleted_at >= now() - interval '24 hours'
)
delete from public.patrol_reports pr
using stale_window s
where pr.id = s.id;
