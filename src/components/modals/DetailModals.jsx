/*
Tujuan: Menyediakan modal detail untuk user, laporan, dan preview foto lintas halaman.
Caller: AppShell saat state detail aktif dari menu settings, UsersPage mobile, laporan, atau preview media.
Dependensi: Context users/UI/reports, UserDetailView, ReportDetailView, dan AsyncImage.
Main Functions: Membuka detail user/profil sendiri, detail laporan, dan preview foto operasional.
Side Effects: Menampilkan overlay modal dan mengubah state preview saat foto ditutup.
*/

import React from 'react';
import { useReports, useUI, useUsers } from '../../context/AppContextRuntime';
import UserDetailView from '../views/UserDetailView';
import ReportDetailView from '../views/ReportDetailView';
import AsyncImage from '../AsyncImage';

export function UserDetailModal() {
  const { selectedUser } = useUsers();
  const { currentPage } = useUI();
  const modalRef = React.useRef(null);
  if (!selectedUser) return null;

  const desktopVisibilityClass = currentPage === 'users' ? 'lg:hidden' : '';

  return (
    <div ref={modalRef} className={`fixed inset-0 z-[100] bg-[#070b19] ${desktopVisibilityClass} flex flex-col animate-in slide-in-from-right-4`}>
      <UserDetailView isInline={false} />
    </div>
  );
}

export function ReportDetailModal() {
  const { selectedReportDetail } = useReports();
  const modalRef = React.useRef(null);
  if (!selectedReportDetail) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] bg-[#070b19] lg:hidden flex flex-col animate-in slide-in-from-right-4">
      <ReportDetailView isInline={false} />
    </div>
  );
}

export function PhotoPreviewModal() {
// ... existing PhotoPreviewModal stays same for now
  const { previewPhoto, setPreviewPhoto } = useReports();
  const modalRef = React.useRef(null);
  if (!previewPhoto) return null;
  return (
    <div ref={modalRef} className="fixed inset-0 z-[110] flex items-center justify-center bg-[#070b19]/95 p-4 animate-in fade-in" onClick={()=>setPreviewPhoto(null)}>
      <div className="relative">
        <AsyncImage src={typeof previewPhoto === 'string' ? previewPhoto : previewPhoto.url} alt="Zoom" className="w-full max-w-lg h-auto rounded-xl border border-cyan-700 shadow-[0_0_30px_rgba(6,182,212,0.2)]" />
        {typeof previewPhoto === 'object' && previewPhoto.author && (
          <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs text-white/90 text-right border border-cyan-900/50"><p className="font-bold text-cyan-400">{previewPhoto.author}</p><p className="text-[10px] text-cyan-100/70">{previewPhoto.time}</p></div>
        )}
      </div>
    </div>
  );
}
