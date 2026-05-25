/*
Tujuan: Memberikan trusted server time untuk audit patroli tanpa Firebase Functions.
Caller: trustedTime.js melalui VITE_TRUSTED_TIME_URL atau Supabase Functions URL.
Dependensi: Supabase Edge Runtime.
Main Functions: Mengembalikan epoch serverNowMs dan ISO timestamp.
Side Effects: Tidak ada selain response jaringan no-store.
*/

import { corsHeaders, handleOptions, jsonResponse } from '../_shared/smartpatrol.ts';

Deno.serve((request) => {
  const options = handleOptions(request);
  if (options) return options;

  const now = new Date();
  return jsonResponse({
    serverNowMs: now.getTime(),
    serverNowIso: now.toISOString(),
    source: 'supabase-edge-server-time',
  }, 200);
});
