/*
Tujuan: Mencegah list Riwayat admin ON GOING menampilkan checkpoint pending sebagai Missed.
Caller: Node test runner saat verifikasi halaman riwayat.
Dependensi: src/pages/HistoryPage.jsx.
Main Functions: Memastikan kartu status ketiga memakai label/count Pending untuk live entry dan Missed untuk history selesai.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('HistoryPage live entries render pending status summary instead of missed summary', () => {
  const source = readFileSync(new URL('../../src/pages/HistoryPage.jsx', import.meta.url), 'utf8');

  // Live entries (ON GOING) ditampilkan terpisah sebagai kartu besar dengan count Pending.
  assert.match(
    source,
    /pendingCount\s*=\s*summary\.pending\s*\?\?\s*data\.pending\s*\?\?\s*0/,
    'live ON GOING cards should derive count from summary.pending',
  );
  assert.match(
    source,
    /uppercase\s+font-bold\s+mb-0\.5">Pending</,
    'live ON GOING cards should label the third summary as Pending',
  );

  // Riwayat arsip (selesai) memakai summary.missed di StatStrip baris shift.
  assert.match(
    source,
    /missedCount\s*=\s*entrySummary\.missed\s*\?\?\s*entry\.missed\s*\?\?\s*0/,
    'completed history entries should derive count from summary.missed',
  );
});
