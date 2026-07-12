-- Tujuan: Sertakan gpsSnapshot, weatherSnapshot, dan field trusted-time ke checkpoint
--         di shift_history_entries agar History menampilkan data yang sama dengan
--         shift aktif (bukan "belum terekam" / "DATA LEGACY").
-- Latar: finalize_shift_for_ship membangun checkpoints JSONB dari patrol_reports, namun
--        jsonb_build_object cabang "completed" sebelumnya MEMBUANG snapshot GPS/cuaca dan
--        metadata trusted-time walau v_report (row patrol_reports) memuat semuanya di
--        kolom payload + occurred_at_trusted_ms.
-- Dependensi: public.ships, public.patrol_reports, public.shift_history_entries.
-- Side Effects: Mengganti definisi finalize_shift_for_ship, lalu backfill ulang seluruh
--               shift_history_entries yang sudah ada.

create or replace function public.finalize_shift_for_ship(
  p_shift_id text,
  p_date_key text,
  p_ship_id text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift_key    text;
  v_shift_label  text;
  v_time_range   text;
  v_ship         record;
  v_cp           record;
  v_report       record;
  v_checkpoints  jsonb;
  v_aman         int;
  v_temuan       int;
  v_missed       int;
  v_total        int;
  v_entries_touched int := 0;
  v_history_key  text;
  v_history_id   text;
  v_time_str     text;
  v_cp_id        text;
  v_slug         text;
  v_cp_name_key  text;
begin
  v_shift_key := p_date_key || '|' || p_shift_id;

  v_shift_label := case p_shift_id
    when 'shift-1-active' then 'Shift 1'
    when 'shift-2-active' then 'Shift 2'
    when 'shift-3-active' then 'Shift 3'
    else p_shift_id
  end;
  v_time_range := case p_shift_id
    when 'shift-1-active' then '06:00 - 12:00'
    when 'shift-2-active' then '12:00 - 18:00'
    when 'shift-3-active' then '18:00 - 06:00'
    else ''
  end;

  for v_ship in
    select s.id, s.name, s.custom_checkpoints
    from public.ships s
    where jsonb_typeof(s.custom_checkpoints) = 'array'
      and jsonb_array_length(s.custom_checkpoints) > 0
      and (p_ship_id is null or s.id = p_ship_id)
  loop
    v_total := jsonb_array_length(v_ship.custom_checkpoints);
    if v_total = 0 then continue; end if;

    if not exists (
      select 1
      from public.patrol_reports
      where shift_key = v_shift_key
        and ship_id = v_ship.id
    ) then
      continue;
    end if;

    v_history_key := regexp_replace(lower(v_ship.id), '[^a-z0-9]+', '-', 'g') || '|' || v_shift_key;
    v_history_id  := 'history-' || v_history_key;

    v_checkpoints := '[]'::jsonb;
    v_aman   := 0;
    v_temuan := 0;
    v_missed := 0;

    for v_cp in
      select
        elem.value ->> 'name' as cp_name,
        elem.idx              as cp_index
      from jsonb_array_elements(v_ship.custom_checkpoints) with ordinality as elem(value, idx)
    loop
      v_slug := regexp_replace(
                  regexp_replace(lower(coalesce(v_cp.cp_name, '')), '[^a-z0-9]+', '-', 'g'),
                  '(^-|-$)', '', 'g');
      if v_slug = '' then
        v_slug := 'checkpoint-' || v_cp.cp_index;
      end if;
      v_cp_id := v_ship.id || '::' || v_slug || '::' || v_cp.cp_index;
      v_cp_name_key := regexp_replace(lower(btrim(coalesce(v_cp.cp_name, ''))), '\s+', ' ', 'g');

      select *
      into v_report
      from public.patrol_reports
      where shift_key = v_shift_key
        and ship_id   = v_ship.id
        and (
          regexp_replace(lower(btrim(checkpoint_name)), '\s+', ' ', 'g') = v_cp_name_key
          or checkpoint_id = v_cp_id
        )
      order by (status = 'completed') desc, occurred_at_trusted_ms desc nulls last
      limit 1;

      if v_report.id is not null and v_report.status = 'completed' then
        if v_report.occurred_at_trusted_ms is not null then
          v_time_str := to_char(
            to_timestamp(v_report.occurred_at_trusted_ms / 1000.0) at time zone 'Asia/Jakarta',
            'HH24:MI'
          );
        else
          v_time_str := null;
        end if;

        if v_report.result_type = 'temuan' then
          v_temuan := v_temuan + 1;
        else
          v_aman := v_aman + 1;
        end if;

        -- Snapshot GPS/cuaca dan metadata trusted-time diambil dari row patrol_reports
        -- (payload JSONB + kolom occurred_at_trusted_ms) supaya History memuat data yang
        -- sama dengan tampilan shift aktif. Laporan lama tanpa data di payload otomatis
        -- menghasilkan null (tetap tampil "belum terekam", benar).
        v_checkpoints := v_checkpoints || jsonb_build_object(
          'id',                coalesce(v_report.checkpoint_id, v_cp_id),
          'name',              v_cp.cp_name,
          'status',            'completed',
          'resultType',        coalesce(v_report.result_type, 'aman'),
          'completedBy',       coalesce(v_report.completed_by, ''),
          'completedByUserId', coalesce(v_report.completed_by_user_id, ''),
          'time',              v_time_str,
          'photoUrl',          v_report.photo_url,
          'historyId',         v_history_id,
          'readOnly',          true,
          'date',              p_date_key,
          'shipName',          v_ship.name,
          'gpsSnapshot',         v_report.payload -> 'gpsSnapshot',
          'gpsPending',          coalesce(v_report.payload -> 'gpsPending', 'false'::jsonb),
          'weatherSnapshot',     v_report.payload -> 'weatherSnapshot',
          'occurredAtTrustedMs', v_report.occurred_at_trusted_ms,
          'timeTrustLevel',      v_report.payload ->> 'timeTrustLevel',
          'verificationStatus',  v_report.payload ->> 'verificationStatus',
          'receivedAtServerMs',  v_report.payload -> 'receivedAtServerMs',
          'clockTamperDetected', coalesce(v_report.payload -> 'clockTamperDetected', 'false'::jsonb)
        );
      else
        v_missed := v_missed + 1;
        v_checkpoints := v_checkpoints || jsonb_build_object(
          'id',        v_cp_id,
          'name',      v_cp.cp_name,
          'status',    'missed',
          'resultType','missed',
          'completedBy', null,
          'time',      null,
          'photoUrl',  null,
          'historyId', v_history_id,
          'readOnly',  true,
          'date',      p_date_key,
          'shipName',  v_ship.name
        );
      end if;
    end loop;

    insert into public.shift_history_entries (
      shift_key, ship_id, ship_name,
      shift_id, shift_label, date_key, time_range,
      aman_count, temuan_count, missed_count, total_count,
      checkpoints, finalized_at
    ) values (
      v_shift_key, v_ship.id, v_ship.name,
      p_shift_id, v_shift_label, p_date_key, v_time_range,
      v_aman, v_temuan, v_missed, v_total,
      v_checkpoints, now()
    )
    on conflict (shift_key, ship_id) do update
      set ship_name = excluded.ship_name,
          shift_id = excluded.shift_id,
          shift_label = excluded.shift_label,
          date_key = excluded.date_key,
          time_range = excluded.time_range,
          aman_count = excluded.aman_count,
          temuan_count = excluded.temuan_count,
          missed_count = excluded.missed_count,
          total_count = excluded.total_count,
          checkpoints = excluded.checkpoints,
          finalized_at = excluded.finalized_at,
          updated_at = now();

    if found then
      v_entries_touched := v_entries_touched + 1;
    end if;
  end loop;

  return v_entries_touched;
end;
$$;

revoke all on function public.finalize_shift_for_ship(text, text, text) from public;

-- Backfill: rebuild seluruh shift_history_entries yang sudah ada agar checkpoint lama
-- yang laporannya memuat snapshot langsung menampilkan GPS/cuaca/trusted-time.
-- Idempoten: finalize_shift_for_ship membaca ulang patrol_reports dan meng-upsert
-- via on conflict.
do $$
declare
  r record;
begin
  for r in
    select distinct shift_id, date_key, ship_id
    from public.shift_history_entries
  loop
    perform public.finalize_shift_for_ship(r.shift_id, r.date_key, r.ship_id);
  end loop;
end $$;
