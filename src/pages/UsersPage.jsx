/*
Tujuan: Menampilkan daftar user operasional, filter admin, dan antrean onboarding pending untuk admin SmartPatrol.
Caller: Halaman admin saat membuka modul manajemen user.
Dependensi: Hook role/user/ship management, helper userFilters, AsyncImage, dan ikon Lucide.
Main Functions: Filter user operasional, buka form/detail user, approve onboarding, dan reject onboarding.
Side Effects: Memicu handler approval/reject onboarding dan memilih user aktif di panel admin.
*/

import React from 'react';
import { useRole, useShips, useUsers } from '../context/AppContextRuntime';
import { CheckCircle2, ChevronDown, Filter, PlusCircle, RotateCcw, Search, Ship, User, Users, XCircle } from 'lucide-react';
import AsyncImage from '../components/AsyncImage';
import { filterUsers, getUserFilterOptions, hasActiveUserFilters } from '../utils/userFilters';

import UserFormView from '../components/views/UserFormView';
import UserDetailView from '../components/views/UserDetailView';

function getUserStatusBadge(user) {
  const status = String(user?.status || '').toLowerCase();
  if (status === 'disabled') {
    return {
      label: 'INACTIVE',
      className: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    };
  }
  if (status === 'active' && user?.role === 'PETUGAS') {
    return {
      label: 'ON-DUTY',
      className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    };
  }
  if (status === 'active') {
    return {
      label: 'ACTIVE',
      className: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
    };
  }
  return {
    label: 'OFF-DUTY',
    className: 'bg-slate-800 text-slate-400 border-slate-700 off-duty-badge',
  };
}

const UsersPage = React.memo(function UsersPage() {
  const {
    usersData,
    pendingRegistrations,
    setSelectedUser,
    selectedUser,
    setShowUserForm,
    showUserForm,
    clearUserManagementFeedback,
    handleApprovePendingUser,
    handleRejectPendingUser,
  } = useUsers();
  const { shipsData } = useShips();
  const { isAdmin } = useRole();
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [userFilters, setUserFilters] = React.useState({
    text: '',
    ship: '',
    agency: '',
    role: '',
  });
  const filterOptions = React.useMemo(() => getUserFilterOptions(usersData, shipsData), [shipsData, usersData]);
  const filteredUsers = React.useMemo(() => filterUsers(usersData, userFilters), [userFilters, usersData]);
  const hasFilters = hasActiveUserFilters(userFilters);
  if (!isAdmin) return null;

  const pendingQueue = pendingRegistrations.filter((entry) => entry.status === 'pending');

  const showRightPane = selectedUser || showUserForm;
  const handleUserSelect = (user) => {
    clearUserManagementFeedback();
    if (showUserForm) {
      setShowUserForm(false);
    }
    setSelectedUser({ ...user });
  };
  const updateUserFilter = (key, value) => {
    setUserFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  };
  const resetUserFilters = () => {
    setUserFilters({
      text: '',
      ship: '',
      agency: '',
      role: '',
    });
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Pane: List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-in fade-in scrollbar-thin scrollbar-thumb-cyan-900/50 lg:border-r lg:border-cyan-900/50">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-cyan-50 flex items-center gap-2"><Users className="w-5 h-5 text-cyan-400" /> DATA USER</h2>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => { clearUserManagementFeedback(); setSelectedUser(null); setShowUserForm(true); }} className="px-3 py-1.5 bg-cyan-600/20 text-cyan-300 border border-cyan-500/50 text-xs font-bold rounded-lg flex items-center gap-1 hover:bg-cyan-600/40 transition-colors active:scale-95 shadow-[0_0_10px_rgba(6,182,212,0.1)]">
              <PlusCircle className="w-3.5 h-3.5" /> Tambah
            </button>
            <button
              type="button"
              onClick={() => setIsFilterOpen((current) => !current)}
              className={`px-3 py-1.5 border text-xs font-bold rounded-lg flex items-center gap-1 transition-colors active:scale-95 shadow-[0_0_10px_rgba(6,182,212,0.08)] ${isFilterOpen || hasFilters ? 'bg-amber-500/15 text-amber-200 border-amber-400/50 hover:bg-amber-500/25' : 'bg-[#0b1229] text-cyan-300 border-cyan-800/60 hover:border-cyan-500/60'}`}
              aria-expanded={isFilterOpen}
              aria-controls="user-filter-panel"
            >
              <Filter className="w-3.5 h-3.5" /> Filter
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
        {isFilterOpen && (
          <div id="user-filter-panel" className="rounded-xl border border-cyan-800/50 bg-[#0b1229]/90 p-3 space-y-3 shadow-sm">
            <div className="relative">
              <Search className="w-4 h-4 text-cyan-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={userFilters.text}
                onChange={(event) => updateUserFilter('text', event.target.value)}
                placeholder="Cari nama, email, nomor pekerja, kapal..."
                className="w-full bg-[#070b19] border border-cyan-800/50 rounded-lg pl-9 pr-3 py-2.5 text-xs text-cyan-50 placeholder:text-cyan-700 focus:border-cyan-400 outline-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={userFilters.ship}
                onChange={(event) => updateUserFilter('ship', event.target.value)}
                className="w-full bg-[#070b19] border border-cyan-800/50 rounded-lg px-3 py-2.5 text-xs text-cyan-50 focus:border-cyan-400 outline-none appearance-none"
              >
                <option value="">Semua Kapal</option>
                {filterOptions.ships.map((shipName) => (
                  <option key={shipName} value={shipName}>{shipName}</option>
                ))}
              </select>
              <select
                value={userFilters.agency}
                onChange={(event) => updateUserFilter('agency', event.target.value)}
                className="w-full bg-[#070b19] border border-cyan-800/50 rounded-lg px-3 py-2.5 text-xs text-cyan-50 focus:border-cyan-400 outline-none appearance-none"
              >
                <option value="">Semua Instansi</option>
                {filterOptions.agencies.map((agency) => (
                  <option key={agency} value={agency}>{agency}</option>
                ))}
              </select>
              <select
                value={userFilters.role}
                onChange={(event) => updateUserFilter('role', event.target.value)}
                className="w-full bg-[#070b19] border border-cyan-800/50 rounded-lg px-3 py-2.5 text-xs text-cyan-50 focus:border-cyan-400 outline-none appearance-none"
              >
                <option value="">Semua Role</option>
                {filterOptions.roles.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-3 text-[10px] text-cyan-500">
              <span>{filteredUsers.length} dari {usersData.length} user</span>
              <button
                type="button"
                onClick={resetUserFilters}
                disabled={!hasFilters}
                className="px-2.5 py-1.5 rounded-lg border border-cyan-800/50 text-cyan-300 hover:border-cyan-500/60 hover:bg-cyan-900/20 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-cyan-800/50 transition-colors flex items-center gap-1 font-bold"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>
          </div>
        )}
        {pendingQueue.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300">Onboarding Pending</p>
                <p className="text-xs text-amber-100/90 mt-1">Registrasi publik sudah terisolasi. Admin perlu approval sebelum akun masuk ke data operasional.</p>
              </div>
              <span className="px-2 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-[10px] font-black text-amber-200">{pendingQueue.length}</span>
            </div>
            <div className="space-y-2">
              {pendingQueue.map((entry) => (
                <div key={entry.uid} className="rounded-xl border border-amber-500/20 bg-[#0b1229]/70 p-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden border border-amber-500/20 bg-[#070b19] shrink-0">
                    {entry.photoUrl ? (
                      <AsyncImage src={entry.photoUrl} alt={entry.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-amber-300"><User className="w-4 h-4" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-amber-50 truncate">{entry.name}</p>
                    <p className="text-[11px] text-amber-200/80 truncate">{entry.email}</p>
                    <p className="text-[10px] text-amber-300/80 mt-1">Instansi: {entry.type || 'BUJP'}{entry.workerNumber ? ` • ${entry.workerNumber}` : ''}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleApprovePendingUser(entry)}
                      className="px-2.5 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                      title="Setujui registrasi"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleRejectPendingUser(entry)}
                      className="px-2.5 py-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 transition-colors"
                      title="Tolak registrasi"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-3">
          {filteredUsers.map((user) => {
            const isSelected = selectedUser?.id === user.id;
            const statusBadge = getUserStatusBadge(user);
            return (
            <div 
              key={user.id} 
              onClick={() => handleUserSelect(user)}
              className={`p-3.5 rounded-xl border flex items-center gap-3 relative overflow-hidden cursor-pointer transition-all group shadow-sm ${isSelected ? 'border-cyan-400 bg-cyan-900/10 shadow-[0_0_15px_rgba(6,182,212,0.1)]' : 'bg-[#0b1229] border-cyan-800/50 hover:border-cyan-500/50'}`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${user.type === 'TNI' ? 'bg-fuchsia-500' : 'bg-cyan-400'}`}></div>
              <div className="w-14 h-14 rounded-xl bg-[#070b19] border border-cyan-700/50 overflow-hidden shrink-0 ml-1 shadow-sm">
                {user.photoUrl ? <AsyncImage src={user.photoUrl} alt={user.name} className={`w-full h-full object-cover transition-opacity ${isSelected ? 'opacity-100' : 'opacity-80'}`} /> : <div className="w-full h-full flex items-center justify-center text-cyan-500"><User className="w-6 h-6"/></div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <div>
                     <h3 className={`font-bold text-base truncate ${isSelected ? 'text-white' : 'text-cyan-50'}`}>{user.name}</h3>
                     <div className="flex items-center gap-1.5 mt-0.5">
                       <span className="text-[10px] text-cyan-500 font-bold uppercase">{user.role}</span>
                       <span className={`text-[8px] px-1 py-0.5 border rounded font-black tracking-widest ${user.type==='TNI' ? 'bg-fuchsia-900/30 border-fuchsia-500 text-fuchsia-400' : 'bg-cyan-900/30 border-cyan-500 text-cyan-300'}`}>{user.type}</span>
                     </div>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 border rounded uppercase font-bold tracking-widest shrink-0 ${statusBadge.className}`}>
                     {statusBadge.label}
                  </span>
                </div>
                <div className="pt-2 mt-1 border-t border-cyan-900/30 flex items-center gap-1.5 text-[10px]">
                   <Ship className={`w-3 h-3 ${user.shipAssigned ? 'text-cyan-400' : 'text-slate-600'}`} />
                   {user.shipAssigned ? <span className="text-cyan-100 italic">Penugasan: <span className="font-bold text-cyan-400">{user.shipAssigned}</span></span> : <span className="text-slate-500 italic">{String(user.status || '').toLowerCase() === 'disabled' ? 'User sedang nonaktif.' : 'Belum ada penugasan.'}</span>}
                </div>
              </div>
            </div>
          );
          })}
          {filteredUsers.length === 0 && (
            <div className="rounded-xl border border-cyan-800/50 bg-[#0b1229] p-6 text-center text-cyan-600">
              <p className="text-xs font-bold uppercase tracking-widest">Data tidak ditemukan</p>
              <p className="text-[11px] mt-1">Sesuaikan kata kunci atau pilihan filter.</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Pane: Detail or Form */}
      <div className="hidden lg:block flex-1 bg-[#070b19] shrink-0 overflow-hidden relative border-l border-cyan-900/50">
        {showUserForm && <UserFormView isInline={true} />}
        {(!showUserForm && selectedUser) && <UserDetailView isInline={true} />}
        
        {!showRightPane && (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-cyan-800">
               <div className="w-16 h-16 rounded-full bg-cyan-900/20 flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 opacity-20" />
               </div>
               <p className="text-sm font-bold uppercase tracking-widest mb-1">Manajemen Pengguna</p>
               <p className="text-xs opacity-60">Pilih personil di sebelah kiri untuk melihat profil lengkap, data darurat, dan history penugasan.</p>
            </div>
         )}
      </div>
    </div>
  );
});


export default UsersPage;
