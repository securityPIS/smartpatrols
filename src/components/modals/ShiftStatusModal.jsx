/*
Tujuan: Menampilkan modal status petugas shift sebelum checklist patroli dibuka.
Caller: PatrolPage pada shift aktif ketika status petugas belum diisi.
Dependensi: Patrol context, data kapal operasional, dan ModalShell UI.
Main Functions: Menyusun draft status patroli/istirahat per petugas dan menyimpan snapshot shift aktif.
Side Effects: Menulis record status petugas shift ke state runtime agar checkpoint dapat diaktifkan.
*/

import React from 'react';
import { Coffee, ShieldCheck, Users } from 'lucide-react';
import { usePatrol, useShips } from '../../context/AppContextRuntime';
import { ModalShell } from '../ui';

function buildDraftItems(guards = []) {
  return (Array.isArray(guards) ? guards : []).map((guard) => ({
    userId: guard?.id || null,
    name: guard?.name || 'Petugas',
    status: guard?.shiftStatus === 'istirahat' ? 'istirahat' : 'patroli',
  }));
}

export default function ShiftStatusModal() {
  const {
    activeShiftGuardSnapshot,
    currentShiftMeta,
    showShiftStatusModal,
    closeShiftStatusModal,
    handleSaveCurrentShiftStatus,
  } = usePatrol();
  const { operationalShipName } = useShips();
  const [draftItems, setDraftItems] = React.useState(() => buildDraftItems(activeShiftGuardSnapshot));
  const wasOpenRef = React.useRef(false);

  React.useEffect(() => {
    if (showShiftStatusModal && !wasOpenRef.current) {
      setDraftItems(buildDraftItems(activeShiftGuardSnapshot));
    }

    wasOpenRef.current = showShiftStatusModal;
  }, [activeShiftGuardSnapshot, showShiftStatusModal]);

  if (!showShiftStatusModal) return null;

  const restCount = draftItems.filter((item) => item.status === 'istirahat').length;
  const handleSetStatus = (itemKey, nextStatus) => {
    setDraftItems((previousItems) => previousItems.map((item) => (
      (item.userId || item.name) === itemKey
        ? { ...item, status: nextStatus }
        : item
    )));
  };

  const handleSave = () => {
    handleSaveCurrentShiftStatus(draftItems);
  };

  const actions = (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={closeShiftStatusModal}
        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-200 transition hover:border-cyan-400/40 hover:text-white"
      >
        Tutup
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={draftItems.length === 0}
        className="rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm font-bold text-emerald-100 transition hover:border-emerald-300/50 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Simpan Status Shift
      </button>
    </div>
  );

  return (
    <ModalShell
      title="Status Petugas Shift"
      subtitle="Patroli Aktif"
      onClose={closeShiftStatusModal}
      maxWidth="max-w-2xl"
      actions={actions}
    >
      <div className="space-y-5">
        <div className="rounded-3xl border border-cyan-500/15 bg-cyan-500/5 p-4 text-sm text-slate-200">
          <div className="flex items-center gap-2 text-cyan-300">
            <Users className="h-4 w-4" />
            <p className="text-xs font-bold uppercase tracking-[0.28em]">Petugas Patroli</p>
          </div>
          <p className="mt-3 text-base font-bold text-white">{operationalShipName || 'Kapal Operasional'}</p>
          <p className="mt-1 text-sm text-slate-300">
            {currentShiftMeta?.label || 'Shift aktif'}
            {currentShiftMeta?.timeRange ? ` (${currentShiftMeta.timeRange})` : ''}
          </p>
          <p className="mt-3 text-sm text-slate-300">
            Status kapal ini cukup diisi satu kali per shift oleh salah satu petugas kapal.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
            <Coffee className="h-3.5 w-3.5" />
            {restCount} petugas status istirahat
          </div>
        </div>

        {draftItems.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/60 p-5 text-sm text-slate-300">
            Belum ada petugas aktif yang terdaftar pada kapal ini.
          </div>
        ) : (
          <div className="space-y-3">
            {draftItems.map((item) => {
              const isPatroli = item.status === 'patroli';
              const isIstirahat = item.status === 'istirahat';
              const itemKey = item.userId || item.name;

              return (
                <div
                  key={itemKey}
                  className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-white">{item.name}</p>
                      <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-300">
                        Petugas Shift
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSetStatus(itemKey, 'patroli')}
                        className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                          isPatroli
                            ? 'border-emerald-300/40 bg-emerald-500/20 text-emerald-100'
                            : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-300/30 hover:text-emerald-100'
                        }`}
                      >
                        <span className="flex items-center justify-center gap-2">
                          <ShieldCheck className="h-4 w-4" />
                          Patroli
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetStatus(itemKey, 'istirahat')}
                        className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                          isIstirahat
                            ? 'border-amber-300/40 bg-amber-500/20 text-amber-100'
                            : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-300/30 hover:text-amber-100'
                        }`}
                      >
                        <span className="flex items-center justify-center gap-2">
                          <Coffee className="h-4 w-4" />
                          Istirahat
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
