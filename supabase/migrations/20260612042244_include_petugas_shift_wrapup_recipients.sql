/*
Tujuan: Memastikan notifikasi Shift Wrap-Up juga menarget PETUGAS aktif sekapal.
Caller: Supabase migration runner; pg_cron tetap memanggil notify-shift-wrapup-shift-1/2/3.
Dependensi: profiles, ships.custom_checkpoints, shift_history_entries, patrol_reports,
            helper insert_notification_fanout dari migration notifikasi cron.
Main Functions: Replace public.notify_shift_wrapup(text,text) dengan penerima PIC + PETUGAS aktif.
Side Effects: Notifikasi wrap-up berikutnya menulis baris notifications untuk PETUGAS aktif
              sekapal sehingga trigger send-push punya target user yang memiliki token FCM.
*/

create or replace function public.notify_shift_wrapup(p_shift_id text, p_date_key text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shift_key      text;
  v_shift_label    text;
  v_time_range     text;
  v_ship           record;
  v_aman           int;
  v_temuan         int;
  v_missed         int;
  v_total          int;
  v_user_ids       text[];
  v_admin_ids      text[];
  v_admin_lines    text[];
  v_admin_body     text;
  v_pic_body       text;
  v_base_id        text;
  v_notif_at       timestamptz;
  v_total_inserted int := 0;
begin
  v_shift_key := p_date_key || '|' || p_shift_id;
  v_notif_at  := now();

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

  select array_agg(p.id) into v_admin_ids
  from public.profiles p
  where p.enabled = true
    and p.review_state = 'approved'
    and p.role = 'ADMIN';

  v_admin_lines := ARRAY[]::text[];

  for v_ship in
    select s.id, s.name, s.custom_checkpoints
    from public.ships s
    where jsonb_typeof(s.custom_checkpoints) = 'array'
      and jsonb_array_length(s.custom_checkpoints) > 0
    order by s.name
  loop
    select she.aman_count, she.temuan_count, she.missed_count, she.total_count
    into v_aman, v_temuan, v_missed, v_total
    from public.shift_history_entries she
    where she.shift_key = v_shift_key
      and she.ship_id   = v_ship.id;

    if not found then
      v_total := jsonb_array_length(v_ship.custom_checkpoints);
      if v_total = 0 then continue; end if;

      if not exists (
        select 1 from public.patrol_reports
        where shift_key = v_shift_key and ship_id = v_ship.id
      ) then continue; end if;

      select
        count(*) filter (where pr.status = 'completed' and coalesce(pr.result_type, 'aman') = 'aman'),
        count(*) filter (where pr.status = 'completed' and pr.result_type = 'temuan'),
        greatest(0, v_total - count(*) filter (where pr.status = 'completed'))
      into v_aman, v_temuan, v_missed
      from public.patrol_reports pr
      where pr.shift_key = v_shift_key
        and pr.ship_id   = v_ship.id;
    end if;

    v_admin_lines := v_admin_lines
      || format('🚢 %s: ✅ %s Aman, ⚠️ %s Temuan, ❌ %s Missed (total %s)',
                v_ship.name, v_aman, v_temuan, v_missed, v_total);

    -- Penerima per-kapal perlu mencakup PETUGAS aktif, karena token push produksi
    -- saat ini berada di device petugas. PIC tetap dipertahankan sesuai perilaku lama.
    select array_agg(p.id) into v_user_ids
    from public.profiles p
    where p.enabled = true
      and p.review_state = 'approved'
      and p.ship_assigned = v_ship.name
      and (
        p.role = 'PIC'
        or (p.role = 'PETUGAS' and p.status = 'active')
      );

    if v_user_ids is not null and array_length(v_user_ids, 1) > 0 then
      v_pic_body := format(
        '📋 Laporan Ringkasan Patroli %s (%s)%s🚢 %s: ✅ %s Aman, ⚠️ %s Temuan, ❌ %s Missed (total %s)',
        v_shift_label, v_time_range,
        E'\n',
        v_ship.name, v_aman, v_temuan, v_missed, v_total
      );
      v_base_id := 'shift-wrapup:' || v_ship.name || ':' || v_shift_key;

      v_total_inserted := v_total_inserted + public.insert_notification_fanout(
        p_base_id    => v_base_id,
        p_user_ids   => v_user_ids,
        p_ship_name  => v_ship.name,
        p_type       => 'shift_wrap_up',
        p_title      => format('📋 Shift selesai — %s %s', v_shift_label, v_ship.name),
        p_body       => v_pic_body,
        p_route      => 'history/list',
        p_shift_key  => v_shift_key,
        p_created_at => v_notif_at
      );
    end if;
  end loop;

  if v_admin_ids is not null
    and array_length(v_admin_ids, 1) > 0
    and array_length(v_admin_lines, 1) > 0
  then
    v_admin_body := format(
      '📋 Laporan Ringkasan Patroli %s (%s)%s%s',
      v_shift_label,
      v_time_range,
      E'\n',
      array_to_string(v_admin_lines, E'\n')
    );
    v_base_id := 'shift-wrapup-admin:' || v_shift_key;

    v_total_inserted := v_total_inserted + public.insert_notification_fanout(
      p_base_id    => v_base_id,
      p_user_ids   => v_admin_ids,
      p_ship_name  => null,
      p_type       => 'shift_wrap_up',
      p_title      => format('📋 Shift Wrap-Up — %s %s', v_shift_label, v_time_range),
      p_body       => v_admin_body,
      p_route      => 'history/list',
      p_shift_key  => v_shift_key,
      p_created_at => v_notif_at
    );
  end if;

  return v_total_inserted;
end;
$$;
