/*
Tujuan: Mencegah regresi performa "setelah take foto lambat" — encode gambar harus ASINKRON
        (canvas.toBlob, bukan toDataURL sinkron) dan form kamera dibuka SEKETIKA dengan varian
        dibuat di latar belakang.
Caller: Node test runner saat verifikasi alur kamera patroli.
Dependensi: src/utils/images.js, src/utils/imageVariants.js, src/context/AppContextRuntime.jsx.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const imagesSource = readFileSync(new URL('../../src/utils/images.js', import.meta.url), 'utf8');
const variantsSource = readFileSync(new URL('../../src/utils/imageVariants.js', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../../src/context/AppContextRuntime.jsx', import.meta.url), 'utf8');

test('images.js: encode kanvas memakai toBlob asinkron (anti-freeze)', () => {
  assert.match(
    imagesSource,
    /export function canvasToCompressedDataUrl/,
    'helper encode asinkron canvasToCompressedDataUrl harus diekspor',
  );
  const startIndex = imagesSource.indexOf('export function canvasToCompressedDataUrl');
  const fnSlice = imagesSource.slice(startIndex, startIndex + 900);
  assert.match(fnSlice, /canvas\.toBlob\(/, 'canvasToCompressedDataUrl harus memakai canvas.toBlob (encode di luar main thread)');
  assert.match(
    imagesSource,
    /return await canvasToCompressedDataUrl\(canvas, "image\/webp", quality\)/,
    'readImageFileAsDataUrl harus encode lewat canvasToCompressedDataUrl, bukan toDataURL sinkron',
  );
});

test('imageVariants.js: downscale varian asinkron lewat helper bersama', () => {
  assert.match(
    variantsSource,
    /import \{ canvasToCompressedDataUrl \} from '\.\/images'/,
    'imageVariants harus memakai helper encode asinkron dari images.js',
  );
  assert.match(variantsSource, /async function downscaleToDataUrl/, 'downscaleToDataUrl harus async');
  assert.match(
    variantsSource,
    /return canvasToCompressedDataUrl\(canvas, 'image\/webp', quality\)/,
    'downscaleToDataUrl harus encode via toBlob (canvasToCompressedDataUrl), bukan toDataURL sinkron',
  );
  assert.match(
    variantsSource,
    /hero = await downscaleToDataUrl[\s\S]*?thumb = await downscaleToDataUrl/,
    'saveImagePhotoSet harus await downscale yang kini async',
  );
});

test('handlePatrolCameraCapture: buka form seketika, varian dibuat di latar belakang', () => {
  const startIndex = runtimeSource.indexOf('const handlePatrolCameraCapture = useCallback');
  assert.notEqual(startIndex, -1, 'handlePatrolCameraCapture harus ada');
  const fnSlice = runtimeSource.slice(startIndex, startIndex + 2400);

  // Pratinjau diset SEKETIKA dari foto mentah (tanpa menunggu encode).
  assert.match(
    fnSlice,
    /const previewSet = \{ photoUrl: dataUrl, heroUrl: dataUrl, thumbUrl: dataUrl \};/,
    'form harus dibuka dengan pratinjau foto mentah lebih dulu',
  );
  // Pembuatan varian (saveImagePhotoSet) berjalan di latar belakang (IIFE), bukan di-await
  // sebelum form terbuka.
  assert.match(
    fnSlice,
    /void \(async \(\) => \{[\s\S]*?await saveImagePhotoSet\(dataUrl\)/,
    'saveImagePhotoSet harus dipanggil di latar belakang (void async IIFE)',
  );
  // Guard anti-timpa: hanya patch bila foto yang ditampilkan masih foto mentah yang sama.
  assert.match(
    fnSlice,
    /currentForm\.photoUrl !== dataUrl\) return previousForms/,
    'patch varian harus dilewati bila foto sudah berubah (ambil ulang/buang form)',
  );
});
