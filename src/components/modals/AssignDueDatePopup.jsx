import React, { useState } from 'react';
import { useShips } from '../../context/AppContextRuntime';
import { ModalShell } from '../ui';
import { CalendarClock, Infinity, UserCheck } from 'lucide-react';

export default function AssignDueDatePopup() {
  const { showAssignPopup, setShowAssignPopup, assignPopupData, handleConfirmAssign } = useShips();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  if (!showAssignPopup || !assignPopupData) return null;

  const handleTBC = () => {
    if (assignPopupData.scheduleType === 'next' && !startDate) {
      window.alert('Mulai Tgl wajib diisi untuk penugasan "Next Assignment".');
      return;
    }
    handleConfirmAssign(assignPopupData.userId, startDate, '', true);
  };

  const handleConfirmDate = () => {
    if (assignPopupData.scheduleType === 'next' && !startDate) {
      window.alert('Mulai Tgl wajib diisi untuk penugasan "Next Assignment".');
      return;
    }
    if (!endDate) {
      window.alert('Silakan pilih tanggal berakhir atau gunakan opsi TBC.');
      return;
    }
    handleConfirmAssign(assignPopupData.userId, startDate, endDate, false);
  };

  const isNextAssignment = assignPopupData.scheduleType === 'next';
  const isSectionDisabled = isNextAssignment && !startDate;

  return (
    <ModalShell
      title="Assign Petugas"
      subtitle="Tentukan batas penugasan (onduty)"
      onClose={() => setShowAssignPopup(false)}
      maxWidth="max-w-lg"
    >
      <div className="grid gap-5">
        <div className="bg-[#0b1229] border border-cyan-800/50 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-100">{assignPopupData.name}</p>
            <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest">{assignPopupData.role}</p>
          </div>
          <div className="bg-cyan-900/30 w-10 h-10 rounded-full flex items-center justify-center border border-cyan-700">
            <UserCheck className="w-5 h-5 text-cyan-400" />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest block mb-2">{isNextAssignment ? 'Mulai Tgl (Wajib)' : 'Mulai Tgl (Opsional)'}</label>
          <div className="relative">
            <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500" />
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl py-3 pl-10 pr-4 text-sm text-cyan-50 focus:border-cyan-400 outline-none transition-colors"
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
        </div>

        <div className={`p-4 rounded-xl border border-cyan-800/50 space-y-4 transition-opacity duration-300 bg-[#070b19]/50 ${isSectionDisabled ? 'opacity-40 pointer-events-none' : ''}`}>
           <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest border-b border-cyan-900/50 pb-2 mb-3">Tentukan Batas Akhir Penugasan</p>

           <div>
             <label className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest block mb-2">Tanggal Berakhir</label>
             <div className="relative">
               <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500" />
               <input 
                 type="date" 
                 value={endDate}
                 onChange={(e) => setEndDate(e.target.value)}
                 className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl py-2.5 pl-10 pr-4 text-sm text-cyan-50 focus:border-cyan-400 outline-none transition-colors"
                 min={startDate || new Date().toISOString().split('T')[0]}
               />
             </div>
           </div>

           <div className="flex items-center gap-3 py-1">
             <div className="h-px bg-cyan-900/50 flex-1"></div>
             <span className="text-[10px] uppercase font-bold tracking-widest text-cyan-700">ATAU</span>
             <div className="h-px bg-cyan-900/50 flex-1"></div>
           </div>

           <button 
             onClick={handleTBC}
             className="w-full relative overflow-hidden group bg-cyan-950/20 border border-cyan-800 hover:border-cyan-400 rounded-xl p-3 transition-colors text-left"
           >
             <div className="flex items-center gap-3 relative z-10">
               <div className="bg-cyan-900/50 p-2 rounded-lg text-cyan-400 group-hover:bg-cyan-400 group-hover:text-cyan-950 transition-colors">
                 <Infinity className="w-5 h-5" />
               </div>
               <div>
                 <p className="text-sm font-bold text-cyan-100">Set sebagai TBC</p>
                 <p className="text-[10px] text-cyan-500 mt-0.5">Petugas akan onduty tanpa batas waktu</p>
               </div>
             </div>
             <div className="absolute inset-0 bg-gradient-to-r from-cyan-900/0 via-cyan-900/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
           </button>
        </div>

        <div className="flex gap-3 pt-2">
          <button 
            onClick={() => setShowAssignPopup(false)}
            className="flex-1 py-3 bg-[#0b1229] border border-slate-700 hover:border-slate-500 text-slate-300 rounded-xl text-xs font-bold tracking-widest uppercase transition-colors"
          >
            Batal
          </button>
          <button 
            onClick={handleConfirmDate}
            disabled={isSectionDisabled}
            className={`flex-1 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-colors shadow-[0_0_15px_rgba(16,185,129,0.2)] ${isSectionDisabled ? 'bg-emerald-900/30 text-emerald-800/50 cursor-not-allowed shadow-none' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
          >
            Konfirmasi Tanggal
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
