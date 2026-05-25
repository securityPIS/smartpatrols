/*
Tujuan: Menyajikan form login Supabase Auth dan registrasi publik terisolasi SmartPatrol SQL.
Caller: App shell saat belum ada sesi user operasional aktif.
Dependensi: Auth context runtime, ikon Lucide, dan AsyncImage untuk foto onboarding.
Main Functions: Login user operasional, kirim registrasi publik, dan upload foto profil onboarding.
Side Effects: Memicu handler auth/register context serta menyimpan foto onboarding ke state form.
*/

import React from 'react';
import { useAuth } from '../context/AppContextRuntime';
import { Shield, Ship, Eye, EyeOff, Camera } from 'lucide-react';
import AsyncImage from '../components/AsyncImage';

export default function LoginPage() {
  const { authMode, setAuthMode, authBusy, authError, authNotice, authForm, setAuthForm, handleLogin, handleRegister, handleAuthPhotoUpload } = useAuth();

  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div style={{ fontFamily: '"Chakra Petch", sans-serif' }} className="w-full min-h-screen bg-[#070b19] text-cyan-50 sm:max-w-md sm:mx-auto sm:border-x sm:border-cyan-900/50 sm:shadow-[0_0_40px_rgba(6,182,212,0.1)] relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_42%),radial-gradient(circle_at_bottom,_rgba(250,204,21,0.08),_transparent_35%)]"></div>
      <div className={`relative min-h-screen flex flex-col px-5 py-8 ${authMode === 'register' ? 'justify-start' : 'justify-center'}`}>
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <Shield className="w-16 h-16 text-cyan-300 stroke-[1.5] opacity-20 absolute" />
              <Shield className="w-16 h-16 text-cyan-300 stroke-1 absolute" />
              <Ship className="w-8 h-8 text-cyan-300 relative z-10 drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]" />
            </div>
            <div>
              <p className="text-[10px] text-cyan-500 font-bold uppercase tracking-[0.35em]">SMARTPATROL BY ANTISLEK</p>
              <h1 className="text-3xl font-black text-white leading-none mt-1">Akses Sistem</h1>
              <p className="text-sm text-cyan-500 leading-relaxed mt-2">Aplikasi Pintar Untuk membantu Petugas Patroli</p>
            </div>
          </div>
        </div>

        {authNotice && <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-medium">{authNotice}</div>}
        {authError && <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 font-medium">{authError}</div>}

        <div className="space-y-3.5">
          <div className="flex bg-[#0b1229] p-1 rounded-xl border border-cyan-800/50">
            <button onClick={() => { setAuthMode('login'); }} className={`flex-1 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${authMode === 'login' ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30' : 'text-cyan-700 hover:text-cyan-500'}`}>Login</button>
            <button onClick={() => { setAuthMode('register'); }} className={`flex-1 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${authMode === 'register' ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30' : 'text-cyan-700 hover:text-cyan-500'}`}>Register</button>
          </div>

          {authMode === 'register' && (
            <>
              <div className="flex flex-col items-center mb-2">
                {!authForm.photoUrl ? (
                  <button onClick={handleAuthPhotoUpload} className="w-24 h-24 rounded-2xl border-2 border-dashed border-cyan-500/50 bg-[#070b19] flex flex-col items-center justify-center text-cyan-500 hover:text-cyan-300 hover:border-cyan-400 transition-colors shadow-sm">
                    <Camera className="w-6 h-6 mb-1" />
                    <span className="text-[9px] font-bold">FOTO</span>
                  </button>
                ) : (
                  <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-cyan-500 shadow-md">
                    <AsyncImage src={authForm.photoUrl} alt="Foto profil registrasi" className="w-full h-full object-cover" />
                    <button onClick={() => setAuthForm({ ...authForm, photoUrl: null })} className="absolute bottom-0 inset-x-0 bg-rose-500/90 py-1 text-[9px] text-white font-bold hover:bg-rose-600 transition-colors">
                      HAPUS
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="text-[10px] font-mono text-cyan-500 mb-1.5 block uppercase tracking-widest pl-1">Nama Lengkap</label>
                <input type="text" value={authForm.name} onChange={e => setAuthForm({ ...authForm, name: e.target.value })} placeholder="Masukkan nama lengkap" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                Registrasi publik hanya membuat akun Supabase Auth dan profil onboarding terbatas. Role, assignment, dan akses operasional akan ditentukan admin setelah approval.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-cyan-500 mb-1.5 block uppercase tracking-widest pl-1">Instansi</label>
                  <select value={authForm.type} onChange={e => setAuthForm({ ...authForm, type: e.target.value })} className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none appearance-none shadow-sm">
                    <option value="BUJP">BUJP</option>
                    <option value="TNI">TNI</option>
                    <option value="POLRI">POLRI</option>
                    <option value="INTERNAL">INTERNAL</option>
                    <option value="Kru Kapal">Kru Kapal</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-mono text-cyan-500 mb-1.5 block uppercase tracking-widest pl-1">Nomor Pekerja</label>
                  <input type="text" value={authForm.workerNumber} onChange={e => setAuthForm({ ...authForm, workerNumber: e.target.value })} placeholder="Contoh: PKJ-001245" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="text-[10px] font-mono text-cyan-500 mb-1.5 block uppercase tracking-widest pl-1">Alamat Email</label>
            <input type="email" value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} placeholder="nama@domain.com" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
          </div>

          <div className="relative">
            <label className="text-[10px] font-mono text-cyan-500 mb-1.5 block uppercase tracking-widest pl-1">Password</label>
            <input type={showPassword ? 'text' : 'password'} value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} placeholder="********" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm pr-12" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-[34px] text-cyan-600 hover:text-cyan-400 transition-colors">
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {authMode === 'register' && (
            <>
              <div>
                <label className="text-[10px] font-mono text-cyan-500 mb-1.5 block uppercase tracking-widest pl-1">Konfirmasi Password</label>
                <input type="password" value={authForm.confirmPassword} onChange={e => setAuthForm({ ...authForm, confirmPassword: e.target.value })} placeholder="********" className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-cyan-500 mb-1.5 block uppercase tracking-widest pl-1">No Telpon</label>
                  <input type="tel" value={authForm.phone} onChange={e => setAuthForm({ ...authForm, phone: e.target.value })} placeholder="0812..." className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
                </div>
                <div>
                  <div className="rounded-xl border border-cyan-800/50 bg-[#0b1229] p-3.5 h-full flex items-center">
                    <p className="text-[11px] text-cyan-300/80 leading-relaxed">Data sensitif seperti alamat, tanggal lahir, dan kontak darurat akan diisi setelah akun operasional disetujui admin.</p>
                  </div>
                </div>
              </div>
            </>
          )}

          <button onClick={authMode === 'login' ? handleLogin : handleRegister} disabled={authBusy} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-black uppercase tracking-widest text-xs rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:opacity-50 flex items-center justify-center gap-2">
            {authBusy ? <span className="animate-pulse">Memproses...</span> : authMode === 'login' ? 'Login' : 'Kirim Registrasi'}
          </button>
        </div>

        <div className="mt-8 text-center">
          <p className="text-[10px] text-cyan-700">SmartPatrol By HSSE - Security III</p>
          <p className="text-[10px] text-cyan-700">PT Pertamina Patra Niaga</p>
        </div>
      </div>
    </div>
  );
}
