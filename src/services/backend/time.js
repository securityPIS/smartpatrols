/*
Tujuan: Mengambil trusted server time dari Supabase Edge Function.
Caller: trustedTime.js saat membuat anchor waktu audit SmartPatrol.
Dependensi: Supabase Functions atau endpoint HTTP VITE_TRUSTED_TIME_URL.
Main Functions: Fetch serverNowMs dengan timeout dan fallback URL publik Supabase.
Side Effects: Melakukan request jaringan no-store untuk sinkronisasi waktu.
*/

import { supabaseUrl } from './app';

export function resolveServerTimeUrls() {
  const urls = new Set();
  const configuredUrl = (import.meta.env?.VITE_TRUSTED_TIME_URL || '').trim();

  if (configuredUrl) urls.add(configuredUrl);

  if (supabaseUrl) {
    urls.add(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/server-time`);
  }

  return Array.from(urls);
}
