import { APP_STORAGE_KEY, APP_STORAGE_VERSION, WEATHER_CACHE_KEY, WEATHER_CACHE_TTL_MS } from "../data/defaultData";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadAppState(defaultState) {
  if (!canUseStorage()) {
    return defaultState;
  }

  try {
    const raw = window.localStorage.getItem(APP_STORAGE_KEY);
    if (!raw) {
      return defaultState;
    }

    const parsed = JSON.parse(raw);
    if (parsed?.version !== APP_STORAGE_VERSION || typeof parsed?.state !== "object") {
      return defaultState;
    }

    const nextState = parsed.state;

    return {
      ...defaultState,
      checkpoints: Array.isArray(nextState.checkpoints) ? nextState.checkpoints : defaultState.checkpoints,
      users: Array.isArray(nextState.users) ? nextState.users : defaultState.users,
      ships: Array.isArray(nextState.ships) ? nextState.ships : defaultState.ships,
      incidents: Array.isArray(nextState.incidents) ? nextState.incidents : defaultState.incidents,
      incidentMeta: nextState.incidentMeta && typeof nextState.incidentMeta === "object" ? nextState.incidentMeta : defaultState.incidentMeta,
      activityLog: Array.isArray(nextState.activityLog) ? nextState.activityLog : defaultState.activityLog,
    };
  } catch {
    return defaultState;
  }
}

export function saveAppState(state) {
  if (!canUseStorage()) {
    return;
  }

  const payload = {
    version: APP_STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    state: {
      checkpoints: state.checkpoints,
      users: state.users,
      ships: state.ships,
      incidents: state.incidents,
      incidentMeta: state.incidentMeta,
      activityLog: state.activityLog.slice(0, 150),
    },
  };

  try {
    window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("SmartPatrol local save skipped:", error);
  }
}

export function loadWeatherCache() {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed?.payload || !parsed?.savedAt) {
      return null;
    }

    if (Date.now() - new Date(parsed.savedAt).getTime() > WEATHER_CACHE_TTL_MS) {
      return null;
    }

    return parsed.payload;
  } catch {
    return null;
  }
}

export function saveWeatherCache(payload) {
  if (!canUseStorage() || !payload) {
    return;
  }

  try {
    window.localStorage.setItem(
      WEATHER_CACHE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        payload,
      }),
    );
  } catch (error) {
    console.warn("Weather cache skipped:", error);
  }
}
