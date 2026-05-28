import React from 'react';
import { AlertTriangle } from 'lucide-react';

const ConfirmModal = React.memo(function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmText, cancelText, isAlert }) {
  const modalRef = React.useRef(null);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div 
        ref={modalRef}
        className="bg-[#0b1229] border border-cyan-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
            </div>
            <h3 className="text-xl font-bold text-white tracking-wide">{title || 'Konfirmasi'}</h3>
          </div>
          <p className="text-sm text-cyan-200/80 leading-relaxed whitespace-pre-line">
            {message || 'Apakah Anda yakin ingin melakukan tindakan ini?'}
          </p>
        </div>
        
        <div className="flex bg-[#070b19] border-t border-cyan-900/50 p-3 gap-3">
          {!isAlert && (
            <button 
              onClick={onCancel}
              className="flex-1 py-2.5 bg-transparent hover:bg-cyan-900/30 text-cyan-500 font-bold text-sm tracking-wide rounded-xl border border-cyan-800 transition-colors"
            >
              {cancelText || 'BATAL'}
            </button>
          )}
          <button 
            onClick={() => {
              onConfirm();
              if (onCancel) onCancel();
            }}
            className="flex-1 py-2.5 bg-rose-600/20 hover:bg-rose-600 border border-rose-500/50 hover:border-transparent text-rose-300 hover:text-white font-bold text-sm tracking-wide rounded-xl transition-all shadow-[0_0_15px_rgba(225,29,72,0.15)] hover:shadow-[0_0_20px_rgba(225,29,72,0.4)]"
          >
            {confirmText || 'YA, HAPUS'}
          </button>
        </div>
      </div>
    </div>
  );
});

export default ConfirmModal;
