/*
 * Tujuan: Menangkap SCREENSHOT ASLI tiap layar SmartPatrol per role untuk disisipkan ke PDF panduan.
 * Caller: Dijalankan di mesin LOKAL (internet terbuka) — sesi web punya egress policy yang memblokir
 *         Supabase/host aplikasi, jadi capture tidak bisa dari sana.
 * Output: docs/panduan-pengguna/pdf/screens/<role>/step-<N>.png  (dipakai otomatis oleh build-pdf.mjs)
 *
 * Cara pakai (lokal):
 *   1) npm install playwright            # versi lengkap, sekalian unduh Chromium
 *      (atau:  npm i playwright-core  +  npx playwright install chromium)
 *   2) salin .env.capture.example -> .env.capture, isi URL + kredensial
 *   3) node docs/panduan-pengguna/capture-screens.mjs           # tangkap screenshot
 *      node docs/panduan-pengguna/build-pdf.mjs                 # bangun ulang PDF (pakai screenshot)
 *      # atau sekaligus:  node docs/panduan-pengguna/capture-screens.mjs --build
 *
 * KEAMANAN (PRODUKSI): skrip ini NON-DESTRUKTIF. Ia hanya login + navigasi + membuka layar/modal
 * dan MENYOROT tombol target. Ia TIDAK PERNAH menekan aksi yang menulis/mengirim data
 * (submit status shift, AMAN/TEMUAN, SOS, approve user, assign kru, tutup/hapus temuan).
 * Sorotan kuning "KLIK" menunjukkan tombol yang harus ditekan tanpa benar-benar menekannya.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screensRoot = path.join(__dirname, 'pdf', 'screens');

/* ---------- Konfigurasi & kredensial ---------- */

function loadEnvFile() {
  const p = path.join(__dirname, '.env.capture');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvFile();

// URL aplikasi ter-deploy (publik). Bisa di-override via env SMARTPATROL_URL / .env.capture.
const URL = process.env.SMARTPATROL_URL || 'https://smartpatrols.vercel.app';
const ACCOUNTS = {
  petugas: { email: process.env.SP_PETUGAS_EMAIL, pass: process.env.SP_PETUGAS_PASSWORD, mobile: true },
  admin: { email: process.env.SP_ADMIN_EMAIL, pass: process.env.SP_ADMIN_PASSWORD, mobile: true },
  // pic: tambahkan SP_PIC_EMAIL/SP_PIC_PASSWORD bila punya akun PIC.
};
const HEADFUL = process.env.HEADFUL === '1';

if (!URL) {
  console.error('✖ SMARTPATROL_URL belum di-set. Isi di .env.capture atau env. Lihat .env.capture.example.');
  process.exit(1);
}

/* ---------- Resolusi Chromium (playwright penuh ATAU playwright-core + browser env) ---------- */

async function getChromium() {
  try {
    const m = await import('playwright');
    return { chromium: m.chromium, exe: undefined, channel: undefined };
  } catch { /* coba playwright-core */ }
  const m = await import('playwright-core');
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  let exe;
  try {
    for (const d of fs.readdirSync(base).filter((x) => x.startsWith('chromium-'))) {
      const c = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(c)) { exe = c; break; }
    }
  } catch { /* noop */ }
  return { chromium: m.chromium, exe, channel: exe ? undefined : 'chrome' };
}

/* ---------- Util Playwright (semua best-effort, tidak melempar) ---------- */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function highlight(page, locator, label = 'KLIK') {
  // Gambar ring kuning + badge "KLIK" di atas elemen target (tanpa menekannya).
  try {
    const el = await locator.first().elementHandle({ timeout: 4000 });
    if (!el) return false;
    await page.evaluate(({ node, text }) => {
      const r = node.getBoundingClientRect();
      const ring = document.createElement('div');
      Object.assign(ring.style, {
        position: 'fixed', left: `${r.left - 5}px`, top: `${r.top - 5}px`,
        width: `${r.width + 10}px`, height: `${r.height + 10}px`,
        border: '3px dashed #facc15', borderRadius: '12px', zIndex: 2147483647,
        boxShadow: '0 0 0 9999px rgba(2,6,23,.04)', pointerEvents: 'none',
      });
      const tag = document.createElement('div');
      tag.textContent = text;
      Object.assign(tag.style, {
        position: 'fixed', left: `${r.right - 40}px`, top: `${r.top - 18}px`,
        background: '#facc15', color: '#0b1229', font: '800 10px sans-serif',
        padding: '2px 7px', borderRadius: '6px', zIndex: 2147483647, pointerEvents: 'none',
      });
      ring.className = tag.className = '__cap_hl';
      document.body.append(ring, tag);
    }, { node: el, text: label });
    return true;
  } catch { return false; }
}

async function clearHighlights(page) {
  try { await page.evaluate(() => document.querySelectorAll('.__cap_hl').forEach((n) => n.remove())); } catch { /* noop */ }
}

async function clickText(page, text, { exact = true, last = true } = {}) {
  try {
    let loc = page.getByText(text, { exact });
    loc = last ? loc.last() : loc.first();
    await loc.click({ timeout: 6000 });
    await wait(700);
    return true;
  } catch { return false; }
}

async function shot(page, role, n) {
  const dir = path.join(screensRoot, role);
  fs.mkdirSync(dir, { recursive: true });
  await wait(400);
  await page.screenshot({ path: path.join(dir, `step-${n}.png`) });
}

/* ---------- Login (non-destruktif: hanya autentikasi) ---------- */

async function login(page, email, pass, role, captureStep1 = true) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await wait(1500);
  try { await page.locator('input[type="email"]').first().fill(email, { timeout: 10000 }); } catch { /* noop */ }
  try { await page.locator('input[type="password"]').first().fill(pass, { timeout: 8000 }); } catch { /* noop */ }
  if (captureStep1) {
    await highlight(page, page.locator('button:has-text("Login")').last(), 'KLIK');
    await shot(page, role, 1);
    await clearHighlights(page);
  }
  try { await page.locator('button:has-text("Login")').last().click({ timeout: 6000 }); } catch { /* noop */ }
  // Tunggu app shell (bottom-nav / header gear) atau skeleton selesai.
  try {
    await page.waitForFunction(() => {
      const t = document.body.innerText || '';
      return /Patroli|Temuan|Laporan|Pengaturan/i.test(t) && !/Memuat|Loading/i.test(t);
    }, { timeout: 45000 });
  } catch { /* lanjut apa adanya */ }
  await wait(2500);
}

async function openSettingsItem(page, itemText) {
  // Buka dropdown gear "Pengaturan" lalu klik item (Menu User / Menu Armada).
  try { await page.getByLabel('Pengaturan').click({ timeout: 6000 }); } catch {
    try { await page.locator('button[aria-label="Pengaturan"]').click({ timeout: 4000 }); } catch { /* noop */ }
  }
  await wait(600);
  return clickText(page, itemText, { exact: true, last: false });
}

/* ---------- Alur capture per role ---------- */

async function capturePetugas(page) {
  const a = ACCOUNTS.petugas;
  await login(page, a.email, a.pass, 'petugas'); // step-1 login

  // step-2: halaman Patroli (modal Status Shift bila muncul) — sorot "Hadir & Patroli", JANGAN klik.
  await highlight(page, page.getByText(/Hadir/i), 'KLIK');
  await shot(page, 'petugas', 2);
  await clearHighlights(page);

  // step-3: daftar checkpoint (jika modal masih ada, coba tutup via backdrop/Escape tanpa submit).
  try { await page.keyboard.press('Escape'); await wait(500); } catch { /* noop */ }
  await highlight(page, page.getByText(/checkpoint|titik|anjungan|buritan/i).first(), 'KLIK TITIK');
  await shot(page, 'petugas', 3);
  await clearHighlights(page);

  // step-4: buka satu checkpoint -> modal AMAN/TEMUAN (membuka modal tidak menulis data). Lalu Escape.
  await clickText(page, 'Anjungan', { exact: false }).catch(() => {});
  await wait(800);
  await highlight(page, page.getByText(/TEMUAN/i).first(), 'AMAN / TEMUAN');
  await shot(page, 'petugas', 4);
  await clearHighlights(page);
  try { await page.keyboard.press('Escape'); } catch { /* noop */ }
  await wait(500);

  // step-5: form temuan (opsional). Sebagian besar setup butuh klik TEMUAN; kita LEWATI agar tak menulis.
  // (step-5 mempertahankan mockup bila tidak ditangkap.)

  // step-6: tab Temuan -> sorot "Lapor Baru" (jangan klik).
  await clickText(page, 'Temuan');
  await wait(800);
  await highlight(page, page.getByText(/Lapor Baru|Lapor/i).first(), 'LAPOR BARU');
  await shot(page, 'petugas', 6);
  await clearHighlights(page);

  // step-7: kembali ke Patroli -> sorot tombol SOS (JANGAN klik — mencegah alarm nyata).
  await clickText(page, 'Patroli');
  await wait(800);
  await highlight(page, page.getByText('SOS', { exact: true }).first(), 'DARURAT');
  await shot(page, 'petugas', 7);
  await clearHighlights(page);
}

async function captureAdmin(page) {
  const a = ACCOUNTS.admin;
  await login(page, a.email, a.pass, 'admin'); // step-1 login

  // step-2: Users (gear -> Menu User) -> sorot kontrol approve (jangan klik).
  await openSettingsItem(page, 'Menu User');
  await wait(1200);
  await highlight(page, page.getByText(/Approve|Setujui|Pending|Detail/i).first(), 'APPROVE');
  await shot(page, 'admin', 2);
  await clearHighlights(page);

  // step-3: Armada -> pilih kapal -> tab Checkpoint -> sorot tambah titik (jangan klik).
  await openSettingsItem(page, 'Menu Armada');
  await wait(1200);
  await page.getByText(/KM |Kapal|Ship/i).first().click({ timeout: 6000 }).catch(() => {});
  await wait(800);
  await clickText(page, 'Checkpoint', { exact: false }).catch(() => {});
  await wait(600);
  await highlight(page, page.getByText(/Tambah/i).first(), 'TAMBAH');
  await shot(page, 'admin', 3);
  await clearHighlights(page);

  // step-4: tab Personil -> sorot ASSIGN (jangan klik).
  await clickText(page, 'Personil', { exact: false }).catch(() => {});
  await wait(600);
  await highlight(page, page.getByText(/Assign|Tetapkan/i).first(), 'ASSIGN');
  await shot(page, 'admin', 4);
  await clearHighlights(page);

  // step-5: Report (Laporan Harian).
  await clickText(page, 'Report').catch(() => {});
  await wait(1000);
  await shot(page, 'admin', 5);

  // step-6: Temuan -> buka detail -> sorot "Tutup Laporan" (jangan klik).
  await clickText(page, 'Temuan');
  await wait(900);
  await page.getByText(/OPEN|PROGRESS|temuan|insiden/i).first().click({ timeout: 6000 }).catch(() => {});
  await wait(800);
  await highlight(page, page.getByText(/Tutup Laporan/i).first(), 'CLOSING');
  await shot(page, 'admin', 6);
  await clearHighlights(page);
}

/* ---------- Main ---------- */

async function runRole(browser, role, fn) {
  const a = ACCOUNTS[role];
  if (!a || !a.email || !a.pass) {
    console.log(`• ${role}: dilewati (kredensial tidak diisi).`);
    return;
  }
  const ctx = await browser.newContext({
    viewport: a.mobile ? { width: 414, height: 896 } : { width: 1366, height: 900 },
    deviceScaleFactor: 2,
    isMobile: a.mobile,
    geolocation: { latitude: -6.1054, longitude: 106.8869 },
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  try {
    await fn(page);
    console.log(`✓ ${role}: screenshot tersimpan di pdf/screens/${role}/`);
  } catch (e) {
    console.log(`! ${role}: berhenti di tengah (${e.message}). Screenshot yang sempat dibuat tetap dipakai.`);
  } finally {
    await ctx.close();
  }
}

async function main() {
  const { chromium, exe, channel } = await getChromium();
  const browser = await chromium.launch({ headless: !HEADFUL, executablePath: exe, channel });
  await runRole(browser, 'petugas', capturePetugas);
  await runRole(browser, 'admin', captureAdmin);
  await browser.close();

  console.log('\nSelesai menangkap. Daftar file:');
  if (fs.existsSync(screensRoot)) {
    for (const role of fs.readdirSync(screensRoot)) {
      const files = fs.readdirSync(path.join(screensRoot, role));
      console.log(` - ${role}: ${files.sort().join(', ') || '(kosong)'}`);
    }
  }

  if (process.argv.includes('--build')) {
    console.log('\nMembangun ulang PDF...');
    await import('./build-pdf.mjs');
  } else {
    console.log('\nLangkah berikutnya:  node docs/panduan-pengguna/build-pdf.mjs');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
