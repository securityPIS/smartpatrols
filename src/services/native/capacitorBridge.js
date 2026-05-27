/*
Tujuan: Menyediakan adapter kecil untuk fitur native Capacitor yang dipakai SmartPatrol Android.
Caller: AppContextRuntime dan komponen kamera patroli.
Dependensi: @capacitor/core, @capacitor/camera, @capacitor/geolocation, @capacitor/network, dan plugin lokal SmartPatrolTime.
Main Functions: Deteksi runtime native, ambil foto kamera-only, baca GPS perangkat, pantau status network native, baca monotonic clock, dan ambil payload launch push.
Side Effects: Memicu permission prompt Android untuk kamera/lokasi dan memasang listener network native.
*/

import { Capacitor, registerPlugin } from '@capacitor/core';

const SmartPatrolTime = registerPlugin('SmartPatrolTime');
let cameraModulePromise = null;

export function isNativeRuntime() {
  return Boolean(Capacitor?.isNativePlatform?.());
}

function isUserCancelledCamera(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('cancel') || message.includes('batal') || message.includes('user cancelled');
}

export async function captureNativeCameraPhoto(options = {}) {
  if (!isNativeRuntime()) return null;

  const {
    direction = 'rear',
    // Dimensi max 1600 di sisi terpanjang agar landscape (mis. 16:9 → 1600×900)
    // dan portrait (mis. 3:4 → 1200×1600) sama-sama menghasilkan kualitas baik.
    height = 1600,
    quality = 78,
    width = 1600,
  } = options;
  const {
    Camera,
    CameraDirection,
    CameraResultType,
    CameraSource,
  } = await getCameraModule();

  const cameraDirection = direction === 'front'
    ? CameraDirection.Front
    : CameraDirection.Rear;

  try {
    const photo = await Camera.getPhoto({
      quality,
      allowEditing: false,
      correctOrientation: true,  // terapkan EXIF orientation agar landscape tetap benar
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,  // camera-only, tidak ada jalur galeri
      direction: cameraDirection,
      cameraDirection,
      saveToGallery: false,
      width,
      height,
    });

    return typeof photo?.dataUrl === 'string' && photo.dataUrl.startsWith('data:image/')
      ? photo.dataUrl
      : null;
  } catch (error) {
    if (isUserCancelledCamera(error)) return null;
    throw error;
  }
}

function getCameraModule() {
  if (!cameraModulePromise) {
    cameraModulePromise = import('@capacitor/camera');
  }
  return cameraModulePromise;
}

export async function getNativeGeolocationPosition(options = {}) {
  if (!isNativeRuntime()) return null;

  const { Geolocation } = await import('@capacitor/geolocation');

  try {
    const permissionStatus = await Geolocation.checkPermissions();
    if (permissionStatus.location !== 'granted') {
      await Geolocation.requestPermissions({ permissions: ['location'] });
    }
  } catch (error) {
    // Beberapa perangkat melempar error saat location service mati; getCurrentPosition
    // tetap dicoba agar caller mendapat fallback yang konsisten.
    console.warn('Status izin GPS native tidak bisa dibaca', error);
  }

  return Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 8000,
    maximumAge: 0,
    ...options,
  });
}

export async function getNativeNetworkStatus() {
  if (!isNativeRuntime()) return null;

  const { Network } = await import('@capacitor/network');
  return Network.getStatus();
}

export async function addNativeNetworkStatusListener(listener) {
  if (!isNativeRuntime() || typeof listener !== 'function') return null;

  const { Network } = await import('@capacitor/network');
  const handle = await Network.addListener('networkStatusChange', listener);
  return () => handle.remove();
}

export async function getNativeTimeSnapshot() {
  if (!isNativeRuntime()) return null;

  const snapshot = await SmartPatrolTime.getTimeSnapshot();
  return {
    elapsedRealtimeMs: Number.isFinite(snapshot?.elapsedRealtimeMs)
      ? snapshot.elapsedRealtimeMs
      : null,
    elapsedRealtimeNanos: Number.isFinite(snapshot?.elapsedRealtimeNanos)
      ? snapshot.elapsedRealtimeNanos
      : null,
    uptimeMs: Number.isFinite(snapshot?.uptimeMs)
      ? snapshot.uptimeMs
      : null,
    deviceEpochMs: Number.isFinite(snapshot?.deviceEpochMs)
      ? snapshot.deviceEpochMs
      : null,
    source: typeof snapshot?.source === 'string' ? snapshot.source : 'android-system-clock',
  };
}

export async function getNativeLaunchNotificationPayload() {
  if (!isNativeRuntime()) return null;

  const payload = await SmartPatrolTime.getLaunchNotificationPayload();
  if (!payload || typeof payload !== 'object') return null;

  return Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => typeof key === 'string' && key.trim())
      .map(([key, value]) => [key, value == null ? '' : String(value)]),
  );
}
