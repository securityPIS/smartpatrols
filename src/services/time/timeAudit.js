/*
Tujuan: Menormalisasi metadata audit waktu dan status verifikasi timestamp operasional.
Caller: AppContextRuntime, kartu audit waktu, dan ringkasan laporan patroli.
Dependensi: Metadata trusted time pada record lokal/cloud.
Main Functions: extractTimeAuditFields, normalizeTimeAuditRecord, markTimeAuditRecordReceived, buildTimeAuditInfo, summarizeTimeAudit.
Side Effects: Tidak ada side effect; semua helper bersifat pure untuk validasi tampilan dan sinkronisasi.
*/

const TRUST_LEVEL_META = {
  'server-trusted': {
    label: 'Waktu tersinkron',
    description: 'Timestamp mengikuti anchor waktu server yang aktif.',
    tone: 'success',
  },
  'offline-trusted': {
    label: 'Offline trusted',
    description: 'Timestamp dihitung offline dari anchor server terakhir.',
    tone: 'warning',
  },
  'offline-interrupted': {
    label: 'Offline interrupted',
    description: 'Sesi offline sempat terputus sehingga timestamp perlu ditinjau ulang.',
    tone: 'danger',
  },
  unverified: {
    label: 'Belum sinkron',
    description: 'Belum ada anchor server yang valid untuk record ini.',
    tone: 'danger',
  },
  legacy: {
    label: 'Data legacy',
    description: 'Record lama belum menyimpan metadata trusted time.',
    tone: 'neutral',
  },
};

const VERIFICATION_META = {
  verified: {
    label: 'Terverifikasi',
    description: 'Timestamp record sudah tervalidasi oleh anchor server atau sinkronisasi ulang.',
    tone: 'success',
  },
  'pending-sync': {
    label: 'Menunggu verifikasi',
    description: 'Record tersimpan, tetapi masih menunggu cap sinkronisasi ulang dari server.',
    tone: 'warning',
  },
  'needs-review': {
    label: 'Perlu review',
    description: 'Timestamp masuk, tetapi harus diperiksa sebelum dipakai sebagai bukti audit penuh.',
    tone: 'warning',
  },
  suspicious: {
    label: 'Anomali waktu',
    description: 'Perubahan jam perangkat terdeteksi. Lakukan audit manual.',
    tone: 'danger',
  },
  legacy: {
    label: 'Data legacy',
    description: 'Record lama belum memiliki jejak verifikasi trusted time.',
    tone: 'neutral',
  },
};

const VALID_TRUST_LEVELS = new Set([
  'server-trusted',
  'offline-trusted',
  'offline-interrupted',
  'unverified',
]);

function asFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function resolveTimestampMs(value) {
  const numericValue = asFiniteNumber(value);
  if (numericValue !== null) return numericValue;

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  if (typeof value?.toMillis === 'function') {
    const timestamp = value.toMillis();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  if (typeof value === 'string' && value.trim()) {
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  return null;
}

function pickFirstTimestampMs(record, keys = []) {
  for (const key of keys) {
    const timestamp = resolveTimestampMs(record?.[key]);
    if (timestamp !== null) return timestamp;
  }

  return null;
}

function shouldPromoteServerReceivedRecord(record = {}) {
  return Boolean(
    resolveTimestampMs(record.receivedAtServerMs) !== null
    && resolveTimestampMs(record.anchorSyncedAtMs) !== null
    && resolveTimestampMs(record.occurredAtTrustedMs ?? record.occurredAtTrustedIso) !== null
    && record.offlineSessionInterrupted !== true
  );
}

export function hasTimeAuditMetadata(record) {
  if (!record || typeof record !== 'object') return false;

  return Boolean(
    VALID_TRUST_LEVELS.has(record.timeTrustLevel)
    || resolveTimestampMs(record.occurredAtTrustedMs) !== null
    || resolveTimestampMs(record.occurredAtTrustedIso) !== null
    || resolveTimestampMs(record.receivedAtServerMs) !== null
    || typeof record.offlineSessionId === 'string'
    || typeof record.offlineSessionInterrupted === 'boolean'
    || typeof record.clockTamperDetected === 'boolean'
    || resolveTimestampMs(record.anchorSyncedAtMs) !== null
  );
}

export function extractTimeAuditFields(record = {}) {
  return {
    occurredAtTrustedMs: resolveTimestampMs(record.occurredAtTrustedMs),
    occurredAtTrustedIso: resolveTimestampMs(record.occurredAtTrustedIso) !== null
      ? new Date(resolveTimestampMs(record.occurredAtTrustedIso)).toISOString()
      : (typeof record.occurredAtTrustedIso === 'string' ? record.occurredAtTrustedIso : null),
    occurredAtClientMs: resolveTimestampMs(record.occurredAtClientMs),
    receivedAtServerMs: resolveTimestampMs(record.receivedAtServerMs),
    timeTrustLevel: VALID_TRUST_LEVELS.has(record.timeTrustLevel) ? record.timeTrustLevel : null,
    verificationStatus: typeof record.verificationStatus === 'string' ? record.verificationStatus : null,
    offlineSessionId: typeof record.offlineSessionId === 'string' ? record.offlineSessionId : null,
    offlineSessionInterrupted: Boolean(record.offlineSessionInterrupted),
    clockTamperDetected: Boolean(record.clockTamperDetected),
    anchorSyncedAtMs: resolveTimestampMs(record.anchorSyncedAtMs),
  };
}

export function resolveTimeVerificationStatus(record, options = {}) {
  const hasAuditMetadata = options.hasAuditMetadata ?? hasTimeAuditMetadata(record);
  if (!hasAuditMetadata) return 'legacy';

  const trustLevel = VALID_TRUST_LEVELS.has(record?.timeTrustLevel)
    ? record.timeTrustLevel
    : 'unverified';
  const hasServerReceipt = resolveTimestampMs(record?.receivedAtServerMs) !== null;

  if (record?.clockTamperDetected) {
    if (!hasServerReceipt) return 'suspicious';
    if (trustLevel === 'offline-interrupted' || trustLevel === 'unverified') {
      return 'needs-review';
    }
    return 'verified';
  }

  if (trustLevel === 'offline-interrupted' || trustLevel === 'unverified') {
    return 'needs-review';
  }

  // Record yang dibuat saat anchor server aktif sudah layak dianggap terverifikasi,
  // walau cap receipt cloud belum ditulis balik ke payload lokal.
  if (hasServerReceipt || trustLevel === 'server-trusted') {
    return 'verified';
  }

  return 'pending-sync';
}

export function normalizeTimeAuditRecord(record, options = {}) {
  if (!record || typeof record !== 'object') return record;

  const fallbackTimestampKeys = Array.isArray(options.fallbackTimestampKeys)
    ? options.fallbackTimestampKeys
    : ['completedAt', 'createdAt', 'updatedAt', 'triggeredAt'];

  const metadataPresent = hasTimeAuditMetadata(record);
  const fallbackTimestampMs = pickFirstTimestampMs(record, fallbackTimestampKeys);
  const shouldPromoteFallbackTimestamp = metadataPresent || options.promoteFallbackTimestamp === true;
  const occurredAtTrustedMs = resolveTimestampMs(record.occurredAtTrustedMs)
    ?? resolveTimestampMs(record.occurredAtTrustedIso)
    ?? (shouldPromoteFallbackTimestamp ? fallbackTimestampMs : null);
  const occurredAtTrustedIso = typeof record.occurredAtTrustedIso === 'string' && record.occurredAtTrustedIso
    ? record.occurredAtTrustedIso
    : (occurredAtTrustedMs !== null ? new Date(occurredAtTrustedMs).toISOString() : null);
  let timeTrustLevel = VALID_TRUST_LEVELS.has(record.timeTrustLevel)
    ? record.timeTrustLevel
    : (metadataPresent || occurredAtTrustedIso ? 'unverified' : null);

  if (timeTrustLevel === 'unverified' && shouldPromoteServerReceivedRecord({
    ...record,
    occurredAtTrustedMs,
    occurredAtTrustedIso,
  })) {
    timeTrustLevel = 'server-trusted';
  }

  if (!metadataPresent && !occurredAtTrustedIso) {
    return {
      ...record,
      verificationStatus: 'legacy',
    };
  }

  const normalizedRecord = {
    ...record,
    occurredAtTrustedMs,
    occurredAtTrustedIso,
    occurredAtClientMs: resolveTimestampMs(record.occurredAtClientMs),
    receivedAtServerMs: resolveTimestampMs(record.receivedAtServerMs),
    timeTrustLevel,
    offlineSessionId: typeof record.offlineSessionId === 'string' ? record.offlineSessionId : null,
    offlineSessionInterrupted: Boolean(record.offlineSessionInterrupted),
    clockTamperDetected: Boolean(record.clockTamperDetected),
    anchorSyncedAtMs: resolveTimestampMs(record.anchorSyncedAtMs),
  };

  normalizedRecord.verificationStatus = resolveTimeVerificationStatus(normalizedRecord, {
    hasAuditMetadata: true,
  });

  return normalizedRecord;
}

export function markTimeAuditRecordReceived(record, receivedAtServerMs, options = {}) {
  const normalizedRecord = normalizeTimeAuditRecord(record, options);
  if (!hasTimeAuditMetadata(normalizedRecord)) return normalizedRecord;

  const resolvedReceivedAtMs = resolveTimestampMs(receivedAtServerMs);
  if (resolvedReceivedAtMs !== null) {
    // Preserve original server-receipt timestamp: stamp ONCE saat record pertama
    // kali sampai ke server, jangan diubah lagi pada sync berikutnya. Ini supaya
    // kolom "Verifikasi" di UI menunjukkan waktu server menerima data,
    // bukan waktu sync terakhir.
    if (!Number.isFinite(normalizedRecord.receivedAtServerMs)) {
      normalizedRecord.receivedAtServerMs = resolvedReceivedAtMs;
    }
  }

  if (normalizedRecord.timeTrustLevel === 'unverified' && shouldPromoteServerReceivedRecord(normalizedRecord)) {
    normalizedRecord.timeTrustLevel = 'server-trusted';
  }

  normalizedRecord.verificationStatus = resolveTimeVerificationStatus(normalizedRecord, {
    hasAuditMetadata: true,
  });

  return normalizedRecord;
}

export function buildTimeAuditInfo(record, options = {}) {
  const normalizedRecord = normalizeTimeAuditRecord(record, options);
  const hasAuditMetadata = hasTimeAuditMetadata(normalizedRecord);
  const trustLevel = hasAuditMetadata
    ? (normalizedRecord.timeTrustLevel || 'unverified')
    : 'legacy';
  const verificationStatus = normalizedRecord.verificationStatus || resolveTimeVerificationStatus(normalizedRecord);
  const trustMeta = TRUST_LEVEL_META[trustLevel] || TRUST_LEVEL_META.legacy;
  const verificationMeta = VERIFICATION_META[verificationStatus] || VERIFICATION_META.legacy;

  let warningMessage = verificationMeta.description;
  if (normalizedRecord.clockTamperDetected) {
    warningMessage = verificationStatus === 'suspicious'
      ? 'Perubahan jam perangkat terdeteksi. Record perlu audit manual.'
      : verificationStatus === 'needs-review'
        ? 'Perubahan jam perangkat sempat terdeteksi. Record sudah tersimpan, tetapi tetap perlu review.'
        : 'Perubahan jam perangkat sempat terdeteksi, tetapi record ini sudah diverifikasi ulang setelah sinkronisasi server.';
  } else if (trustLevel === 'offline-interrupted') {
    warningMessage = 'Sesi aplikasi sempat terputus saat offline. Record ini wajib direview.';
  } else if (trustLevel === 'offline-trusted' && verificationStatus === 'verified') {
    warningMessage = 'Record offline ini sudah lolos sinkronisasi kembali dan diterima sistem.';
  } else if (trustLevel === 'server-trusted' && verificationStatus === 'verified') {
    warningMessage = 'Record ini menggunakan anchor waktu server aktif dan siap dipakai sebagai jejak audit.';
  }

  return {
    record: normalizedRecord,
    hasAuditMetadata,
    trustLevel,
    trustLabel: trustMeta.label,
    trustTone: trustMeta.tone,
    trustDescription: trustMeta.description,
    verificationStatus,
    verificationLabel: verificationMeta.label,
    verificationTone: verificationMeta.tone,
    verificationDescription: verificationMeta.description,
    warningMessage,
    receivedAtServerMs: resolveTimestampMs(normalizedRecord.receivedAtServerMs),
    showTrustBadge: hasAuditMetadata,
  };
}

export function summarizeTimeAudit(records = [], options = {}) {
  const audits = records
    .filter(Boolean)
    .map((record) => buildTimeAuditInfo(record, options));

  const counts = {
    verified: 0,
    'pending-sync': 0,
    'needs-review': 0,
    suspicious: 0,
    legacy: 0,
  };

  audits.forEach((audit) => {
    counts[audit.verificationStatus] += 1;
  });

  const total = audits.length;
  const primaryStatus = total === 0
    ? 'legacy'
    : counts.suspicious > 0
      ? 'suspicious'
      : counts['needs-review'] > 0
        ? 'needs-review'
        : counts['pending-sync'] > 0
          ? 'pending-sync'
          : counts.verified > 0
            ? 'verified'
            : 'legacy';

  const primaryMeta = VERIFICATION_META[primaryStatus] || VERIFICATION_META.legacy;
  const summaryParts = [];

  if (counts.verified > 0) {
    summaryParts.push(`${counts.verified} terverifikasi`);
  }

  if (counts['pending-sync'] > 0) {
    summaryParts.push(`${counts['pending-sync']} menunggu verifikasi`);
  }

  const reviewCount = counts['needs-review'] + counts.suspicious;
  if (reviewCount > 0) {
    summaryParts.push(`${reviewCount} perlu review`);
  }

  if (counts.legacy > 0) {
    summaryParts.push(`${counts.legacy} data legacy`);
  }

  return {
    total,
    counts,
    primaryStatus,
    label: primaryMeta.label,
    tone: primaryMeta.tone,
    description: total === 0
      ? 'Belum ada record operasional yang menyimpan jejak audit waktu pada panel ini.'
      : summaryParts.join(' • '),
  };
}
