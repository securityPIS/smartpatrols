/*
Tujuan: Membuat schema SQL SmartPatrol untuk Supabase/Postgres dengan RLS ketat.
Caller: Supabase CLI `supabase db reset` dan Supabase Cloud migration runner.
Dependensi: Supabase Auth, Storage schema, dan Realtime publication.
Main Functions: Enum role/status/review, tabel operasional, index, trigger updated_at, RLS policy, bucket storage, dan realtime publication.
Side Effects: Membuat/menimpa fungsi helper authorization dan mengaktifkan RLS pada seluruh tabel operasional.
*/

create extension if not exists "pgcrypto";

do $$
begin
  create type public.app_role as enum ('ADMIN', 'PIC', 'PETUGAS');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.operational_status as enum ('active', 'off-duty', 'disabled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.review_state as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id text primary key,
  auth_uid uuid unique,
  email text unique not null,
  name text not null,
  role public.app_role not null default 'PETUGAS',
  status public.operational_status not null default 'off-duty',
  review_state public.review_state not null default 'approved',
  enabled boolean not null default false,
  ship_assigned text,
  type text not null default 'BUJP',
  worker_number text not null default '',
  phone text not null default '',
  dob text not null default '',
  address text not null default '',
  office_address text not null default '',
  emergency_name text not null default '',
  emergency_contact text not null default '',
  emergency_relation text not null default 'Orang Tua',
  photo_url text,
  credential_updated_at timestamptz,
  duty_end_date date,
  duty_status text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_format check (position('@' in email) > 1),
  constraint profiles_petugas_assignment check (
    role <> 'PETUGAS'
    or status <> 'active'
    or ship_assigned is not null
  )
);

create table if not exists public.pending_registrations (
  uid text primary key,
  email text not null,
  name text not null,
  phone text not null default '',
  photo_url text,
  photo_path text not null default '',
  type text not null default 'BUJP',
  worker_number text not null default '',
  status public.review_state not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by text not null default '',
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pending_email_format check (position('@' in email) > 1)
);

create table if not exists public.ships (
  id text primary key,
  name text not null unique,
  type text not null default '',
  imo_number text not null default '',
  lat text not null default '',
  lng text not null default '',
  status text not null default 'Non Operasional',
  route text not null default '',
  route_loading text not null default '',
  route_discharge text not null default '',
  cargo_type text not null default '',
  cargo_amount text not null default '',
  photo_url text,
  personnel jsonb not null default '[]'::jsonb,
  personnel_next_month jsonb not null default '[]'::jsonb,
  personnel_schedules jsonb not null default '{}'::jsonb,
  custom_checkpoints jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  sos_recipient_ship_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ship_personnel_assignments (
  id uuid primary key default gen_random_uuid(),
  ship_id text not null references public.ships(id) on delete cascade,
  profile_id text not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  starts_on date,
  ends_on date,
  schedule_kind text not null default 'current',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ship_id, profile_id, schedule_kind)
);

create table if not exists public.ship_checkpoints (
  id text primary key,
  ship_id text not null references public.ships(id) on delete cascade,
  name text not null,
  description text not null default '',
  is_default boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shift_status_records (
  id uuid primary key default gen_random_uuid(),
  client_event_id text unique not null,
  ship_id text not null references public.ships(id) on delete cascade,
  ship_name text not null,
  shift_key text not null,
  filled_by_user_id text references public.profiles(id),
  filled_by_name text not null default '',
  filled_at_trusted_ms bigint,
  filled_at_trusted_iso timestamptz,
  time_trust_level text not null default 'unverified',
  clock_tamper_detected boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ship_id, shift_key)
);

create table if not exists public.shift_status_items (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.shift_status_records(id) on delete cascade,
  profile_id text references public.profiles(id),
  name text not null,
  role public.app_role not null default 'PETUGAS',
  status text not null check (status in ('patroli', 'istirahat')),
  created_at timestamptz not null default now()
);

create table if not exists public.patrol_reports (
  id uuid primary key default gen_random_uuid(),
  client_event_id text unique not null,
  shift_key text not null,
  ship_id text not null references public.ships(id) on delete cascade,
  checkpoint_id text not null,
  ship_name text not null,
  checkpoint_name text not null default '',
  status text not null check (status in ('pending', 'completed', 'missed')),
  result_type text check (result_type is null or result_type in ('aman', 'temuan', 'missed')),
  completed_by_user_id text references public.profiles(id),
  completed_by text,
  occurred_at_trusted_ms bigint,
  client_updated_at_ms bigint not null,
  server_updated_at timestamptz not null default now(),
  media_status text not null default 'none' check (media_status in ('none', 'uploading', 'ready', 'failed')),
  photo_url text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_key, ship_id, checkpoint_id)
);

create table if not exists public.patrol_report_photos (
  id text primary key,
  report_id uuid references public.patrol_reports(id) on delete cascade,
  ship_id text not null references public.ships(id) on delete cascade,
  object_path text not null,
  photo_url text,
  author_id text references public.profiles(id),
  occurred_at_trusted_ms bigint,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.incidents (
  id text primary key,
  client_event_id text unique not null,
  ship_name text not null default '',
  status text not null default 'open' check (status in ('open', 'closed', 'active', 'resolved')),
  location text not null default '',
  reported_by text not null default '',
  occurred_at_trusted_ms bigint,
  client_updated_at_ms bigint not null,
  server_updated_at timestamptz not null default now(),
  photo_url text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.incident_progress (
  id text primary key,
  incident_id text not null references public.incidents(id) on delete cascade,
  author_id text references public.profiles(id),
  status text not null default '',
  comment text not null default '',
  photo_url text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.incident_documentation (
  id text primary key,
  incident_id text not null references public.incidents(id) on delete cascade,
  author_id text references public.profiles(id),
  notes text not null default '',
  photo_url text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sos_alerts (
  id text primary key,
  client_event_id text unique not null,
  triggered_by text references public.profiles(id),
  ship_name text not null default '',
  lat text not null default '',
  lng text not null default '',
  status text not null default 'active' check (status in ('active', 'acknowledged', 'resolved')),
  triggered_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sos_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  sos_id text not null references public.sos_alerts(id) on delete cascade,
  acknowledged_by text references public.profiles(id),
  acknowledged_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  unique (sos_id, acknowledged_by)
);

create table if not exists public.notifications (
  id text primary key,
  target_user_id text references public.profiles(id),
  target_role public.app_role,
  ship_name text,
  type text not null,
  title text not null,
  body text not null default '',
  read boolean not null default false,
  tone text not null default 'info',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  object_path text not null,
  owner_id text,
  ship_id text references public.ships(id) on delete set null,
  domain text not null default 'operational',
  mime_type text,
  byte_size bigint,
  signed_url_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, object_path)
);

create table if not exists public.client_mutations (
  client_event_id text primary key,
  mutation_type text not null,
  client_updated_at_ms bigint not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id text,
  event_type text not null,
  entity_table text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_auth_uid_idx on public.profiles(auth_uid);
create index if not exists profiles_role_status_idx on public.profiles(role, status);
create index if not exists profiles_ship_assigned_idx on public.profiles(ship_assigned);
create index if not exists ships_name_idx on public.ships(name);
create index if not exists patrol_reports_shift_ship_idx on public.patrol_reports(shift_key, ship_id);
create index if not exists patrol_reports_ship_name_idx on public.patrol_reports(ship_name);
create index if not exists incidents_ship_status_idx on public.incidents(ship_name, status);
create index if not exists sos_alerts_status_idx on public.sos_alerts(status, triggered_at desc);
create index if not exists notifications_target_idx on public.notifications(target_user_id, read, created_at desc);
create index if not exists media_assets_owner_idx on public.media_assets(owner_id, domain);
create index if not exists client_mutations_type_idx on public.client_mutations(mutation_type, created_at desc);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_pending_registrations_updated_at on public.pending_registrations;
create trigger set_pending_registrations_updated_at before update on public.pending_registrations
for each row execute function public.set_updated_at();

drop trigger if exists set_ships_updated_at on public.ships;
create trigger set_ships_updated_at before update on public.ships
for each row execute function public.set_updated_at();

drop trigger if exists set_patroL_reports_updated_at on public.patrol_reports;
create trigger set_patroL_reports_updated_at before update on public.patrol_reports
for each row execute function public.set_updated_at();

drop trigger if exists set_incidents_updated_at on public.incidents;
create trigger set_incidents_updated_at before update on public.incidents
for each row execute function public.set_updated_at();

drop trigger if exists set_sos_alerts_updated_at on public.sos_alerts;
create trigger set_sos_alerts_updated_at before update on public.sos_alerts
for each row execute function public.set_updated_at();

drop trigger if exists set_notifications_updated_at on public.notifications;
create trigger set_notifications_updated_at before update on public.notifications
for each row execute function public.set_updated_at();

drop trigger if exists set_media_assets_updated_at on public.media_assets;
create trigger set_media_assets_updated_at before update on public.media_assets
for each row execute function public.set_updated_at();

create or replace function public.current_profile_id()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.id
  from public.profiles p
  where p.enabled = true
    and p.review_state = 'approved'
    and (p.auth_uid = auth.uid() or p.id = auth.uid()::text)
  limit 1
$$;

create or replace function public.current_profile_role()
returns public.app_role
language sql
security definer
set search_path = public
stable
as $$
  select p.role
  from public.profiles p
  where p.enabled = true
    and p.review_state = 'approved'
    and (p.auth_uid = auth.uid() or p.id = auth.uid()::text)
  limit 1
$$;

create or replace function public.current_profile_ship()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.ship_assigned
  from public.profiles p
  where p.enabled = true
    and p.review_state = 'approved'
    and (p.auth_uid = auth.uid() or p.id = auth.uid()::text)
  limit 1
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_profile_role() = 'ADMIN', false)
$$;

create or replace function public.has_operational_access()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.enabled = true
      and p.review_state = 'approved'
      and p.status <> 'disabled'
      and (p.auth_uid = auth.uid() or p.id = auth.uid()::text)
  )
$$;

create or replace function public.can_access_ship_name(target_ship_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    public.current_profile_role() = 'ADMIN'
    or (
      public.current_profile_role() in ('PIC', 'PETUGAS')
      and target_ship_name is not null
      and public.current_profile_ship() = target_ship_name
    ),
    false
  )
$$;

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_profile_ship() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_operational_access() to authenticated;
grant execute on function public.can_access_ship_name(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.pending_registrations enable row level security;
alter table public.ships enable row level security;
alter table public.ship_personnel_assignments enable row level security;
alter table public.ship_checkpoints enable row level security;
alter table public.shift_status_records enable row level security;
alter table public.shift_status_items enable row level security;
alter table public.patrol_reports enable row level security;
alter table public.patrol_report_photos enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_progress enable row level security;
alter table public.incident_documentation enable row level security;
alter table public.sos_alerts enable row level security;
alter table public.sos_acknowledgements enable row level security;
alter table public.notifications enable row level security;
alter table public.media_assets enable row level security;
alter table public.client_mutations enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists "profiles_read_operational" on public.profiles;
create policy "profiles_read_operational" on public.profiles
for select to authenticated
using (
  public.is_admin()
  or auth_uid = auth.uid()
  or id = auth.uid()::text
  or (public.has_operational_access() and ship_assigned = public.current_profile_ship())
);

drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "pending_owner_create" on public.pending_registrations;
create policy "pending_owner_create" on public.pending_registrations
for insert to authenticated
with check (
  uid = auth.uid()::text
  and status = 'pending'
);

drop policy if exists "pending_owner_or_admin_read" on public.pending_registrations;
create policy "pending_owner_or_admin_read" on public.pending_registrations
for select to authenticated
using (uid = auth.uid()::text or public.is_admin());

drop policy if exists "pending_admin_update" on public.pending_registrations;
create policy "pending_admin_update" on public.pending_registrations
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ships_read_assigned" on public.ships;
create policy "ships_read_assigned" on public.ships
for select to authenticated
using (public.is_admin() or public.can_access_ship_name(name));

drop policy if exists "ships_admin_write" on public.ships;
create policy "ships_admin_write" on public.ships
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ship_assignments_read_assigned" on public.ship_personnel_assignments;
create policy "ship_assignments_read_assigned" on public.ship_personnel_assignments
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.ships s
    where s.id = ship_id and public.can_access_ship_name(s.name)
  )
);

drop policy if exists "ship_assignments_admin_write" on public.ship_personnel_assignments;
create policy "ship_assignments_admin_write" on public.ship_personnel_assignments
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ship_checkpoints_read_assigned" on public.ship_checkpoints;
create policy "ship_checkpoints_read_assigned" on public.ship_checkpoints
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.ships s
    where s.id = ship_id and public.can_access_ship_name(s.name)
  )
);

drop policy if exists "ship_checkpoints_admin_write" on public.ship_checkpoints;
create policy "ship_checkpoints_admin_write" on public.ship_checkpoints
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "patrol_reports_read_assigned" on public.patrol_reports;
create policy "patrol_reports_read_assigned" on public.patrol_reports
for select to authenticated
using (public.can_access_ship_name(ship_name));

drop policy if exists "patrol_reports_write_assigned" on public.patrol_reports;
create policy "patrol_reports_write_assigned" on public.patrol_reports
for insert to authenticated
with check (public.can_access_ship_name(ship_name));

drop policy if exists "patrol_reports_update_assigned" on public.patrol_reports;
create policy "patrol_reports_update_assigned" on public.patrol_reports
for update to authenticated
using (public.can_access_ship_name(ship_name))
with check (public.can_access_ship_name(ship_name));

drop policy if exists "patrol_photos_access_assigned" on public.patrol_report_photos;
create policy "patrol_photos_access_assigned" on public.patrol_report_photos
for all to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.ships s
    where s.id = ship_id and public.can_access_ship_name(s.name)
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.ships s
    where s.id = ship_id and public.can_access_ship_name(s.name)
  )
);

drop policy if exists "incidents_read_assigned" on public.incidents;
create policy "incidents_read_assigned" on public.incidents
for select to authenticated
using (public.is_admin() or ship_name = '' or public.can_access_ship_name(ship_name));

drop policy if exists "incidents_write_assigned" on public.incidents;
create policy "incidents_write_assigned" on public.incidents
for insert to authenticated
with check (public.is_admin() or ship_name = '' or public.can_access_ship_name(ship_name));

drop policy if exists "incidents_update_assigned" on public.incidents;
create policy "incidents_update_assigned" on public.incidents
for update to authenticated
using (public.is_admin() or ship_name = '' or public.can_access_ship_name(ship_name))
with check (public.is_admin() or ship_name = '' or public.can_access_ship_name(ship_name));

drop policy if exists "incidents_admin_delete" on public.incidents;
create policy "incidents_admin_delete" on public.incidents
for delete to authenticated
using (public.is_admin());

drop policy if exists "incident_progress_access_assigned" on public.incident_progress;
create policy "incident_progress_access_assigned" on public.incident_progress
for all to authenticated
using (
  exists (
    select 1 from public.incidents i
    where i.id = incident_id
      and (public.is_admin() or i.ship_name = '' or public.can_access_ship_name(i.ship_name))
  )
)
with check (
  exists (
    select 1 from public.incidents i
    where i.id = incident_id
      and (public.is_admin() or i.ship_name = '' or public.can_access_ship_name(i.ship_name))
  )
);

drop policy if exists "incident_documentation_access_assigned" on public.incident_documentation;
create policy "incident_documentation_access_assigned" on public.incident_documentation
for all to authenticated
using (
  exists (
    select 1 from public.incidents i
    where i.id = incident_id
      and (public.is_admin() or i.ship_name = '' or public.can_access_ship_name(i.ship_name))
  )
)
with check (
  exists (
    select 1 from public.incidents i
    where i.id = incident_id
      and (public.is_admin() or i.ship_name = '' or public.can_access_ship_name(i.ship_name))
  )
);

drop policy if exists "sos_alerts_read_operational" on public.sos_alerts;
create policy "sos_alerts_read_operational" on public.sos_alerts
for select to authenticated
using (public.has_operational_access());

drop policy if exists "sos_alerts_write_assigned" on public.sos_alerts;
create policy "sos_alerts_write_assigned" on public.sos_alerts
for insert to authenticated
with check (public.is_admin() or ship_name = '' or public.can_access_ship_name(ship_name));

drop policy if exists "sos_alerts_update_operational" on public.sos_alerts;
create policy "sos_alerts_update_operational" on public.sos_alerts
for update to authenticated
using (public.has_operational_access())
with check (public.has_operational_access());

drop policy if exists "sos_ack_access_operational" on public.sos_acknowledgements;
create policy "sos_ack_access_operational" on public.sos_acknowledgements
for all to authenticated
using (public.has_operational_access())
with check (public.has_operational_access());

drop policy if exists "notifications_read_target" on public.notifications;
create policy "notifications_read_target" on public.notifications
for select to authenticated
using (
  public.is_admin()
  or target_user_id = public.current_profile_id()
  or target_role = public.current_profile_role()
  or (ship_name is not null and public.can_access_ship_name(ship_name))
);

drop policy if exists "notifications_operational_insert" on public.notifications;
create policy "notifications_operational_insert" on public.notifications
for insert to authenticated
with check (public.has_operational_access());

drop policy if exists "notifications_target_update" on public.notifications;
create policy "notifications_target_update" on public.notifications
for update to authenticated
using (public.is_admin() or target_user_id = public.current_profile_id())
with check (public.is_admin() or target_user_id = public.current_profile_id());

drop policy if exists "media_assets_read_operational" on public.media_assets;
create policy "media_assets_read_operational" on public.media_assets
for select to authenticated
using (public.has_operational_access() or owner_id = auth.uid()::text);

drop policy if exists "media_assets_write_operational" on public.media_assets;
create policy "media_assets_write_operational" on public.media_assets
for all to authenticated
using (public.has_operational_access() or owner_id = auth.uid()::text)
with check (public.has_operational_access() or owner_id = auth.uid()::text);

drop policy if exists "client_mutations_operational_access" on public.client_mutations;
create policy "client_mutations_operational_access" on public.client_mutations
for all to authenticated
using (public.has_operational_access())
with check (public.has_operational_access());

drop policy if exists "audit_events_admin_read" on public.audit_events;
create policy "audit_events_admin_read" on public.audit_events
for select to authenticated
using (public.is_admin());

drop policy if exists "audit_events_operational_insert" on public.audit_events;
create policy "audit_events_operational_insert" on public.audit_events
for insert to authenticated
with check (public.has_operational_access());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('operational-assets', 'operational-assets', false, 12582912, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('registration-assets', 'registration-assets', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "storage_registration_owner_or_admin" on storage.objects;
create policy "storage_registration_owner_or_admin" on storage.objects
for all to authenticated
using (
  bucket_id = 'registration-assets'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
)
with check (
  bucket_id = 'registration-assets'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

drop policy if exists "storage_operational_assets_access" on storage.objects;
create policy "storage_operational_assets_access" on storage.objects
for all to authenticated
using (
  bucket_id = 'operational-assets'
  and public.has_operational_access()
)
with check (
  bucket_id = 'operational-assets'
  and public.has_operational_access()
);

alter table public.profiles replica identity full;
alter table public.ships replica identity full;
alter table public.patrol_reports replica identity full;
alter table public.incidents replica identity full;
alter table public.sos_alerts replica identity full;
alter table public.notifications replica identity full;
alter table public.client_mutations replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.ships;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.patrol_reports;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.incidents;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.sos_alerts;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.client_mutations;
exception
  when duplicate_object then null;
end $$;

-- Kebijakan RLS update registrasi mandiri
drop policy if exists "pending_owner_update" on public.pending_registrations;
create policy "pending_owner_update" on public.pending_registrations
for update to authenticated
using (uid = auth.uid()::text and status = 'pending')
with check (uid = auth.uid()::text and status = 'pending');

-- Kebijakan RLS update profil mandiri
drop policy if exists "profiles_owner_update" on public.profiles;
create policy "profiles_owner_update" on public.profiles
for update to authenticated
using (auth_uid = auth.uid() or id = auth.uid()::text)
with check (auth_uid = auth.uid() or id = auth.uid()::text);

-- Fungsi trigger membatasi modifikasi kolom sensitif oleh non-admin
create or replace function public.check_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and session_user <> 'postgres' then
    new.role := old.role;
    new.enabled := old.enabled;
    new.review_state := old.review_state;
    new.ship_assigned := old.ship_assigned;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_profile_update_restrictions on public.profiles;
create trigger enforce_profile_update_restrictions
before update on public.profiles
for each row execute function public.check_profile_update();

