-- Tujuan: Penghapusan temuan oleh admin yang ATOMIC dan tidak bergantung shift_key client.
-- Caller: Frontend admin via supabase.rpc('admin_delete_patrol_report_findings', ...).
-- Dependensi: public.patrol_reports, public.patrol_report_tombstones, public.is_admin.
-- Main Functions: admin_delete_patrol_report_findings — SECURITY DEFINER, satu transaksi.
-- Side Effects: Tulis tombstone (dengan client_event_id + shift_key ASLI dari DB) + DELETE
--   baris patrol_reports yang cocok. Mengembalikan ringkasan baris yang dihapus.
--
-- Latar belakang:
--   Versi client-side (5 PR sebelumnya) menyusun delete sebagai 3 round-trip terpisah:
--   SELECT -> upsert tombstone -> DELETE. Bila salah satu langkah memakai shift_key
--   yang berbeda dari shift_key asli baris (mis. client mengirim shift_key shift aktif
--   sedangkan baris DB punya shift_key shift asal), DELETE tidak menemukan apa pun
--   dan tombstone tertulis dengan natural key salah — temuan hidup lagi setiap hydrate.
--
--   Function ini memindahkan SELECT, tombstone, DELETE ke satu transaksi server-side.
--   Client cukup mengirim (ship_id, checkpoint_id) — atau opsional id baris (uuid).
--   Function membaca shift_key + client_event_id ASLI dari DB untuk membentuk tombstone,
--   sehingga trigger anti-resurrection (migration 008/012) selalu mendapat kunci yang
--   benar untuk memblokir re-upsert dari device manapun.

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

  -- Kumpulkan semua baris yang relevan + tulis tombstone dengan data ASLI dari DB.
  -- Match by id (uuid) ATAU (ship_id + checkpoint_id) — sehingga DELETE menangkap
  -- baris yang shift_key-nya berbeda dari yang dikirim client.
  for v_row in
    select id, client_event_id, shift_key, ship_id, checkpoint_id, ship_name
    from public.patrol_reports
    where (v_firestore_uuid is not null and id = v_firestore_uuid)
       or (p_ship_id is not null and p_checkpoint_id is not null
           and ship_id = p_ship_id and checkpoint_id = p_checkpoint_id)
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

  -- Tombstone "natural key" tambahan agar re-upsert dengan client_event_id baru tetap
  -- terblokir oleh trigger (cocok via natural key cabang).
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

  -- Hapus baris (atomic dengan tombstone di atas — satu transaksi).
  delete from public.patrol_reports
  where (v_firestore_uuid is not null and id = v_firestore_uuid)
     or (p_ship_id is not null and p_checkpoint_id is not null
         and ship_id = p_ship_id and checkpoint_id = p_checkpoint_id);

  get diagnostics v_deleted_count = row_count;

  return query select v_deleted_count, v_tombstone_count, v_rows_seen;
end;
$$;

grant execute on function public.admin_delete_patrol_report_findings(text, text, text) to authenticated;
