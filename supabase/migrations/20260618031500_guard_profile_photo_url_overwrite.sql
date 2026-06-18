/*
Tujuan: Menjaga avatar profil agar signed URL lengkap tidak ditimpa snapshot lokal lama.
Caller: Supabase migration runner saat deploy/reset database.
Dependensi: profiles, media_assets, helper is_admin.
Main Functions: check_profile_update.
Side Effects: Update profiles.photo_url terpotong dari media_assets.signed_url lengkap.
*/

create or replace function public.check_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.photo_url ~ '^https://[^/]+\.supabase\.co/storage/v1/object/sign/'
    and length(split_part(split_part(coalesce(old.photo_url, ''), 'token=', 2), '.', 3)) >= 43
    and (
      nullif(trim(coalesce(new.photo_url, '')), '') is null
      or new.photo_url like 'idb://%'
      or new.photo_url like 'data:image/%'
      or (
        new.photo_url ~ '^https://[^/]+\.supabase\.co/storage/v1/object/sign/'
        and length(split_part(split_part(coalesce(new.photo_url, ''), 'token=', 2), '.', 3)) < 43
      )
    )
  then
    new.photo_url := old.photo_url;
  end if;

  if not public.is_admin() and session_user <> 'postgres' then
    new.role := old.role;
    new.enabled := old.enabled;
    new.review_state := old.review_state;
    new.ship_assigned := old.ship_assigned;
  end if;

  return new;
end;
$$;

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
