/*
Tujuan: Menyediakan form pembuatan user operasional oleh admin SmartPatrol.
Caller: UsersPage saat admin memilih aksi tambah user.
Dependensi: User management context, AsyncImage, dan ikon Lucide.
Main Functions: Mengisi profil user baru, membuat akun Supabase Auth opsional, dan menyimpan profil operasional.
Side Effects: Memicu handler simpan user serta upload foto profil ke state form user.
*/

import React from 'react';
import { useUsers } from '../../context/AppContextRuntime';
import { ChevronDown, Camera, UserPlus } from 'lucide-react';
import AsyncImage from '../AsyncImage';

export default function UserFormView({ isInline = false }) {
  const {
    showUserForm,
    setShowUserForm,
    userFormData,
    setUserFormData,
    userFormError,
    userFormNotice,
    clearUserManagementFeedback,
    handleSaveUser,
    handleUserPhotoUpload,
  } = useUsers();

  if (!showUserForm) {
    if (isInline) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-cyan-800 p-8 text-center border-2 border-dashed border-cyan-900/30 rounded-3xl m-4">
          <div className="w-16 h-16 rounded-full bg-cyan-900/20 flex items-center justify-center mb-4">
            <UserPlus className="w-8 h-8 opacity-20" />
          </div>
          <p className="text-sm font-bold uppercase tracking-widest mb-1">Tambah Pengguna</p>
          <p className="text-xs opacity-60">Klik tombol "Tambah User" di sebelah kiri untuk mendaftarkan personil keamanan baru ke dalam sistem.</p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className={`flex flex-col h-full bg-[#070b19] ${isInline ? 'border-l border-cyan-900/50' : 'fixed inset-0 z-[100] sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50'}`}>
      <div className="p-4 border-b border-cyan-500/30 flex items-center gap-3 bg-[#0b1229] shrink-0 shadow-sm">
        {!isInline && (
          <button onClick={() => { clearUserManagementFeedback(); setShowUserForm(false); }} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors" aria-label="Tutup form user">
            <ChevronDown className="w-5 h-5 rotate-90" />
          </button>
        )}
        <div>
          <span className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold">Registrasi</span>
          <h3 className="font-bold text-xl text-cyan-50 line-clamp-1">User Baru</h3>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        <div className="space-y-4">
          {userFormNotice && <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-200">{userFormNotice}</div>}
          {userFormError && <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200">{userFormError}</div>}

          <div className="flex flex-col items-center mb-6">
            {!userFormData.photoUrl ? (
              <button onClick={handleUserPhotoUpload} className="w-24 h-24 rounded-2xl border-2 border-dashed border-cyan-500/50 bg-[#070b19] flex flex-col items-center justify-center text-cyan-500 hover:text-cyan-300 hover:border-cyan-400 transition-colors shadow-sm">
                <Camera className="w-6 h-6 mb-1" />
                <span className="text-[9px] font-bold">FOTO</span>
              </button>
            ) : (
              <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-cyan-500 shadow-md">
                <AsyncImage src={userFormData.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                <button onClick={() => setUserFormData({ ...userFormData, photoUrl: null })} className="absolute bottom-0 inset-x-0 bg-rose-500/90 py-1 text-[9px] text-white font-bold hover:bg-rose-600 transition-colors">
                  HAPUS
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Nama Lengkap</label>
            <input type="text" value={userFormData.name} onChange={e => setUserFormData({ ...userFormData, name: e.target.value })} placeholder="Contoh: Dedi Mulyadi" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">ROLE</label>
              <select value={userFormData.role} onChange={e => setUserFormData({ ...userFormData, role: e.target.value })} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm">
                <option value="ADMIN">ADMIN</option>
                <option value="PETUGAS">PETUGAS</option>
                <option value="PIC">PIC</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Instansi</label>
              <select value={userFormData.type} onChange={e => setUserFormData({ ...userFormData, type: e.target.value })} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm">
                <option value="BUJP">BUJP</option>
                <option value="TNI">TNI</option>
                <option value="POLRI">POLRI</option>
                <option value="INTERNAL">INTERNAL</option>
                <option value="Kru Kapal">Kru Kapal</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Nomor Pekerja</label>
            <input type="text" value={userFormData.workerNumber || ''} onChange={e => setUserFormData({ ...userFormData, workerNumber: e.target.value })} placeholder="Contoh: PKJ-001245" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-cyan-900/30">
            <div>
              <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Email</label>
              <input type="email" value={userFormData.email} onChange={e => setUserFormData({ ...userFormData, email: e.target.value })} placeholder="email@domain.com" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Password</label>
              <input type="password" value={userFormData.password} onChange={e => setUserFormData({ ...userFormData, password: e.target.value })} placeholder="********" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
            </div>
          </div>

          <p className="text-[10px] text-cyan-600 leading-relaxed">Jika password diisi, admin akan langsung membuat akun Supabase Auth untuk user ini. Jika password dikosongkan, user hanya disiapkan sebagai profil operasional sampai akun Supabase diikat.</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">No Telpon</label>
              <input type="tel" value={userFormData.phone} onChange={e => setUserFormData({ ...userFormData, phone: e.target.value })} placeholder="0812..." className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
            </div>
            <div>
              <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Tgl Lahir</label>
              <input type="date" value={userFormData.dob} onChange={e => setUserFormData({ ...userFormData, dob: e.target.value })} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm [color-scheme:dark]" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Alamat</label>
            <textarea rows={2} value={userFormData.address} onChange={e => setUserFormData({ ...userFormData, address: e.target.value })} placeholder="Alamat domisili..." className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm resize-none" />
          </div>

          <div className="p-4 border border-rose-900/50 bg-rose-950/10 rounded-xl space-y-4">
            <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest border-b border-rose-900/30 pb-2">Kontak Darurat</p>
            <div>
              <label className="text-[10px] font-mono text-rose-400 mb-1.5 block uppercase tracking-widest pl-1">Nama</label>
              <input type="text" value={userFormData.emergencyName} onChange={e => setUserFormData({ ...userFormData, emergencyName: e.target.value })} placeholder="Nama kontak darurat" className="w-full bg-[#070b19] border border-rose-900/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-rose-500 outline-none shadow-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono text-rose-400 mb-1.5 block uppercase tracking-widest pl-1">No. HP</label>
                <input type="tel" value={userFormData.emergencyContact} onChange={e => setUserFormData({ ...userFormData, emergencyContact: e.target.value })} placeholder="08..." className="w-full bg-[#070b19] border border-rose-900/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-rose-500 outline-none shadow-sm" />
              </div>
              <div>
                <label className="text-[10px] font-mono text-rose-400 mb-1.5 block uppercase tracking-widest pl-1">Hubungan</label>
                <select value={userFormData.emergencyRelation} onChange={e => setUserFormData({ ...userFormData, emergencyRelation: e.target.value })} className="w-full bg-[#070b19] border border-rose-900/50 rounded-xl p-3 text-sm text-cyan-50 focus:border-rose-500 outline-none appearance-none shadow-sm">
                  <option value="Orang Tua">Orang Tua</option>
                  <option value="Suami/Istri">Suami/Istri</option>
                  <option value="Anak">Anak</option>
                  <option value="Saudara">Saudara</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-[#0b1229] border-t border-cyan-900/50 shrink-0 pb-safe flex gap-3">
        {!isInline && (
          <button onClick={() => { clearUserManagementFeedback(); setShowUserForm(false); }} className="flex-1 py-4 rounded-xl font-black tracking-widest uppercase text-xs border border-cyan-800 text-cyan-300 hover:bg-cyan-900/30 transition-colors">
            Cancel
          </button>
        )}
        <button onClick={handleSaveUser} disabled={!userFormData.name} className="flex-1 py-4 rounded-xl font-black tracking-widest uppercase text-xs bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
          <UserPlus className="w-4 h-4" /> Add User
        </button>
      </div>
    </div>
  );
}
