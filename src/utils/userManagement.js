/*
Tujuan: Menjaga integritas state user dan penugasan kapal pada modul admin.
Caller: AppContextRuntime dan test regresi manajemen user.
Dependensi: Tidak ada dependensi eksternal.
Main Functions: Assignment eksklusif user lintas kapal, unassign terarah, pembacaan override eksplisit, dan guard bootstrap armada.
Side Effects: Tidak ada; semua helper bersifat pure function.
*/

function toUserIdList(value) {
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  ));
}

function withoutUserId(list, userId) {
  return toUserIdList(list).filter((item) => item !== userId);
}

function appendUserId(list, userId) {
  return Array.from(new Set([...toUserIdList(list), userId].filter(Boolean)));
}

function cloneSchedules(schedules) {
  return schedules && typeof schedules === 'object' ? { ...schedules } : {};
}

function areArraysEqual(left, right) {
  const leftList = toUserIdList(left);
  const rightList = toUserIdList(right);
  return leftList.length === rightList.length && leftList.every((item, index) => item === rightList[index]);
}

function areSchedulesEqual(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function addMutationMetaIfChanged(originalShip, nextShip, mutationMeta = {}) {
  const changed = (
    !areArraysEqual(originalShip?.personnel, nextShip.personnel)
    || !areArraysEqual(originalShip?.personnelNextMonth, nextShip.personnelNextMonth)
    || !areSchedulesEqual(originalShip?.personnelSchedules, nextShip.personnelSchedules)
  );

  return changed ? { ...nextShip, ...mutationMeta } : originalShip;
}

function normalizeSchedule(schedule = {}) {
  return {
    startDate: String(schedule.startDate || ''),
    endDate: String(schedule.endDate || ''),
    isTBC: Boolean(schedule.isTBC),
  };
}

export function resolveExplicitOverride(overrides = {}, source = {}, key, fallback = '') {
  if (Object.prototype.hasOwnProperty.call(overrides || {}, key)) {
    return overrides[key];
  }
  if (Object.prototype.hasOwnProperty.call(source || {}, key)) {
    return source[key];
  }
  return fallback;
}

export function assignUserToExclusiveShip(ships = [], options = {}) {
  const userId = String(options.userId || '').trim();
  const targetShipId = String(options.targetShipId || '').trim();
  const scheduleType = options.scheduleType === 'next' ? 'next' : 'current';
  const schedule = normalizeSchedule(options.schedule || {});
  const mutationMeta = options.mutationMeta || {};

  if (!userId || !targetShipId || !Array.isArray(ships)) return Array.isArray(ships) ? ships : [];

  return ships.map((ship) => {
    const isTargetShip = String(ship?.id || '') === targetShipId;
    const originalTargetSchedule = isTargetShip ? { ...(ship?.personnelSchedules?.[userId] || {}) } : {};
    let personnel = toUserIdList(ship?.personnel);
    let personnelNextMonth = toUserIdList(ship?.personnelNextMonth);
    const personnelSchedules = cloneSchedules(ship?.personnelSchedules);

    if (scheduleType === 'current') {
      personnel = withoutUserId(personnel, userId);
      personnelNextMonth = withoutUserId(personnelNextMonth, userId);
      delete personnelSchedules[userId];
    } else {
      personnelNextMonth = withoutUserId(personnelNextMonth, userId);
      if (!personnel.includes(userId)) {
        delete personnelSchedules[userId];
      }
    }

    if (isTargetShip) {
      if (scheduleType === 'current') {
        personnel = appendUserId(personnel, userId);
      } else {
        personnelNextMonth = appendUserId(personnelNextMonth, userId);
      }
      personnelSchedules[userId] = {
        ...originalTargetSchedule,
        ...schedule,
      };
    }

    return addMutationMetaIfChanged(ship, {
      ...ship,
      personnel,
      personnelNextMonth,
      personnelSchedules,
    }, mutationMeta);
  });
}

export function removeUserFromShipAssignment(ships = [], options = {}) {
  const userId = String(options.userId || '').trim();
  const targetShipId = String(options.targetShipId || '').trim();
  const scheduleType = options.scheduleType === 'next' ? 'next' : 'current';
  const mutationMeta = options.mutationMeta || {};

  if (!userId || !targetShipId || !Array.isArray(ships)) {
    return { ships: Array.isArray(ships) ? ships : [], remainingCurrentAssignment: null };
  }

  const nextShips = ships.map((ship) => {
    if (String(ship?.id || '') !== targetShipId) return ship;

    const personnel = scheduleType === 'current'
      ? withoutUserId(ship?.personnel, userId)
      : toUserIdList(ship?.personnel);
    const personnelNextMonth = scheduleType === 'next'
      ? withoutUserId(ship?.personnelNextMonth, userId)
      : toUserIdList(ship?.personnelNextMonth);
    const personnelSchedules = cloneSchedules(ship?.personnelSchedules);

    if (!personnel.includes(userId) && !personnelNextMonth.includes(userId)) {
      delete personnelSchedules[userId];
    }

    return addMutationMetaIfChanged(ship, {
      ...ship,
      personnel,
      personnelNextMonth,
      personnelSchedules,
    }, mutationMeta);
  });

  const remainingShip = nextShips.find((ship) => toUserIdList(ship?.personnel).includes(userId)) || null;

  return {
    ships: nextShips,
    remainingCurrentAssignment: remainingShip
      ? { shipId: remainingShip.id, shipName: remainingShip.name }
      : null,
  };
}

// PETUGAS role marker — duplikat string (bukan import dari AppContextRuntime untuk hindari siklus).
const PETUGAS_ROLE = 'PETUGAS';

export function shouldDeferPetugasFleetValidation({
  isCloudSyncEnabled = false,
  cloudSyncBootstrapped = true,
  isOffline = false,
  user = null,
  assignedShip = null,
} = {}) {
  const role = String(user?.role || '').toUpperCase();
  const status = String(user?.status || '').toLowerCase();
  const shipAssigned = String(user?.shipAssigned || '').trim();

  return Boolean(
    isCloudSyncEnabled
    && !cloudSyncBootstrapped
    && !isOffline
    && role === PETUGAS_ROLE
    && status === 'active'
    && shipAssigned
    && !assignedShip
  );
}

/*
Rekonsiliasi user.shipAssigned untuk PETUGAS terhadap ship.personnel sebagai source of truth.
Dipanggil saat data masuk dari cloud/persisted state agar nama petugas yang sudah dipindah
tidak nyangkut di kapal lama saat di-filter pada DATA USER.
Admin/PIC dilewati karena shipAssigned mereka bisa di-set tanpa masuk personnel kapal.
*/
export function reconcileUserShipAssignments(users = [], ships = []) {
  const safeUsers = Array.isArray(users) ? users : [];
  const safeShips = Array.isArray(ships) ? ships : [];
  if (safeUsers.length === 0) return safeUsers;

  const personnelOwnershipByUserId = new Map();
  safeShips.forEach((ship) => {
    toUserIdList(ship?.personnel).forEach((uId) => {
      if (!personnelOwnershipByUserId.has(uId)) {
        personnelOwnershipByUserId.set(uId, { shipId: ship?.id || '', shipName: ship?.name || '' });
      }
    });
  });

  let changed = false;
  const next = safeUsers.map((u) => {
    if (!u || typeof u !== 'object') return u;
    if (String(u.role || '').toUpperCase() !== PETUGAS_ROLE) return u;

    const ownership = personnelOwnershipByUserId.get(u.id) || null;
    const expectedShipName = ownership?.shipName || null;
    const currentShipAssigned = String(u.shipAssigned || '').trim() || null;
    if (currentShipAssigned === expectedShipName) return u;

    changed = true;
    return {
      ...u,
      shipAssigned: expectedShipName,
      status: expectedShipName ? 'active' : (u.status === 'disabled' ? 'disabled' : 'off-duty'),
    };
  });

  return changed ? next : safeUsers;
}
