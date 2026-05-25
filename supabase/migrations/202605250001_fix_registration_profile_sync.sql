/*
Tujuan: Menstabilkan onboarding publik dan update profil Supabase yang sudah punya auth_uid.
Caller: Supabase migration runner saat deploy/reset database.
Dependensi: auth.users, public.pending_registrations, dan metadata Supabase Auth signUp.
Main Functions: Membuat trigger Auth untuk pending registration publik saat sesi email belum tersedia.
Side Effects: Menambah/menimpa function trigger dan trigger AFTER INSERT pada auth.users.
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
    nullif(left(trim(regexp_replace(coalesce(metadata->>'photo_url', ''), '[[:cntrl:]<>]', ' ', 'g')), 500), ''),
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
