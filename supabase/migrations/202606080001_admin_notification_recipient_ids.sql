/*
Tujuan: Menyediakan resolver id admin server-side untuk target notifikasi temuan.
Caller: Frontend SmartPatrol via RPC get_admin_recipient_ids.
Dependensi: public.profiles, helper public.has_operational_access().
Main Functions: Mengembalikan id admin aktif tanpa membuka RLS profiles atau data PII ke klien.
Side Effects: CREATE/REPLACE FUNCTION dan GRANT EXECUTE ke authenticated.
*/

create or replace function public.get_admin_recipient_ids()
returns setof text
language sql
security definer
set search_path = public
stable
as $$
  select p.id
    from public.profiles p
   where public.has_operational_access()
     and p.enabled = true
     and p.review_state = 'approved'
     and p.status <> 'disabled'
     and p.role = 'ADMIN'
   order by p.id
$$;

revoke execute on function public.get_admin_recipient_ids() from public, anon;
grant execute on function public.get_admin_recipient_ids() to authenticated;
