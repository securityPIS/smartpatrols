/*
Tujuan: Perbaiki fungsi finalize_shift agar membaca definisi checkpoint dari
        ships.custom_checkpoints (JSONB) — sumber kebenaran yang dipakai klien —
        bukan dari tabel ship_checkpoints yang TIDAK pernah ditulis aplikasi.
Caller: pg_cron (jadwal finalize-shift-1/2/3 dari migration 202605280001).
Dependensi: tabel ships (kolom custom_checkpoints), patrol_reports, shift_history_entries.
Main Functions: finalize_shift(shift_id, date_key) versi baru.
Side Effects: Upsert ke shift_history_entries. Tidak menyentuh jadwal cron (cukup ganti body fungsi).

Latar: ship_checkpoints kosong di produksi karena klien menyimpan titik patroli di
ships.custom_checkpoints. Versi lama finalize_shift mensyaratkan baris di ship_checkpoints,
sehingga history server-side tidak pernah terbentuk. Versi ini:
  - iterasi elemen ships.custom_checkpoints (dengan ordinality untuk urutan),
  - cocokkan laporan TERUTAMA via nama checkpoint (tahan beda id antar-device),
    dengan fallback ke id checkpoint runtime klien `${shipId}::slug::index`,
  - hitung aman/temuan/missed dan simpan snapshot checkpoints.
*/

create or replace function public.finalize_shift(p_shift_id text, p_date_key text)
returns int
language plpgsql
security definer
as $$
declare
  v_shift_key    text;
  v_shift_label  text;
  v_time_range   text;
  v_ship         record;
  v_cp           record;
  v_report       record;
  v_checkpoints  jsonb;
  v_aman         int;
  v_temuan       int;
  v_missed       int;
  v_total        int;
  v_entries_created int := 0;
  v_history_key  text;
  v_history_id   text;
  v_time_str     text;
  v_cp_id        text;
  v_slug         text;
  v_cp_name_key  text;
begin
  -- Bentuk shift_key (format sama dengan client: 'YYYY-MM-DD|shift-id')
  v_shift_key := p_date_key || '|' || p_shift_id;

  v_shift_label := case p_shift_id
    when 'shift-1-active' then 'Shift 1'
    when 'shift-2-active' then 'Shift 2'
    when 'shift-3-active' then 'Shift 3'
    else p_shift_id
  end;
  v_time_range := case p_shift_id
    when 'shift-1-active' then '06:00 - 12:00'
    when 'shift-2-active' then '12:00 - 18:00'
    when 'shift-3-active' then '18:00 - 06:00'
    else ''
  end;

  -- Iterasi kapal yang punya definisi checkpoint di custom_checkpoints
  for v_ship in
    select s.id, s.name, s.custom_checkpoints
    from public.ships s
    where jsonb_typeof(s.custom_checkpoints) = 'array'
      and jsonb_array_length(s.custom_checkpoints) > 0
  loop
    v_total := jsonb_array_length(v_ship.custom_checkpoints);
    if v_total = 0 then continue; end if;

    -- Lewati kapal yang tidak ada laporan SAMA SEKALI di shift ini
    -- (berarti kapal tidak aktif pada shift tersebut)
    if not exists (
      select 1 from public.patrol_reports
      where shift_key = v_shift_key and ship_id = v_ship.id
    ) then
      continue;
    end if;

    -- history_key/id identik dengan client (createHistoryEntryKey: shipToken|shiftKey)
    v_history_key := regexp_replace(lower(v_ship.id), '[^a-z0-9]+', '-', 'g') || '|' || v_shift_key;
    v_history_id  := 'history-' || v_history_key;

    v_checkpoints := '[]'::jsonb;
    v_aman   := 0;
    v_temuan := 0;
    v_missed := 0;

    for v_cp in
      select
        elem.value ->> 'name' as cp_name,
        elem.idx              as cp_index
      from jsonb_array_elements(v_ship.custom_checkpoints) with ordinality as elem(value, idx)
    loop
      -- Rekonstruksi id checkpoint runtime klien: `${shipId}::slug::index`
      -- slug = lower(name) dengan non-alnum -> '-' dan strip '-' di ujung.
      v_slug := regexp_replace(
                  regexp_replace(lower(coalesce(v_cp.cp_name, '')), '[^a-z0-9]+', '-', 'g'),
                  '(^-|-$)', '', 'g');
      if v_slug = '' then
        v_slug := 'checkpoint-' || v_cp.cp_index;
      end if;
      v_cp_id := v_ship.id || '::' || v_slug || '::' || v_cp.cp_index;

      -- Kunci nama ternormalisasi (lower + whitespace tunggal) untuk pencocokan tahan-banting
      v_cp_name_key := regexp_replace(lower(btrim(coalesce(v_cp.cp_name, ''))), '\s+', ' ', 'g');

      -- Utamakan match nama; fallback ke id runtime. Bila ada duplikat, pilih yang completed/terbaru.
      select *
      into v_report
      from public.patrol_reports
      where shift_key = v_shift_key
        and ship_id   = v_ship.id
        and (
          regexp_replace(lower(btrim(checkpoint_name)), '\s+', ' ', 'g') = v_cp_name_key
          or checkpoint_id = v_cp_id
        )
      order by (status = 'completed') desc, occurred_at_trusted_ms desc nulls last
      limit 1;

      if v_report.id is not null and v_report.status = 'completed' then
        if v_report.occurred_at_trusted_ms is not null then
          v_time_str := to_char(
            to_timestamp(v_report.occurred_at_trusted_ms / 1000.0) at time zone 'Asia/Jakarta',
            'HH24:MI'
          );
        else
          v_time_str := null;
        end if;

        if v_report.result_type = 'temuan' then
          v_temuan := v_temuan + 1;
        else
          v_aman := v_aman + 1;
        end if;

        v_checkpoints := v_checkpoints || jsonb_build_object(
          'id',                coalesce(v_report.checkpoint_id, v_cp_id),
          'name',              v_cp.cp_name,
          'status',            'completed',
          'resultType',        coalesce(v_report.result_type, 'aman'),
          'completedBy',       coalesce(v_report.completed_by, ''),
          'completedByUserId', coalesce(v_report.completed_by_user_id, ''),
          'time',              v_time_str,
          'photoUrl',          v_report.photo_url,
          'historyId',         v_history_id,
          'readOnly',          true,
          'date',              p_date_key,
          'shipName',          v_ship.name
        );
      else
        -- Checkpoint tidak dikerjakan -> missed
        v_missed := v_missed + 1;
        v_checkpoints := v_checkpoints || jsonb_build_object(
          'id',        v_cp_id,
          'name',      v_cp.cp_name,
          'status',    'missed',
          'resultType','missed',
          'completedBy', null,
          'time',      null,
          'photoUrl',  null,
          'historyId', v_history_id,
          'readOnly',  true,
          'date',      p_date_key,
          'shipName',  v_ship.name
        );
      end if;
    end loop;

    -- Jangan timpa jika sudah ada (client mungkin sudah buat duluan)
    insert into public.shift_history_entries (
      shift_key, ship_id, ship_name,
      shift_id, shift_label, date_key, time_range,
      aman_count, temuan_count, missed_count, total_count,
      checkpoints, finalized_at
    ) values (
      v_shift_key, v_ship.id, v_ship.name,
      p_shift_id, v_shift_label, p_date_key, v_time_range,
      v_aman, v_temuan, v_missed, v_total,
      v_checkpoints, now()
    )
    on conflict (shift_key, ship_id) do nothing;

    if found then
      v_entries_created := v_entries_created + 1;
    end if;

  end loop;

  return v_entries_created;
end;
$$;
