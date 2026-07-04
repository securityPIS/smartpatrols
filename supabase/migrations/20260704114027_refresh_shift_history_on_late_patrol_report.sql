-- Tujuan: Rebuild shift_history_entries saat laporan patroli masuk terlambat setelah finalisasi shift.
-- Caller: Trigger patrol_reports setelah insert/update, dan wrapper finalize_shift yang dipanggil pg_cron.
-- Dependensi: public.ships, public.patrol_reports, public.shift_history_entries.
-- Main Functions: finalize_shift_for_ship, finalize_shift, refresh_shift_history_after_late_patrol_report.
-- Side Effects: Meng-upsert ulang satu history kapal/shift ketika row patrol_reports datang setelah jam akhir shift.

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
          'shipName',          v_ship.name
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

create or replace function public.finalize_shift(p_shift_id text, p_date_key text)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.finalize_shift_for_ship(p_shift_id, p_date_key, null);
end;
$$;

create or replace function public.refresh_shift_history_after_late_patrol_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift_key text;
  v_date_key text;
  v_shift_id text;
  v_now_wib timestamp;
  v_shift_end_wib timestamp;
begin
  v_shift_key := coalesce(new.shift_key, '');
  v_date_key := split_part(v_shift_key, '|', 1);
  v_shift_id := split_part(v_shift_key, '|', 2);

  if v_date_key = '' or v_shift_id = '' or new.ship_id is null or new.ship_id = '' then
    return new;
  end if;

  begin
    v_now_wib := now() at time zone 'Asia/Jakarta';
    v_shift_end_wib := case v_shift_id
      when 'shift-1-active' then (v_date_key::date + time '12:00')
      when 'shift-2-active' then (v_date_key::date + time '18:00')
      when 'shift-3-active' then (v_date_key::date + interval '1 day' + time '06:00')
      else null
    end;
  exception when others then
    return new;
  end;

  if v_shift_end_wib is null or v_now_wib < v_shift_end_wib then
    return new;
  end if;

  perform public.finalize_shift_for_ship(v_shift_id, v_date_key, new.ship_id);
  return new;
end;
$$;

drop trigger if exists refresh_shift_history_after_late_patrol_report_trg on public.patrol_reports;
create trigger refresh_shift_history_after_late_patrol_report_trg
after insert or update on public.patrol_reports
for each row
when (new.status = 'completed')
execute function public.refresh_shift_history_after_late_patrol_report();

revoke all on function public.finalize_shift_for_ship(text, text, text) from public;
revoke all on function public.refresh_shift_history_after_late_patrol_report() from public;
