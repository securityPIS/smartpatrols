import React from 'react';
import { buildTimeAuditInfo, summarizeTimeAudit } from '../services/time/timeAudit';

const TONE_CLASS_MAP = {
  success: {
    border: 'border-emerald-500/30',
    background: 'bg-emerald-500/10',
    text: 'text-emerald-200',
    subtext: 'text-emerald-300/75',
  },
  warning: {
    border: 'border-yellow-500/30',
    background: 'bg-yellow-500/10',
    text: 'text-yellow-100',
    subtext: 'text-yellow-200/75',
  },
  danger: {
    border: 'border-rose-500/30',
    background: 'bg-rose-500/10',
    text: 'text-rose-100',
    subtext: 'text-rose-200/75',
  },
  neutral: {
    border: 'border-cyan-800/50',
    background: 'bg-[#0b1229]',
    text: 'text-cyan-100',
    subtext: 'text-cyan-300/70',
  },
};

const auditDateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function getToneClasses(tone = 'neutral') {
  return TONE_CLASS_MAP[tone] || TONE_CLASS_MAP.neutral;
}

function formatAuditDateTime(value) {
  if (!value) return '-';
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) return '-';
  return auditDateFormatter.format(dateValue);
}

export function TimeAuditBadge({ label, tone = 'neutral' }) {
  const toneClass = getToneClasses(tone);

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${toneClass.border} ${toneClass.background} ${toneClass.text}`}>
      {label}
    </span>
  );
}

export function TimeAuditPills({ record, className = '', fallbackTimestampKeys }) {
  const audit = buildTimeAuditInfo(record, { fallbackTimestampKeys });

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      {audit.showTrustBadge ? (
        <TimeAuditBadge label={audit.trustLabel} tone={audit.trustTone} />
      ) : null}
      <TimeAuditBadge label={audit.verificationLabel} tone={audit.verificationTone} />
    </div>
  );
}

export function TimeAuditRecordCard({ record, title = 'Audit Waktu', className = '', fallbackTimestampKeys }) {
  const audit = buildTimeAuditInfo(record, { fallbackTimestampKeys });
  const toneClass = getToneClasses(audit.verificationTone);

  return (
    <div className={`rounded-2xl border p-4 ${toneClass.border} ${toneClass.background} ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[10px] font-black uppercase tracking-widest audit-card-title ${toneClass.subtext}`}>{title}</p>
          <TimeAuditPills
            record={record}
            fallbackTimestampKeys={fallbackTimestampKeys}
            className="mt-2"
          />
        </div>
        {audit.receivedAtServerMs ? (
          <div className="text-right">
            <p className={`text-[10px] font-black uppercase tracking-widest audit-card-title ${toneClass.subtext}`}>Verifikasi</p>
            <p className={`mt-1 text-xs font-bold ${toneClass.text}`}>{formatAuditDateTime(audit.receivedAtServerMs)}</p>
          </div>
        ) : null}
      </div>

      <p className={`mt-3 text-xs leading-relaxed ${toneClass.text}`}>{audit.warningMessage}</p>
    </div>
  );
}

export function TimeAuditSummaryCard({ records, title = 'Audit Waktu Shift', className = '', fallbackTimestampKeys }) {
  const summary = summarizeTimeAudit(records, { fallbackTimestampKeys });
  const toneClass = getToneClasses(summary.tone);

  return (
    <div className={`rounded-2xl border p-4 ${toneClass.border} ${toneClass.background} ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[10px] font-black uppercase tracking-widest audit-card-title ${toneClass.subtext}`}>{title}</p>
          <p className={`mt-1 text-sm font-black ${toneClass.text}`}>{summary.label}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#070b19]/40 px-3 py-2 text-right audit-record-box">
          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-500">Record</p>
          <p className="mt-1 text-sm font-black text-cyan-50">{summary.total}</p>
        </div>
      </div>

      <p className={`mt-3 text-xs leading-relaxed ${toneClass.text}`}>{summary.description}</p>

      {summary.total > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.counts.verified > 0 ? <TimeAuditBadge label={`${summary.counts.verified} terverifikasi`} tone="success" /> : null}
          {summary.counts['pending-sync'] > 0 ? <TimeAuditBadge label={`${summary.counts['pending-sync']} menunggu`} tone="warning" /> : null}
          {summary.counts['needs-review'] > 0 ? <TimeAuditBadge label={`${summary.counts['needs-review']} review`} tone="warning" /> : null}
          {summary.counts.suspicious > 0 ? <TimeAuditBadge label={`${summary.counts.suspicious} anomali`} tone="danger" /> : null}
          {summary.counts.legacy > 0 ? <TimeAuditBadge label={`${summary.counts.legacy} legacy`} tone="neutral" /> : null}
        </div>
      ) : null}
    </div>
  );
}
