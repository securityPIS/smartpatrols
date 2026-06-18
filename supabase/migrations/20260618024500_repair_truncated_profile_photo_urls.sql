/*
Tujuan: Memulihkan signed URL avatar profil yang terpotong dan menutup regresi trigger onboarding.
Caller: Supabase migration runner saat deploy/reset database.
Dependensi: auth.users, public.pending_registrations, public.profiles, public.media_assets.
Main Functions: create_pending_registration_from_auth_user.
Side Effects: Update profiles.photo_url yang token signed URL-nya terpotong memakai media_assets.signed_url lengkap.
*/

create or replace function public.create_pending_registration_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  safe_email text := lower(coalesce(new.email, ''));
  safe_name text := left(trim(regexp_replace(coalesce(
    metadata->>'name',
    metadata->>'display_name',
    split_part(safe_email, '@', 1),
    'User Baru'
  ), '[[:cntrl:]<>]', ' ', 'g')), 80);
begin
  if coalesce(metadata->>'smartpatrol_registration_flow', '') <> 'public' then
    return new;
  end if;

  if position('@' in safe_email) <= 1 then
    return new;
  end if;

  insert into public.pending_registrations (
    uid,
    email,
    name,
    phone,
    photo_url,
    photo_path,
    type,
    worker_number,
    status
  )
  values (
    new.id::text,
    safe_email,
    coalesce(nullif(safe_name, ''), 'User Baru'),
    left(regexp_replace(coalesce(metadata->>'phone', ''), '[^0-9+]', '', 'g'), 20),
    nullif(left(trim(regexp_replace(coalesce(metadata->>'photo_url', ''), '[[:cntrl:]<>]', ' ', 'g')), 4096), ''),
    left(trim(regexp_replace(coalesce(metadata->>'photo_path', ''), '[[:cntrl:]<>]', ' ', 'g')), 240),
    coalesce(nullif(left(trim(regexp_replace(coalesce(metadata->>'type', 'BUJP'), '[[:cntrl:]<>]', ' ', 'g')), 20), ''), 'BUJP'),
    left(trim(regexp_replace(coalesce(metadata->>'worker_number', ''), '[[:cntrl:]<>]', ' ', 'g')), 40),
    'pending'
  )
  on conflict (uid) do nothing;

  return new;
end;
$$;

drop trigger if exists smartpatrol_public_registration_after_auth_insert on auth.users;
create trigger smartpatrol_public_registration_after_auth_insert
after insert on auth.users
for each row execute function public.create_pending_registration_from_auth_user();

with latest_registration_assets as (
  select distinct on (owner_id::text)
    owner_id::text as auth_uid,
    signed_url
  from public.media_assets
  where domain = 'registration'
    and owner_id is not null
    and signed_url like 'https://%'
    and length(split_part(split_part(signed_url, 'token=', 2), '.', 3)) >= 43
  order by owner_id::text, created_at desc nulls last, signed_url_expires_at desc nulls last
)
update public.profiles as profile
set photo_url = asset.signed_url
from latest_registration_assets as asset
where profile.auth_uid::text = asset.auth_uid
  and profile.photo_url like 'https://%'
  and length(split_part(split_part(profile.photo_url, 'token=', 2), '.', 3)) < 43
  and profile.photo_url is distinct from asset.signed_url;
