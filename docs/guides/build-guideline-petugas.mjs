/**
 * Tujuan: Membangun deck PowerPoint panduan penggunaan SmartPatrol untuk petugas lapangan.
 * Caller: Agent/developer yang perlu membuat ulang materi training dari repo SmartPatrol.
 * Dependensi: @oai/artifact-tool dari Codex primary runtime, asset launcher Android, dan dokumen user guideline.
 * Main Functions: Menyusun slide editable, export PPTX, render preview PNG, dan membuat QA report ringan.
 * Side Effects: Menulis file PPTX, preview PNG, layout JSON, dan laporan QA ke folder docs/guides.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const outputDir = __dirname;
const previewDir = path.join(outputDir, "preview");
const sourcePreviewDir = path.join(previewDir, "source");
const pptxPreviewDir = path.join(previewDir, "pptx");
const layoutDir = path.join(previewDir, "layout");

const deckPath = path.join(outputDir, "smartpatrol-guideline-petugas.pptx");
const reportPath = path.join(previewDir, "qa-report.json");
const iconPath = path.join(
  repoRoot,
  "android",
  "app",
  "src",
  "main",
  "res",
  "mipmap-xxxhdpi",
  "ic_launcher.png",
);

const slideSize = { width: 1920, height: 1080 };

function runtimeNodeModulesPath() {
  if (process.env.ARTIFACT_TOOL_NODE_MODULES) {
    return process.env.ARTIFACT_TOOL_NODE_MODULES;
  }

  const userProfile = process.env.USERPROFILE || process.env.HOME || "";
  return path.join(
    userProfile,
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "node",
    "node_modules",
  );
}

async function loadRuntimePackage(packageName) {
  const nodeModulesPath = runtimeNodeModulesPath();
  const runtimeRequire = createRequire(path.join(nodeModulesPath, "__runtime__.cjs"));
  const packageEntry = runtimeRequire.resolve(packageName);
  return import(pathToFileURL(packageEntry).href);
}

function makeApi(artifact) {
  const {
    Presentation,
    PresentationFile,
    row,
    column,
    grid,
    layers,
    panel,
    text,
    image,
    shape,
    rule,
    fill,
    hug,
    fixed,
    wrap,
    grow,
    fr,
    auto,
  } = artifact;

  return {
    Presentation,
    PresentationFile,
    row,
    column,
    grid,
    layers,
    panel,
    text,
    image,
    shape,
    rule,
    fill,
    hug,
    fixed,
    wrap,
    grow,
    fr,
    auto,
  };
}

const colors = {
  bg: "#06111F",
  bg2: "#0B1728",
  bg3: "#102235",
  ink: "#F1FAF8",
  muted: "#9DB4C4",
  dim: "#6D8494",
  cyan: "#25D4E8",
  teal: "#20C7A8",
  gold: "#F2C75C",
  coral: "#FF6B57",
  rose: "#F05268",
  green: "#4ADE80",
  line: "rgba(185, 226, 235, 0.20)",
  soft: "rgba(255, 255, 255, 0.06)",
  softer: "rgba(255, 255, 255, 0.035)",
};

const font = {
  display: "Aptos Display",
  body: "Aptos",
  mono: "Cascadia Mono",
};

function textStyle(size, color = colors.ink, extras = {}) {
  return {
    fontSize: size,
    color,
    typeface: extras.typeface || font.body,
    ...extras,
  };
}

function addSlide(api, presentation, build) {
  const slide = presentation.slides.add();
  build(slide);
  return slide;
}

function compose(api, slide, root) {
  slide.compose(root, {
    frame: { left: 0, top: 0, width: slideSize.width, height: slideSize.height },
    baseUnit: 8,
  });
}

function background(api, children) {
  const { layers, shape, fill } = api;
  return layers(
    { name: "slide-layers", width: fill, height: fill },
    [
      shape({ name: "background", width: fill, height: fill, fill: colors.bg }),
      shape({
        name: "top-accent",
        width: fill,
        height: api.fixed(10),
        fill: colors.teal,
      }),
      ...children,
    ],
  );
}

function label(api, value, color = colors.cyan) {
  const { text, fixed, hug } = api;
  return text(value.toUpperCase(), {
    name: `label-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    width: fixed(840),
    height: hug,
    style: textStyle(18, color, {
      bold: true,
      typeface: font.mono,
    }),
  });
}

function titleBlock(api, kicker, title, subtitle, options = {}) {
  const { column, text, wrap, fill, hug, rule, fixed } = api;
  return column(
    { name: "title-stack", width: fill, height: hug, gap: 18, columnSpan: options.columnSpan },
    [
      label(api, kicker),
      text(title, {
        name: "slide-title",
        width: wrap(1320),
        height: fixed(150),
        style: textStyle(56, colors.ink, {
          bold: true,
          typeface: font.display,
          lineSpacingMultiple: 1.0,
        }),
      }),
      rule({ name: "title-rule", width: fixed(180), stroke: colors.teal, weight: 5 }),
      subtitle
        ? text(subtitle, {
            name: "slide-subtitle",
            width: wrap(1180),
            height: hug,
            style: textStyle(26, colors.muted, { lineSpacingMultiple: 1.08 }),
          })
        : null,
    ].filter(Boolean),
  );
}

function footer(api, value = "SmartPatrol HSSE - Panduan Petugas", options = {}) {
  const { row, text, fill, hug } = api;
  return row(
    {
      name: "footer",
      width: fill,
      height: hug,
      align: "center",
      justify: "between",
      columnSpan: options.columnSpan,
    },
    [
      text(value, {
        name: "footer-left",
        width: api.fixed(1100),
        height: hug,
        style: textStyle(16, colors.dim, { typeface: font.mono }),
      }),
      text("Mei 2026", {
        name: "footer-date",
        width: api.fixed(180),
        height: hug,
        style: textStyle(16, colors.dim, { typeface: font.mono, alignment: "right" }),
      }),
    ],
  );
}

function bullet(api, value, color = colors.teal) {
  const { row, shape, text, fixed, fill, hug } = api;
  return row(
    { name: "bullet-row", width: fill, height: hug, gap: 16, align: "start" },
    [
      shape({
        name: "bullet-dot",
        geometry: "ellipse",
        width: fixed(12),
        height: fixed(12),
        fill: color,
      }),
      text(value, {
        name: "bullet-text",
        width: fill,
        height: hug,
        style: textStyle(25, colors.ink, { lineSpacingMultiple: 1.08 }),
      }),
    ],
  );
}

function numberedStep(api, number, heading, body, color = colors.teal) {
  const { row, column, panel, text, fixed, fill, hug } = api;
  return row(
    { name: `step-${number}`, width: fill, height: hug, gap: 22, align: "start" },
    [
      panel(
        {
          name: `step-number-${number}`,
          width: fixed(58),
          height: fixed(58),
          fill: color,
          borderRadius: "rounded-full",
          align: "center",
          justify: "center",
        },
        text(String(number), {
          name: `step-number-text-${number}`,
          width: fixed(40),
          height: hug,
          style: textStyle(26, colors.bg, {
            bold: true,
            alignment: "center",
            typeface: font.display,
          }),
        }),
      ),
      column(
        { name: `step-copy-${number}`, width: fill, height: hug, gap: 6 },
        [
          text(heading, {
            name: `step-heading-${number}`,
            width: fill,
            height: hug,
            style: textStyle(29, colors.ink, { bold: true, typeface: font.display }),
          }),
          text(body, {
            name: `step-body-${number}`,
            width: fill,
            height: hug,
            style: textStyle(21, colors.muted, { lineSpacingMultiple: 1.12 }),
          }),
        ],
      ),
    ],
  );
}

function smallPill(api, value, color = colors.teal, dark = false) {
  const { panel, text, fixed, hug } = api;
  const pillTextWidth = Math.min(620, Math.max(110, value.length * 12 + 18));
  return panel(
    {
      name: `pill-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      fill: dark ? "rgba(6, 17, 31, 0.92)" : "rgba(255, 255, 255, 0.08)",
      line: { fill: color, width: 1.5 },
      borderRadius: "rounded-full",
      padding: { x: 18, y: 8 },
    },
    text(value, {
      name: "pill-text",
      width: fixed(pillTextWidth),
      height: hug,
      style: textStyle(16, color, {
        bold: true,
        typeface: font.mono,
        alignment: "center",
      }),
    }),
  );
}

function insightPanel(api, heading, body, color = colors.teal) {
  const { panel, column, text, fill, hug } = api;
  return panel(
    {
      name: `insight-${heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      width: fill,
      height: hug,
      fill: colors.soft,
      line: { fill: "rgba(255, 255, 255, 0.13)", width: 1.25 },
      borderRadius: 18,
      padding: { x: 28, y: 24 },
    },
    column(
      { width: fill, height: hug, gap: 10 },
      [
        text(heading, {
          name: "insight-heading",
          width: fill,
          height: hug,
          style: textStyle(28, color, { bold: true, typeface: font.display }),
        }),
        text(body, {
          name: "insight-body",
          width: fill,
          height: hug,
          style: textStyle(21, colors.muted, { lineSpacingMultiple: 1.08 }),
        }),
      ],
    ),
  );
}

function phoneFrame(api, title, items, accent = colors.teal) {
  const { panel, column, row, text, shape, fixed, fill, hug } = api;
  return panel(
    {
      name: "phone-frame",
      width: fixed(420),
      height: fixed(600),
      fill: "#081422",
      line: { fill: "rgba(255, 255, 255, 0.22)", width: 2 },
      borderRadius: 32,
      padding: { x: 24, y: 24 },
    },
    column(
      { name: "phone-inner", width: fill, height: fill, gap: 12 },
      [
        row(
          { name: "phone-top", width: fill, height: hug, justify: "between", align: "center" },
          [
            text("SmartPatrol", {
              name: "phone-brand",
              width: api.fixed(220),
              height: hug,
              style: textStyle(16, colors.cyan, { bold: true, typeface: font.display }),
            }),
            shape({
              name: "phone-status",
              geometry: "ellipse",
              width: fixed(14),
              height: fixed(14),
              fill: accent,
            }),
          ],
        ),
        panel(
          {
            name: "phone-title-panel",
            width: fill,
            height: hug,
            fill: "rgba(37, 212, 232, 0.08)",
            borderRadius: 18,
            padding: { x: 16, y: 14 },
          },
          text(title, {
            name: "phone-title",
            width: fill,
            height: hug,
            style: textStyle(21, colors.ink, { bold: true, typeface: font.display }),
          }),
        ),
        column(
          { name: "phone-list", width: fill, height: fill, gap: 10 },
          items.map((item, index) =>
            row(
              { name: `phone-item-${index + 1}`, width: fill, height: hug, gap: 12, align: "center" },
              [
                panel(
                  {
                    name: `phone-item-dot-${index + 1}`,
                    width: fixed(28),
                    height: fixed(28),
                    fill: item.color || accent,
                    borderRadius: "rounded-full",
                    align: "center",
                    justify: "center",
                  },
                  text(String(index + 1), {
                    width: fixed(20),
                    height: hug,
                    style: textStyle(12, colors.bg, {
                      bold: true,
                      alignment: "center",
                      typeface: font.mono,
                    }),
                  }),
                ),
                column(
                  { width: fill, height: hug, gap: 2 },
                  [
                    text(item.title, {
                      name: `phone-item-title-${index + 1}`,
                      width: fill,
                      height: hug,
                      style: textStyle(15, colors.ink, { bold: true }),
                    }),
                    text(item.body, {
                      name: `phone-item-body-${index + 1}`,
                      width: fill,
                      height: hug,
                      style: textStyle(12, colors.muted, { lineSpacingMultiple: 1.02 }),
                    }),
                  ],
                ),
              ],
            ),
          ),
        ),
        row(
          { name: "phone-bottom-nav", width: fill, height: hug, justify: "between" },
          ["Patroli", "Temuan", "Riwayat", "Notif"].map((nav) =>
            text(nav, {
              name: `phone-nav-${nav.toLowerCase()}`,
              width: api.fixed(76),
              height: api.fixed(20),
              style: textStyle(10, nav === "Patroli" ? accent : colors.dim, {
                bold: nav === "Patroli",
                alignment: "center",
              }),
            }),
          ),
        ),
      ],
    ),
  );
}

function buildDeck(api, assets) {
  const {
    Presentation,
    row,
    column,
    grid,
    layers,
    panel,
    text,
    image,
    shape,
    rule,
    fill,
    hug,
    fixed,
    wrap,
    grow,
    fr,
    auto,
  } = api;

  const presentation = Presentation.create({ slideSize });

  // Slide 1: cover.
  addSlide(api, presentation, (slide) => {
    compose(
      api,
      slide,
      background(api, [
        grid(
          {
            name: "cover-root",
            width: fill,
            height: fill,
            columns: [fr(1.1), fr(0.7)],
            rows: [auto, fr(1), auto],
            padding: { x: 96, y: 74 },
            columnGap: 64,
            rowGap: 38,
          },
          [
            Object.assign(label(api, "Field guide"), { columnSpan: 2 }),
            column(
              { name: "cover-copy", width: fill, height: fill, gap: 28, justify: "center" },
              [
                text("SmartPatrol", {
                  name: "cover-title",
                  width: wrap(850),
                  height: hug,
                  style: textStyle(96, colors.ink, {
                    bold: true,
                    typeface: font.display,
                  }),
                }),
                text("Panduan Cepat Petugas Lapangan", {
                  name: "cover-subtitle",
                  width: wrap(860),
                  height: hug,
                  style: textStyle(42, colors.cyan, {
                    bold: true,
                    typeface: font.display,
                  }),
                }),
                text(
                  "Mulai shift, isi checkpoint, dokumentasikan temuan, gunakan SOS, dan tetap aman saat sinyal hilang.",
                  {
                    name: "cover-promise",
                    width: wrap(840),
                    height: hug,
                    style: textStyle(28, colors.muted, { lineSpacingMultiple: 1.1 }),
                  },
                ),
                row(
                  { name: "cover-pills", width: fill, height: hug, gap: 14 },
                  [
                    smallPill(api, "OFFLINE-FIRST", colors.teal),
                    smallPill(api, "TRUSTED TIME", colors.gold),
                    smallPill(api, "SOS READY", colors.rose),
                  ],
                ),
              ],
            ),
            panel(
              {
                name: "cover-icon-stage",
                width: fill,
                height: fill,
                fill: colors.softer,
                line: { fill: colors.line, width: 1.25 },
                borderRadius: 32,
                padding: { x: 70, y: 70 },
                align: "center",
                justify: "center",
              },
              image({
                name: "smartpatrol-icon",
                dataUrl: assets.iconDataUrl,
                width: fixed(360),
                height: fixed(360),
                fit: "contain",
                alt: "Ikon aplikasi SmartPatrol",
              }),
            ),
            footer(api, "Materi briefing internal petugas patroli", { columnSpan: 2 }),
          ],
        ),
      ]),
    );
  });

  // Slide 2: operating model.
  addSlide(api, presentation, (slide) => {
    compose(
      api,
      slide,
      background(api, [
        grid(
          {
            name: "model-root",
            width: fill,
            height: fill,
            columns: [fr(1)],
            rows: [auto, fr(1), auto],
            padding: { x: 88, y: 70 },
            rowGap: 42,
          },
          [
            titleBlock(
              api,
              "Cara berpikir",
              "Setiap patroli adalah bukti operasional",
              "SmartPatrol bukan sekadar checklist. Setiap aksi menyimpan konteks shift, foto, lokasi, dan status audit waktu.",
            ),
            row(
              { name: "three-pillars", width: fill, height: hug, gap: 34, align: "start" },
              [
                insightPanel(
                  api,
                  "Bukti lapangan",
                  "Checkpoint berisi status AMAN atau TEMUAN, foto, dan uraian kejadian saat diperlukan.",
                  colors.teal,
                ),
                insightPanel(
                  api,
                  "Waktu audit",
                  "Sistem memakai trusted time untuk mendeteksi manipulasi jam perangkat.",
                  colors.gold,
                ),
                insightPanel(
                  api,
                  "Sinkron otomatis",
                  "Saat offline, data masuk antrean lokal dan naik ke Supabase saat koneksi pulih.",
                  colors.cyan,
                ),
              ],
            ),
            footer(api),
          ],
        ),
      ]),
    );
  });

  // Slide 3: pre-shift readiness.
  addSlide(api, presentation, (slide) => {
    compose(
      api,
      slide,
      background(api, [
        grid(
          {
            name: "readiness-root",
            width: fill,
            height: fill,
            columns: [fr(1.05), fr(0.62)],
            rows: [auto, fr(1), auto],
            padding: { x: 88, y: 70 },
            columnGap: 56,
            rowGap: 34,
          },
          [
            titleBlock(
              api,
              "Sebelum shift",
              "Pastikan akun, perangkat, dan izin aplikasi siap",
              "Persiapan kecil mencegah laporan tertahan saat kondisi lapangan berubah.",
              { columnSpan: 2 },
            ),
            column(
              { name: "readiness-list", width: fill, height: fill, gap: 22 },
              [
                bullet(api, "Login dengan akun yang sudah di-approve Admin.", colors.teal),
                bullet(api, "Pastikan assignment kapal sesuai area tugas hari ini.", colors.teal),
                bullet(api, "Aktifkan izin kamera, lokasi, dan notifikasi.", colors.gold),
                bullet(api, "Cek baterai, sinyal, dan ruang penyimpanan sebelum mulai patroli.", colors.gold),
                bullet(api, "Jangan pinjamkan akun. Semua log melekat ke nama petugas.", colors.rose),
              ],
            ),
            phoneFrame(
              api,
              "Checklist kesiapan",
              [
                { title: "Akun aktif", body: "Masuk area operasional setelah approval." },
                { title: "Kapal benar", body: "Data yang terlihat mengikuti assignment." },
                { title: "Izin lengkap", body: "Kamera, lokasi, dan notifikasi aktif." },
                { title: "Perangkat siap", body: "Baterai cukup dan storage tidak penuh." },
              ],
              colors.teal,
            ),
            footer(api, undefined, { columnSpan: 2 }),
          ],
        ),
      ]),
    );
  });

  // Slide 4: start shift.
  addSlide(api, presentation, (slide) => {
    compose(
      api,
      slide,
      background(api, [
        grid(
          {
            name: "shift-root",
            width: fill,
            height: fill,
            columns: [fr(1)],
            rows: [auto, fr(1), auto],
            padding: { x: 88, y: 70 },
            rowGap: 34,
          },
          [
            titleBlock(
              api,
              "Mulai shift",
              "Isi Status Shift sebelum membuka checkpoint",
              "Checklist dikunci sampai satu petugas kapal menyimpan snapshot status petugas pada shift aktif.",
            ),
            row(
              { name: "shift-flow", width: fill, height: fill, gap: 30, align: "stretch" },
              [
                column(
                  { name: "shift-steps", width: grow(1), height: fill, gap: 28, justify: "center" },
                  [
                    numberedStep(api, 1, "Buka Patroli", "Masuk ke tab Patroli dan cek label kapal serta shift aktif.", colors.teal),
                    numberedStep(api, 2, "Pilih status", "Tandai petugas sebagai patroli atau istirahat sesuai kondisi aktual.", colors.gold),
                    numberedStep(api, 3, "Simpan snapshot", "Setelah status tersimpan, tombol checkpoint aktif untuk semua petugas kapal.", colors.cyan),
                    numberedStep(api, 4, "Mulai rute", "Kerjakan titik patroli sesuai urutan lapangan dan prioritas risiko.", colors.teal),
                  ],
                ),
                phoneFrame(
                  api,
                  "Patroli aktif",
                  [
                    { title: "Shift 1 ON GOING", body: "Countdown membantu kontrol waktu.", color: colors.gold },
                    { title: "Status petugas", body: "Patroli atau istirahat disimpan per shift.", color: colors.teal },
                    { title: "Checkpoint terbuka", body: "Aksi AMAN/TEMUAN siap dipakai.", color: colors.cyan },
                    { title: "Sync urgent", body: "Snapshot status dikirim secepat mungkin.", color: colors.teal },
                  ],
                  colors.gold,
                ),
              ],
            ),
            footer(api),
          ],
        ),
      ]),
    );
  });

  // Slide 5: checkpoint decision.
  addSlide(api, presentation, (slide) => {
    compose(
      api,
      slide,
      background(api, [
        grid(
          {
            name: "checkpoint-root",
            width: fill,
            height: fill,
            columns: [fr(1)],
            rows: [auto, fr(1), auto],
            padding: { x: 88, y: 70 },
            rowGap: 36,
          },
          [
            titleBlock(
              api,
              "Isi checkpoint",
              "Pilih AMAN untuk kondisi normal, TEMUAN untuk anomali",
              "Jangan menunda input. Catatan yang dibuat dekat dengan waktu kejadian lebih kuat untuk audit.",
            ),
            grid(
              {
                name: "checkpoint-compare",
                width: fill,
                height: fill,
                columns: [fr(1), fr(1)],
                columnGap: 36,
              },
              [
                panel(
                  {
                    name: "aman-panel",
                    width: fill,
                    height: fill,
                    fill: "rgba(74, 222, 128, 0.08)",
                    line: { fill: "rgba(74, 222, 128, 0.45)", width: 2 },
                    borderRadius: 24,
                    padding: { x: 36, y: 34 },
                  },
                  column(
                    { width: fill, height: fill, gap: 22 },
                    [
                      smallPill(api, "AMAN", colors.green, true),
                      text("Gunakan saat titik patroli normal.", {
                        name: "aman-heading",
                        width: fill,
                        height: hug,
                        style: textStyle(38, colors.ink, { bold: true, typeface: font.display }),
                      }),
                      bullet(api, "Ambil foto bila diwajibkan SOP atau kondisi perlu bukti.", colors.green),
                      bullet(api, "Pastikan titik, nama petugas, dan shift sudah benar.", colors.green),
                      bullet(api, "Kirim laporan. Jika offline, biarkan antrean sync bekerja.", colors.green),
                    ],
                  ),
                ),
                panel(
                  {
                    name: "temuan-panel",
                    width: fill,
                    height: fill,
                    fill: "rgba(242, 199, 92, 0.09)",
                    line: { fill: "rgba(242, 199, 92, 0.55)", width: 2 },
                    borderRadius: 24,
                    padding: { x: 36, y: 34 },
                  },
                  column(
                    { width: fill, height: fill, gap: 22 },
                    [
                      smallPill(api, "TEMUAN", colors.gold, true),
                      text("Gunakan saat ada kondisi bermasalah.", {
                        name: "temuan-heading",
                        width: fill,
                        height: hug,
                        style: textStyle(38, colors.ink, { bold: true, typeface: font.display }),
                      }),
                      bullet(api, "Foto wajib, ambil dari kamera untuk bukti segar.", colors.gold),
                      bullet(api, "Isi kejadian, dugaan penyebab, dan tindak lanjut awal.", colors.gold),
                      bullet(api, "Temuan masuk daftar Insiden untuk dipantau PIC/Admin.", colors.gold),
                    ],
                  ),
                ),
              ],
            ),
            footer(api),
          ],
        ),
      ]),
    );
  });

  // Slide 6: incident handling.
  addSlide(api, presentation, (slide) => {
    compose(
      api,
      slide,
      background(api, [
        grid(
          {
            name: "incident-root",
            width: fill,
            height: fill,
            columns: [fr(0.8), fr(1)],
            rows: [auto, fr(1), auto],
            padding: { x: 88, y: 70 },
            columnGap: 54,
            rowGap: 34,
          },
          [
            titleBlock(
              api,
              "Temuan dan insiden",
              "Catatan 5W1H membuat tindak lanjut lebih cepat",
              "Petugas mencatat bukti dan kondisi awal. PIC/Admin melanjutkan progress dan closing.",
              { columnSpan: 2 },
            ),
            panel(
              {
                name: "incident-5w1h",
                width: fill,
                height: fill,
                fill: colors.soft,
                line: { fill: colors.line, width: 1.5 },
                borderRadius: 28,
                padding: { x: 42, y: 42 },
              },
              column(
                { width: fill, height: fill, gap: 20, justify: "center" },
                [
                  text("5W1H", {
                    name: "fivew-title",
                    width: fill,
                    height: hug,
                    style: textStyle(76, colors.gold, { bold: true, typeface: font.display }),
                  }),
                  text("Apa terjadi, dimana, kapan, siapa melapor, mengapa diduga terjadi, dan bagaimana tindak awalnya.", {
                    name: "fivew-body",
                    width: fill,
                    height: hug,
                    style: textStyle(28, colors.ink, { lineSpacingMultiple: 1.1 }),
                  }),
                  rule({ name: "fivew-rule", width: fixed(210), stroke: colors.gold, weight: 5 }),
                  text("Foto + keterangan singkat lebih berguna daripada narasi panjang tanpa bukti.", {
                    name: "fivew-note",
                    width: fill,
                    height: hug,
                    style: textStyle(22, colors.muted, { lineSpacingMultiple: 1.08 }),
                  }),
                ],
              ),
            ),
            column(
              { name: "incident-flow", width: fill, height: fill, gap: 26, justify: "center" },
              [
                numberedStep(api, 1, "Checkpoint TEMUAN atau Lapor Baru", "Gunakan Lapor Baru jika insiden tidak berasal dari titik checkpoint.", colors.gold),
                numberedStep(api, 2, "Lengkapi bukti awal", "Deskripsi, penyebab, tindak lanjut awal, foto, dan lokasi checkpoint wajib jelas.", colors.gold),
                numberedStep(api, 3, "Pantau status", "Temuan terbuka sampai PIC/Admin menambahkan progress dan menutup laporan.", colors.cyan),
                numberedStep(api, 4, "Jangan hapus bukti lokal", "Saat offline, foto masih bisa tertahan di perangkat sampai upload selesai.", colors.rose),
              ],
            ),
            footer(api, undefined, { columnSpan: 2 }),
          ],
        ),
      ]),
    );
  });

  // Slide 7: SOS.
  addSlide(api, presentation, (slide) => {
    compose(
      api,
      slide,
      layers(
        { name: "sos-layers", width: fill, height: fill },
        [
          shape({ name: "sos-bg", width: fill, height: fill, fill: "#16080E" }),
          shape({ name: "sos-accent", width: fixed(34), height: fill, fill: colors.rose }),
          grid(
            {
              name: "sos-root",
              width: fill,
              height: fill,
              columns: [fr(0.75), fr(1.05)],
              rows: [auto, fr(1), auto],
              padding: { x: 96, y: 74 },
              columnGap: 58,
              rowGap: 34,
            },
            [
              titleBlock(
                api,
                "Darurat",
                "SOS hanya untuk keadaan kritis",
                "Gunakan untuk perompakan, kebakaran, medis darurat, orang jatuh, atau ancaman keselamatan langsung.",
                { columnSpan: 2 },
              ),
              column(
                { name: "sos-warning", width: fill, height: fill, gap: 28, justify: "center" },
                [
                  text("Tekan SOS", {
                    name: "sos-large",
                    width: fill,
                    height: hug,
                    style: textStyle(90, colors.rose, { bold: true, typeface: font.display }),
                  }),
                  text("Aplikasi akan meminta konfirmasi untuk mencegah pemencetan tidak sengaja.", {
                    name: "sos-large-copy",
                    width: wrap(620),
                    height: hug,
                    style: textStyle(29, colors.ink, { lineSpacingMultiple: 1.08 }),
                  }),
                  smallPill(api, "JANGAN DIPAKAI UNTUK TEST TANPA KOORDINASI", colors.gold, true),
                ],
              ),
              column(
                { name: "sos-steps", width: fill, height: fill, gap: 28, justify: "center" },
                [
                  numberedStep(api, 1, "Konfirmasi SOS", "Tekan hanya setelah kondisi darurat benar-benar terjadi.", colors.rose),
                  numberedStep(api, 2, "GPS dibaca", "Koordinat perangkat dan nama pelapor dikirim ke penerima terkait.", colors.rose),
                  numberedStep(api, 3, "Alarm menyala", "Perangkat target menerima modal darurat dan bunyi alarm.", colors.rose),
                  numberedStep(api, 4, "Terima & Mengerti", "Penerima menekan tombol ini untuk menghentikan alarm di perangkatnya.", colors.rose),
                ],
              ),
              footer(api, "Gunakan sesuai prosedur emergency response", { columnSpan: 2 }),
            ],
          ),
        ],
      ),
    );
  });

  // Slide 8: offline sync.
  addSlide(api, presentation, (slide) => {
    compose(
      api,
      slide,
      background(api, [
        grid(
          {
            name: "offline-root",
            width: fill,
            height: fill,
            columns: [fr(1), fr(0.75)],
            rows: [auto, fr(1), auto],
            padding: { x: 88, y: 70 },
            columnGap: 54,
            rowGap: 34,
          },
          [
            titleBlock(
              api,
              "Saat offline",
              "Terus patroli. Data masuk antrean lokal.",
              "Mode offline-first menjaga log dan foto tetap tersimpan di perangkat sampai koneksi stabil.",
              { columnSpan: 2 },
            ),
            column(
              { name: "offline-do", width: fill, height: fill, gap: 22, justify: "center" },
              [
                bullet(api, "Isi checkpoint seperti biasa walau sinyal hilang.", colors.teal),
                bullet(api, "Biarkan aplikasi terbuka atau jangan paksa clear storage sebelum sync selesai.", colors.gold),
                bullet(api, "Foto disimpan di IndexedDB dan di-upload saat koneksi pulih.", colors.cyan),
                bullet(api, "Jika sync lama, tunggu jaringan stabil lalu refresh sekali.", colors.teal),
                bullet(api, "Laporkan ke PIC jika foto tetap kosong setelah online.", colors.rose),
              ],
            ),
            panel(
              {
                name: "offline-queue",
                width: fill,
                height: fill,
                fill: colors.soft,
                line: { fill: colors.line, width: 1.5 },
                borderRadius: 30,
                padding: { x: 36, y: 40 },
              },
              column(
                { width: fill, height: fill, gap: 26, justify: "center" },
                [
                  smallPill(api, "LOCAL QUEUE", colors.cyan, true),
                  text("Offline bukan gagal simpan.", {
                    name: "offline-claim",
                    width: fill,
                    height: hug,
                    style: textStyle(48, colors.ink, { bold: true, typeface: font.display }),
                  }),
                  text("Log, foto, dan status akan disinkronkan ulang. Hindari tindakan yang menghapus data lokal sebelum proses selesai.", {
                    name: "offline-body",
                    width: fill,
                    height: hug,
                    style: textStyle(26, colors.muted, { lineSpacingMultiple: 1.12 }),
                  }),
                  rule({ name: "offline-rule", width: fixed(220), stroke: colors.cyan, weight: 5 }),
                  text("Risiko terbesar saat offline: clear cache, uninstall, atau ganti perangkat sebelum data naik.", {
                    name: "offline-risk",
                    width: fill,
                    height: hug,
                    style: textStyle(21, colors.gold, { lineSpacingMultiple: 1.08 }),
                  }),
                ],
              ),
            ),
            footer(api, undefined, { columnSpan: 2 }),
          ],
        ),
      ]),
    );
  });

  // Slide 9: trusted time.
  addSlide(api, presentation, (slide) => {
    compose(
      api,
      slide,
      background(api, [
        grid(
          {
            name: "audit-root",
            width: fill,
            height: fill,
            columns: [fr(1)],
            rows: [auto, fr(1), auto],
            padding: { x: 88, y: 70 },
            rowGap: 34,
          },
          [
            titleBlock(
              api,
              "Audit waktu",
              "Jangan ubah jam perangkat untuk mengejar jadwal",
              "SmartPatrol membandingkan waktu server, monotonic clock, dan drift perangkat untuk menandai rekaman yang mencurigakan.",
            ),
            grid(
              {
                name: "audit-grid",
                width: fill,
                height: hug,
                columns: [fr(1), fr(1), fr(1)],
                columnGap: 28,
                alignItems: "start",
              },
              [
                insightPanel(
                  api,
                  "Verified",
                  "Laporan online dengan trusted time yang valid. Ini status audit paling kuat.",
                  colors.green,
                ),
                insightPanel(
                  api,
                  "Pending-sync",
                  "Laporan dibuat saat offline dan menunggu verifikasi ketika koneksi kembali.",
                  colors.gold,
                ),
                insightPanel(
                  api,
                  "Suspicious",
                  "Ada indikasi jam perangkat berubah atau sinyal waktu tidak konsisten.",
                  colors.rose,
                ),
              ],
            ),
            footer(api, "Audit waktu menjaga integritas laporan dan disiplin patroli"),
          ],
        ),
      ]),
    );
  });

  // Slide 10: handover and troubleshooting.
  addSlide(api, presentation, (slide) => {
    compose(
      api,
      slide,
      background(api, [
        grid(
          {
            name: "handover-root",
            width: fill,
            height: fill,
            columns: [fr(0.95), fr(1.05)],
            rows: [auto, fr(1), auto],
            padding: { x: 88, y: 70 },
            columnGap: 54,
            rowGap: 34,
          },
          [
            titleBlock(
              api,
              "Akhir shift",
              "Pastikan laporan bisa dipakai untuk handover",
              "Sebelum meninggalkan area, cek ringkasan shift dan status sinkronisasi agar tim berikutnya menerima kondisi terkini.",
              { columnSpan: 2 },
            ),
            column(
              { name: "handover-left", width: fill, height: fill, gap: 24, justify: "center" },
              [
                numberedStep(api, 1, "Cek checkpoint", "Pastikan tidak ada titik penting yang tertinggal atau salah status.", colors.teal),
                numberedStep(api, 2, "Review temuan", "Catat temuan terbuka untuk briefing shift berikutnya.", colors.gold),
                numberedStep(api, 3, "Tunggu sync", "Pastikan laporan dan foto sudah naik bila koneksi tersedia.", colors.cyan),
                numberedStep(api, 4, "Laporkan anomali", "Sampaikan data kosong, foto hilang, atau badge suspicious ke PIC.", colors.rose),
              ],
            ),
            panel(
              {
                name: "troubleshooting",
                width: fill,
                height: fill,
                fill: colors.soft,
                line: { fill: colors.line, width: 1.5 },
                borderRadius: 28,
                padding: { x: 36, y: 36 },
              },
              column(
                { width: fill, height: fill, gap: 24, justify: "center" },
                [
                  text("Troubleshooting cepat", {
                    name: "trouble-title",
                    width: fill,
                    height: hug,
                    style: textStyle(42, colors.ink, { bold: true, typeface: font.display }),
                  }),
                  bullet(api, "Checkpoint terkunci: isi Status Shift lebih dulu.", colors.teal),
                  bullet(api, "Data belum update: tunggu sync, lalu refresh sekali.", colors.cyan),
                  bullet(api, "Foto blank: koneksi/upload mungkin belum selesai.", colors.gold),
                  bullet(api, "Tidak bisa closing insiden: hanya PIC/Admin yang berwenang.", colors.rose),
                ],
              ),
            ),
            footer(api, "Briefing selesai - gunakan aplikasi sesuai SOP lapangan", { columnSpan: 2 }),
          ],
        ),
      ]),
    );
  });

  return presentation;
}

async function saveBlobToFile(blob, filePath) {
  const bytes = Buffer.from(await blob.arrayBuffer());
  await fs.writeFile(filePath, bytes);
}

async function readPngAsDataUrl(filePath) {
  const bytes = await fs.readFile(filePath);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function inspectLayout(layout, slideIndex) {
  const warnings = [];
  const elements = Array.isArray(layout.elements) ? layout.elements : [];

  for (const element of elements) {
    const bbox = element.bbox;
    if (!Array.isArray(bbox) || bbox.length !== 4) continue;
    const [left, top, width, height] = bbox;
    const right = left + width;
    const bottom = top + height;

    if (left < -1 || top < -1 || right > slideSize.width + 1 || bottom > slideSize.height + 1) {
      warnings.push({
        slide: slideIndex,
        name: element.name || element.id,
        type: "bounds",
        message: "Element keluar dari canvas slide.",
        bbox,
      });
    }

    if (element.textPreview && /Slide Number|placeholder/i.test(element.textPreview)) {
      warnings.push({
        slide: slideIndex,
        name: element.name || element.id,
        type: "placeholder",
        message: "Placeholder text masih terlihat.",
        text: element.textPreview,
      });
    }
  }

  return warnings;
}

async function renderPresentationPreviews(presentation, targetDir, prefix = "slide") {
  await fs.mkdir(targetDir, { recursive: true });
  const paths = [];

  for (let i = 0; i < presentation.slides.count; i += 1) {
    const slide = presentation.slides.getItem(i);
    const pngBlob = await slide.export({ format: "png" });
    const filePath = path.join(targetDir, `${prefix}-${String(i + 1).padStart(2, "0")}.png`);
    await saveBlobToFile(pngBlob, filePath);
    paths.push(filePath);
  }

  return paths;
}

async function exportLayouts(presentation) {
  await fs.mkdir(layoutDir, { recursive: true });
  const warnings = [];
  const paths = [];

  for (let i = 0; i < presentation.slides.count; i += 1) {
    const slide = presentation.slides.getItem(i);
    const layoutBlob = await slide.export({ format: "layout" });
    const layoutJson = JSON.parse(await layoutBlob.text());
    const filePath = path.join(layoutDir, `slide-${String(i + 1).padStart(2, "0")}.layout.json`);
    await fs.writeFile(filePath, JSON.stringify(layoutJson, null, 2), "utf8");
    warnings.push(...inspectLayout(layoutJson, i + 1));
    paths.push(filePath);
  }

  return { paths, warnings };
}

async function run() {
  const artifact = await loadRuntimePackage("@oai/artifact-tool");
  const api = makeApi(artifact);
  const presentation = buildDeck(api, {
    iconDataUrl: await readPngAsDataUrl(iconPath),
  });

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(previewDir, { recursive: true });

  const pptxBlob = await api.PresentationFile.exportPptx(presentation);
  await pptxBlob.save(deckPath);

  const sourcePreviewPaths = await renderPresentationPreviews(presentation, sourcePreviewDir, "source-slide");
  const layoutResult = await exportLayouts(presentation);

  const pptxBytes = await fs.readFile(deckPath);
  const importedPresentation = await api.PresentationFile.importPptx(pptxBytes);
  const pptxPreviewPaths = await renderPresentationPreviews(importedPresentation, pptxPreviewDir, "pptx-slide");

  const report = {
    generatedAt: new Date().toISOString(),
    deckPath,
    slideCount: presentation.slides.count,
    sourcePreviewPaths,
    pptxPreviewPaths,
    layoutPaths: layoutResult.paths,
    layoutWarnings: layoutResult.warnings,
    pptxParityChecked: true,
  };

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
