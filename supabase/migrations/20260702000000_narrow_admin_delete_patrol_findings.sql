-- Tujuan: Persempit penghapusan temuan admin agar TIDAK ikut menghapus laporan AMAN atau
--   laporan shift lain pada checkpoint yang sama.
-- Caller: Frontend admin via supabase.rpc('admin_delete_patrol_report_findings', ...).
-- Dependensi: public.patrol_reports, public.patrol_report_tombstones, public.is_admin, public.ships.
-- Main Functions: admin_delete_patrol_report_findings (versi presisi).
-- Side Effects: tombstone + DELETE HANYA baris yang dituju (by id) atau baris result_type='temuan'.
--
-- Latar belakang (akar "laporan JKT03 shift 2 hilang sebagian setelah isi foto kondisi personil"):
--   Versi lama (migrasi 202605300013) mencocokkan baris dengan (ship_id, checkpoint_id) TANPA
--   filter. Karena patrol_reports unik per (shift_key, ship_id, checkpoint_id) — satu baris per
--   shift — menghapus SATU temuan ikut menghapus SELURUH baris checkpoint itu lintas shift/tanggal,
--   termasuk baris AMAN. Tombstone per-baris + guard klien lalu mereset laporan yang tampil,
--   sehingga laporan sah lenyap dari UI (efeknya terlihat saat app resume dari kamera).
--
-- Prinsip perbaikan:
--   MODE A (presisi): p_firestore_id (uuid baris) diketahui -> operasi HANYA pada baris itu.
--     Tidak menyentuh baris AMAN maupun baris shift lain pada checkpoint yang sama.
--   MODE B (fallback tanpa uuid): operasi HANYA pada baris result_type='temuan' di
--     (ship_id, checkpoint_id). Laporan AMAN tidak pernah dihapus oleh penghapusan temuan.
--   Tombstone "natural" (shift_key=NULL) TETAP ditulis untuk anti-resurrection. Trigger
--     block_tombstoned_patrol_report memblokirnya secara TIME-GUARDED (hanya completedAt <=
--     deleted_at), dan guard klien shouldApplyPatrolReportTombstoneToCheckpoint kini juga
--     time-guarded + temuan-only, jadi laporan BARU/AMAN aman.

create or replace function public.admin_delete_patrol_report_findings(
  p_ship_id text,
  p_checkpoint_id text,
  p_firestore_id text default null
)
returns table (
  deleted_count integer,
  tombstone_count integer,
  rows_seen jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_firestore_uuid uuid;
  v_rows_seen jsonb := '[]'::jsonb;
  v_tombstone_count integer := 0;
  v_deleted_count integer := 0;
  v_row record;
begin
  -- Hanya admin yang boleh memanggil. is_admin() memakai JWT caller (bukan postgres),
  -- jadi cek tetap aman walau function berjalan SECURITY DEFINER.
  if not public.is_admin() then
    raise exception 'permission denied: admin only';
  end if;

  if p_firestore_id is not null and p_firestore_id <> '' then
    begin
      v_firestore_uuid := p_firestore_id::uuid;
    exception when others then
      v_firestore_uuid := null;
    end;
  end if;

  -- Kumpulkan baris target + tulis tombstone per-baris (data ASLI dari DB).
  -- MODE A: HANYA baris id = uuid. MODE B (uuid null): HANYA baris temuan pada checkpoint.
  for v_row in
    select id, client_event_id, shift_key, ship_id, checkpoint_id, ship_name
    from public.patrol_reports
    where (v_firestore_uuid is not null and id = v_firestore_uuid)
       or (v_firestore_uuid is null
           and p_ship_id is not null and p_checkpoint_id is not null
           and ship_id = p_ship_id and checkpoint_id = p_checkpoint_id
           and result_type = 'temuan')
  loop
    v_rows_seen := v_rows_seen || jsonb_build_object(
      'id', v_row.id,
      'client_event_id', v_row.client_event_id,
      'shift_key', v_row.shift_key,
      'ship_id', v_row.ship_id,
      'checkpoint_id', v_row.checkpoint_id
    );

    insert into public.patrol_report_tombstones
      (client_event_id, shift_key, ship_id, checkpoint_id, ship_name)
    values (
      coalesce(
        nullif(v_row.client_event_id, ''),
        v_row.shift_key || '|' || v_row.ship_id || '|' || v_row.checkpoint_id
      ),
      v_row.shift_key,
      v_row.ship_id,
      v_row.checkpoint_id,
      v_row.ship_name
    )
    on conflict (client_event_id) do update
      set shift_key = excluded.shift_key,
          ship_id = excluded.ship_id,
          checkpoint_id = excluded.checkpoint_id,
          ship_name = coalesce(public.patrol_report_tombstones.ship_name, excluded.ship_name);

    v_tombstone_count := v_tombstone_count + 1;
  end loop;

  -- Tombstone "natural key" (shift_key=NULL) agar re-upsert dengan client_event_id baru tetap
  -- terblokir trigger (cabang natural key, TIME-GUARDED). Ditulis walau tak ada baris ditemukan
  -- (race: baris temuan belum sempat masuk DB) supaya anti-resurrection tetap berlaku.
  if p_ship_id is not null and p_checkpoint_id is not null then
    insert into public.patrol_report_tombstones
      (client_event_id, shift_key, ship_id, checkpoint_id, ship_name)
    select
      'natural|' || p_ship_id || '|' || p_checkpoint_id,
      null,
      p_ship_id,
      p_checkpoint_id,
      coalesce((select ship_name from public.patrol_report_tombstones
                where ship_id = p_ship_id and checkpoint_id = p_checkpoint_id
                  and ship_name is not null limit 1),
               (select name from public.ships where id = p_ship_id))
    on conflict (client_event_id) do nothing;
  end if;

  -- Hapus baris (atomic dengan tombstone di atas). MODE A: HANYA baris id. MODE B: HANYA temuan.
  -- Baris AMAN & baris shift lain TIDAK PERNAH terhapus oleh penghapusan temuan.
  delete from public.patrol_reports
  where (v_firestore_uuid is not null and id = v_firestore_uuid)
     or (v_firestore_uuid is null
         and p_ship_id is not null and p_checkpoint_id is not null
         and ship_id = p_ship_id and checkpoint_id = p_checkpoint_id
         and result_type = 'temuan');

  get diagnostics v_deleted_count = row_count;

  return query select v_deleted_count, v_tombstone_count, v_rows_seen;
end;
$$;

grant execute on function public.admin_delete_patrol_report_findings(text, text, text) to authenticated;
