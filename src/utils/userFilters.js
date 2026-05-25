/*
Tujuan: Menyediakan helper filter daftar user operasional SmartPatrol.
Caller: UsersPage dan test halaman data user.
Dependensi: Tidak ada dependensi eksternal.
Main Functions: Normalisasi query filter, penyaringan user, dan penyusunan opsi dropdown unik.
Side Effects: Tidak ada; semua helper bersifat pure function.
*/

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeExact(value) {
  return String(value || '').trim();
}

function includesText(value, query) {
  if (!query) return true;
  return normalizeText(value).includes(query);
}

function getUserSearchHaystack(user) {
  return [
    user?.name,
    user?.email,
    user?.phone,
    user?.workerNumber,
    user?.shipAssigned,
    user?.role,
    user?.type,
  ];
}

function matchesTextFilter(user, query) {
  if (!query) return true;
  return getUserSearchHaystack(user).some((value) => includesText(value, query));
}

function matchesExactFilter(value, selectedValue) {
  if (!selectedValue) return true;
  return normalizeExact(value) === selectedValue;
}

function uniqueSorted(values) {
  return Array.from(new Set(
    values
      .map((value) => normalizeExact(value))
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));
}

export function filterUsers(users, filters = {}) {
  const query = normalizeText(filters.text);
  const selectedShip = normalizeExact(filters.ship);
  const selectedAgency = normalizeExact(filters.agency);
  const selectedRole = normalizeExact(filters.role);

  return (Array.isArray(users) ? users : []).filter((user) => (
    matchesTextFilter(user, query)
    && matchesExactFilter(user?.shipAssigned, selectedShip)
    && matchesExactFilter(user?.type, selectedAgency)
    && matchesExactFilter(user?.role, selectedRole)
  ));
}

export function getUserFilterOptions(users, ships = []) {
  const safeUsers = Array.isArray(users) ? users : [];
  const safeShips = Array.isArray(ships) ? ships : [];

  return {
    ships: uniqueSorted([
      ...safeShips.map((ship) => ship?.name),
      ...safeUsers.map((user) => user?.shipAssigned),
    ]),
    agencies: uniqueSorted(safeUsers.map((user) => user?.type)),
    roles: uniqueSorted(safeUsers.map((user) => user?.role)),
  };
}

export function hasActiveUserFilters(filters = {}) {
  return Boolean(
    normalizeText(filters.text)
    || normalizeExact(filters.ship)
    || normalizeExact(filters.agency)
    || normalizeExact(filters.role),
  );
}
