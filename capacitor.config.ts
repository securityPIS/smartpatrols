/*
Tujuan: Konfigurasi Capacitor untuk membungkus build Vite SmartPatrol sebagai aplikasi Android.
Caller: Capacitor CLI saat sync, open, dan build Android.
Dependensi: Folder dist hasil `npm run build` dan Android project di folder android.
Main Functions: Menetapkan appId, appName, dan webDir agar asset offline dibundel ke APK.
Side Effects: Menentukan package name Android dan sumber asset web yang disalin ke project native.
*/

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartpatrol.app',
  appName: 'SmartPatrol',
  webDir: 'dist',
};

export default config;
