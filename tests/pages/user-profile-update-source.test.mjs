/*
Tujuan: Mencegah update profil user kalah oleh snapshot cloud/lokal lama.
Caller: Node test runner saat verifikasi manajemen user.
Dependensi: src/context/AppContextRuntime.jsx.
Main Functions: Memastikan update user membawa metadata versi dan metadata tersebut ikut persist.
Side Effects: Tidak ada; test membaca source secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/context/AppContextRuntime.jsx', import.meta.url), 'utf8');

test('handleUpdateUser stamps profile changes with local mutation metadata', () => {
  assert.match(
    source,
    /const\s+userMutationMeta\s*=\s*createLocalEntityUpdateMeta\(\);[\s\S]*const\s+previewUser\s*=\s*normalizeUserRecord\(\{[\s\S]*\.\.\.userMutationMeta,/,
    'profile updates must carry updatedAt metadata so role changes win cloud merges',
  );
});

test('persisted user snapshots retain mutation metadata for future merges', () => {
  assert.match(
    source,
    /updatedAt:\s*sanitizeText\(user\?\.updatedAt\s*\|\|\s*'',\s*80\)\s*\|\|\s*null,[\s\S]*updatedAtClientMs:\s*Number\.isFinite\(user\?\.updatedAtClientMs\)\s*\?\s*user\.updatedAtClientMs\s*:\s*null,[\s\S]*updatedAtTrustedMs:\s*Number\.isFinite\(user\?\.updatedAtTrustedMs\)\s*\?\s*user\.updatedAtTrustedMs\s*:\s*null,/,
    'local persistence must keep user update timestamps instead of dropping them',
  );
});
