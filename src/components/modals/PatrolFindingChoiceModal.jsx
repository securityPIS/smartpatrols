/*
Tujuan: Memberi pilihan kepada petugas untuk membuat temuan baru atau memperbarui temuan lama yang masih open pada checkpoint yang sama.
Caller: AppShell saat patrolFindingChoice aktif dari AppContextRuntime.
Dependensi: React, lucide-react, dan hook patrol AppContextRuntime.
Main Functions: Menampilkan pilihan Temuan Baru/Temuan Lama serta daftar temuan open bila kandidat lebih dari satu.
Side Effects: Memanggil handler context untuk membuka kamera patroli atau detail update temuan.
*/

import React from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, FileText, Plus, Ship, User, X } from 'lucide-react';
import { usePatrol } from '../../context/AppContextRuntime';

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function truncateText(value, limit = 96) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

export default function PatrolFindingChoiceModal() {
  const {
    patrolFindingChoice,
    closePatrolFindingChoice,
    chooseNewPatrolFinding,
    openFindingUpdate,
  } = usePatrol();
  const [showList, setShowList] = React.useState(false);

  const openFindings = ensureArray(patrolFindingChoice?.openFindings);
  const checkpointName = patrolFindingChoice?.checkpointName || 'Checkpoint';

  React.useEffect(() => {
    setShowList(false);
  }, [patrolFindingChoice?.checkpointId]);

  if (!patrolFindingChoice) return null;

  const handleOpenOldFinding = () => {
    if (openFindings.length === 1) {
      openFindingUpdate(openFindings[0]);
      return;
    }
    setShowList(true);
  };

  return (
    <div className="fixed inset-0 z-[105] flex items-end sm:items-center justify-center bg-[#070b19]/90 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-md max-h-[86vh] overflow-hidden rounded-[1.5rem] border border-yellow-500/30 bg-[#0b1229] shadow-2xl shadow-yellow-900/20 flex flex-col">
        <div className="px-5 py-4 border-b border-cyan-900/50 bg-[#070b19]/60 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-yellow-500">Temuan Patroli</p>
            <h3 className="mt-1 text-lg font-black text-white leading-tight">{checkpointName}</h3>
            <p className="mt-1 text-xs text-cyan-300/75">{openFindings.length} temuan lama masih open</p>
          </div>
          <button
            type="button"
            onClick={closePatrolFindingChoice}
            className="w-10 h-10 rounded-xl border border-cyan-800/70 bg-[#0b1229] text-cyan-300 flex items-center justify-center hover:bg-cyan-900/30 transition-colors"
            aria-label="Tutup pilihan temuan"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!showList ? (
          <div className="p-5 space-y-3 overflow-y-auto">
            <button
              type="button"
              onClick={chooseNewPatrolFinding}
              className="w-full rounded-2xl border border-cyan-700/60 bg-cyan-500/10 p-4 text-left hover:bg-cyan-500/20 transition-colors active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 flex items-center justify-center shrink-0">
                  <Plus className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black uppercase tracking-widest text-cyan-100">Temuan Baru</span>
                  <span className="mt-1 block text-xs leading-relaxed text-cyan-300/70">Ambil foto dan isi laporan baru untuk checkpoint ini.</span>
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={handleOpenOldFinding}
              className="w-full rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-left hover:bg-yellow-500/20 transition-colors active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black uppercase tracking-widest text-yellow-100">Temuan Lama</span>
                  <span className="mt-1 block text-xs leading-relaxed text-yellow-100/70">
                    Tambahkan update ke temuan open yang sudah tercatat.
                  </span>
                </span>
              </div>
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-5 py-3 border-b border-cyan-900/50 bg-[#070b19]/35 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowList(false)}
                className="w-9 h-9 rounded-xl border border-cyan-800/70 text-cyan-300 flex items-center justify-center hover:bg-cyan-900/30 transition-colors"
                aria-label="Kembali ke pilihan temuan"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <p className="text-xs font-black uppercase tracking-widest text-cyan-300">Pilih Temuan Lama</p>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto">
              {openFindings.map((finding) => (
                <button
                  key={finding.id}
                  type="button"
                  onClick={() => openFindingUpdate(finding)}
                  className="w-full rounded-2xl border border-cyan-900/70 bg-[#070b19]/55 p-4 text-left hover:border-yellow-500/50 hover:bg-yellow-500/10 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-cyan-50 leading-tight">{truncateText(finding.location || checkpointName, 64)}</p>
                      <p className="mt-2 text-xs leading-relaxed text-cyan-200/75">{truncateText(finding.deskripsi || finding.tindakLanjut || finding.penyebab || 'Belum ada ringkasan.', 110)}</p>
                    </div>
                    <span className="shrink-0 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 text-[10px] font-black tracking-widest text-yellow-300">OPEN</span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-cyan-400/80">
                    <span className="flex items-center gap-2 min-w-0">
                      <Ship className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{finding.shipName || '-'}</span>
                    </span>
                    <span className="flex items-center gap-2 min-w-0">
                      <User className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{finding.reportedBy || '-'}</span>
                    </span>
                    <span className="flex items-center gap-2 min-w-0">
                      <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{finding.date || '-'} {finding.time || ''}</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="px-5 py-3 border-t border-cyan-900/50 bg-[#070b19]/50 flex items-center gap-2 text-[11px] text-cyan-500">
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span className="leading-relaxed">Update temuan lama tidak membuat laporan patroli baru.</span>
        </div>
      </div>
    </div>
  );
}
