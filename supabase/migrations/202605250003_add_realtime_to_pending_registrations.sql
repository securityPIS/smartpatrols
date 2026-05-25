-- Tambah pending_registrations ke realtime publication
do $$
begin
  alter publication supabase_realtime add table public.pending_registrations;
exception
  when duplicate_object then null;
end $$;
