/*
Tujuan: Menyediakan navigasi bawah mobile yang menyesuaikan urutan menu berdasarkan role user.
Caller: App shell pada layout mobile.
Dependensi: UI context, role context, history context, ships context, dan SOSButton.
Main Functions: Merender tab navigasi mobile, badge notifikasi, shortcut SOS, dan urutan menu role-aware.
Side Effects: Mengubah currentPage, mereset activeShipId, dan menutup detail riwayat aktif.
*/

import React from 'react';
import { useHistory, useNotifications, useRole, useShips, useUI } from '../context/AppContextRuntime';
import { Home, AlertOctagon, FileText, Bell, BarChart3 } from 'lucide-react';
import SOSButton from './SOSButton';

const BottomNav = React.memo(function BottomNav() {
  const { currentPage, setCurrentPage } = useUI();
  const { setActiveShipId, activeShipId } = useShips();
  const { closeHistoryEntry, selectedHistoryEntry } = useHistory();
  const { unreadNotificationCount } = useNotifications();
  const { isAdmin, isPic } = useRole();
  const isPrivilegedRole = isAdmin || isPic;

  const tabs = isPrivilegedRole
    ? [
        {id: 'history', icon: <FileText className="w-5 h-5 mb-0.5"/>, label: 'Laporan'},
        {id: 'incidents', icon: <AlertOctagon className="w-5 h-5 mb-0.5"/>, label: 'Temuan'},
        {id: 'daily-report', icon: <BarChart3 className="w-5 h-5 mb-0.5"/>, label: 'Report'},
        {id: 'notifications', icon: <Bell className="w-5 h-5 mb-0.5"/>, label: 'Notif'}
      ]
    : [
        {id: 'home', icon: <Home className="w-5 h-5 mb-0.5"/>, label: 'Patroli'},
        {id: 'incidents', icon: <AlertOctagon className="w-5 h-5 mb-0.5"/>, label: 'Temuan'},
        {id: 'history', icon: <FileText className="w-5 h-5 mb-0.5"/>, label: 'Laporan'},
        {id: 'notifications', icon: <Bell className="w-5 h-5 mb-0.5"/>, label: 'Notif'}
      ];
  const leftTabs = tabs.slice(0, 2);
  const rightTabs = tabs.slice(2);

  const renderTabButton = (tab) => (
    <button 
      key={tab.id}
      onClick={() => { if (selectedHistoryEntry) closeHistoryEntry(); setCurrentPage(tab.id); setActiveShipId(null); }}
      className={`relative flex flex-col items-center justify-center p-2 rounded-xl flex-1 transition-colors ${currentPage === tab.id && !activeShipId ? (tab.id === 'incidents' ? 'text-yellow-400' : 'text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]') : 'text-cyan-700 hover:text-cyan-500'}`}
    >
      {tab.icon}
      {tab.id === 'notifications' && unreadNotificationCount > 0 && (
        <span className="absolute top-1.5 right-[calc(50%-20px)] min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[8px] font-black flex items-center justify-center border border-[#0b1229]">
          {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
        </span>
      )}
      <span className="text-[9px] font-bold uppercase tracking-widest line-clamp-1">{tab.label}</span>
    </button>
  );

  return (
    <>
      <div className="fixed bottom-0 w-full lg:hidden bg-[#0b1229] border-t border-cyan-800/50 pb-safe z-40">
        <div className="relative">
          <div className="absolute inset-x-0 -top-7 flex justify-center pointer-events-none">
            <div className="pointer-events-auto">
              <SOSButton className="!static w-16 h-16 rounded-full border-0 ring-4 ring-red-500/20" />
            </div>
          </div>
          <div className="flex items-center px-2 pt-2 pb-1">
            <div className="flex flex-1 items-center justify-around">
              {leftTabs.map(renderTabButton)}
            </div>
            <div className="w-20 shrink-0" aria-hidden="true"></div>
            <div className="flex flex-1 items-center justify-around">
              {rightTabs.map(renderTabButton)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

export default BottomNav;
