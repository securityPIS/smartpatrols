const LEGACY_CHUNK_REFRESH_KEY_PREFIX = 'smartpatrol.legacy-chunk-refresh';

function requestLatestApp(reason) {
  if (typeof window === 'undefined') return;

  try {
    console.warn(`[SmartPatrol] Shim chunk lama aktif: ${reason}`);

    if (navigator.onLine !== true || !window.sessionStorage) {
      return;
    }

    const guardKey = `${LEGACY_CHUNK_REFRESH_KEY_PREFIX}:${reason}`;
    if (window.sessionStorage.getItem(guardKey) === '1') {
      return;
    }

    window.sessionStorage.setItem(guardKey, '1');

    const latestUrl = new URL(window.location.href);
    latestUrl.searchParams.set('_chunkfix', Date.now().toString());
    window.location.replace(latestUrl.toString());
  } catch (error) {
    console.warn('[SmartPatrol] Gagal mengalihkan ke bundle terbaru', error);
  }
}

export function createLegacyModalShim(reason) {
  requestLatestApp(reason);

  return function LegacyModalShim() {
    return null;
  };
}
