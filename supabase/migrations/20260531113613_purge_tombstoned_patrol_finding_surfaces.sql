-- Tujuan: Membersihkan semua permukaan temuan patroli yang sudah di-tombstone admin.
-- Caller: Supabase db push; trigger patrol_report_tombstones setelah insert/update.
-- Dependensi: public.patrol_report_tombstones, patrol_reports, incidents, shift_history_entries.
-- Main Functions: admin_delete_patrol_report_findings, purge_tombstoned_patrol_finding_surfaces.
-- Side Effects: Menghapus incidents patroli turunan dan menghapus checkpoint temuan dari snapshot history.

alter table public.patrol_report_tombstones
  add column if not exists incident_id text,
  add column if not exists checkpoint_name text;

update public.patrol_report_tombstones t
set checkpoint_name = coalesce(t.checkpoint_name, pr.checkpoint_name),
    incident_id = coalesce(t.incident_id, nullif(pr.payload ->> 'incidentId', ''))
from public.patrol_reports pr
where pr.ship_id = t.ship_id
  and pr.checkpoint_id = t.checkpoint_id
  and (t.shift_key is null or pr.shift_key = t.shift_key)
  and (t.checkpoint_name is null or t.incident_id is null);

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

  for v_row in
    select id, client_event_id, shift_key, ship_id, checkpoint_id, ship_name,
           checkpoint_name, payload
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
      'checkpoint_id', v_row.checkpoint_id,
      'checkpoint_name', v_row.checkpoint_name,
      'incident_id', nullif(v_row.payload ->> 'incidentId', '')
    );

    insert into public.patrol_report_tombstones
      (client_event_id, incident_id, shift_key, ship_id, checkpoint_id, checkpoint_name, ship_name)
    values (
      coalesce(
        nullif(v_row.client_event_id, ''),
        v_row.shift_key || '|' || v_row.ship_id || '|' || v_row.checkpoint_id
      ),
      nullif(v_row.payload ->> 'incidentId', ''),
      v_row.shift_key,
      v_row.ship_id,
      v_row.checkpoint_id,
      v_row.checkpoint_name,
      v_row.ship_name
    )
    on conflict (client_event_id) do update
      set incident_id = coalesce(public.patrol_report_tombstones.incident_id, excluded.incident_id),
          shift_key = excluded.shift_key,
          ship_id = excluded.ship_id,
          checkpoint_id = excluded.checkpoint_id,
          checkpoint_name = coalesce(public.patrol_report_tombstones.checkpoint_name, excluded.checkpoint_name),
          ship_name = coalesce(public.patrol_report_tombstones.ship_name, excluded.ship_name);

    v_tombstone_count := v_tombstone_count + 1;
  end loop;

  if p_ship_id is not null and p_checkpoint_id is not null then
    insert into public.patrol_report_tombstones
      (client_event_id, shift_key, ship_id, checkpoint_id, checkpoint_name, ship_name)
    select
      'natural|' || p_ship_id || '|' || p_checkpoint_id,
      null,
      p_ship_id,
      p_checkpoint_id,
      (select checkpoint_name from public.patrol_report_tombstones
       where ship_id = p_ship_id and checkpoint_id = p_checkpoint_id
         and checkpoint_name is not null limit 1),
      coalesce((select ship_name from public.patrol_report_tombstones
                where ship_id = p_ship_id and checkpoint_id = p_checkpoint_id
                  and ship_name is not null limit 1),
               (select name from public.ships where id = p_ship_id))
    on conflict (client_event_id) do update
      set checkpoint_name = coalesce(public.patrol_report_tombstones.checkpoint_name, excluded.checkpoint_name),
          ship_name = coalesce(public.patrol_report_tombstones.ship_name, excluded.ship_name);
  end if;

  delete from public.patrol_reports
  where (v_firestore_uuid is not null and id = v_firestore_uuid)
     or (p_ship_id is not null and p_checkpoint_id is not null
         and ship_id = p_ship_id and checkpoint_id = p_checkpoint_id);

  get diagnostics v_deleted_count = row_count;

  return query select v_deleted_count, v_tombstone_count, v_rows_seen;
end;
$$;

grant execute on function public.admin_delete_patrol_report_findings(text, text, text) to authenticated;

create or replace function public.purge_tombstoned_patrol_finding_surfaces()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.incidents i
  where i.payload ->> 'isPatrol' = 'true'
    and (
      (new.incident_id is not null and i.id = new.incident_id)
      or (
        (new.ship_name is null or new.ship_name = '' or i.ship_name = new.ship_name or i.payload ->> 'shipName' = new.ship_name)
        and (
          (new.checkpoint_id is not null and new.checkpoint_id <> '' and i.payload ->> 'checkpointId' = new.checkpoint_id)
          or (
            new.checkpoint_name is not null and new.checkpoint_name <> ''
            and lower(btrim(coalesce(i.payload ->> 'checkpointName', i.location, i.payload ->> 'location', ''))) = lower(btrim(new.checkpoint_name))
          )
        )
        and (
          (new.shift_key is not null and new.shift_key <> '' and i.payload ->> 'shiftKey' = new.shift_key)
          or public.patrol_report_completed_at(i.payload, i.occurred_at_trusted_ms) <= new.deleted_at
          or new.deleted_at >= now() - interval '1 hour'
        )
      )
    );

  with affected as (
    select
      she.id,
      coalesce(
        jsonb_agg(cp.value order by cp.ordinality) filter (
          where not (
            coalesce(cp.value ->> 'resultType', '') = 'temuan'
            and (
              (new.checkpoint_id is not null and new.checkpoint_id <> ''
               and (cp.value ->> 'id' = new.checkpoint_id or cp.value ->> 'checkpointId' = new.checkpoint_id))
              or (
                new.checkpoint_name is not null and new.checkpoint_name <> ''
                and lower(btrim(coalesce(cp.value ->> 'checkpointName', cp.value ->> 'name', ''))) = lower(btrim(new.checkpoint_name))
              )
            )
            and (
              (new.shift_key is not null and new.shift_key <> '' and cp.value ->> 'shiftKey' = new.shift_key)
              or public.patrol_report_completed_at(cp.value, null::bigint) <= new.deleted_at
              or new.deleted_at >= now() - interval '1 hour'
            )
          )
        ),
        '[]'::jsonb
      ) as checkpoints,
      count(*) filter (
        where coalesce(cp.value ->> 'resultType', '') = 'temuan'
          and (
            (new.checkpoint_id is not null and new.checkpoint_id <> ''
             and (cp.value ->> 'id' = new.checkpoint_id or cp.value ->> 'checkpointId' = new.checkpoint_id))
            or (
              new.checkpoint_name is not null and new.checkpoint_name <> ''
              and lower(btrim(coalesce(cp.value ->> 'checkpointName', cp.value ->> 'name', ''))) = lower(btrim(new.checkpoint_name))
            )
          )
          and (
            (new.shift_key is not null and new.shift_key <> '' and cp.value ->> 'shiftKey' = new.shift_key)
            or public.patrol_report_completed_at(cp.value, null::bigint) <= new.deleted_at
            or new.deleted_at >= now() - interval '1 hour'
          )
      ) as removed_count
    from public.shift_history_entries she
    cross join lateral jsonb_array_elements(she.checkpoints) with ordinality as cp(value, ordinality)
    where (new.ship_id is null or new.ship_id = '' or she.ship_id = new.ship_id)
      and (new.ship_name is null or new.ship_name = '' or she.ship_name = new.ship_name)
    group by she.id
  ),
  summarized as (
    select
      a.id,
      a.checkpoints,
      (select count(*) from jsonb_array_elements(a.checkpoints) c(value)
       where c.value ->> 'status' = 'completed' and c.value ->> 'resultType' = 'aman') as aman_count,
      (select count(*) from jsonb_array_elements(a.checkpoints) c(value)
       where c.value ->> 'status' = 'completed' and c.value ->> 'resultType' = 'temuan') as temuan_count,
      (select count(*) from jsonb_array_elements(a.checkpoints) c(value)
       where c.value ->> 'status' = 'missed' or c.value ->> 'resultType' = 'missed') as missed_count,
      (select count(*) from jsonb_array_elements(a.checkpoints)) as total_count
    from affected a
    where a.removed_count > 0
  )
  update public.shift_history_entries she
  set checkpoints = summarized.checkpoints,
      aman_count = summarized.aman_count,
      temuan_count = summarized.temuan_count,
      missed_count = summarized.missed_count,
      total_count = summarized.total_count,
      updated_at = now()
  from summarized
  where she.id = summarized.id;

  return new;
end;
$$;

revoke all on function public.purge_tombstoned_patrol_finding_surfaces() from public, anon, authenticated;

drop trigger if exists purge_tombstoned_patrol_finding_surfaces_trg on public.patrol_report_tombstones;
create trigger purge_tombstoned_patrol_finding_surfaces_trg
after insert or update on public.patrol_report_tombstones
for each row execute function public.purge_tombstoned_patrol_finding_surfaces();

-- Jalankan trigger untuk tombstone yang sudah ada agar device yang refresh tidak menerima
-- temuan lama dari tabel incidents atau snapshot history server-side.
update public.patrol_report_tombstones
set checkpoint_name = checkpoint_name;
