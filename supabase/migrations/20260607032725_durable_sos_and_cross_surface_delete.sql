/*
Tujuan: Membuat SOS durable dan memastikan penghapusan temuan lintas surface tidak
        bergantung pada state lokal admin.
Caller: Supabase db push / workflow Deploy Supabase.
Dependensi: profiles, ships, sos_alerts, notifications, client_mutations,
            patrol_reports, patrol_report_tombstones, shift_history_entries.
Main Functions: create_operational_sos_alert, resolve_operational_sos_alert,
        admin_delete_patrol_report_findings, purge_tombstoned_patrol_finding_surfaces.
Side Effects: Menulis SOS/notifikasi durable, memperkaya tombstone, dan membersihkan
        salinan incident/history yang cocok dengan tombstone patrol.
*/

alter table public.patrol_report_tombstones
  add column if not exists incident_id text,
  add column if not exists checkpoint_name text;

create index if not exists patrol_report_tombstones_incident_idx
  on public.patrol_report_tombstones (incident_id)
  where incident_id is not null;

create or replace function public.build_patrol_incident_id(
  p_checkpoint_id text,
  p_payload jsonb,
  p_occurred_at_trusted_ms bigint
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_existing text;
  v_completed_at timestamptz;
  v_checkpoint_token text;
  v_completed_token text;
begin
  v_existing := nullif(p_payload ->> 'incidentId', '');
  if v_existing is not null then
    return v_existing;
  end if;

  v_checkpoint_token := lower(regexp_replace(coalesce(nullif(p_checkpoint_id, ''), 'checkpoint'), '[^a-zA-Z0-9]+', '-', 'g'));
  v_checkpoint_token := trim(both '-' from v_checkpoint_token);
  if v_checkpoint_token = '' then
    v_checkpoint_token := 'checkpoint';
  end if;

  v_completed_at := public.patrol_report_completed_at(p_payload, p_occurred_at_trusted_ms);
  if v_completed_at is not null then
    v_completed_token := lower(regexp_replace(to_char(v_completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24-MI-SS-MS"Z"'), '[^a-zA-Z0-9]+', '-', 'g'));
    v_completed_token := trim(both '-' from v_completed_token);
    return 'p-' || v_checkpoint_token || '-' || v_completed_token;
  end if;

  return 'p-' || v_checkpoint_token;
end;
$$;

create or replace function public.create_operational_sos_alert(
  p_sos_id text,
  p_client_event_id text,
  p_ship_name text,
  p_lat text default null,
  p_lng text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_ship public.ships%rowtype;
  v_target_ship_names text[] := array[]::text[];
  v_target_user_ids text[] := array[]::text[];
  v_payload jsonb;
  v_triggered_at timestamptz;
  v_notification_base text;
  v_target_user_id text;
begin
  select *
    into v_actor
    from public.profiles p
   where p.enabled = true
     and p.review_state = 'approved'
     and p.status <> 'disabled'
     and (p.auth_uid = auth.uid() or p.id = auth.uid()::text)
   limit 1;

  if v_actor.id is null then
    raise exception 'permission denied: operational profile required';
  end if;

  if nullif(p_sos_id, '') is null or nullif(p_client_event_id, '') is null then
    raise exception 'sos id and client_event_id are required';
  end if;

  select *
    into v_ship
    from public.ships s
   where s.name = coalesce(nullif(p_ship_name, ''), v_actor.ship_assigned)
   limit 1;

  if v_ship.id is null then
    raise exception 'ship not found for sos alert';
  end if;

  if v_actor.role <> 'ADMIN' and v_actor.ship_assigned is distinct from v_ship.name then
    raise exception 'permission denied: ship mismatch';
  end if;

  select array_agg(distinct ship_name order by ship_name)
    into v_target_ship_names
    from (
      select v_ship.name as ship_name
      union
      select s.name
        from public.ships s
       where s.id in (
         select jsonb_array_elements_text(coalesce(v_ship.sos_recipient_ship_ids, '[]'::jsonb))
       )
    ) names
   where ship_name is not null and ship_name <> '';

  select array_agg(distinct p.id order by p.id)
    into v_target_user_ids
    from public.profiles p
   where p.enabled = true
     and p.review_state = 'approved'
     and p.status <> 'disabled'
     and p.id <> v_actor.id
     and (
       p.role = 'ADMIN'
       or p.role = 'PIC'
       or (
         p.role = 'PETUGAS'
         and p.status = 'active'
         and p.ship_assigned = any(coalesce(v_target_ship_names, array[v_ship.name]))
       )
     );

  v_target_ship_names := coalesce(v_target_ship_names, array[v_ship.name]);
  v_target_user_ids := coalesce(v_target_user_ids, array[]::text[]);
  v_triggered_at := coalesce(
    nullif(p_payload ->> 'triggeredAt', '')::timestamptz,
    nullif(p_payload ->> 'createdAt', '')::timestamptz,
    now()
  );

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'id', p_sos_id,
      'senderUserId', v_actor.id,
      'senderName', v_actor.name,
      'senderRole', v_actor.role,
      'shipName', v_ship.name,
      'lat', p_lat,
      'lng', p_lng,
      'triggeredAt', v_triggered_at,
      'createdAt', coalesce(p_payload ->> 'createdAt', v_triggered_at::text),
      'updatedAt', coalesce(p_payload ->> 'updatedAt', v_triggered_at::text),
      'targetUserIds', to_jsonb(v_target_user_ids),
      'targetShipNames', to_jsonb(v_target_ship_names),
      'targetShipIds', to_jsonb((
        select coalesce(array_agg(id order by id), array[]::text[])
          from public.ships
         where name = any(v_target_ship_names)
      )),
      'status', 'active',
      'confirmedBy', coalesce(p_payload -> 'confirmedBy', '[]'::jsonb)
    );

  insert into public.sos_alerts (
    id,
    client_event_id,
    triggered_by,
    ship_name,
    lat,
    lng,
    status,
    triggered_at,
    payload
  )
  values (
    p_sos_id,
    p_client_event_id,
    v_actor.id,
    v_ship.name,
    coalesce(p_lat, ''),
    coalesce(p_lng, ''),
    'active',
    v_triggered_at,
    v_payload
  )
  on conflict (id) do update
    set ship_name = excluded.ship_name,
        lat = excluded.lat,
        lng = excluded.lng,
        status = 'active',
        triggered_at = excluded.triggered_at,
        payload = excluded.payload,
        updated_at = now();

  v_notification_base := 'sos:' || p_sos_id;
  foreach v_target_user_id in array v_target_user_ids loop
    insert into public.notifications (
      id,
      target_user_id,
      target_role,
      ship_name,
      type,
      title,
      body,
      read,
      tone,
      payload,
      created_at
    )
    values (
      v_notification_base || '::' || v_target_user_id,
      v_target_user_id,
      null,
      v_ship.name,
      'sos',
      'SOS Darurat',
      'Tanda darurat dikirim oleh ' || coalesce(v_actor.name, 'Petugas') || ' dari ' || v_ship.name || '.',
      false,
      'critical',
      jsonb_build_object(
        'baseId', v_notification_base,
        'id', v_notification_base,
        'type', 'sos',
        'title', 'SOS Darurat',
        'message', 'Tanda darurat dikirim oleh ' || coalesce(v_actor.name, 'Petugas') || ' dari ' || v_ship.name || '.',
        'senderName', v_actor.name,
        'senderRole', v_actor.role,
        'targetUserIds', to_jsonb(v_target_user_ids),
        'readByUserIds', '[]'::jsonb,
        'route', 'incidents/detail',
        'routeParams', jsonb_build_object('incidentId', p_sos_id),
        'incidentId', p_sos_id,
        'shipName', v_ship.name,
        'createdAt', v_triggered_at
      ),
      v_triggered_at
    )
    on conflict (id) do nothing;
  end loop;

  insert into public.client_mutations (
    client_event_id,
    mutation_type,
    client_updated_at_ms,
    payload,
    created_by
  )
  values (
    'signal-sos-' || p_sos_id,
    'sos_alerts',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    jsonb_build_object(
      'domain', 'sos_alerts',
      'reason', 'sos-active',
      'sosId', p_sos_id,
      'shipName', v_ship.name
    ),
    auth.uid()
  )
  on conflict (client_event_id) do update
    set client_updated_at_ms = excluded.client_updated_at_ms,
        payload = excluded.payload,
        created_at = now();

  return jsonb_build_object(
    'sos', v_payload,
    'targetUserIds', to_jsonb(v_target_user_ids),
    'targetShipNames', to_jsonb(v_target_ship_names),
    'notificationBaseId', v_notification_base
  );
end;
$$;

revoke execute on function public.create_operational_sos_alert(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_operational_sos_alert(text, text, text, text, text, jsonb) to authenticated;

create or replace function public.resolve_operational_sos_alert(
  p_sos_id text,
  p_payload jsonb default '{}'::jsonb,
  p_deleted boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_row public.sos_alerts%rowtype;
  v_payload jsonb;
  v_resolved_at timestamptz := now();
begin
  select *
    into v_actor
    from public.profiles p
   where p.enabled = true
     and p.review_state = 'approved'
     and p.status <> 'disabled'
     and (p.auth_uid = auth.uid() or p.id = auth.uid()::text)
   limit 1;

  if v_actor.id is null then
    raise exception 'permission denied: operational profile required';
  end if;

  select *
    into v_row
    from public.sos_alerts
   where id = p_sos_id
   limit 1;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'missing', true);
  end if;

  if not (
    v_actor.role = 'ADMIN'
    or public.can_access_ship_name(v_row.ship_name)
  ) then
    raise exception 'permission denied: sos ship mismatch';
  end if;

  v_payload := coalesce(v_row.payload, '{}'::jsonb)
    || coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'id', v_row.id,
      'status', 'resolved',
      'resolvedAt', coalesce(nullif(p_payload ->> 'resolvedAt', ''), v_resolved_at::text),
      'resolvedBy', coalesce(nullif(p_payload ->> 'resolvedBy', ''), v_actor.name),
      'updatedAt', coalesce(nullif(p_payload ->> 'updatedAt', ''), v_resolved_at::text),
      'deleted', p_deleted,
      'deletedAt', case when p_deleted then coalesce(nullif(p_payload ->> 'deletedAt', ''), v_resolved_at::text) else (p_payload ->> 'deletedAt') end
    );

  update public.sos_alerts
     set status = 'resolved',
         payload = v_payload,
         updated_at = now()
   where id = p_sos_id;

  insert into public.client_mutations (
    client_event_id,
    mutation_type,
    client_updated_at_ms,
    payload,
    created_by
  )
  values (
    'signal-sos-resolved-' || p_sos_id,
    'sos_alerts',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    jsonb_build_object(
      'domain', 'sos_alerts',
      'reason', case when p_deleted then 'sos-deleted' else 'sos-resolved' end,
      'sosId', p_sos_id,
      'deleted', p_deleted,
      'shipName', v_row.ship_name
    ),
    auth.uid()
  )
  on conflict (client_event_id) do update
    set client_updated_at_ms = excluded.client_updated_at_ms,
        payload = excluded.payload,
        created_at = now();

  return jsonb_build_object('ok', true, 'sos', v_payload);
end;
$$;

revoke execute on function public.resolve_operational_sos_alert(text, jsonb, boolean) from public, anon;
grant execute on function public.resolve_operational_sos_alert(text, jsonb, boolean) to authenticated;

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
    select
      id,
      client_event_id,
      shift_key,
      ship_id,
      checkpoint_id,
      ship_name,
      checkpoint_name,
      public.build_patrol_incident_id(checkpoint_id, payload, occurred_at_trusted_ms) as incident_id
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
      'incident_id', v_row.incident_id
    );

    insert into public.patrol_report_tombstones (
      client_event_id,
      shift_key,
      ship_id,
      checkpoint_id,
      ship_name,
      incident_id,
      checkpoint_name,
      deleted_by
    )
    values (
      coalesce(
        nullif(v_row.client_event_id, ''),
        v_row.shift_key || '|' || v_row.ship_id || '|' || v_row.checkpoint_id
      ),
      v_row.shift_key,
      v_row.ship_id,
      v_row.checkpoint_id,
      v_row.ship_name,
      v_row.incident_id,
      v_row.checkpoint_name,
      public.current_profile_id()
    )
    on conflict (client_event_id) do update
      set shift_key = excluded.shift_key,
          ship_id = excluded.ship_id,
          checkpoint_id = excluded.checkpoint_id,
          ship_name = coalesce(public.patrol_report_tombstones.ship_name, excluded.ship_name),
          incident_id = coalesce(public.patrol_report_tombstones.incident_id, excluded.incident_id),
          checkpoint_name = coalesce(public.patrol_report_tombstones.checkpoint_name, excluded.checkpoint_name),
          deleted_by = coalesce(public.patrol_report_tombstones.deleted_by, excluded.deleted_by);

    v_tombstone_count := v_tombstone_count + 1;
  end loop;

  if p_ship_id is not null and p_checkpoint_id is not null then
    insert into public.patrol_report_tombstones (
      client_event_id,
      shift_key,
      ship_id,
      checkpoint_id,
      ship_name,
      checkpoint_name,
      deleted_by
    )
    select
      'natural|' || p_ship_id || '|' || p_checkpoint_id,
      null,
      p_ship_id,
      p_checkpoint_id,
      coalesce((select ship_name from public.patrol_report_tombstones
                where ship_id = p_ship_id and checkpoint_id = p_checkpoint_id
                  and ship_name is not null limit 1),
               (select name from public.ships where id = p_ship_id)),
      coalesce((select checkpoint_name from public.patrol_report_tombstones
                where ship_id = p_ship_id and checkpoint_id = p_checkpoint_id
                  and checkpoint_name is not null limit 1),
               p_checkpoint_id),
      public.current_profile_id()
    on conflict (client_event_id) do update
      set ship_name = coalesce(public.patrol_report_tombstones.ship_name, excluded.ship_name),
          checkpoint_name = coalesce(public.patrol_report_tombstones.checkpoint_name, excluded.checkpoint_name),
          deleted_by = coalesce(public.patrol_report_tombstones.deleted_by, excluded.deleted_by);
  end if;

  delete from public.patrol_reports
  where (v_firestore_uuid is not null and id = v_firestore_uuid)
     or (p_ship_id is not null and p_checkpoint_id is not null
         and ship_id = p_ship_id and checkpoint_id = p_checkpoint_id);

  get diagnostics v_deleted_count = row_count;

  return query select v_deleted_count, v_tombstone_count, v_rows_seen;
end;
$$;

revoke execute on function public.admin_delete_patrol_report_findings(text, text, text) from public, anon;
grant execute on function public.admin_delete_patrol_report_findings(text, text, text) to authenticated;

create or replace function public.purge_tombstoned_patrol_finding_surfaces()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_incident_ids text[];
begin
  v_incident_ids := array_remove(array[
    nullif(new.incident_id, ''),
    case
      when nullif(new.checkpoint_id, '') is not null
      then 'p-' || trim(both '-' from lower(regexp_replace(new.checkpoint_id, '[^a-zA-Z0-9]+', '-', 'g')))
      else null
    end
  ], null);

  if coalesce(array_length(v_incident_ids, 1), 0) > 0 then
    delete from public.incidents
     where id = any(v_incident_ids)
        or payload ->> 'patrolReportId' = new.client_event_id;
  end if;

  if new.ship_id is not null and new.checkpoint_id is not null and new.shift_key is not null then
    update public.shift_history_entries she
       set checkpoints = (
             select coalesce(jsonb_agg(checkpoint), '[]'::jsonb)
               from jsonb_array_elements(coalesce(she.checkpoints, '[]'::jsonb)) checkpoint
              where not (
                coalesce(checkpoint ->> 'id', checkpoint ->> 'checkpointId') = new.checkpoint_id
                and coalesce(checkpoint ->> 'shiftKey', she.shift_key) = new.shift_key
              )
           ),
           updated_at = now()
     where she.ship_id = new.ship_id
       and she.shift_key = new.shift_key;
  end if;

  return new;
end;
$$;

drop trigger if exists purge_tombstoned_patrol_finding_surfaces_trg on public.patrol_report_tombstones;
create trigger purge_tombstoned_patrol_finding_surfaces_trg
after insert or update on public.patrol_report_tombstones
for each row execute function public.purge_tombstoned_patrol_finding_surfaces();
