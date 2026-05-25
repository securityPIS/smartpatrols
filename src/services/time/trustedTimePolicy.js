/*
Tujuan: Menyediakan aturan murni untuk evaluasi drift trusted time SmartPatrol.
Caller: trustedTime.js dan smoke test security untuk validasi clock tampering.
Dependensi: Tidak ada.
Main Functions: Menghitung drift clock dan menentukan apakah drift melewati ambang audit.
Side Effects: Tidak ada; helper ini murni.
*/

export const DEFAULT_CLOCK_TAMPER_DRIFT_THRESHOLD_MS = 5000;

export function calculateClockDriftMs(localElapsedMs, perfElapsedMs) {
  const safeLocalElapsedMs = Number.isFinite(localElapsedMs) ? localElapsedMs : 0;
  const safePerfElapsedMs = Number.isFinite(perfElapsedMs) ? perfElapsedMs : 0;
  return Math.abs(safeLocalElapsedMs - safePerfElapsedMs);
}

export function isClockDriftSuspicious(
  localElapsedMs,
  perfElapsedMs,
  thresholdMs = DEFAULT_CLOCK_TAMPER_DRIFT_THRESHOLD_MS,
) {
  return calculateClockDriftMs(localElapsedMs, perfElapsedMs) > thresholdMs;
}
