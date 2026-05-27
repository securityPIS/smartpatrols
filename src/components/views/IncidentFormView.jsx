import React, { useEffect } from 'react';
import { useIncidents, usePatrol } from '../../context/AppContextRuntime';
import { ChevronDown, Camera, X, MapPin, Save, AlertCircle } from 'lucide-react';
import AsyncImage from '../AsyncImage';
import { isReportFieldValid, REPORT_FIELD_MIN_LENGTH } from '../../utils/sanitize';

export default function IncidentFormView({ isInline = false }) {
  const {
    showIncidentModal, incidentForm, setIncidentForm,
    incidentLocationOptions, closeIncidentModal,
    handleSubmitIncident,
  } = useIncidents();
  const { handlePhotoUpload } = usePatrol();

  // Touched state agar error hanya muncul setelah user mulai mengisi
  // Harus dideklarasikan sebelum conditional return agar tidak melanggar Rules of Hooks
  const [touched, setTouched] = React.useState({ deskripsi: false, penyebab: false, tindakLanjut: false });
  const touch = (field) => setTouched(prev => ({ ...prev, [field]: true }));

  // Validasi field (juga harus dideklarasikan sebelum conditional return)
  const deskripsiValid = isReportFieldValid(incidentForm.deskripsi);
  const penyebabValid = isReportFieldValid(incidentForm.penyebab);
  const tindakLanjutValid = isReportFieldValid(incidentForm.tindakLanjut);
  const allFieldsValid = deskripsiValid && penyebabValid && tindakLanjutValid;

  // Validasi lokasi
  const locationValid = incidentForm.locType === 'custom'
    ? incidentForm.customLocation.trim().length > 0
    : incidentForm.location.trim().length > 0;

  const locs = incidentLocationOptions;

  // useEffect harus dideklarasikan sebelum conditional return agar tidak melanggar Rules of Hooks
  useEffect(() => {
    if (incidentForm.locType !== 'default') return;
    if (locs.length === 0) {
      if (incidentForm.location) {
        setIncidentForm((previousValue) => ({ ...previousValue, location: '' }));
      }
      return;
    }
    if (incidentForm.location && !locs.includes(incidentForm.location)) {
      setIncidentForm((previousValue) => ({ ...previousValue, location: '' }));
    }
  }, [incidentForm.locType, incidentForm.location, locs, setIncidentForm]);

  if (!showIncidentModal) {
    if (isInline) return (
      <div className="h-full flex flex-col items-center justify-center text-cyan-800 p-8 text-center border-2 border-dashed border-cyan-900/30 rounded-3xl m-4">
        <div className="w-16 h-16 rounded-full bg-yellow-900/20 flex items-center justify-center mb-4">
          <MapPin className="w-8 h-8 opacity-20 text-yellow-500" />
        </div>
        <p className="text-sm font-bold uppercase tracking-widest mb-1 text-yellow-500/50">Lapor Temuan</p>
        <p className="text-xs opacity-60">Klik tombol "Lapor Baru" untuk membuat laporan temuan insiden atau gangguan keamanan baru.</p>
      </div>
    );
    return null;
  }

  return (
    <div className={`flex flex-col h-full bg-[#070b19] ${isInline ? 'border-l border-yellow-500/20' : 'fixed inset-0 z-[100] sm:max-w-md sm:mx-auto sm:border-x sm:border-yellow-500/20'}`}>
      <div className="p-4 border-b border-yellow-500/30 flex items-center gap-3 bg-[#0b1229] shrink-0 shadow-sm">
        {!isInline && (
          <button onClick={closeIncidentModal} className="p-2 bg-[#070b19] border border-cyan-800 text-cyan-300 rounded-full hover:bg-cyan-900/50 transition-colors" aria-label="Tutup formulir"><ChevronDown className="w-5 h-5 rotate-90"/></button>
        )}
        <div><span className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold">Form Temuan</span><h3 className="font-bold text-xl text-yellow-400 line-clamp-1">Lapor Baru</h3></div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {!incidentForm.photoUrl ? (
          <button onClick={() => handlePhotoUpload(null, true)} className="w-full py-4 rounded-xl border-2 border-dashed border-yellow-500/40 bg-yellow-950/20 text-yellow-400 hover:bg-yellow-900/40 flex flex-col items-center gap-2 transition-colors"><Camera className="w-6 h-6" /><span className="text-sm font-bold uppercase tracking-wider">Unggah Foto Temuan</span><span className="text-[10px] text-yellow-200/60 uppercase tracking-widest">Opsional</span></button>
        ) : (
          <div className="w-full h-40 bg-[#070b19] rounded-xl border border-yellow-500/40 overflow-hidden relative"><AsyncImage src={incidentForm.photoUrl} alt="Preview" className="w-full h-full object-cover" /><button onClick={() => setIncidentForm(prev => ({...prev, photoUrl: null}))} className="absolute top-2 right-2 bg-black/60 p-1.5 rounded-lg border border-yellow-500/50 text-white hover:bg-rose-500 transition-colors" aria-label="Hapus foto"><X className="w-4 h-4" /></button></div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setIncidentForm(prev => ({...prev, locType: 'default'}))} className={`py-3 rounded-xl border text-xs font-black uppercase tracking-widest transition-colors ${incidentForm.locType === 'default' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400' : 'bg-[#0b1229] border-cyan-900/50 text-cyan-500 hover:border-cyan-700'}`}>Lokasi Daftar</button>
          <button onClick={() => setIncidentForm(prev => ({...prev, locType: 'custom'}))} className={`py-3 rounded-xl border text-xs font-black uppercase tracking-widest transition-colors ${incidentForm.locType === 'custom' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400' : 'bg-[#0b1229] border-cyan-900/50 text-cyan-500 hover:border-cyan-700'}`}>Lokasi Manual</button>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-cyan-500 mb-1.5 block font-bold pl-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Lokasi Temuan</label>
          {incidentForm.locType === 'custom' ? (
            <input type="text" value={incidentForm.customLocation} onChange={e => setIncidentForm(prev => ({...prev, customLocation: e.target.value}))} placeholder="Masukkan nama lokasi..." className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-yellow-500 outline-none shadow-sm" />
          ) : (
            locs.length > 0 ? (
              <div className="space-y-2">
                <select
                  value={incidentForm.location}
                  onChange={e => setIncidentForm(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full bg-[#0b1229] border border-cyan-800/50 rounded-xl p-3.5 text-sm text-cyan-50 focus:border-yellow-500 outline-none appearance-none shadow-sm"
                  required
                >
                  <option value="" disabled>Pilih lokasi checkpoint...</option>
                  {locs.map((locationName) => (
                    <option key={locationName} value={locationName}>{locationName}</option>
                  ))}
                </select>
                <p className="text-[10px] text-cyan-600 uppercase tracking-widest pl-1">
                  Dropdown ini mengambil daftar checkpoint kapal dan wajib dipilih.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-cyan-800/50 bg-[#0b1229] p-4 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">Belum Ada Checkpoint</p>
                <p className="text-[11px] text-cyan-600 mt-2">Daftar lokasi akan mengikuti checkpoint kapal yang tersedia.</p>
              </div>
            )
          )}
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-cyan-500 mb-1.5 block font-bold">
            Deskripsi Temuan <span className="text-yellow-500">*</span>
          </label>
          <textarea
            rows={3}
            value={incidentForm.deskripsi}
            onChange={e => { setIncidentForm(prev => ({...prev, deskripsi: e.target.value})); touch('deskripsi'); }}
            onBlur={() => touch('deskripsi')}
            placeholder={`Jelaskan detail temuan (min. ${REPORT_FIELD_MIN_LENGTH} karakter)...`}
            className={`w-full bg-[#0b1229] border rounded-xl p-3 text-sm text-cyan-50 outline-none resize-none transition-colors ${touched.deskripsi && !deskripsiValid ? 'border-rose-500 focus:border-rose-400' : 'border-cyan-800/50 focus:border-yellow-500'}`}
          />
          {touched.deskripsi && !deskripsiValid && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-400">
              <AlertCircle className="w-3 h-3 shrink-0" />
              Deskripsi wajib diisi minimal {REPORT_FIELD_MIN_LENGTH} karakter ({incidentForm.deskripsi.trim().length}/{REPORT_FIELD_MIN_LENGTH})
            </p>
          )}
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-cyan-500 mb-1.5 block font-bold">
            Penyebab Kejadian <span className="text-yellow-500">*</span>
          </label>
          <textarea
            rows={2}
            value={incidentForm.penyebab}
            onChange={e => { setIncidentForm(prev => ({...prev, penyebab: e.target.value})); touch('penyebab'); }}
            onBlur={() => touch('penyebab')}
            placeholder={`Apa indikasi penyebabnya (min. ${REPORT_FIELD_MIN_LENGTH} karakter)...`}
            className={`w-full bg-[#0b1229] border rounded-xl p-3 text-sm text-cyan-50 outline-none resize-none transition-colors ${touched.penyebab && !penyebabValid ? 'border-rose-500 focus:border-rose-400' : 'border-cyan-800/50 focus:border-yellow-500'}`}
          />
          {touched.penyebab && !penyebabValid && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-400">
              <AlertCircle className="w-3 h-3 shrink-0" />
              Penyebab wajib diisi minimal {REPORT_FIELD_MIN_LENGTH} karakter ({incidentForm.penyebab.trim().length}/{REPORT_FIELD_MIN_LENGTH})
            </p>
          )}
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-cyan-500 mb-1.5 block font-bold">
            Tindak Lanjut Awal <span className="text-yellow-500">*</span>
          </label>
          <textarea
            rows={2}
            value={incidentForm.tindakLanjut}
            onChange={e => { setIncidentForm(prev => ({...prev, tindakLanjut: e.target.value})); touch('tindakLanjut'); }}
            onBlur={() => touch('tindakLanjut')}
            placeholder={`Tindakan awal yang sudah dilakukan (min. ${REPORT_FIELD_MIN_LENGTH} karakter)...`}
            className={`w-full bg-[#0b1229] border rounded-xl p-3 text-sm text-cyan-50 outline-none resize-none transition-colors ${touched.tindakLanjut && !tindakLanjutValid ? 'border-rose-500 focus:border-rose-400' : 'border-cyan-800/50 focus:border-emerald-500'}`}
          />
          {touched.tindakLanjut && !tindakLanjutValid && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-400">
              <AlertCircle className="w-3 h-3 shrink-0" />
              Tindak lanjut wajib diisi minimal {REPORT_FIELD_MIN_LENGTH} karakter ({incidentForm.tindakLanjut.trim().length}/{REPORT_FIELD_MIN_LENGTH})
            </p>
          )}
        </div>
      </div>
      <div className="p-4 bg-[#0b1229] border-t border-cyan-900/50 shrink-0 pb-safe">
        <div className="flex gap-3">
          {!isInline && (
            <button onClick={closeIncidentModal} className="flex-1 py-4 rounded-xl font-black tracking-widest uppercase text-xs border border-cyan-800 text-cyan-300 hover:bg-cyan-900/30 transition-colors">Batal</button>
          )}
          <button
            onClick={() => {
              if (!locationValid || !allFieldsValid) {
                setTouched({ deskripsi: true, penyebab: true, tindakLanjut: true });
                return;
              }
              handleSubmitIncident();
            }}
            disabled={!locationValid || !allFieldsValid}
            className="flex-1 py-4 rounded-xl font-black tracking-widest uppercase text-xs bg-yellow-600 hover:bg-yellow-500 text-black disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(250,204,21,0.25)]"
          >
            <Save className="w-4 h-4" /> Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
