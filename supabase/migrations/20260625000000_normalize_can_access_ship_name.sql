/*
Tujuan: Membuat can_access_ship_name() tahan banting terhadap selisih sepele nama kapal
  (spasi berlebih, kapitalisasi) antara profiles.ship_assigned dan ships.name. Sebelumnya
  perbandingan memakai '=' persis, sehingga selisih satu karakter (mis. "JKT 02" vs "JKT02",
  trailing space, beda kapital, atau kapal di-rename tanpa update profil) membuat RLS
  ships_read_assigned menyembunyikan SELURUH baris kapal dari petugas → fetchShipsRows balik
  0 baris → operationalShip null → daftar checkpoint kosong (progres 0/0). Header tetap
  menampilkan nama kapal karena nilainya berasal dari Edge Function resolve-operational-access
  (service role + fallback email), bukan dari jalur RLS ini.
Caller: Supabase migration runner (supabase db push) saat deploy.
Dependensi: helper current_profile_role()/current_profile_ship() (security definer).
Side Effects: Menimpa fungsi can_access_ship_name (security definer). TIDAK mengubah data.
  Perubahan hanya MELONGGARKAN match untuk nama yang setara setelah normalisasi; tidak
  memberi akses lintas-kapal karena dua kapal berbeda tetap bernama beda setelah normalisasi.

Konsisten dengan normalisasi sisi klien createShipNameKey() di AppContextRuntime.jsx
  (trim + collapse whitespace + lowercase) yang dipakai resolveAssignedShipForUser().
*/

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
      and nullif(btrim(regexp_replace(lower(coalesce(target_ship_name, '')), '\s+', ' ', 'g')), '') is not null
      and nullif(btrim(regexp_replace(lower(coalesce(public.current_profile_ship(), '')), '\s+', ' ', 'g')), '')
          = nullif(btrim(regexp_replace(lower(coalesce(target_ship_name, '')), '\s+', ' ', 'g')), '')
    ),
    false
  )
$$;

grant execute on function public.can_access_ship_name(text) to authenticated;
