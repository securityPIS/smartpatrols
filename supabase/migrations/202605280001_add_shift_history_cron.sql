/*
Tujuan: Membuat tabel shift_history_entries, fungsi finalize_shift, dan cron job otomatis
        agar history patroli terbentuk tepat saat shift berakhir — tanpa perlu app terbuka.
Caller: pg_cron (server-side) dan AppContextRuntime saat subscribe real-time.
Dependensi: pg_cron extension, tabel patrol_reports, ship_checkpoints, ships.
Main Functions:
  - shift_history_entries: tabel hasil finalisasi per shift per kapal
  - finalize_shift(shift_id, date_key): bangun snapshot history dari patrol_reports
  - 3 cron job: trigger finalize_shift di akhir Shift 1 (05:00 UTC), Shift 2 (11:00 UTC), Shift 3 (23:00 UTC)
Side Effects: Upsert ke shift_history_entries; cron job teregister di cron.job.
*/

-- ─────────────────────────────────────────────
-- 1. Extension
-- ─────────────────────────────────────────────
create extension if not exists pg_cron;

-- ─────────────────────────────────────────────
-- 2. Tabel shift_history_entries
-- ─────────────────────────────────────────────
create table if not exists public.shift_history_entries (
  id           uuid primary key default gen_random_uuid(),
  shift_key    text not null,
  ship_id      text not null references public.ships(id) on delete cascade,
  ship_name    text not null,
  shift_id     text not null,
  shift_label  text not null,
  date_key     text not null,
  time_range   text not null,
  aman_count   int  not null default 0,
  temuan_count int  not null default 0,
  missed_count int  not null default 0,
  total_count  int  not null default 0,
  checkpoints  jsonb not null default '[]'::jsonb,
  crew_snapshot jsonb not null default '[]'::jsonb,
  finalized_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (shift_key, ship_id)
);

create index if not exists shift_history_entries_date_idx
  on public.shift_history_entries (date_key desc);

create index if not exists shift_history_entries_ship_idx
  on public.shift_history_entries (ship_id);

-- updated_at trigger
drop trigger if exists set_shift_history_entries_updated_at on public.shift_history_entries;
create trigger set_shift_history_entries_updated_at
  before update on public.shift_history_entries
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────
alter table public.shift_history_entries enable row level security;

drop policy if exists "shift_history_read" on public.shift_history_entries;
create policy "shift_history_read"
  on public.shift_history_entries
  for select
  using (public.is_operational_user() or public.is_admin());

drop policy if exists "shift_history_service_write" on public.shift_history_entries;
create policy "shift_history_service_write"
  on public.shift_history_entries
  for all
  using (true)
  with check (true);

-- ─────────────────────────────────────────────
-- 4. Realtime
-- ─────────────────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.shift_history_entries;
exception when duplicate_object then null;
end $$;

alter table public.shift_history_entries replica identity full;

-- ─────────────────────────────────────────────
-- 5. Fungsi finalize_shift
-- ─────────────────────────────────────────────
create or replace function public.finalize_shift(p_shift_id text, p_date_key text)
returns int
language plpgsql
security definer
as $$
declare
  v_shift_key    text;
  v_shift_label  text;
  v_time_range   text;
  v_ship         record;
  v_checkpoint   record;
  v_report       record;
  v_checkpoints  jsonb;
  v_aman         int;
  v_temuan       int;
  v_missed       int;
  v_total        int;
  v_entries_created int := 0;
  v_history_key  text;
  v_history_id   text;
  v_time_str     text;
begin
  -- Bentuk shift_key (format sama dengan client: 'YYYY-MM-DD|shift-id')
  v_shift_key := p_date_key || '|' || p_shift_id;

  -- Label & time range sesuai definisi shift di AppContextRuntime
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

  -- Iterasi semua kapal yang punya checkpoint aktif
  for v_ship in
    select distinct s.id, s.name
    from public.ships s
    where exists (
      select 1 from public.ship_checkpoints sc
      where sc.ship_id = s.id and sc.active = true
    )
  loop
    -- Hitung total checkpoint aktif kapal ini
    select count(*) into v_total
    from public.ship_checkpoints
    where ship_id = v_ship.id and active = true;

    if v_total = 0 then continue; end if;

    -- Lewati kapal yang tidak ada laporan SAMA SEKALI di shift ini
    -- (berarti kapal tidak aktif pada shift tersebut)
    if not exists (
      select 1 from public.patrol_reports
      where shift_key = v_shift_key and ship_id = v_ship.id
    ) then
      continue;
    end if;

    -- Bentuk history_key dan history_id yang identik dengan client
    -- createHistoryEntryKey: shipToken|shiftKey
    -- shipToken = ship.id.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    v_history_key := regexp_replace(lower(v_ship.id), '[^a-z0-9]+', '-', 'g') || '|' || v_shift_key;
    v_history_id  := 'history-' || v_history_key;

    -- Build array checkpoints
    v_checkpoints := '[]'::jsonb;
    v_aman   := 0;
    v_temuan := 0;
    v_missed := 0;

    for v_checkpoint in
      select id, name
      from public.ship_checkpoints
      where ship_id = v_ship.id and active = true
      order by sort_order
    loop
      select *
      into v_report
      from public.patrol_reports
      where shift_key = v_shift_key
        and ship_id   = v_ship.id
        and checkpoint_id = v_checkpoint.id
      limit 1;

      if v_report is not null and v_report.status = 'completed' then
        -- Format waktu WIB
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
          'id',                v_checkpoint.id,
          'name',              v_checkpoint.name,
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
        -- Checkpoint tidak dikerjakan → missed
        v_missed := v_missed + 1;
        v_checkpoints := v_checkpoints || jsonb_build_object(
          'id',        v_checkpoint.id,
          'name',      v_checkpoint.name,
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

    -- Upsert — jangan timpa jika sudah ada (client mungkin sudah buat duluan)
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
    on conflict (shift_key, ship_id) do nothing;

    if found then
      v_entries_created := v_entries_created + 1;
    end if;

  end loop;

  return v_entries_created;
end;
$$;

-- ─────────────────────────────────────────────
-- 6. pg_cron jobs
--    Semua waktu dalam UTC. WIB = UTC+7, jadi kurangi 7 jam.
-- ─────────────────────────────────────────────

-- Hapus job lama dulu (idempoten agar migration aman diulang)
do $$
begin
  perform cron.unschedule(jobname)
  from cron.job
  where jobname in ('finalize-shift-1', 'finalize-shift-2', 'finalize-shift-3');
exception when others then null;
end $$;

-- Shift 1: berakhir 12:00 WIB → 05:00 UTC
-- date_key = tanggal Jakarta saat itu
select cron.schedule(
  'finalize-shift-1',
  '0 5 * * *',
  $$select public.finalize_shift(
    'shift-1-active',
    to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD')
  )$$
);

-- Shift 2: berakhir 18:00 WIB → 11:00 UTC
select cron.schedule(
  'finalize-shift-2',
  '0 11 * * *',
  $$select public.finalize_shift(
    'shift-2-active',
    to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD')
  )$$
);

-- Shift 3: berakhir 06:00 WIB keesokan hari → 23:00 UTC hari sebelumnya
-- Saat 23:00 UTC, WIB sudah 06:00 hari +1, maka date_key = hari WIB dikurangi 1
select cron.schedule(
  'finalize-shift-3',
  '0 23 * * *',
  $$select public.finalize_shift(
    'shift-3-active',
    to_char((now() at time zone 'Asia/Jakarta')::date - 1, 'YYYY-MM-DD')
  )$$
);
