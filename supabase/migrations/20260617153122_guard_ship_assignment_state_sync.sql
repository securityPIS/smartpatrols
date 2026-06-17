/*
Tujuan: Menahan state-sync lama agar tidak menghapus assignment kru kapal.
Caller: Supabase migration runner.
Dependensi: profiles, ships, admin_set_ship_personnel_assignment, helper is_admin/current_profile_id.
Main Functions: smartpatrol_assignment_write_allowed, guard_profile_assignment_columns, guard_ship_assignment_columns.
Side Effects: Menambah trigger guard dan mengganti RPC assignment agar memakai flag transaksi internal.
*/

create or replace function public.smartpatrol_assignment_write_allowed()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(current_setting('smartpatrol.assignment_write', true), '') = 'on'
$$;

create or replace function public.guard_profile_assignment_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.role = 'PETUGAS'::public.app_role then
    new.ship_assigned := nullif(trim(coalesce(new.ship_assigned, '')), '');

    if public.smartpatrol_assignment_write_allowed() then
      if new.ship_assigned is not null and new.status <> 'disabled'::public.operational_status then
        new.status := 'active'::public.operational_status;
        new.enabled := true;
      end if;
      return new;
    end if;

    if old.ship_assigned is not null
      and new.ship_assigned is null
      and new.status <> 'disabled'::public.operational_status
    then
      new.ship_assigned := old.ship_assigned;
      new.status := 'active'::public.operational_status;
      new.enabled := true;
    elsif new.ship_assigned is not null
      and new.status <> 'disabled'::public.operational_status
    then
      new.status := 'active'::public.operational_status;
      new.enabled := true;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.guard_ship_assignment_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if not public.smartpatrol_assignment_write_allowed() then
    new.personnel := old.personnel;
    new.personnel_next_month := old.personnel_next_month;
    new.personnel_schedules := old.personnel_schedules;
    return new;
  end if;

  new.personnel := coalesce(new.personnel, '[]'::jsonb);
  new.personnel_next_month := coalesce(new.personnel_next_month, '[]'::jsonb);
  new.personnel_schedules := coalesce(new.personnel_schedules, '{}'::jsonb);
  return new;
end;
$$;

drop trigger if exists guard_profile_assignment_columns on public.profiles;
create trigger guard_profile_assignment_columns
before update of role, status, enabled, ship_assigned on public.profiles
for each row
execute function public.guard_profile_assignment_columns();

drop trigger if exists guard_ship_assignment_columns on public.ships;
create trigger guard_ship_assignment_columns
before update of personnel, personnel_next_month, personnel_schedules on public.ships
for each row
execute function public.guard_ship_assignment_columns();

create or replace function public.admin_set_ship_personnel_assignment(
  p_profile_id text,
  p_ship_id text default null,
  p_schedule_kind text default 'current',
  p_assign boolean default true,
  p_start_date date default null,
  p_end_date date default null,
  p_is_tbc boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_ship public.ships%rowtype;
  v_target_ship public.ships%rowtype;
  v_remaining_ship public.ships%rowtype;
  v_profile_id text := nullif(trim(coalesce(p_profile_id, '')), '');
  v_ship_id text := nullif(trim(coalesce(p_ship_id, '')), '');
  v_schedule_kind text := case when lower(coalesce(p_schedule_kind, 'current')) = 'next' then 'next' else 'current' end;
  v_current_ids text[];
  v_next_ids text[];
  v_next_schedules jsonb;
  v_schedule_payload jsonb;
  v_next_status public.operational_status;
  v_next_ship_assigned text;
  v_changed_ships jsonb := '[]'::jsonb;
  v_client_ms bigint := round(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if not public.is_admin() then
    raise exception 'permission-denied' using errcode = '42501';
  end if;

  perform set_config('smartpatrol.assignment_write', 'on', true);

  if v_profile_id is null then
    raise exception 'profile-required' using errcode = '22023';
  end if;

  select *
    into v_profile
    from public.profiles
   where id = v_profile_id
   for update;

  if not found then
    raise exception 'profile-not-found' using errcode = 'P0002';
  end if;

  if v_profile.role <> 'PETUGAS' then
    raise exception 'only-petugas-assignment-supported' using errcode = '22023';
  end if;

  if p_assign and v_ship_id is null then
    raise exception 'ship-required' using errcode = '22023';
  end if;

  if v_ship_id is not null then
    select *
      into v_target_ship
      from public.ships
     where id = v_ship_id
     for update;

    if not found then
      raise exception 'ship-not-found' using errcode = 'P0002';
    end if;
  end if;

  v_schedule_payload := jsonb_build_object(
    'startDate', coalesce(p_start_date::text, ''),
    'endDate', coalesce(p_end_date::text, ''),
    'isTBC', coalesce(p_is_tbc, false)
  );

  for v_ship in
    select *
      from public.ships
     order by id
     for update
  loop
    select coalesce(array_agg(value), array[]::text[])
      into v_current_ids
      from jsonb_array_elements_text(coalesce(v_ship.personnel, '[]'::jsonb)) as item(value);

    select coalesce(array_agg(value), array[]::text[])
      into v_next_ids
      from jsonb_array_elements_text(coalesce(v_ship.personnel_next_month, '[]'::jsonb)) as item(value);

    v_next_schedules := coalesce(v_ship.personnel_schedules, '{}'::jsonb);

    if v_schedule_kind = 'current' then
      if p_assign then
        v_current_ids := array_remove(v_current_ids, v_profile_id);
        v_next_ids := array_remove(v_next_ids, v_profile_id);
        v_next_schedules := v_next_schedules - v_profile_id;

        if v_ship.id = v_ship_id then
          if not v_profile_id = any(v_current_ids) then
            v_current_ids := array_append(v_current_ids, v_profile_id);
          end if;
          v_next_schedules := jsonb_set(v_next_schedules, array[v_profile_id], v_schedule_payload, true);
        end if;
      elsif v_ship_id is null or v_ship.id = v_ship_id then
        v_current_ids := array_remove(v_current_ids, v_profile_id);
        if not v_profile_id = any(v_next_ids) then
          v_next_schedules := v_next_schedules - v_profile_id;
        end if;
      end if;
    else
      if p_assign then
        v_next_ids := array_remove(v_next_ids, v_profile_id);
        if not v_profile_id = any(v_current_ids) then
          v_next_schedules := v_next_schedules - v_profile_id;
        end if;

        if v_ship.id = v_ship_id then
          if not v_profile_id = any(v_next_ids) then
            v_next_ids := array_append(v_next_ids, v_profile_id);
          end if;
          v_next_schedules := jsonb_set(v_next_schedules, array[v_profile_id], v_schedule_payload, true);
        end if;
      elsif v_ship_id is null or v_ship.id = v_ship_id then
        v_next_ids := array_remove(v_next_ids, v_profile_id);
        if not v_profile_id = any(v_current_ids) then
          v_next_schedules := v_next_schedules - v_profile_id;
        end if;
      end if;
    end if;

    if (
      to_jsonb(v_current_ids) is distinct from v_ship.personnel
      or to_jsonb(v_next_ids) is distinct from v_ship.personnel_next_month
      or v_next_schedules is distinct from v_ship.personnel_schedules
    ) then
      update public.ships
         set personnel = to_jsonb(v_current_ids),
             personnel_next_month = to_jsonb(v_next_ids),
             personnel_schedules = v_next_schedules
       where id = v_ship.id;

      v_changed_ships := v_changed_ships || jsonb_build_array(v_ship.id);
    end if;
  end loop;

  if v_schedule_kind = 'current' then
    select *
      into v_remaining_ship
      from public.ships
     where personnel ? v_profile_id
     order by name
     limit 1;

    v_next_ship_assigned := v_remaining_ship.name;
    v_next_status := case
      when v_profile.status = 'disabled' and v_next_ship_assigned is null then 'disabled'::public.operational_status
      when v_next_ship_assigned is not null then 'active'::public.operational_status
      else 'off-duty'::public.operational_status
    end;

    update public.profiles
       set ship_assigned = v_next_ship_assigned,
           status = v_next_status,
           enabled = case
             when v_next_status = 'disabled' then false
             else (v_next_status = 'active' and v_next_ship_assigned is not null)
           end
     where id = v_profile_id
     returning * into v_profile;
  end if;

  insert into public.audit_events (
    actor_id,
    event_type,
    entity_table,
    entity_id,
    payload
  ) values (
    public.current_profile_id(),
    'ship.assignment.sync',
    'profiles',
    v_profile_id,
    jsonb_build_object(
      'assign', p_assign,
      'scheduleKind', v_schedule_kind,
      'shipId', v_ship_id,
      'shipAssigned', v_profile.ship_assigned,
      'status', v_profile.status,
      'changedShips', v_changed_ships
    )
  );

  insert into public.client_mutations (
    client_event_id,
    mutation_type,
    client_updated_at_ms,
    payload,
    created_by
  ) values (
    'ship-assignment-' || v_client_ms::text || '-' || substr(md5(random()::text), 1, 8),
    'state-sync',
    v_client_ms,
    jsonb_build_object(
      'domain', 'app_state',
      'reason', 'ship-assignment',
      'profiles', 1,
      'ships', jsonb_array_length(v_changed_ships),
      'profileId', v_profile_id,
      'shipId', v_ship_id,
      'scheduleKind', v_schedule_kind
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'changedShipIds', v_changed_ships,
    'scheduleKind', v_schedule_kind
  );
end;
$$;

revoke all on function public.admin_set_ship_personnel_assignment(text, text, text, boolean, date, date, boolean) from public;
grant execute on function public.admin_set_ship_personnel_assignment(text, text, text, boolean, date, date, boolean) to authenticated;
