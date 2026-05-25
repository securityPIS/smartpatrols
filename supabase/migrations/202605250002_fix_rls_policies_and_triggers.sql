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
