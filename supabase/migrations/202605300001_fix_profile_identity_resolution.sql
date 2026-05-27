/*
Tujuan: Menutup bug "bisa login tapi tulisan ditolak RLS" akibat profiles.auth_uid tidak
  sinkron dengan UID Supabase Auth aktif (mis. akun Auth dibuat ulang dengan email sama).
Caller: Supabase migration runner (supabase db push) saat deploy.
Dependensi: tabel public.profiles dan helper otorisasi current_profile_*/has_operational_access.
Main Functions: Menyamakan cara helper RLS mengenali profil user dengan resolver Edge Function,
  yakni cocok via auth_uid ATAU id ATAU email terverifikasi dari JWT, dengan urutan deterministik.
Side Effects: Menimpa fungsi helper otorisasi (security definer). Tidak mengubah data.

Latar belakang:
  resolve-operational-access (Edge Function) menemukan profil dengan fallback
  auth_uid -> id -> email, sehingga user tetap bisa login meski auth_uid profil basi.
  Namun helper RLS hanya cocok via (auth_uid OR id) tanpa email, sehingga
  current_profile_role()/current_profile_ship() mengembalikan NULL untuk user tsb,
  membuat can_access_ship_name() = false dan SEMUA tulisan operasional (patrol_reports,
  incidents, shift status) ditolak diam-diam lalu mengendap di outbox selamanya.
  Email JWT berasal dari auth.users yang wajib terkonfirmasi & unik per akun Auth,
  jadi mencocokkan via email aman dan konsisten dengan model kepercayaan login.
*/

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
    and (
      p.auth_uid = auth.uid()
      or p.id = auth.uid()::text
      or (
        nullif(lower(auth.jwt() ->> 'email'), '') is not null
        and lower(p.email) = lower(auth.jwt() ->> 'email')
      )
    )
  order by
    (p.auth_uid = auth.uid()) desc nulls last,
    (p.id = auth.uid()::text) desc nulls last,
    p.updated_at desc nulls last
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
    and (
      p.auth_uid = auth.uid()
      or p.id = auth.uid()::text
      or (
        nullif(lower(auth.jwt() ->> 'email'), '') is not null
        and lower(p.email) = lower(auth.jwt() ->> 'email')
      )
    )
  order by
    (p.auth_uid = auth.uid()) desc nulls last,
    (p.id = auth.uid()::text) desc nulls last,
    p.updated_at desc nulls last
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
    and (
      p.auth_uid = auth.uid()
      or p.id = auth.uid()::text
      or (
        nullif(lower(auth.jwt() ->> 'email'), '') is not null
        and lower(p.email) = lower(auth.jwt() ->> 'email')
      )
    )
  order by
    (p.auth_uid = auth.uid()) desc nulls last,
    (p.id = auth.uid()::text) desc nulls last,
    p.updated_at desc nulls last
  limit 1
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
      and (
        p.auth_uid = auth.uid()
        or p.id = auth.uid()::text
        or (
          nullif(lower(auth.jwt() ->> 'email'), '') is not null
          and lower(p.email) = lower(auth.jwt() ->> 'email')
        )
      )
  )
$$;
