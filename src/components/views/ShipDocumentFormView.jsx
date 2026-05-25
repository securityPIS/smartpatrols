import React from 'react';
import { useShips } from '../../context/AppContextRuntime';
import { ChevronDown, FileText, Upload, Save } from 'lucide-react';
import { detectDocumentType, getDocumentTypeLabel } from '../../utils/documentFiles';
import { ImageIcon } from 'lucide-react';

function ShipDocumentUploadVisual({ document }) {
  const type = detectDocumentType(document?.fileName, document?.mimeType);
  const badge = getDocumentTypeLabel(type);
  const isImage = type === 'image';
  const toneClass = {
    pdf: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
    word: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
    excel: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    powerpoint: 'text-orange-300 bg-orange-500/10 border-orange-500/20',
    image: 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20',
    other: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
  }[type] || 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20';

  const Icon = isImage ? ImageIcon : FileText;

  return (
    <div className={`relative w-11 h-11 rounded-xl border flex items-center justify-center ${toneClass}`}>
      <Icon className="w-5 h-5" />
      <span className="absolute -bottom-1 px-1.5 py-0.5 rounded-md bg-[#070b19] border border-current text-[8px] font-black tracking-widest leading-none">
        {badge}
      </span>
    </div>
  );
}

export default function ShipDocumentFormView({ isInline = false }) {
  const { showShipDocForm, closeShipDocForm, newShipDoc, setNewShipDoc, handleShipDocUpload, handleAddShipDoc } = useShips();
  const modalRef = React.useRef(null);
  
  if (!showShipDocForm) return null;

  return (
    <div className={`flex flex-col h-full bg-[#070b19] ${isInline ? 'border-l border-cyan-900/50' : 'fixed inset-0 z-[100] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in lg:hidden'}`}>
      <div 
        ref={!isInline ? modalRef : null} 
        className={`${isInline ? 'w-full h-full' : 'w-full max-w-sm bg-[#0b1229] border border-cyan-800/60 rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200'}`} 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-cyan-900/50 flex items-center gap-3 bg-[#0f1734]">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-300">
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest">Dokumen Armada</p>
            <h3 className="text-lg font-bold text-cyan-50">Upload Dokumen Baru</h3>
          </div>
          {!isInline && (
            <button onClick={closeShipDocForm} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors" aria-label="Tutup form dokumen">
              <ChevronDown className="w-5 h-5 rotate-90"/>
            </button>
          )}
        </div>

        <div className="p-5 space-y-4 text-left overflow-y-auto max-h-[calc(100vh-180px)]">
          <div>
            <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Judul Dokumen</label>
            <input type="text" value={newShipDoc.title} onChange={e => setNewShipDoc({ ...newShipDoc, title: e.target.value })} placeholder="Contoh: Sertifikat Keselamatan" className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Keterangan</label>
            <input type="text" value={newShipDoc.desc} onChange={e => setNewShipDoc({ ...newShipDoc, desc: e.target.value })} placeholder="Contoh: Berlaku hingga 2027" className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-cyan-400 mb-1.5 block uppercase tracking-widest pl-1">Tanggal Dokumen</label>
            <input type="date" value={newShipDoc.docDate} onChange={e => setNewShipDoc({ ...newShipDoc, docDate: e.target.value })} className="w-full bg-[#070b19] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-cyan-400 outline-none shadow-sm" />
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-mono text-cyan-400 block uppercase tracking-widest pl-1">File Dokumen</label>
            <button onClick={handleShipDocUpload} className="w-full rounded-2xl border border-dashed border-emerald-700/70 bg-emerald-950/10 px-4 py-5 text-left hover:border-emerald-400 hover:bg-emerald-900/20 transition-colors">
              <div className="flex items-center gap-3">
                {newShipDoc.fileName ? (
                  <ShipDocumentUploadVisual document={newShipDoc} />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-300">
                    <Upload className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-emerald-300">{newShipDoc.fileName || 'Pilih file dokumen'}</p>
                  <p className="text-[11px] text-cyan-500">PDF, DOC, XLS, PPT, atau gambar dokumen</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="p-4 bg-[#070b19] border-t border-cyan-900/50 flex gap-3">
          <button onClick={closeShipDocForm} className="flex-1 py-3 rounded-xl font-black tracking-widest uppercase text-[11px] border border-cyan-800 text-cyan-300 hover:bg-cyan-900/30 transition-colors">Batal</button>
          <button onClick={handleAddShipDoc} disabled={!newShipDoc.title || !newShipDoc.fileUrl} className="flex-1 py-3 rounded-xl font-black tracking-widest uppercase text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.25)]">
            <Save className="w-4 h-4" /> Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
