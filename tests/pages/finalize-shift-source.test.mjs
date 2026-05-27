/*
Tujuan: Mencegah regresi finalize_shift kembali bergantung pada tabel ship_checkpoints
        yang TIDAK pernah ditulis aplikasi (definisi checkpoint ada di ships.custom_checkpoints).
Caller: Node test runner saat verifikasi migration history shift.
Dependensi: supabase/migrations/202605290001_finalize_shift_from_custom_checkpoints.sql.
Main Functions: Memastikan finalize_shift membaca custom_checkpoints dan mencocokkan laporan via nama.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../supabase/migrations/202605290001_finalize_shift_from_custom_checkpoints.sql', import.meta.url),
  'utf8',
);

test('finalize_shift membaca definisi dari ships.custom_checkpoints', () => {
  assert.match(
    source,
    /jsonb_array_elements\(v_ship\.custom_checkpoints\)\s+with ordinality/,
    'finalize_shift harus mengiterasi ships.custom_checkpoints, bukan ship_checkpoints',
  );
  assert.doesNotMatch(
    source,
    /from\s+public\.ship_checkpoints/i,
    'finalize_shift tidak boleh lagi membaca dari tabel ship_checkpoints',
  );
});

test('finalize_shift mencocokkan laporan terutama via nama checkpoint (tahan beda id antar-device)', () => {
  assert.match(
    source,
    /regexp_replace\(lower\(btrim\(checkpoint_name\)\), '\\s\+', ' ', 'g'\)\s*=\s*v_cp_name_key/,
    'pencocokan utama harus berdasarkan nama checkpoint ternormalisasi',
  );
  assert.match(
    source,
    /or checkpoint_id = v_cp_id/,
    'tetap sediakan fallback pencocokan via id checkpoint runtime',
  );
});

test('finalize_shift menghitung aman untuk completed non-temuan', () => {
  assert.match(
    source,
    /if v_report\.result_type = 'temuan' then[\s\S]*?v_temuan := v_temuan \+ 1;[\s\S]*?else[\s\S]*?v_aman := v_aman \+ 1;/,
    'completed selain temuan harus dihitung sebagai aman',
  );
});
