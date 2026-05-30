-- Tujuan: Memblokir temuan lama yang sudah dihapus admin agar tidak hidup lagi dari device stale.
-- Caller: Supabase db push dan trigger patrol_reports sebelum insert/update.
-- Dependensi: public.patrol_reports, public.patrol_report_tombstones, payload completedAt.
-- Main Functions: patrol_report_completed_at, block_tombstoned_patrol_report.
-- Side Effects: Menghapus baris patrol_reports temuan lama yang cocok tombstone walau shift_key berbeda.

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
    where t.client_event_id = new.client_event_id
       or (
         t.ship_id = new.ship_id
         and t.checkpoint_id = new.checkpoint_id
         and t.shift_key is not distinct from new.shift_key
       )
       or (
         new.result_type = 'temuan'
         and t.ship_id = new.ship_id
         and t.checkpoint_id = new.checkpoint_id
         and t.shift_key is distinct from new.shift_key
         and v_completed_at is not null
         and v_completed_at <= t.deleted_at
       )
  ) then
    return null;
  end if;

  return new;
end;
$$;

with stale_tombstoned_reports as (
  select pr.id
  from public.patrol_reports pr
  join public.patrol_report_tombstones t
    on t.ship_id = pr.ship_id
   and t.checkpoint_id = pr.checkpoint_id
   and t.shift_key is distinct from pr.shift_key
  cross join lateral (
    select public.patrol_report_completed_at(
      pr.payload,
      pr.occurred_at_trusted_ms
    ) as completed_at
  ) parsed
  where pr.result_type = 'temuan'
    and parsed.completed_at is not null
    and parsed.completed_at <= t.deleted_at
)
delete from public.patrol_reports pr
using stale_tombstoned_reports stale
where pr.id = stale.id;
