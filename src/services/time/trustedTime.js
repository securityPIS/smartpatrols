/*
Tujuan: Menyediakan trusted clock SmartPatrol dengan sinkronisasi server SQL dan deteksi clock tampering.
Caller: AppContextRuntime dan komponen audit waktu.
Dependensi: Supabase Edge Function server-time, trustedTimePolicy, localStorage, browser timing APIs, dan adapter native Capacitor.
Main Functions: Sinkronisasi waktu server, membangun timestamp trusted, mengelola sesi offline, dan mendeteksi drift perangkat.
Side Effects: Menulis anchor trusted time ke localStorage, memasang interval/timer, dan memanggil endpoint server time.
*/

import {
  DEFAULT_CLOCK_TAMPER_DRIFT_THRESHOLD_MS,
  isClockDriftSuspicious,
} from './trustedTimePolicy';
import { getNativeTimeSnapshot, isNativeRuntime } from '../native/capacitorBridge';
import { resolveServerTimeUrls } from '../backend/time';

const TRUSTED_TIME_STORAGE_KEY = 'smartpatrol.trusted-time.v1';
const SERVER_TIME_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const CLOCK_TAMPER_CHECK_INTERVAL_MS = 15 * 1000;
const CLOCK_TAMPER_DRIFT_THRESHOLD_MS = DEFAULT_CLOCK_TAMPER_DRIFT_THRESHOLD_MS;
const CLOCK_TAMPER_RECOVERY_STABLE_SAMPLE_COUNT = 2;
const REQUEST_TIMEOUT_MS = 8000;
const TICK_INTERVAL_MS = 1000;

const TRUST_LEVEL_META = {
  'server-trusted': {
    label: 'Waktu tersinkron',
    description: 'Timer mengikuti anchor waktu server SmartPatrol.',
    tone: 'success',
  },
  'offline-trusted': {
    label: 'Offline trusted',
    description: 'Timer offline dihitung dari anchor server dan performance.now().',
    tone: 'warning',
  },
  'offline-interrupted': {
    label: 'Offline interrupted',
    description: 'Aplikasi sempat restart saat offline. Timestamp tetap dicatat, tetapi perlu verifikasi.',
    tone: 'danger',
  },
  unverified: {
    label: 'Belum sinkron',
    description: 'Belum ada anchor server yang valid. Timestamp perlu verifikasi.',
    tone: 'danger',
  },
};

const DEFAULT_STATE = {
  anchorServerEpochMs: null,
  anchorPerfNowMs: null,
  anchorMonotonicMs: null,
  anchorDeviceNowMs: null,
  anchorSyncedAtMs: null,
  offlineSessionId: null,
  offlineStartedAtMs: null,
  offlineSessionActive: false,
  offlineSessionInterrupted: false,
  clockTamperDetected: false,
  lastSyncAttemptAtMs: null,
  lastSyncError: '',
  syncSource: null,
};

const listeners = new Set();

let state = {
  ...DEFAULT_STATE,
  anchorPerfNowMs: readPerfNow(),
};

let initialized = false;
let tickTimerId = null;
let tamperTimerId = null;
let syncTimerId = null;
let visibilityListenerAttached = false;
let lastLocalNowMs = readDeviceNow();
let lastPerfNowMs = readPerfNow();
let cachedSnapshot = null;
let stableClockSampleCount = 0;
let tamperRecoverySyncInFlight = false;
let nativeBaselineDeviceEpochMs = null;
let nativeBaselineMonotonicMs = null;
let nativeClockCache = {
  available: false,
  elapsedRealtimeMs: null,
  deviceEpochMs: null,
  sampledAtPerfMs: null,
};

function canUseWindow() {
  return typeof window !== 'undefined';
}

function readDeviceNow() {
  return Date.now();
}

function readPerfNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function readMonotonicNow() {
  if (
    nativeClockCache.available
    && Number.isFinite(nativeClockCache.elapsedRealtimeMs)
    && Number.isFinite(nativeClockCache.sampledAtPerfMs)
  ) {
    const elapsedSinceNativeSampleMs = Math.max(0, readPerfNow() - nativeClockCache.sampledAtPerfMs);
    return nativeClockCache.elapsedRealtimeMs + elapsedSinceNativeSampleMs;
  }

  return readPerfNow();
}

async function refreshNativeClockSnapshot() {
  if (!isNativeRuntime()) return null;

  try {
    const snapshot = await getNativeTimeSnapshot();
    if (!Number.isFinite(snapshot?.elapsedRealtimeMs)) return null;

    nativeClockCache = {
      available: true,
      elapsedRealtimeMs: snapshot.elapsedRealtimeMs,
      deviceEpochMs: Number.isFinite(snapshot.deviceEpochMs) ? snapshot.deviceEpochMs : readDeviceNow(),
      sampledAtPerfMs: readPerfNow(),
    };

    if (nativeBaselineDeviceEpochMs === null || nativeBaselineMonotonicMs === null) {
      nativeBaselineDeviceEpochMs = nativeClockCache.deviceEpochMs;
      nativeBaselineMonotonicMs = nativeClockCache.elapsedRealtimeMs;
    }

    return nativeClockCache;
  } catch (error) {
    console.warn('Gagal membaca monotonic clock native Android', error);
    return null;
  }
}

function getOnlineStatus() {
  if (!canUseWindow() || typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

function asFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function createOfflineSessionId() {
  if (globalThis.crypto?.randomUUID) {
    return `offline-${globalThis.crypto.randomUUID()}`;
  }

  return `offline-${readDeviceNow()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadPersistedState() {
  if (!canUseWindow()) {
    return {
      ...DEFAULT_STATE,
      anchorPerfNowMs: readPerfNow(),
    };
  }

  try {
    const raw = window.localStorage.getItem(TRUSTED_TIME_STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_STATE,
        anchorPerfNowMs: readPerfNow(),
      };
    }

    const parsed = JSON.parse(raw);
    const persistedAnchorMonotonicMs = asFiniteNumber(parsed?.anchorMonotonicMs ?? parsed?.anchorPerfNowMs);
    const nextState = {
      ...DEFAULT_STATE,
      anchorServerEpochMs: asFiniteNumber(parsed?.anchorServerEpochMs),
      anchorPerfNowMs: readMonotonicNow(),
      anchorMonotonicMs: persistedAnchorMonotonicMs,
      anchorDeviceNowMs: asFiniteNumber(parsed?.anchorDeviceNowMs),
      anchorSyncedAtMs: asFiniteNumber(parsed?.anchorSyncedAtMs),
      offlineSessionId: typeof parsed?.offlineSessionId === 'string' ? parsed.offlineSessionId : null,
      offlineStartedAtMs: asFiniteNumber(parsed?.offlineStartedAtMs),
      offlineSessionActive: Boolean(parsed?.offlineSessionActive),
      offlineSessionInterrupted: Boolean(parsed?.offlineSessionInterrupted),
      clockTamperDetected: Boolean(parsed?.clockTamperDetected),
      lastSyncAttemptAtMs: asFiniteNumber(parsed?.lastSyncAttemptAtMs),
      lastSyncError: typeof parsed?.lastSyncError === 'string' ? parsed.lastSyncError : '',
      syncSource: typeof parsed?.syncSource === 'string' ? parsed.syncSource : null,
    };

    if (
      nextState.anchorServerEpochMs
      && persistedAnchorMonotonicMs
      && nativeClockCache.available
    ) {
      const currentMonotonicMs = readMonotonicNow();
      const elapsedSincePersistMs = currentMonotonicMs - persistedAnchorMonotonicMs;
      if (elapsedSincePersistMs >= 0) {
        nextState.anchorServerEpochMs += elapsedSincePersistMs;
        nextState.anchorPerfNowMs = currentMonotonicMs;
        nextState.anchorMonotonicMs = currentMonotonicMs;
        nextState.anchorDeviceNowMs = readDeviceNow();
      } else {
        nextState.offlineSessionInterrupted = true;
      }
    } else if (nextState.anchorServerEpochMs && nextState.anchorDeviceNowMs && !isNativeRuntime()) {
      const elapsedSincePersistMs = Math.max(0, readDeviceNow() - nextState.anchorDeviceNowMs);
      nextState.anchorServerEpochMs += elapsedSincePersistMs;
      nextState.anchorDeviceNowMs = readDeviceNow();
    } else if (nextState.anchorServerEpochMs && isNativeRuntime()) {
      nextState.offlineSessionInterrupted = true;
    }

    if (!getOnlineStatus() && nextState.anchorServerEpochMs) {
      nextState.offlineSessionActive = true;
      nextState.offlineSessionId = nextState.offlineSessionId || createOfflineSessionId();
      nextState.offlineStartedAtMs = nextState.offlineStartedAtMs || nextState.anchorServerEpochMs;
      nextState.offlineSessionInterrupted = true;
    }

    return nextState;
  } catch (error) {
    console.error('Gagal memuat anchor trusted time', error);
    return {
      ...DEFAULT_STATE,
      anchorPerfNowMs: readPerfNow(),
    };
  }
}

function toPersistedState() {
  const trustedNowMs = state.anchorServerEpochMs ? getTrustedNowMs() : null;

  return {
    anchorServerEpochMs: trustedNowMs,
    anchorMonotonicMs: state.anchorServerEpochMs ? readMonotonicNow() : null,
    anchorDeviceNowMs: state.anchorServerEpochMs ? readDeviceNow() : null,
    anchorSyncedAtMs: state.anchorSyncedAtMs,
    offlineSessionId: state.offlineSessionId,
    offlineStartedAtMs: state.offlineStartedAtMs,
    offlineSessionActive: state.offlineSessionActive,
    offlineSessionInterrupted: state.offlineSessionInterrupted,
    clockTamperDetected: state.clockTamperDetected,
    lastSyncAttemptAtMs: state.lastSyncAttemptAtMs,
    lastSyncError: state.lastSyncError,
    syncSource: state.syncSource,
  };
}

function persistState() {
  if (!canUseWindow()) return;

  try {
    window.localStorage.setItem(TRUSTED_TIME_STORAGE_KEY, JSON.stringify(toPersistedState()));
  } catch (error) {
    console.error('Gagal menyimpan anchor trusted time', error);
  }
}

function invalidateSnapshotCache() {
  cachedSnapshot = null;
}

function resetClockTamperRecoveryState() {
  stableClockSampleCount = 0;
}

function notifyListeners() {
  invalidateSnapshotCache();
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('Listener trusted time gagal dijalankan', error);
    }
  });
}

function commitState(patch, options = {}) {
  const { persist = true, notify = true } = options;
  state = {
    ...state,
    ...patch,
  };
  invalidateSnapshotCache();

  if (persist) persistState();
  if (notify) notifyListeners();
}

function applyServerAnchor(serverNowMs, source) {
  const deviceNowMs = readDeviceNow();
  const monotonicNowMs = readMonotonicNow();
  if (isNativeRuntime()) {
    nativeBaselineDeviceEpochMs = deviceNowMs;
    nativeBaselineMonotonicMs = monotonicNowMs;
  }
  resetClockTamperRecoveryState();
  commitState({
    anchorServerEpochMs: serverNowMs,
    anchorPerfNowMs: monotonicNowMs,
    anchorMonotonicMs: monotonicNowMs,
    anchorDeviceNowMs: deviceNowMs,
    anchorSyncedAtMs: serverNowMs,
    offlineSessionId: null,
    offlineStartedAtMs: null,
    offlineSessionActive: false,
    offlineSessionInterrupted: false,
    clockTamperDetected: false,
    lastSyncError: '',
    syncSource: source || null,
  });
}

function rehydrateNativeAnchorAfterClockRefresh() {
  if (
    !isNativeRuntime()
    || !nativeClockCache.available
    || !Number.isFinite(state.anchorServerEpochMs)
    || !Number.isFinite(state.anchorMonotonicMs)
  ) {
    return;
  }

  const currentMonotonicMs = readMonotonicNow();
  const elapsedSincePersistMs = currentMonotonicMs - state.anchorMonotonicMs;

  if (elapsedSincePersistMs < 0) {
    commitState({
      offlineSessionInterrupted: true,
    });
    return;
  }

  commitState({
    anchorServerEpochMs: state.anchorServerEpochMs + elapsedSincePersistMs,
    anchorPerfNowMs: currentMonotonicMs,
    anchorMonotonicMs: currentMonotonicMs,
    anchorDeviceNowMs: readDeviceNow(),
    offlineSessionInterrupted: false,
  });
}

function resolveTrustLevel() {
  if (!state.anchorServerEpochMs) return 'unverified';
  if (state.offlineSessionInterrupted) return 'offline-interrupted';
  if (!getOnlineStatus()) return 'offline-trusted';
  return 'server-trusted';
}

function getTrustMeta(trustLevel = resolveTrustLevel()) {
  return TRUST_LEVEL_META[trustLevel] || TRUST_LEVEL_META.unverified;
}

export function getTrustedNowMs() {
  if (!state.anchorServerEpochMs) {
    // Android-only: jangan pernah percaya device clock tanpa anchor server
    if (isNativeRuntime()) {
      return null;
    }
    return readDeviceNow();
  }

  const currentMonotonicMs = readMonotonicNow();
  if (Number.isFinite(state.anchorMonotonicMs) && currentMonotonicMs >= state.anchorMonotonicMs) {
    return state.anchorServerEpochMs + Math.max(0, currentMonotonicMs - state.anchorMonotonicMs);
  }

  if (state.offlineSessionInterrupted) {
    // Android-only: pakai monotonic clock yang tidak terpengaruh perubahan waktu HP
    if (isNativeRuntime() && Number.isFinite(state.anchorMonotonicMs)) {
      const elapsedFromMonotonicMs = Math.max(0, currentMonotonicMs - state.anchorMonotonicMs);
      return state.anchorServerEpochMs + elapsedFromMonotonicMs;
    }
    const elapsedFromDeviceMs = Math.max(0, readDeviceNow() - (state.anchorDeviceNowMs || readDeviceNow()));
    return state.anchorServerEpochMs + elapsedFromDeviceMs;
  }

  const elapsedFromPerfMs = Math.max(0, currentMonotonicMs - (state.anchorPerfNowMs || currentMonotonicMs));
  return state.anchorServerEpochMs + elapsedFromPerfMs;
}

export function getTrustedDate() {
  const trustedNowMs = getTrustedNowMs();
  return Number.isFinite(trustedNowMs) ? new Date(trustedNowMs) : new Date(readDeviceNow());
}

export function getTimeTrustStatus() {
  const trustLevel = resolveTrustLevel();
  const meta = getTrustMeta(trustLevel);

  return {
    trustLevel,
    label: meta.label,
    description: meta.description,
    tone: meta.tone,
    clockTamperDetected: state.clockTamperDetected,
    offlineSessionId: state.offlineSessionId,
    offlineSessionActive: state.offlineSessionActive,
    offlineSessionInterrupted: state.offlineSessionInterrupted,
    anchorSyncedAtMs: state.anchorSyncedAtMs,
    lastSyncAttemptAtMs: state.lastSyncAttemptAtMs,
    lastSyncError: state.lastSyncError,
    syncSource: state.syncSource,
    isOnline: getOnlineStatus(),
  };
}

function buildTrustedTimeSnapshot() {
  // Bulatkan ke milidetik bulat: performance.now() membawa pecahan sub-ms sehingga
  // nowMs bisa seperti 1779986567403.7. Kolom *_trusted_ms di Postgres bertipe bigint
  // dan menolak nilai berkoma ("invalid input syntax for type bigint"), membuat seluruh
  // tulisan laporan gagal. Wall-clock ms tidak butuh presisi sub-ms.
  const nowMs = Math.round(getTrustedNowMs());
  const nowDate = new Date(nowMs);
  const status = getTimeTrustStatus();
  const warningMessage = status.clockTamperDetected
    ? 'Perubahan jam perangkat terdeteksi. Timestamp perlu audit tambahan.'
    : status.description;

  return {
    ...status,
    nowMs,
    nowDate,
    nowIso: nowDate.toISOString(),
    warningMessage,
  };
}

export function getTrustedTimeSnapshot() {
  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  cachedSnapshot = buildTrustedTimeSnapshot();
  return cachedSnapshot;
}

export function createTrustedTimestampRecord() {
  const snapshot = buildTrustedTimeSnapshot();

  return {
    occurredAtTrustedMs: snapshot.nowMs,
    occurredAtTrustedIso: snapshot.nowIso,
    occurredAtClientMs: readDeviceNow(),
    receivedAtServerMs: null,
    timeTrustLevel: snapshot.trustLevel,
    offlineSessionId: snapshot.offlineSessionId,
    offlineSessionInterrupted: snapshot.offlineSessionInterrupted,
    clockTamperDetected: snapshot.clockTamperDetected,
    anchorSyncedAtMs: snapshot.anchorSyncedAtMs,
  };
}

export function startOfflineSession() {
  if (!state.anchorServerEpochMs) {
    notifyListeners();
    return;
  }

  commitState({
    offlineSessionActive: true,
    offlineSessionId: state.offlineSessionId || createOfflineSessionId(),
    offlineStartedAtMs: state.offlineStartedAtMs || getTrustedNowMs(),
  });
}

export function finishOfflineSession() {
  commitState({
    offlineSessionActive: false,
    offlineSessionId: null,
    offlineStartedAtMs: null,
    offlineSessionInterrupted: false,
  });
}

export function detectClockTampering() {
  const currentLocalNowMs = readDeviceNow();
  const currentPerfNowMs = readMonotonicNow();
  const localElapsedMs = currentLocalNowMs - lastLocalNowMs;
  const perfElapsedMs = currentPerfNowMs - lastPerfNowMs;
  const driftMs = Math.abs(localElapsedMs - perfElapsedMs);
  const nativeDeviceElapsedMs = nativeClockCache.available && Number.isFinite(nativeBaselineDeviceEpochMs)
    ? (currentLocalNowMs - nativeBaselineDeviceEpochMs)
    : null;
  const nativeMonotonicElapsedMs = nativeClockCache.available && Number.isFinite(nativeBaselineMonotonicMs)
    ? (currentPerfNowMs - nativeBaselineMonotonicMs)
    : null;

  lastLocalNowMs = currentLocalNowMs;
  lastPerfNowMs = currentPerfNowMs;

  const nativeDriftSuspicious = isNativeRuntime()
    && Number.isFinite(nativeDeviceElapsedMs)
    && Number.isFinite(nativeMonotonicElapsedMs)
    && isClockDriftSuspicious(nativeDeviceElapsedMs, nativeMonotonicElapsedMs, CLOCK_TAMPER_DRIFT_THRESHOLD_MS);

  if (isClockDriftSuspicious(localElapsedMs, perfElapsedMs, CLOCK_TAMPER_DRIFT_THRESHOLD_MS) || nativeDriftSuspicious) {
    resetClockTamperRecoveryState();

    if (state.clockTamperDetected) {
      return true;
    }

    commitState({
      clockTamperDetected: true,
    });

    return true;
  }

  if (!state.clockTamperDetected) {
    resetClockTamperRecoveryState();
    return false;
  }

  stableClockSampleCount += 1;

  if (
    stableClockSampleCount >= CLOCK_TAMPER_RECOVERY_STABLE_SAMPLE_COUNT
    && getOnlineStatus()
    && !tamperRecoverySyncInFlight
  ) {
    tamperRecoverySyncInFlight = true;
    syncServerTime({ reason: 'clock-recovery' })
      .catch((error) => {
        console.error('Sinkronisasi trusted time saat pemulihan clock gagal', error);
      })
      .finally(() => {
        tamperRecoverySyncInFlight = false;
      });
  }

  return state.clockTamperDetected;
}

export function subscribeTrustedTime(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function syncServerTime(options = {}) {
  const { reason = 'manual' } = options;
  const urls = resolveServerTimeUrls();
  await refreshNativeClockSnapshot();
  const syncStartedAtMs = readDeviceNow();

  commitState({
    lastSyncAttemptAtMs: syncStartedAtMs,
  }, { notify: false });

  let lastError = null;

  for (const url of urls) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      : null;
    const requestStartedPerfMs = readMonotonicNow();

    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
        signal: controller?.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const serverNowMs = asFiniteNumber(payload?.serverNowMs);
      if (!serverNowMs) {
        throw new Error('Respons serverNowMs tidak valid');
      }

      await refreshNativeClockSnapshot();
      const roundTripMs = Math.max(0, readMonotonicNow() - requestStartedPerfMs);
      const adjustedServerNowMs = serverNowMs + Math.round(roundTripMs / 2);

      applyServerAnchor(adjustedServerNowMs, payload?.source || reason || url);
      return getTrustedTimeSnapshot();
    } catch (error) {
      lastError = error;
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  commitState({
    lastSyncError: lastError?.message || 'Sinkronisasi waktu server gagal',
  });

  throw lastError;
}

export function initializeTrustedTime() {
  if (initialized) {
    return () => { };
  }

  initialized = true;

  const hydrateTrustedState = () => {
    invalidateSnapshotCache();
    resetClockTamperRecoveryState();
    tamperRecoverySyncInFlight = false;
    lastLocalNowMs = readDeviceNow();
    lastPerfNowMs = readMonotonicNow();
    persistState();
    notifyListeners();
  };

  if (isNativeRuntime()) {
    refreshNativeClockSnapshot()
      .then(() => {
        state = loadPersistedState();
        rehydrateNativeAnchorAfterClockRefresh();
        hydrateTrustedState();
      })
      .catch(() => {
        state = loadPersistedState();
        hydrateTrustedState();
      });
  } else {
    state = loadPersistedState();
    hydrateTrustedState();
  }

  refreshNativeClockSnapshot()
    .then(() => {
      rehydrateNativeAnchorAfterClockRefresh();
      lastLocalNowMs = readDeviceNow();
      lastPerfNowMs = readMonotonicNow();
    })
    .catch(() => { });

  const handleOnline = () => {
    syncServerTime({ reason: 'online' }).catch((error) => {
      console.error('Sinkronisasi trusted time saat online gagal', error);
      notifyListeners();
    });
  };

  const handleOffline = () => {
    startOfflineSession();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible' || !getOnlineStatus()) return;

    const timeSinceLastSyncMs = Math.max(0, readDeviceNow() - (state.lastSyncAttemptAtMs || 0));
    if (timeSinceLastSyncMs < 60 * 1000) return;

    syncServerTime({ reason: 'focus' }).catch((error) => {
      console.error('Sinkronisasi trusted time saat fokus gagal', error);
    });
  };

  if (canUseWindow()) {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  if (typeof document !== 'undefined' && !visibilityListenerAttached) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    visibilityListenerAttached = true;
  }

  tickTimerId = window.setInterval(() => {
    notifyListeners();
  }, TICK_INTERVAL_MS);

  tamperTimerId = window.setInterval(() => {
    refreshNativeClockSnapshot().finally(() => {
      detectClockTampering();
    });
  }, CLOCK_TAMPER_CHECK_INTERVAL_MS);

  syncTimerId = window.setInterval(() => {
    if (!getOnlineStatus()) return;

    syncServerTime({ reason: 'interval' }).catch((error) => {
      console.error('Sinkronisasi trusted time terjadwal gagal', error);
    });
  }, SERVER_TIME_SYNC_INTERVAL_MS);

  if (getOnlineStatus()) {
    syncServerTime({ reason: 'init' }).catch((error) => {
      console.error('Sinkronisasi trusted time saat inisialisasi gagal', error);
      notifyListeners();
    });
  } else {
    startOfflineSession();
  }

  return () => {
    initialized = false;

    if (canUseWindow()) {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }

    if (typeof document !== 'undefined' && visibilityListenerAttached) {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      visibilityListenerAttached = false;
    }

    if (tickTimerId) {
      window.clearInterval(tickTimerId);
      tickTimerId = null;
    }

    if (tamperTimerId) {
      window.clearInterval(tamperTimerId);
      tamperTimerId = null;
    }

    if (syncTimerId) {
      window.clearInterval(syncTimerId);
      syncTimerId = null;
    }
  };
}
