import React, { useState } from 'react';
import { Siren } from 'lucide-react';
import { useSOS } from '../context/AppContextRuntime';

const SOS_CATEGORIES = [
  { label: '⚔️ Pembajakan', value: 'Kapal mengalami pembajakan butuh bantuan keamanan' },
  { label: '🔥 Kebakaran',  value: 'Kapal mengalami kebakaran butuh bantuan pemadaman' },
  { label: '🌊 Tenggelam',  value: 'Kapal tenggelam butuh bantuan evakuasi' },
  { label: '💥 Ledakan',    value: 'Terjadi ledakan di kapal butuh bantuan secepatnya' },
  { label: '🚁 Medivac',    value: 'Butuh bantuan medical evacuation untuk Petugas' },
  { label: '❗ Lainnya',    value: 'Kondisi sangat darurat petugas belum bisa menentukan, harap PIC/ADMIN yang menghubungi petugas' },
];

export default function SOSButton({ className = '' }) {
  const { handleSOSTrigger } = useSOS();
  const [isConfirming, setIsConfirming] = useState(false);

  const handleClick = (e) => {
    e.preventDefault();
    setIsConfirming(true);
  };

  const handleCategorySelect = (sosType) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          handleSOSTrigger(position.coords.latitude, position.coords.longitude, sosType);
        },
        (error) => {
          console.warn('GPS error', error);
          handleSOSTrigger(null, null, sosType);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
      );
    } else {
      handleSOSTrigger(null, null, sosType);
    }
    setIsConfirming(false);
  };

  const handleCancel = () => {
    setIsConfirming(false);
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`fixed z-40 bg-red-600 text-white flex items-center justify-center shadow-xl hover:bg-red-700 active:bg-red-800 transition-colors ${className}`}
        style={{
          boxShadow: '0 0 15px rgba(220, 38, 38, 0.6), 0 0 30px rgba(220, 38, 38, 0.4)'
        }}
        title="Tombol Darurat SOS"
      >
        <Siren className="w-8 h-8 animate-pulse" />
      </button>

      {/* Confirmation Modal */}
      {isConfirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-red-500/30 rounded-xl max-w-sm w-full p-6 shadow-2xl relative overflow-hidden scale-up-center">
            <div className="absolute top-0 left-0 right-0 h-1 bg-red-500 animate-pulse"></div>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="bg-red-500/20 p-4 rounded-full">
                <Siren className="w-12 h-12 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-white">KONFIRMASI SOS</h2>
              <p className="text-slate-300 text-sm leading-relaxed">
                Peringatan: Ini akan mengaktifkan <strong>alarm sirine di seluruh perangkat yang terhubung</strong>. Pilih jenis kedaruratan:
              </p>

              <div className="grid grid-cols-2 gap-2 w-full pt-2">
                {SOS_CATEGORIES.map(({ label, value }) => (
                  <button
                    key={value}
                    onClick={() => handleCategorySelect(value)}
                    className="py-3 px-2 bg-red-700 text-white rounded-lg font-semibold text-sm hover:bg-red-600 active:bg-red-800 transition text-center leading-tight"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                onClick={handleCancel}
                className="w-full py-3 px-4 bg-slate-800 text-slate-200 rounded-lg font-medium hover:bg-slate-700 transition"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
