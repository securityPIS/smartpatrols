/*
Tujuan: Menyediakan resolver status temuan/SOS yang konsisten untuk incident manual, patrol, dan history.
Caller: AppContextRuntime, IncidentsPage, dan IncidentDetailView.
Dependensi: Tidak ada dependensi eksternal; hanya normalisasi string lokal.
Main Functions: Membangun kandidat key incidentMeta, mengambil meta yang cocok, dan menentukan status open/closed.
Side Effects: Tidak ada.
*/

function normalizeIncidentMetaKeyPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function buildIncidentMetaKeyCandidates(incident) {
  const candidates = new Set();
  const exactId = String(incident?.id || '').trim();
  const explicitIncidentId = String(incident?.incidentId || '').trim();
  const firestoreId = String(incident?.firestoreId || '').trim();
  const checkpointToken = normalizeIncidentMetaKeyPart(incident?.checkpointId);
  const completedToken = normalizeIncidentMetaKeyPart(incident?.completedAt);

  if (exactId) candidates.add(exactId);
  if (explicitIncidentId) candidates.add(explicitIncidentId);
  if (firestoreId) candidates.add(firestoreId);
  if (checkpointToken) {
    candidates.add(`p-${checkpointToken}`);
    if (completedToken) {
      candidates.add(`p-${checkpointToken}-${completedToken}`);
    }
  }

  return Array.from(candidates);
}

export function resolveIncidentMetaRecord(incidentMeta = {}, incident = null) {
  const candidates = buildIncidentMetaKeyCandidates(incident);
  return candidates.reduce((resolvedMeta, candidateKey) => (
    resolvedMeta || incidentMeta?.[candidateKey] || null
  ), null);
}

function isIncidentMetaRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return [
    'status',
    'progress',
    'documentation',
    'infoOverrides',
    'deleted',
  ].some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function getIncidentStatus(incident, incidentMetaOrRecord = {}) {
  const metaRecord = isIncidentMetaRecord(incidentMetaOrRecord)
    ? incidentMetaOrRecord
    : resolveIncidentMetaRecord(incidentMetaOrRecord, incident);
  const metaStatus = metaRecord?.status;
  if (metaStatus) return metaStatus;
  if (incident?.isSOS) {
    return incident.sosStatus === 'resolved' || incident.status === 'resolved' ? 'closed' : 'open';
  }
  return incident?.status || 'open';
}
