/*
Tujuan: Optimasi egress Supabase dengan watermark sync ringan dan Realtime payload bertahap.
Caller: Frontend SmartPatrol via RPC get_operational_sync_watermarks dan Supabase Realtime.
Dependensi: profiles, ships, patrol_reports, incidents, sos_alerts, notifications, patrol_report_tombstones, RLS existing.
Main Functions: Menambah RPC watermark, index delta updated_at, dan menurunkan replica identity pada tabel aman.
Side Effects: Query watchdog menjadi ringan; Realtime old-row penuh dikurangi pada tabel yang tidak bergantung old payload.
*/

create or replace function public.get_operational_sync_watermarks(
  p_shift_key text default null,
  p_ship_id text default null,
  p_ship_name text default null
)
returns jsonb
language sql
security invoker
set search_path = public
stable
as $$
  select jsonb_build_object(
    'patrol_reports',
      (
        select max(pr.updated_at)
        from public.patrol_reports pr
        where (p_shift_key is null or pr.shift_key = p_shift_key)
          and (p_ship_id is null or pr.ship_id = p_ship_id)
          and (p_ship_name is null or pr.ship_name = p_ship_name)
      ),
    'incidents',
      (
        select max(i.updated_at)
        from public.incidents i
        where (p_ship_name is null or i.ship_name = '' or i.ship_name = p_ship_name)
      ),
    'sos_alerts',
      (
        select max(sa.updated_at)
        from public.sos_alerts sa
        where (p_ship_name is null or sa.ship_name = '' or sa.ship_name = p_ship_name)
      ),
    'notifications',
      (
        select max(n.updated_at)
        from public.notifications n
        where (p_ship_name is null or n.ship_name is null or n.ship_name = p_ship_name)
      ),
    'patrol_report_tombstones',
      (
        select max(t.deleted_at)
        from public.patrol_report_tombstones t
        where (p_ship_id is null or t.ship_id = p_ship_id)
          and (p_ship_name is null or t.ship_name is null or t.ship_name = p_ship_name)
      )
  );
$$;

grant execute on function public.get_operational_sync_watermarks(text, text, text) to authenticated;

create index if not exists patrol_reports_shift_ship_updated_idx
  on public.patrol_reports (shift_key, ship_id, updated_at desc);

create index if not exists patrol_reports_ship_name_updated_idx
  on public.patrol_reports (ship_name, updated_at desc);

create index if not exists incidents_ship_name_updated_idx
  on public.incidents (ship_name, updated_at desc);

create index if not exists sos_alerts_ship_name_updated_idx
  on public.sos_alerts (ship_name, updated_at desc);

create index if not exists notifications_ship_name_updated_idx
  on public.notifications (ship_name, updated_at desc);

create index if not exists notifications_target_updated_idx
  on public.notifications (target_user_id, updated_at desc);

create index if not exists patrol_report_tombstones_ship_deleted_idx
  on public.patrol_report_tombstones (ship_id, deleted_at desc);

create index if not exists patrol_report_tombstones_ship_name_deleted_idx
  on public.patrol_report_tombstones (ship_name, deleted_at desc);

-- Tabel berikut tidak bergantung pada old row penuh di client saat ini. Jangan ubah
-- patrol_reports/profiles/ships di migration ini: patrol_reports masih punya jalur
-- tombstone/delete sensitif, profiles/ships membawa data akses operasional.
alter table public.client_mutations replica identity default;
alter table public.notifications replica identity default;
alter table public.sos_alerts replica identity default;
alter table public.incidents replica identity default;
