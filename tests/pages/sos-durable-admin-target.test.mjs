/*
Tujuan: Mencegah regresi SOS yang tidak durable dan admin tidak menjadi target.
Caller: Node test runner saat verifikasi SOS lintas-role.
Dependensi: AppContextRuntime, incidentReports adapter, dan migration SOS durable.
Main Functions: Mengunci RPC create_operational_sos_alert, fan-out notifications,
        dan handler client yang menulis SOS ke tabel durable.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtimeSource = readFileSync(
  new URL('../../src/context/AppContextRuntime.jsx', import.meta.url),
  'utf8',
);
const incidentReportsSource = readFileSync(
  new URL('../../src/services/backend/incidentReports.js', import.meta.url),
  'utf8',
);
const cloudStateSource = readFileSync(
  new URL('../../src/services/backend/cloudState.js', import.meta.url),
  'utf8',
);
const migrationSource = readFileSync(
  new URL('../../supabase/migrations/20260607032725_durable_sos_and_cross_surface_delete.sql', import.meta.url),
  'utf8',
);

test('handler SOS client menulis ke adapter durable sos_alerts', () => {
  assert.match(
    runtimeSource,
    /saveSosAlert\(newSOS, \{ clientUpdatedAt: trustedTimestamp\.occurredAtClientMs \}\)/,
    'handleSOSTrigger harus memanggil saveSosAlert',
  );
  assert.match(
    runtimeSource,
    /domain: 'sos_alerts'/,
    'signal SOS harus memakai domain sos_alerts agar fetch domain spesifik',
  );
  assert.match(
    incidentReportsSource,
    /export async function saveSosAlert/,
    'adapter harus mengekspor saveSosAlert',
  );
  assert.match(
    incidentReportsSource,
    /supabase\.rpc\('create_operational_sos_alert'/,
    'saveSosAlert harus memakai RPC server-side penerima SOS',
  );
});

test('RPC SOS menghitung admin dan PIC server-side tanpa membuka profiles ke client', () => {
  assert.match(
    migrationSource,
    /create or replace function public\.create_operational_sos_alert/,
    'migration harus membuat RPC SOS durable',
  );
  assert.match(
    migrationSource,
    /p\.role = 'ADMIN'/,
    'RPC harus menargetkan ADMIN dari query server-side',
  );
  assert.match(
    migrationSource,
    /p\.role = 'PIC'/,
    'RPC harus menargetkan PIC dari query server-side',
  );
  assert.match(
    migrationSource,
    /insert into public\.sos_alerts/,
    'RPC harus menulis row sos_alerts',
  );
  assert.match(
    migrationSource,
    /insert into public\.notifications/,
    'RPC harus membuat fan-out notifications',
  );
});

test('delete dan close SOS memakai tombstone resolved-deleted durable', () => {
  assert.match(
    incidentReportsSource,
    /export async function resolveSosAlert/,
    'adapter harus mengekspor resolveSosAlert',
  );
  assert.match(
    incidentReportsSource,
    /supabase\.rpc\('resolve_operational_sos_alert'/,
    'resolve/delete SOS harus memakai RPC durable',
  );
  assert.match(
    incidentReportsSource,
    /deleted: true/,
    'deleteSosAlert harus menulis marker deleted',
  );
  assert.match(
    cloudStateSource,
    /payload\.deleted !== true/,
    'hydrate activeSOSAlert harus mengabaikan SOS deleted',
  );
  assert.match(
    cloudStateSource,
    /incidentMeta\[sosId\] = \{[\s\S]*?deleted: true/,
    'hydrate harus menerjemahkan SOS deleted menjadi incidentMeta.deleted',
  );
});
