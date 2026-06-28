/*
 * Tujuan: Membangun PDF panduan pengguna SmartPatrol per role lengkap dengan ilustrasi
 *         antarmuka (mockup layar) plus anotasi "Klik" dan "Hasil".
 * Caller: Developer/agent yang perlu membuat ulang materi panduan bergambar dari repo.
 * Dependensi: playwright-core (render HTML -> PDF via Chromium pra-instal di lingkungan).
 * Output: docs/panduan-pengguna/pdf/panduan-{petugas,pic,admin}.pdf
 *
 * Jalankan:  node docs/panduan-pengguna/build-pdf.mjs
 *
 * Catatan: Mockup layar adalah ILUSTRASI yang dibangun ulang dari token desain asli
 *          aplikasi (tema gelap #070b19/#0b1229, aksen cyan, bottom-nav, tombol SOS).
 *          Tampilan produksi aktual dapat sedikit berbeda.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'pdf');
fs.mkdirSync(outDir, { recursive: true });

function resolveChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  let dirs = [];
  try { dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium-')); } catch { /* noop */ }
  for (const d of dirs) {
    const exe = path.join(base, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined; // biarkan playwright cari sendiri
}

/* ---------- Mockup layar (ilustrasi antarmuka) ---------- */

const NAV_PETUGAS = [
  { ic: '🏠', l: 'Patroli', id: 'home' },
  { ic: '⚠️', l: 'Temuan', id: 'incidents' },
  { ic: '📄', l: 'Laporan', id: 'history' },
  { ic: '🔔', l: 'Notif', id: 'notifications' },
];
const NAV_PRIV = [
  { ic: '📄', l: 'Laporan', id: 'history' },
  { ic: '⚠️', l: 'Temuan', id: 'incidents' },
  { ic: '📊', l: 'Report', id: 'daily-report' },
  { ic: '🔔', l: 'Notif', id: 'notifications' },
];

function bottomNav(tabs, active) {
  const left = tabs.slice(0, 2);
  const right = tabs.slice(2);
  const btn = (t) => `<div class="nav-btn ${t.id === active ? 'on' : ''}">
      <div class="nav-ic">${t.ic}</div><div class="nav-l">${t.l}</div></div>`;
  return `<div class="bottomnav">
    <div class="sos-fab">SOS</div>
    <div class="nav-side">${left.map(btn).join('')}</div>
    <div class="nav-gap"></div>
    <div class="nav-side">${right.map(btn).join('')}</div>
  </div>`;
}

// Bingkai HP. body = HTML konten layar (di atas bottom nav).
function phone(title, body, { nav = NAV_PETUGAS, active = 'home', dot = '#facc15' } = {}) {
  return `<div class="phone">
    <div class="ph-screen">
      <div class="ph-top">
        <div class="ph-brand">SmartPatrol</div>
        <div class="ph-dot" style="background:${dot}"></div>
      </div>
      ${title ? `<div class="ph-title">${title}</div>` : ''}
      <div class="ph-body">${body}</div>
      ${bottomNav(nav, active)}
    </div>
  </div>`;
}

// Pembungkus highlight "KLIK"
const hl = (html, label = 'KLIK') => `<div class="hl"><span class="hltag">${label}</span>${html}</div>`;

const chip = (t, c) => `<span class="chip chip-${c}">${t}</span>`;

/* --- Layar spesifik --- */

function screenLogin() {
  const body = `
    <div class="login">
      <div class="login-head">
        <div class="login-shield">🛡️</div>
        <div>
          <div class="login-kicker">SMARTPATROL BY ANTISLEK</div>
          <div class="login-h1">Akses Sistem</div>
          <div class="login-sub">Aplikasi pintar untuk membantu petugas patroli</div>
        </div>
      </div>
      <div class="seg"><div class="seg-on">LOGIN</div><div class="seg-off">REGISTER</div></div>
      <div class="fld"><div class="lbl">ALAMAT EMAIL</div><div class="inp">petugas@kapal.com</div></div>
      <div class="fld"><div class="lbl">PASSWORD</div><div class="inp">••••••••</div></div>
      ${hl('<div class="btn btn-cyan">LOGIN</div>')}
      <div class="login-foot">SmartPatrol By HSSE — Security III<br/>PT Pertamina Patra Niaga</div>
    </div>`;
  return phone('', body, { active: '' });
}

function screenShiftModal() {
  const body = `
    <div class="dim">
      <div class="cklist">
        <div class="ck-row done"><span>✔</span> Buritan</div>
        <div class="ck-row lock"><span>🔒</span> Anjungan</div>
        <div class="ck-row lock"><span>🔒</span> Kamar Mesin</div>
      </div>
    </div>
    <div class="modal">
      <div class="modal-h">Status Shift — Shift 1</div>
      <div class="modal-p">Tetapkan status sebelum membuka checkpoint.</div>
      ${hl('<div class="btn btn-cyan">HADIR & PATROLI</div>')}
      <div class="btn btn-ghost">ISTIRAHAT</div>
    </div>`;
  return phone('Patroli aktif · KM Sahabat', body, { active: 'home' });
}

function screenCheckpointList() {
  const body = `
    <div class="bar"><div>Shift 1 · ON GOING</div><div class="bar-prog">1/4</div></div>
    <div class="cklist">
      <div class="ck-row done"><span>✔</span> Buritan <em>AMAN</em></div>
      ${hl('<div class="ck-row pend"><span>○</span> Anjungan <em>PERIKSA</em></div>', 'KLIK TITIK')}
      <div class="ck-row pend"><span>○</span> Kamar Mesin <em>PERIKSA</em></div>
      <div class="ck-row pend"><span>○</span> Geladak Utama <em>PERIKSA</em></div>
    </div>`;
  return phone('Patroli aktif · KM Sahabat', body, { active: 'home' });
}

function screenActionModal() {
  const body = `
    <div class="dim"></div>
    <div class="modal">
      <div class="modal-h">Anjungan</div>
      <div class="modal-p">Pilih kondisi titik patroli ini.</div>
      ${hl('<div class="btn btn-green">AMAN</div>', 'AMAN')}
      ${hl('<div class="btn btn-amber">TEMUAN</div>', 'ATAU')}
      <div class="hint">TEMUAN wajib: deskripsi, penyebab, tindak lanjut, & foto.</div>
    </div>`;
  return phone('Patroli aktif · KM Sahabat', body, { active: 'home' });
}

function screenTemuanForm() {
  const body = `
    <div class="form">
      <div class="fld"><div class="lbl">KEJADIAN</div><div class="inp">Lampu anjungan mati</div></div>
      <div class="fld"><div class="lbl">PENYEBAB</div><div class="inp">Sekring putus</div></div>
      <div class="fld"><div class="lbl">TINDAK LANJUT</div><div class="inp">Ganti sekring cadangan</div></div>
      ${hl('<div class="photo-box">📷<div>AMBIL FOTO (WAJIB)</div></div>', 'FOTO')}
      <div class="btn btn-amber">KIRIM TEMUAN</div>
    </div>`;
  return phone('Lapor Temuan · Anjungan', body, { active: 'home' });
}

function screenIncidentList(nav, active) {
  const body = `
    ${hl('<div class="btn btn-amber sm">+ LAPOR BARU</div>', 'LAPOR BARU')}
    <div class="cklist">
      <div class="inc-row">
        <div class="inc-t">Lampu anjungan mati ${chip('OPEN', 'amber')}</div>
        <div class="inc-s">KM Sahabat · Shift 1 · 14:20</div>
      </div>
      <div class="inc-row">
        <div class="inc-t">Pintu dek longgar ${chip('PROGRESS', 'cyan')}</div>
        <div class="inc-s">KM Sahabat · Shift 1 · 11:05</div>
      </div>
    </div>`;
  return phone('Temuan', body, { nav, active });
}

function screenIncidentDetail({ closing = false } = {}) {
  const closeBtn = closing
    ? hl('<div class="btn btn-green">TUTUP LAPORAN</div>', 'CLOSING')
    : '<div class="btn btn-disabled">TUTUP LAPORAN (PIC/ADMIN)</div>';
  const progBtn = closing
    ? '<div class="btn btn-cyan">UPDATE PROGRESS</div>'
    : hl('<div class="btn btn-cyan">UPDATE PROGRESS</div>', 'PROGRES');
  const body = `
    <div class="inc-detail">
      <div class="inc-t big">Lampu anjungan mati ${chip('OPEN', 'amber')}</div>
      <div class="inc-s">KM Sahabat · Shift 1 · pelapor: Budi</div>
      <div class="photo-thumb">📷 foto temuan</div>
      <div class="timeline">
        <div class="tl"><b>14:20</b> Temuan dibuat</div>
        <div class="tl"><b>15:00</b> Menunggu sekring cadangan</div>
      </div>
      ${progBtn}
      ${closeBtn}
      <div class="hint">Closing wajib: foto perbaikan akhir + keterangan konklusi.</div>
    </div>`;
  return phone('Detail Temuan', body, { nav: NAV_PRIV, active: 'incidents' });
}

function screenSosButton(nav, active) {
  const body = `
    <div class="cklist">
      <div class="ck-row done"><span>✔</span> Buritan <em>AMAN</em></div>
      <div class="ck-row pend"><span>○</span> Anjungan <em>PERIKSA</em></div>
    </div>
    <div class="sos-callout">${hl('<div class="sos-big">SOS</div>', 'DARURAT')}<div class="sos-note">Tombol SOS selalu ada di tengah navigasi bawah.</div></div>`;
  return phone('Patroli aktif · KM Sahabat', body, { nav, active });
}

function screenSosModal() {
  const body = `
    <div class="dim red"></div>
    <div class="modal sos-modal">
      <div class="sos-ic">🚨</div>
      <div class="modal-h red">SOS DARURAT</div>
      <div class="modal-p">Pelapor: Budi · KM Sahabat<br/>GPS: -6.1054, 106.8869</div>
      <div class="modal-p sm">Alarm berbunyi di semua perangkat kapal & dashboard Admin HQ.</div>
      ${hl('<div class="btn btn-red">TERIMA & MENGERTI</div>', 'STOP ALARM')}
    </div>`;
  return phone('', body, { nav: NAV_PRIV, active: '', dot: '#f43f5e' });
}

function screenDailyReport() {
  const body = `
    <div class="dr-grid">
      <div class="dr-card"><div class="dr-n">12</div><div class="dr-l">AMAN</div></div>
      <div class="dr-card amber"><div class="dr-n">2</div><div class="dr-l">TEMUAN</div></div>
      <div class="dr-card rose"><div class="dr-n">1</div><div class="dr-l">MISSED</div></div>
      <div class="dr-card cyan"><div class="dr-n">95%</div><div class="dr-l">HADIR</div></div>
    </div>
    <div class="dr-row">KM Sahabat · Shift 1 ${chip('SELESAI', 'cyan')}</div>
    <div class="dr-row">KM Sahabat · Shift 2 ${chip('ON GOING', 'amber')}</div>
    <div class="dr-row">KM Bahari · Shift 1 ${chip('SELESAI', 'cyan')}</div>`;
  return phone('Laporan Harian', body, { nav: NAV_PRIV, active: 'daily-report' });
}

function screenUsersApproval() {
  const body = `
    <div class="sect">PENDING REGISTRATION</div>
    <div class="user-row">
      <div class="ava">👤</div>
      <div class="user-i"><b>Budi Santoso</b><span>BUJP · PKJ-001245</span></div>
      ${hl('<div class="pill green">APPROVE</div>', 'APPROVE')}
    </div>
    <div class="role-line">Role: <b>PETUGAS ▾</b> · Status: <b>ACTIVE ▾</b></div>
    <div class="sect">AKTIF</div>
    <div class="user-row"><div class="ava">👤</div><div class="user-i"><b>Sari (PIC)</b><span>KM Sahabat</span></div>${chip('PIC', 'cyan')}</div>`;
  return phone('Users', body, { nav: NAV_PRIV, active: 'users' });
}

function screenShipsAssign() {
  const body = `
    <div class="tabs"><div class="tab on">Personil</div><div class="tab">Checkpoint</div><div class="tab">Dokumen</div></div>
    <div class="sect">KM SAHABAT — KRU BULAN INI</div>
    <div class="user-row"><div class="ava">👤</div><div class="user-i"><b>Budi Santoso</b><span>PETUGAS</span></div>${chip('ASSIGNED', 'cyan')}</div>
    <div class="sect">TERSEDIA</div>
    <div class="user-row"><div class="ava">👤</div><div class="user-i"><b>Andi</b><span>PETUGAS</span></div>${hl('<div class="pill cyan">ASSIGN</div>', 'ASSIGN')}</div>`;
  return phone('Armada · KM Sahabat', body, { nav: NAV_PRIV, active: 'ships' });
}

function screenShipsCheckpoint() {
  const body = `
    <div class="tabs"><div class="tab">Personil</div><div class="tab on">Checkpoint</div><div class="tab">Dokumen</div></div>
    <div class="sect">TITIK PATROLI KUSTOM</div>
    <div class="ck-row done"><span>≡</span> Buritan</div>
    <div class="ck-row done"><span>≡</span> Anjungan</div>
    <div class="ck-row done"><span>≡</span> Kamar Mesin</div>
    ${hl('<div class="btn btn-cyan sm">+ TAMBAH TITIK</div>', 'TAMBAH')}
    <div class="hint">Titik di sini menjadi sumber checkpoint yang dilihat petugas.</div>`;
  return phone('Armada · KM Sahabat', body, { nav: NAV_PRIV, active: 'ships' });
}

/* ---------- Konten panduan per role ---------- */

const COMMON_NOTE = 'Ilustrasi antarmuka — dibangun ulang dari desain asli aplikasi; tampilan produksi dapat sedikit berbeda.';

const ROLES = {
  petugas: {
    color: '#22d3ee',
    icon: '🛡️',
    title: 'PETUGAS',
    subtitle: 'Security / Kru Lapangan',
    intro: 'Panduan bergambar menjalankan patroli: mulai shift, isi checkpoint, dokumentasi temuan, SOS, dan mode offline.',
    badges: ['OFFLINE-FIRST', 'TRUSTED TIME', 'SOS READY'],
    steps: [
      {
        title: 'Login ke aplikasi',
        klik: 'Isi <b>Email</b> & <b>Password</b>, lalu tekan tombol <b>LOGIN</b>.',
        hasil: 'Jika akun sudah di-<i>approve</i> Admin dan di-<i>assign</i> ke kapal, Anda langsung masuk ke halaman <b>Patroli</b>. Jika belum, muncul notice menunggu persetujuan.',
        screen: screenLogin,
      },
      {
        title: 'Tetapkan Status Shift ("Tap In")',
        klik: 'Pada halaman Patroli, tekan <b>HADIR & PATROLI</b> di modal Status Shift.',
        hasil: 'Daftar titik checkpoint <b>terbuka & bisa ditekan</b>. Sebelum status diisi, semua titik terkunci (🔒).',
        screen: screenShiftModal,
      },
      {
        title: 'Buka titik checkpoint',
        klik: 'Tekan salah satu <b>titik</b> berstatus PERIKSA (mis. Anjungan).',
        hasil: 'Muncul pilihan kondisi titik: <b>AMAN</b> atau <b>TEMUAN</b>.',
        screen: screenCheckpointList,
      },
      {
        title: 'Pilih AMAN atau TEMUAN',
        klik: 'Tekan <b>AMAN</b> bila normal (foto opsional), atau <b>TEMUAN</b> bila ada masalah.',
        hasil: 'AMAN → titik tercatat selesai. TEMUAN → terbuka form wajib isi: kejadian, penyebab, tindak lanjut, & <b>foto wajib</b>.',
        screen: screenActionModal,
      },
      {
        title: 'Isi temuan & ambil foto',
        klik: 'Lengkapi form lalu tekan <b>AMBIL FOTO</b>, terakhir <b>KIRIM TEMUAN</b>.',
        hasil: 'Foto otomatis diberi cap <b>Waktu Server Terpercaya</b>. Temuan masuk ke tab Temuan & ternotifikasi ke PIC/Admin.',
        screen: screenTemuanForm,
      },
      {
        title: 'Lapor temuan tanpa checkpoint',
        klik: 'Buka tab <b>Temuan</b> → tekan <b>+ LAPOR BARU</b>.',
        hasil: 'Form laporan baru terbuka. Anda bisa lapor & beri progres, tapi <b>tidak bisa menutup</b> laporan (itu wewenang PIC/Admin).',
        screen: () => screenIncidentList(NAV_PETUGAS, 'incidents'),
      },
      {
        title: 'Tombol SOS darurat',
        klik: 'Tekan tombol <b>SOS</b> merah di tengah navigasi, lalu konfirmasi cepat.',
        hasil: 'GPS dibaca & disiarkan. <b>Alarm berbunyi</b> di semua perangkat kapal + dashboard Admin HQ sampai penerima menekan "Terima & Mengerti".',
        screen: () => screenSosButton(NAV_PETUGAS, 'home'),
      },
    ],
    closing: {
      title: 'Bekerja tanpa internet (Offline)',
      points: [
        'Terus patroli — laporan teks & foto tersimpan di HP, ditandai <b>Pending-Sync</b>.',
        'Biarkan aplikasi tetap terbuka di latar belakang.',
        'Saat sinyal kembali, semua laporan <b>terunggah otomatis</b> tanpa data hilang.',
        'Jangan tutup paksa aplikasi saat masih ada laporan menunggu sync.',
      ],
    },
  },

  pic: {
    color: '#38bdf8',
    icon: '👁️',
    title: 'PIC',
    subtitle: 'Supervisor / Pengawas',
    intro: 'Panduan bergambar pengawasan: memantau temuan, memberi progres, menutup (closing) laporan, dan membaca Laporan Harian.',
    badges: ['CLOSING TEMUAN', 'DAILY REPORT', 'SOS RESPONSE'],
    steps: [
      {
        title: 'Login ke aplikasi',
        klik: 'Isi Email & Password lalu tekan <b>LOGIN</b>.',
        hasil: 'PIC masuk dengan menu pengawasan: <b>Laporan · Temuan · Report · Notif</b>.',
        screen: screenLogin,
      },
      {
        title: 'Buka daftar Temuan',
        klik: 'Tekan tab <b>Temuan</b> lalu pilih salah satu insiden.',
        hasil: 'Terbuka detail insiden: foto, riwayat progres, dan tombol aksi.',
        screen: () => screenIncidentList(NAV_PRIV, 'incidents'),
      },
      {
        title: 'Beri update progres',
        klik: 'Pada detail insiden, tekan <b>UPDATE PROGRESS</b> dan isi perkembangan.',
        hasil: 'Progres tercatat di timeline. Ulangi sampai masalah benar-benar selesai.',
        screen: () => screenIncidentDetail({ closing: false }),
      },
      {
        title: 'Tutup laporan (Closing) — khusus PIC/Admin',
        klik: 'Tekan <b>TUTUP LAPORAN</b>, lampirkan foto perbaikan akhir + keterangan konklusi.',
        hasil: 'Insiden berstatus <b>selesai</b>. Jika tombol tak muncul, pastikan insiden di kapal yang Anda di-<i>assign</i>.',
        screen: () => screenIncidentDetail({ closing: true }),
      },
      {
        title: 'Baca Laporan Harian',
        klik: 'Tekan tab <b>Report</b>.',
        hasil: 'Rekap per Kapal/Shift: jumlah aman/temuan/missed, kehadiran, status insiden.',
        screen: screenDailyReport,
      },
      {
        title: 'Tanggapi SOS',
        klik: 'Saat SOS masuk, baca lokasi & pelapor, koordinasikan, lalu tekan <b>TERIMA & MENGERTI</b>.',
        hasil: 'Alarm berhenti di perangkat Anda. Insiden SOS tetap tercatat durable.',
        screen: screenSosModal,
      },
    ],
    closing: {
      title: 'Batasan & audit',
      points: [
        'PIC hanya melihat <b>kapal yang ditugaskan</b> (dijaga RLS).',
        'Manajemen user, approval, dan assign kru adalah wewenang Admin.',
        'Gunakan label audit waktu (<b>Verified / Pending-Sync / Tampered</b>) untuk evaluasi disiplin.',
      ],
    },
  },

  admin: {
    color: '#facc15',
    icon: '🏢',
    title: 'ADMIN',
    subtitle: 'HQ / Superadmin',
    intro: 'Panduan bergambar administrasi: approval user, kelola armada & checkpoint, assign kru, dokumen, dashboard global, dan moderasi temuan.',
    badges: ['USER APPROVAL', 'KELOLA ARMADA', 'ASSIGN KRU'],
    steps: [
      {
        title: 'Login sebagai Admin',
        klik: 'Isi kredensial Admin lalu tekan <b>LOGIN</b>.',
        hasil: 'Admin masuk dengan akses penuh + menu <b>Armada</b> & <b>Users</b>.',
        screen: screenLogin,
      },
      {
        title: 'Approve user baru',
        klik: 'Buka <b>Users</b> → tinjau Pending → tetapkan Role/Status → tekan <b>APPROVE</b>.',
        hasil: 'User dapat login ke area operasional dengan role yang ditetapkan.',
        screen: screenUsersApproval,
      },
      {
        title: 'Atur titik checkpoint kapal',
        klik: 'Buka <b>Armada</b> → pilih kapal → tab <b>Checkpoint</b> → <b>+ TAMBAH TITIK</b>.',
        hasil: 'Titik ini menjadi <b>sumber checkpoint</b> yang dilihat petugas. Kapal tanpa titik akan tampak 0/0.',
        screen: screenShipsCheckpoint,
      },
      {
        title: 'Assign / rotasi kru',
        klik: 'Tab <b>Personil</b> → pilih petugas tersedia → tekan <b>ASSIGN</b> (atau jadwalkan Bulan Depan).',
        hasil: 'Petugas dapat mengakses data kapal tersebut. Perubahan bersifat atomik (profil & kapal sinkron).',
        screen: screenShipsAssign,
      },
      {
        title: 'Pantau Laporan Harian global',
        klik: 'Tekan tab <b>Report</b>.',
        hasil: 'Rekap seluruh armada per Kapal/Shift untuk audit & pelaporan HQ.',
        screen: screenDailyReport,
      },
      {
        title: 'Tutup / hapus temuan',
        klik: 'Buka detail insiden → <b>TUTUP LAPORAN</b>, atau hapus bila perlu.',
        hasil: 'Penutupan butuh foto+konklusi. Penghapusan menulis <b>tombstone</b> agar temuan tak muncul lagi di perangkat lain.',
        screen: () => screenIncidentDetail({ closing: true }),
      },
    ],
    closing: {
      title: 'Catatan operasional',
      points: [
        'Admin pertama dibuat lewat <code>npm run setup:admin</code> (service-role), bukan registrasi publik.',
        'Selalu assign kru lewat halaman Armada agar nama kapal pada profil & laporan konsisten.',
        'Notifikasi cron bergantung pada <b>custom_checkpoints</b> kapal — kapal tanpa titik tidak memicu notifikasi.',
      ],
    },
  },
};

/* ---------- Render HTML ---------- */

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
:root { --bg:#070b19; --panel:#0b1229; --line:rgba(8,145,178,.35); --cyan:#22d3ee; --cyan6:#0891b2;
  --ink:#0f172a; --amber:#facc15; --rose:#f43f5e; --green:#10b981; }
body { font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; color:#0f172a; }
.mono { font-family: "Courier New", monospace; }
.page { width: 210mm; min-height: 297mm; padding: 16mm 14mm; position: relative; page-break-after: always; background:#fff; }
.page:last-child { page-break-after: auto; }

/* Cover */
.cover { background: var(--bg); color:#e0f2fe; }
.cover .kicker { font-family:"Courier New",monospace; letter-spacing:.35em; font-size:11px; color:var(--cyan); }
.cover h1 { font-size:72px; font-weight:900; color:#fff; line-height:1; margin-top:18px; }
.cover .role-pill { display:inline-flex; align-items:center; gap:10px; margin-top:22px; padding:10px 18px;
  border:1px solid var(--line); border-radius:14px; background:rgba(34,211,238,.06); font-size:20px; font-weight:800; }
.cover .role-sub { font-size:15px; color:#67e8f9; margin-top:8px; letter-spacing:.05em; }
.cover .intro { font-size:15px; line-height:1.7; color:#cbe9f5; margin-top:28px; max-width:150mm; }
.cover .badges { margin-top:26px; display:flex; gap:10px; flex-wrap:wrap; }
.cover .badge { font-family:"Courier New",monospace; font-size:11px; font-weight:800; padding:8px 14px; border-radius:999px;
  border:1px solid var(--line); color:#a5f3fc; }
.cover .legend { margin-top:40px; border-top:1px solid var(--line); padding-top:18px; font-size:13px; color:#bae6fd; }
.cover .legend b { color:var(--amber); }
.cover .foot { position:absolute; bottom:16mm; left:14mm; right:14mm; display:flex; justify-content:space-between;
  font-family:"Courier New",monospace; font-size:11px; color:#3b6e80; }

/* Step pages */
.pg-head { display:flex; align-items:baseline; gap:12px; border-bottom:2px solid var(--accent); padding-bottom:10px; margin-bottom:14px; }
.pg-head .ic { font-size:22px; }
.pg-head .t { font-size:20px; font-weight:900; color:#0b1229; }
.pg-head .r { margin-left:auto; font-family:"Courier New",monospace; font-size:11px; color:#64748b; letter-spacing:.2em; }

.step { display:flex; gap:16px; border:1px solid #e2e8f0; border-radius:16px; padding:14px; margin-bottom:14px;
  break-inside: avoid; background:#fbfdff; }
.step .num { width:34px; height:34px; flex:0 0 34px; border-radius:50%; background:var(--accent); color:#0b1229;
  font-weight:900; display:flex; align-items:center; justify-content:center; font-size:16px; }
.step .info { flex:1; }
.step .info h3 { font-size:16px; color:#0b1229; margin-bottom:8px; }
.callout { border-radius:10px; padding:9px 11px; font-size:12.5px; line-height:1.55; margin-top:7px; }
.callout.klik { background:#fff7e0; border:1px solid #facc1566; }
.callout.hasil { background:#e9fbf2; border:1px solid #10b98155; }
.callout .ck { font-family:"Courier New",monospace; font-size:10px; font-weight:800; letter-spacing:.15em; display:block; margin-bottom:3px; }
.callout.klik .ck { color:#b45309; }
.callout.hasil .ck { color:#047857; }
.step .art { flex:0 0 196px; display:flex; justify-content:center; }

/* Phone mockup */
.phone { width:196px; }
.ph-screen { background:var(--bg); border:6px solid #1e293b; border-radius:26px; padding:8px; height:380px;
  position:relative; overflow:hidden; box-shadow:0 6px 18px rgba(2,6,23,.18); }
.ph-top { display:flex; align-items:center; justify-content:space-between; padding:2px 4px 6px; }
.ph-brand { color:var(--cyan); font-size:10px; font-weight:800; }
.ph-dot { width:8px; height:8px; border-radius:50%; }
.ph-title { color:#fff; font-size:11px; font-weight:800; background:rgba(34,211,238,.08); border:1px solid var(--line);
  border-radius:9px; padding:6px 8px; margin-bottom:6px; }
.ph-body { position:relative; height:288px; overflow:hidden; }
.bottomnav { position:absolute; bottom:6px; left:8px; right:8px; height:46px; background:var(--panel);
  border:1px solid var(--line); border-radius:12px; display:flex; align-items:center; padding:0 6px; }
.nav-side { flex:1; display:flex; justify-content:space-around; gap:6px; }
.nav-gap { width:34px; }
.nav-btn { text-align:center; color:#0e7490; padding:0 2px; }
.nav-btn.on { color:var(--cyan); }
.nav-ic { font-size:13px; }
.nav-l { font-size:6px; font-weight:800; text-transform:uppercase; letter-spacing:0; }
.sos-fab { position:absolute; top:-16px; left:50%; transform:translateX(-50%); width:40px; height:40px; border-radius:50%;
  background:#e11d48; color:#fff; font-size:11px; font-weight:900; display:flex; align-items:center; justify-content:center;
  border:3px solid var(--bg); box-shadow:0 0 0 4px rgba(225,29,72,.18); }

/* widgets */
.chip { font-size:8px; font-weight:800; padding:2px 6px; border-radius:6px; letter-spacing:.05em; }
.chip-cyan { background:rgba(34,211,238,.15); color:#67e8f9; border:1px solid #22d3ee44; }
.chip-amber { background:rgba(250,204,21,.15); color:#fde68a; border:1px solid #facc1544; }
.btn { border-radius:10px; padding:9px; text-align:center; font-size:11px; font-weight:900; letter-spacing:.08em; margin-top:7px; color:#fff; }
.btn.sm { padding:7px; font-size:10px; }
.btn-cyan { background:#0891b2; box-shadow:0 0 12px rgba(8,145,178,.4); }
.btn-green { background:#059669; }
.btn-amber { background:#d97706; }
.btn-red { background:#e11d48; }
.btn-ghost { background:transparent; border:1px solid var(--line); color:#7dd3fc; }
.btn-disabled { background:#1e293b; color:#475569; }
.hint { font-size:8.5px; color:#94a3b8; margin-top:7px; line-height:1.4; }
.fld { margin-top:8px; }
.lbl { font-family:"Courier New",monospace; font-size:7.5px; color:#0e7490; letter-spacing:.12em; margin-bottom:3px; }
.inp { background:var(--panel); border:1px solid var(--line); border-radius:9px; padding:8px; font-size:10px; color:#cffafe; }
.seg { display:flex; gap:3px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:3px; margin-top:8px; }
.seg-on { flex:1; text-align:center; font-size:9px; font-weight:900; padding:6px; border-radius:7px; background:rgba(8,145,178,.25); color:var(--cyan); }
.seg-off { flex:1; text-align:center; font-size:9px; font-weight:900; padding:6px; color:#0e7490; }
.login { padding:2px; }
.login-head { display:flex; gap:8px; align-items:center; margin-bottom:4px; }
.login-shield { font-size:26px; }
.login-kicker { font-family:"Courier New",monospace; font-size:6.5px; color:var(--cyan6); letter-spacing:.2em; }
.login-h1 { font-size:16px; font-weight:900; color:#fff; }
.login-sub { font-size:7.5px; color:#0e7490; }
.login-foot { text-align:center; font-size:7px; color:#0e7490; margin-top:10px; line-height:1.5; }

.dim { position:absolute; inset:0; background:rgba(2,6,23,.55); }
.dim.red { background:rgba(136,19,55,.45); }
.modal { position:absolute; left:8px; right:8px; bottom:58px; background:var(--panel); border:1px solid var(--line);
  border-radius:14px; padding:12px; }
.modal-h { font-size:13px; font-weight:900; color:#fff; }
.modal-h.red { color:#fecaca; }
.modal-p { font-size:9.5px; color:#94a3b8; margin-top:5px; line-height:1.5; }
.modal-p.sm { font-size:8px; }
.cklist { margin-top:4px; }
.ck-row { display:flex; align-items:center; gap:7px; background:var(--panel); border:1px solid var(--line);
  border-radius:9px; padding:8px; font-size:10.5px; color:#cffafe; margin-bottom:5px; }
.ck-row em { margin-left:auto; font-style:normal; font-size:7.5px; font-weight:800; color:#0e7490; letter-spacing:.05em; }
.ck-row.done { border-color:#10b98144; } .ck-row.done span { color:#10b981; }
.ck-row.done em { color:#34d399; }
.ck-row.pend span { color:#0e7490; }
.ck-row.lock { opacity:.7; }
.bar { display:flex; justify-content:space-between; align-items:center; background:rgba(34,211,238,.08);
  border:1px solid var(--line); border-radius:9px; padding:6px 8px; font-size:9px; color:#7dd3fc; margin-bottom:6px; }
.bar-prog { font-weight:900; color:var(--cyan); }
.photo-box { border:2px dashed #0e7490; border-radius:10px; padding:14px; text-align:center; color:#22d3ee; font-size:18px; }
.photo-box div { font-size:8px; font-weight:800; margin-top:4px; letter-spacing:.05em; }
.photo-thumb { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; text-align:center;
  font-size:9px; color:#67e8f9; margin:6px 0; }
.inc-row { background:var(--panel); border:1px solid var(--line); border-radius:9px; padding:8px; margin-bottom:5px; }
.inc-t { font-size:10.5px; color:#e2e8f0; font-weight:700; display:flex; align-items:center; gap:6px; }
.inc-t.big { font-size:12px; }
.inc-s { font-size:8px; color:#64748b; margin-top:3px; }
.timeline { margin:6px 0; }
.tl { font-size:8.5px; color:#94a3b8; padding:4px 0; border-left:2px solid var(--line); padding-left:8px; }
.tl b { color:#7dd3fc; }
.sos-callout { text-align:center; margin-top:18px; }
.sos-big { width:64px; height:64px; border-radius:50%; background:#e11d48; color:#fff; font-size:18px; font-weight:900;
  display:flex; align-items:center; justify-content:center; margin:0 auto; box-shadow:0 0 0 6px rgba(225,29,72,.2); }
.sos-note { font-size:8.5px; color:#94a3b8; margin-top:10px; }
.sos-modal { text-align:center; border-color:#e11d4855; }
.sos-ic { font-size:26px; }
.dr-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:8px; }
.dr-card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:10px; text-align:center; }
.dr-card.amber { border-color:#facc1544; } .dr-card.rose { border-color:#f43f5e44; } .dr-card.cyan { border-color:#22d3ee44; }
.dr-n { font-size:20px; font-weight:900; color:#fff; }
.dr-l { font-size:7.5px; font-weight:800; color:#94a3b8; letter-spacing:.1em; margin-top:2px; }
.dr-row { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:8px; font-size:9.5px;
  color:#cbd5e1; margin-bottom:5px; display:flex; align-items:center; gap:8px; }
.sect { font-family:"Courier New",monospace; font-size:8px; color:#0e7490; letter-spacing:.15em; margin:8px 0 5px; }
.user-row { display:flex; align-items:center; gap:8px; background:var(--panel); border:1px solid var(--line);
  border-radius:9px; padding:7px; margin-bottom:5px; }
.ava { width:26px; height:26px; border-radius:7px; background:#1e293b; display:flex; align-items:center; justify-content:center; font-size:13px; }
.user-i { flex:1; } .user-i b { font-size:10px; color:#e2e8f0; display:block; } .user-i span { font-size:8px; color:#64748b; }
.pill { font-size:8.5px; font-weight:900; padding:6px 10px; border-radius:8px; }
.pill.green { background:#059669; color:#fff; } .pill.cyan { background:#0891b2; color:#fff; }
.role-line { font-size:8.5px; color:#94a3b8; padding:4px 2px 8px; }
.tabs { display:flex; gap:4px; margin-bottom:6px; }
.tab { flex:1; text-align:center; font-size:8.5px; font-weight:800; padding:6px; border-radius:8px; color:#0e7490;
  background:var(--panel); border:1px solid var(--line); }
.tab.on { color:var(--cyan); background:rgba(8,145,178,.2); border-color:#22d3ee44; }

/* highlight */
.hl { position:relative; outline:3px dashed var(--amber); outline-offset:3px; border-radius:12px; }
.hltag { position:absolute; top:-9px; right:8px; z-index:6; background:var(--amber); color:#0b1229; font-size:7.5px;
  font-weight:900; letter-spacing:.1em; padding:2px 6px; border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,.3); }

.closing { border:1px solid #e2e8f0; border-radius:16px; padding:16px; background:#f8fafc; margin-top:6px; }
.closing h3 { font-size:16px; color:#0b1229; margin-bottom:10px; }
.closing ul { list-style:none; }
.closing li { font-size:13px; line-height:1.6; padding:6px 0 6px 22px; position:relative; color:#334155; }
.closing li::before { content:"▸"; position:absolute; left:4px; color:var(--accent); font-weight:900; }
.pg-foot { position:absolute; bottom:10mm; left:14mm; right:14mm; font-size:9px; color:#94a3b8;
  border-top:1px solid #e2e8f0; padding-top:6px; display:flex; justify-content:space-between; }
`;

function coverPage(role) {
  return `<div class="page cover" style="--accent:${role.color}">
    <div class="kicker">FIELD GUIDE · USER GUIDELINE</div>
    <h1>SmartPatrol</h1>
    <div class="role-pill">${role.icon} ROLE: ${role.title}</div>
    <div class="role-sub">${role.subtitle}</div>
    <div class="intro">${role.intro}</div>
    <div class="badges">${role.badges.map((b) => `<span class="badge">${b}</span>`).join('')}</div>
    <div class="legend">
      Cara baca: ikuti langkah berurutan. Bingkai HP menunjukkan layar; bagian bertanda
      <b>garis kuning "KLIK"</b> = elemen yang ditekan. Setiap langkah punya kotak
      <b>KLIK</b> (aksi) dan <b>HASIL</b> (yang muncul).
    </div>
    <div class="foot"><span>${COMMON_NOTE}</span><span>SmartPatrol · HSSE Security III</span></div>
  </div>`;
}

function stepsPages(role) {
  // 2 langkah per halaman
  const perPage = 2;
  let html = '';
  for (let i = 0; i < role.steps.length; i += perPage) {
    const chunk = role.steps.slice(i, i + perPage);
    const rows = chunk.map((s, j) => {
      const n = i + j + 1;
      return `<div class="step">
        <div class="num">${n}</div>
        <div class="info">
          <h3>${s.title}</h3>
          <div class="callout klik"><span class="ck">👆 KLIK</span>${s.klik}</div>
          <div class="callout hasil"><span class="ck">✅ HASIL</span>${s.hasil}</div>
        </div>
        <div class="art">${s.screen()}</div>
      </div>`;
    }).join('');
    html += `<div class="page" style="--accent:${role.color}">
      <div class="pg-head"><span class="ic">${role.icon}</span><span class="t">Panduan ${role.title}</span>
        <span class="r">LANGKAH ${i + 1}–${Math.min(i + perPage, role.steps.length)}</span></div>
      ${rows}
      <div class="pg-foot"><span>${COMMON_NOTE}</span><span>SmartPatrol — Panduan ${role.title}</span></div>
    </div>`;
  }
  return html;
}

function closingPage(role) {
  return `<div class="page" style="--accent:${role.color}">
    <div class="pg-head"><span class="ic">${role.icon}</span><span class="t">Panduan ${role.title}</span>
      <span class="r">RINGKASAN</span></div>
    <div class="closing">
      <h3>${role.closing.title}</h3>
      <ul>${role.closing.points.map((p) => `<li>${p}</li>`).join('')}</ul>
    </div>
    <div class="closing" style="margin-top:14px">
      <h3>Label Audit Waktu</h3>
      <ul>
        <li><b>Verified (Server-Trusted)</b> — laporan online, waktu server akurat.</li>
        <li><b>Pending-Sync</b> — dibuat offline, menunggu koneksi.</li>
        <li><b>Suspicious / Tampered</b> — jam perangkat terindikasi dimanipulasi.</li>
      </ul>
    </div>
    <div class="pg-foot"><span>${COMMON_NOTE}</span><span>SmartPatrol — Panduan ${role.title}</span></div>
  </div>`;
}

function buildHtml(role) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>${CSS}</style></head>
  <body>${coverPage(role)}${stepsPages(role)}${closingPage(role)}</body></html>`;
}

export { ROLES, buildHtml };

/* ---------- Main ---------- */

async function main() {
  const exe = resolveChromium();
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage();
  const results = [];
  for (const [key, role] of Object.entries(ROLES)) {
    const html = buildHtml(role);
    await page.setContent(html, { waitUntil: 'load' });
    const out = path.join(outDir, `panduan-${key}.pdf`);
    await page.pdf({ path: out, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    results.push(`${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  }
  await browser.close();
  console.log('PDF tersusun:\n - ' + results.join('\n - '));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
