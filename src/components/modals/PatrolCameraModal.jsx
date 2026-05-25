/*
Tujuan: Menyediakan kamera khusus laporan patroli tanpa jalur impor galeri.
Caller: App shell melalui pendingPatrolCameraCapture dari AppContextRuntime.
Dependensi: React, lucide-react, AppContextRuntime, adapter native Capacitor, dan utilitas kompresi gambar.
Main Functions: Menampilkan preview kamera web/Android WebView, mengambil foto terkompresi untuk sync cepat (native camera di Android, input capture di web mobile), mengganti kamera depan/belakang, fallback ke kamera native Android, dan memilih galeri hanya untuk update temuan.
Side Effects: Memicu permission kamera/galeri, membuka stream kamera perangkat atau UI native fallback, membaca file lokal, dan menghentikan stream saat modal ditutup.
*/

import React from 'react';
import { Camera, CameraOff, Images, RefreshCcw, X } from 'lucide-react';
import { usePatrol } from '../../context/AppContextRuntime';
import { captureNativeCameraPhoto, isNativeRuntime } from '../../services/native/capacitorBridge';
import { readImageFileAsDataUrl } from '../../utils/images';

const PATROL_CAMERA_MAX_EDGE = 1200;
const PATROL_CAMERA_IMAGE_QUALITY = 0.74;
const PATROL_CAMERA_ASPECT_RATIO = 4 / 5;

function pickGalleryImageDataUrl() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = false;
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.width = '1px';
  input.style.height = '1px';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';

  return new Promise((resolve) => {
    const cleanup = () => {
      input.onchange = null;
      input.oncancel = null;
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }

      try {
        const dataUrl = await readImageFileAsDataUrl(
          file,
          PATROL_CAMERA_MAX_EDGE,
          PATROL_CAMERA_IMAGE_QUALITY,
        );
        cleanup();
        resolve(dataUrl);
      } catch (error) {
        console.error('Gagal membaca foto dari galeri', error);
        cleanup();
        resolve(null);
      }
    };

    input.oncancel = () => {
      cleanup();
      resolve(null);
    };

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Fungsi untuk membuka kamera native perangkat dari browser (web mobile).
 * Menggunakan <input type="file" capture="environment"> agar perangkat
 * membuka aplikasi kamera bawaan dengan resolusi penuh, bukan stream WebView.
 */
function pickWebCameraDataUrl(cameraDirection = 'environment') {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = cameraDirection; // 'environment' = belakang, 'user' = depan
  input.multiple = false;
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.width = '1px';
  input.style.height = '1px';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';

  return new Promise((resolve) => {
    const cleanup = () => {
      input.onchange = null;
      input.oncancel = null;
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }

      try {
        // Kompresi tetap jalan agar ukuran foto terkontrol untuk sync lintas-device.
        const dataUrl = await readImageFileAsDataUrl(
          file,
          PATROL_CAMERA_MAX_EDGE,
          PATROL_CAMERA_IMAGE_QUALITY,
        );
        cleanup();
        resolve(dataUrl);
      } catch (error) {
        console.error('Gagal membaca foto dari kamera web', error);
        cleanup();
        resolve(null);
      }
    };

    input.oncancel = () => {
      cleanup();
      resolve(null);
    };

    document.body.appendChild(input);
    input.click();
  });
}

export default function PatrolCameraModal() {
  const {
    pendingPatrolCameraCapture,
    closePatrolCameraCapture,
    handlePatrolCameraCapture,
  } = usePatrol();
  const modalRef = React.useRef(null);
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const [cameraError, setCameraError] = React.useState('');
  const [isStartingCamera, setIsStartingCamera] = React.useState(false);
  const [cameraFacingMode, setCameraFacingMode] = React.useState('environment');
  const canUseNativeFallback = isNativeRuntime();
  const supportsEmbeddedCamera = Boolean(
    typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia,
  );
  const isIncidentProgressCapture = pendingPatrolCameraCapture?.intent === 'incident-progress';
  const activeCameraLabel = cameraFacingMode === 'environment' ? 'Belakang' : 'Depan';
  const modalTitle = isIncidentProgressCapture
    ? 'Foto Update Temuan'
    : pendingPatrolCameraCapture?.type === 'temuan'
      ? 'Foto Temuan'
      : 'Foto Aman';

  const stopCameraStream = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCameraStream = React.useCallback(async () => {
    if (!pendingPatrolCameraCapture || !supportsEmbeddedCamera) return;

    setIsStartingCamera(true);
    setCameraError('');
    stopCameraStream();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: cameraFacingMode },
          aspectRatio: { ideal: PATROL_CAMERA_ASPECT_RATIO },
          width: { ideal: 960 },
          height: { ideal: 1200 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error('Gagal membuka kamera patroli', error);
      setCameraError(
        canUseNativeFallback
          ? 'Preview kamera tidak bisa dibuka. Gunakan kamera Android sebagai cadangan.'
          : 'Kamera tidak bisa dibuka. Pastikan izin kamera aktif di perangkat.',
      );
    } finally {
      setIsStartingCamera(false);
    }
  }, [cameraFacingMode, canUseNativeFallback, pendingPatrolCameraCapture, stopCameraStream, supportsEmbeddedCamera]);

  // Efek untuk memulai native camera otomatis di Android, atau web camera di browser
  React.useEffect(() => {
    if (!pendingPatrolCameraCapture) {
      stopCameraStream();
      setCameraError('');
      return;
    }

    // Di Android (Capacitor native), langsung buka native camera API tanpa preview
    if (canUseNativeFallback) {
      setCameraError('');
      setIsStartingCamera(true);
      const direction = cameraFacingMode === 'user' ? 'front' : 'rear';

      captureNativeCameraPhoto({ direction }).then((dataUrl) => {
        if (!dataUrl) {
          setIsStartingCamera(false);
          setCameraError('Pengambilan foto dibatalkan atau tidak menghasilkan gambar.');
          return;
        }
        handlePatrolCameraCapture(dataUrl);
      }).catch((error) => {
        console.error('Gagal mengambil foto kamera native', error);
        setIsStartingCamera(false);
        setCameraError('Kamera native tidak bisa mengambil foto. Periksa izin kamera Android.');
      });

      return () => {
        // cleanup tidak perlu stop stream karena native camera tidak pakai stream
      };
    }

    // Di Web, coba preview getUserMedia dulu
    if (!supportsEmbeddedCamera) {
      stopCameraStream();
      setCameraError(
        'Browser ini belum mendukung akses kamera langsung.',
      );
      return;
    }

    startCameraStream();

    return () => {
      stopCameraStream();
    };
  }, [canUseNativeFallback, cameraFacingMode, pendingPatrolCameraCapture, startCameraStream, stopCameraStream, supportsEmbeddedCamera, handlePatrolCameraCapture]);

  const handleClose = React.useCallback(() => {
    stopCameraStream();
    closePatrolCameraCapture();
  }, [closePatrolCameraCapture, stopCameraStream]);

  const handleCapture = React.useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const targetAspectRatio = PATROL_CAMERA_ASPECT_RATIO;
    let sourceWidth = width;
    let sourceHeight = height;
    let offsetX = 0;
    let offsetY = 0;

    if (width / height > targetAspectRatio) {
      sourceWidth = Math.round(height * targetAspectRatio);
      offsetX = Math.round((width - sourceWidth) / 2);
    } else {
      sourceHeight = Math.round(width / targetAspectRatio);
      offsetY = Math.round((height - sourceHeight) / 2);
    }

    const scale = Math.min(1, PATROL_CAMERA_MAX_EDGE / Math.max(sourceWidth, sourceHeight, 1));
    const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
    const outputHeight = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      setCameraError('Browser tidak mendukung pengambilan gambar dari kamera.');
      return;
    }

    context.drawImage(video, offsetX, offsetY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);
    const dataUrl = canvas.toDataURL('image/webp', PATROL_CAMERA_IMAGE_QUALITY);
    await handlePatrolCameraCapture(dataUrl);
    stopCameraStream();
  }, [handlePatrolCameraCapture, stopCameraStream]);

  const handleNativeCapture = React.useCallback(async (direction) => {
    if (!canUseNativeFallback) return;

    setIsStartingCamera(true);
    setCameraError('');

    try {
      const dataUrl = await captureNativeCameraPhoto({ direction });
      if (!dataUrl) {
        setCameraError('Pengambilan foto dibatalkan atau tidak menghasilkan gambar.');
        return;
      }

      await handlePatrolCameraCapture(dataUrl);
    } catch (error) {
      console.error('Gagal mengambil foto kamera native', error);
      setCameraError('Kamera native tidak bisa mengambil foto. Periksa izin kamera Android.');
    } finally {
      setIsStartingCamera(false);
    }
  }, [canUseNativeFallback, handlePatrolCameraCapture]);

  const handleSwitchWebCamera = React.useCallback(() => {
    setCameraFacingMode((currentMode) => (
      currentMode === 'environment' ? 'user' : 'environment'
    ));
  }, []);

  const handleNativeFallbackCapture = React.useCallback(() => {
    const direction = cameraFacingMode === 'user' ? 'front' : 'rear';
    handleNativeCapture(direction);
  }, [cameraFacingMode, handleNativeCapture]);

  // Handler untuk web: buka kamera native perangkat via input capture
  const handleWebNativeCapture = React.useCallback(async () => {
    if (canUseNativeFallback) {
      // Di Android native, sudah dihandle otomatis di useEffect
      return;
    }

    setIsStartingCamera(true);
    setCameraError('');

    try {
      const dir = cameraFacingMode === 'user' ? 'user' : 'environment';
      const dataUrl = await pickWebCameraDataUrl(dir);
      if (!dataUrl) {
        setCameraError('Pengambilan foto dibatalkan atau tidak menghasilkan gambar.');
        return;
      }
      await handlePatrolCameraCapture(dataUrl);
      stopCameraStream();
    } catch (error) {
      console.error('Gagal mengambil foto kamera web', error);
      setCameraError('Kamera tidak bisa mengambil foto.');
    } finally {
      setIsStartingCamera(false);
    }
  }, [canUseNativeFallback, cameraFacingMode, handlePatrolCameraCapture, stopCameraStream]);

  const handlePickGallery = React.useCallback(async () => {
    if (!isIncidentProgressCapture) return;

    setIsStartingCamera(true);
    setCameraError('');

    try {
      const dataUrl = await pickGalleryImageDataUrl();
      if (!dataUrl) return;
      await handlePatrolCameraCapture(dataUrl);
      stopCameraStream();
    } finally {
      setIsStartingCamera(false);
    }
  }, [handlePatrolCameraCapture, isIncidentProgressCapture, stopCameraStream]);

  if (!pendingPatrolCameraCapture) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-[#020617]">
      <div ref={modalRef} className="h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-cyan-900/50 bg-[#070b19]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Kamera Patroli</p>
            <h3 className="text-lg font-black text-white">{modalTitle}</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-10 h-10 rounded-xl border border-cyan-700/60 bg-[#0b1229] text-cyan-300 flex items-center justify-center"
            aria-label="Tutup kamera patroli"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex flex-col p-4 gap-4">
          {/* Android native: tidak pakai preview, langsung tampilkan instruksi */}
          {canUseNativeFallback ? (
            <div className="w-full max-w-sm mx-auto aspect-[4/5] rounded-2xl overflow-hidden border border-cyan-900/50 bg-black relative flex items-center justify-center">
              {isStartingCamera ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center px-6">
                  <Camera className="w-12 h-12 text-cyan-300 animate-pulse" />
                  <p className="text-sm font-medium text-cyan-200">Membuka kamera Android...</p>
                </div>
              ) : cameraError ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center px-6">
                  <CameraOff className="w-10 h-10 text-rose-400" />
                  <p className="text-sm font-medium text-rose-300">{cameraError}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 text-center px-6">
                  <Camera className="w-12 h-12 text-cyan-400/60" />
                  <p className="text-xs text-cyan-400/60">Kamera Android siap digunakan</p>
                </div>
              )}
            </div>
          ) : (
            /* Web: preview stream getUserMedia atau fallback instruksi */
            <div className="w-full max-w-sm mx-auto aspect-[4/5] rounded-2xl overflow-hidden border border-cyan-900/50 bg-black relative">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
                autoPlay
              />

              {(isStartingCamera || cameraError) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#020617]/90 text-center px-6">
                  {cameraError ? <CameraOff className="w-10 h-10 text-rose-400" /> : <Camera className="w-10 h-10 text-cyan-300 animate-pulse" />}
                  <p className={`text-sm font-medium ${cameraError ? 'text-rose-300' : 'text-cyan-200'}`}>
                    {cameraError || 'Membuka kamera...'}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {canUseNativeFallback ? (
              /* Android native: tombol kamera + switch */
              <div className="space-y-3">
                {cameraError ? (
                  <div className="grid grid-cols-[1fr_auto] gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const direction = cameraFacingMode === 'user' ? 'front' : 'rear';
                        handleNativeCapture(direction);
                      }}
                      disabled={isStartingCamera}
                      className="py-4 rounded-xl bg-cyan-600 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Camera className="w-4 h-4" />
                      Coba Lagi - {activeCameraLabel}
                    </button>
                    <button
                      type="button"
                      onClick={handleSwitchWebCamera}
                      disabled={isStartingCamera}
                      className="w-14 rounded-xl border border-cyan-700/60 bg-[#0b1229] text-cyan-300 flex items-center justify-center disabled:opacity-50"
                      aria-label="Ganti kamera depan atau belakang"
                      title="Ganti kamera"
                    >
                      <RefreshCcw className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className={isIncidentProgressCapture ? 'grid grid-cols-[auto_1fr_auto] gap-3' : 'grid grid-cols-[1fr_auto] gap-3'}>
                    {isIncidentProgressCapture && (
                      <button
                        type="button"
                        onClick={handlePickGallery}
                        disabled={isStartingCamera}
                        className="w-14 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200 flex items-center justify-center disabled:opacity-50 hover:bg-fuchsia-500/20"
                        aria-label="Pilih foto dari galeri"
                        title="Pilih galeri"
                      >
                        <Images className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const direction = cameraFacingMode === 'user' ? 'front' : 'rear';
                        handleNativeCapture(direction);
                      }}
                      disabled={isStartingCamera}
                      className="py-4 rounded-xl bg-emerald-600 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Camera className="w-4 h-4" />
                      Ambil Foto
                    </button>
                    <button
                      type="button"
                      onClick={handleSwitchWebCamera}
                      disabled={isStartingCamera}
                      className="w-14 rounded-xl border border-cyan-700/60 bg-[#0b1229] text-cyan-300 flex items-center justify-center disabled:opacity-50"
                      aria-label="Ganti kamera depan atau belakang"
                      title="Ganti kamera"
                    >
                      <RefreshCcw className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Web: tombol capture dari stream atau kamera native browser */
              cameraError ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleWebNativeCapture}
                    disabled={isStartingCamera}
                    className="w-full py-4 rounded-xl bg-cyan-600 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    Buka Kamera HP (Kualitas Tinggi)
                  </button>
                  {supportsEmbeddedCamera && (
                    <button
                      type="button"
                      onClick={startCameraStream}
                      disabled={isStartingCamera}
                      className="w-full py-3 rounded-xl border border-cyan-700/60 bg-[#0b1229] text-cyan-300 font-bold uppercase tracking-widest text-xs disabled:opacity-50"
                    >
                      Coba Preview Webcam
                    </button>
                  )}
                </div>
              ) : (
                <div className={isIncidentProgressCapture ? 'grid grid-cols-[1fr_1fr_auto] gap-3' : 'grid grid-cols-[1fr_auto] gap-3'}>
                  {isIncidentProgressCapture && (
                    <button
                      type="button"
                      onClick={handlePickGallery}
                      disabled={isStartingCamera}
                      className="py-4 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-fuchsia-500/20"
                      aria-label="Pilih foto dari galeri"
                      title="Pilih galeri"
                    >
                      <Images className="w-4 h-4" />
                      Galeri
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCapture}
                    disabled={isStartingCamera}
                    className="py-4 rounded-xl bg-emerald-600 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    Ambil Foto
                  </button>
                  <button
                    type="button"
                    onClick={handleSwitchWebCamera}
                    disabled={isStartingCamera}
                    className="w-14 rounded-xl border border-cyan-700/60 bg-[#0b1229] text-cyan-300 flex items-center justify-center disabled:opacity-50"
                    aria-label="Ganti kamera depan atau belakang"
                    title="Ganti kamera"
                  >
                    <RefreshCcw className="w-4 h-4" />
                  </button>
                </div>
              )
            )}

            <button
              type="button"
              onClick={handleClose}
              className="w-full py-3 rounded-xl border border-cyan-900/70 text-cyan-300 font-bold uppercase tracking-widest text-xs bg-[#0b1229]"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
