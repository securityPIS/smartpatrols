/*
Tujuan: Menyediakan navigasi samping desktop dengan prioritas menu yang berbeda untuk role operasional.
Caller: App shell pada layout desktop.
Dependensi: UI context, role context, history context, ships context, notifications context, dan SOSButton.
Main Functions: Merender tab desktop, status aktif menu, badge notifikasi, shortcut SOS, dan urutan menu role-aware.
Side Effects: Mengubah currentPage, mereset activeShipId, dan menutup detail riwayat aktif.
*/

import React from 'react';
import { useHistory, useNotifications, useRole, useShips, useUI } from '../context/AppContextRuntime';
import { Home, AlertOctagon, FileText, Shield, Ship, Bell, ChevronRight, BarChart3 } from 'lucide-react';
import SOSButton from './SOSButton';

const SideNav = React.memo(function SideNav() {
  const { currentPage, setCurrentPage } = useUI();
  const { setActiveShipId, activeShipId } = useShips();
  const { closeHistoryEntry, selectedHistoryEntry } = useHistory();
  const { unreadNotificationCount } = useNotifications();
  const { isAdmin, isPic } = useRole();
  const isPrivilegedRole = isAdmin || isPic;

  const tabs = isPrivilegedRole
    ? [
        {id: 'history', icon: <FileText className="w-5 h-5"/>, label: 'Laporan'},
        {id: 'incidents', icon: <AlertOctagon className="w-5 h-5"/>, label: 'Temuan'},
        {id: 'daily-report', icon: <BarChart3 className="w-5 h-5"/>, label: 'Report'},
        {id: 'notifications', icon: <Bell className="w-5 h-5"/>, label: 'Notif'}
      ]
    : [
        {id: 'home', icon: <Home className="w-5 h-5"/>, label: 'Patroli'},
        {id: 'incidents', icon: <AlertOctagon className="w-5 h-5"/>, label: 'Temuan'},
        {id: 'history', icon: <FileText className="w-5 h-5"/>, label: 'Laporan'},
        {id: 'notifications', icon: <Bell className="w-5 h-5"/>, label: 'Notif'}
      ];

  return (
    <div className="hidden lg:flex flex-col w-[100px] bg-[#0b1229] border-r border-cyan-800/50 h-screen sticky top-0 py-6 overflow-y-auto shrink-0 z-50">
      <div className="flex flex-col items-center gap-6 px-2">
        <div className="relative flex items-center justify-center w-12 h-12 mb-4">
          <Shield className="w-12 h-12 text-cyan-400 stroke-[1.5] opacity-20 absolute" />
          <Shield className="w-12 h-12 text-cyan-400 stroke-1 absolute" />
          <Ship className="w-6 h-6 text-cyan-400 relative z-10 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
        </div>

        <div className="flex flex-col w-full gap-2">
          {tabs.map(tab => {
            const isActive = currentPage === tab.id && !activeShipId;
            return (
              <button 
                key={tab.id} 
                onClick={() => { 
                  if (selectedHistoryEntry) closeHistoryEntry(); 
                  setCurrentPage(tab.id); 
                  setActiveShipId(null); 
                }}
                className={`group relative flex flex-col items-center justify-center w-full py-4 rounded-2xl transition-all duration-300 ${isActive ? (tab.id === 'incidents' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-cyan-500/10 text-cyan-400') : 'text-cyan-700 hover:bg-cyan-900/40 hover:text-cyan-500'}`}
              >
                {isActive && (
                  <div className={`absolute left-0 w-1 h-8 rounded-r-full ${tab.id === 'incidents' ? 'bg-yellow-500' : 'bg-cyan-500'} shadow-[0_0_10px_currentcolor]`}></div>
                )}
                
                <div className={`mb-1.5 transition-transform duration-300 group-hover:scale-110 ${isActive ? 'scale-110' : ''}`}>
                  {tab.icon}
                </div>
                {tab.id === 'notifications' && unreadNotificationCount > 0 && (
                  <span className="absolute top-3 right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[8px] font-black flex items-center justify-center border border-[#0b1229]">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
                
                <span className="text-[10px] font-bold uppercase tracking-widest text-center px-1">
                  {tab.label}
                </span>

                {!isActive && (
                  <div className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-3 h-3 text-cyan-800" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-auto px-4 pb-4 space-y-4">
        <div className="flex justify-center">
          <SOSButton className="relative flex-col w-14 h-14 rounded-full !z-10 !fixed-none !shadow-none ring-4 ring-red-500/20" />
        </div>
        <div className="p-3 rounded-xl border border-cyan-900/30 bg-cyan-950/10 flex flex-col items-center gap-1">
           <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></div>
           <span className="text-[8px] font-black text-cyan-600 uppercase tracking-tighter">ONLINE</span>
        </div>
      </div>
    </div>
  );
});

export default SideNav;
