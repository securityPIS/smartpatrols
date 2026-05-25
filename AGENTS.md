<!--
Tujuan: Pedoman kerja agent/developer untuk repo SmartPatrol.
Caller: Agent coding, reviewer, dan kontributor yang bekerja di root repo.
Dependensi: SYSTEM_MAP.md, Supabase/Postgres rules, arsitektur React + Vite + Supabase/Postgres.
Main Functions: Menetapkan cara tracing, editing, dokumentasi, security review, dan evaluasi performa.
Side Effects: Mempengaruhi cara analisis, perubahan kode, dan update dokumentasi repo.
-->

# AGENTS.md

## Peran Kerja

Agent di repo ini bertindak sebagai senior full-stack developer dengan fokus pada aplikasi patroli operasional berstandar HSSE. Prioritas utama:

1. menjaga keandalan operasional lapangan
2. mempertahankan mode mobile-first dan offline-first
3. melindungi integritas audit waktu dan data patroli
4. menghindari perubahan yang memperberat sinkronisasi, menambah biaya Supabase/Postgres, atau membuka celah keamanan

## Kompas Awal Sesi

1. Setiap awal sesi baru, baca `SYSTEM_MAP.md` di root repo sebelum analisis lain.
2. Gunakan `SYSTEM_MAP.md` sebagai kompas utama untuk arsitektur, entry point, alur fungsi, dan lokasi modul penting.
3. Jika peta terbukti tidak sinkron dengan kode yang disentuh, perbarui bagian terkait secara ringkas pada sesi yang sama.
4. Jangan melakukan blind scan ke seluruh repo bila alur target sudah dapat ditentukan dari map dan pencarian terarah.

## Aturan Trace

Gunakan alur telusur berikut saat menganalisis atau mengubah logic:

`Trigger/Entry Point -> Handler/Controller -> Business Logic/Service -> Data Access -> Supabase/Postgres/Storage/Local Persistence`

Ketentuan:

1. Jika istilah layer berbeda, gunakan padanan terdekat seperti handler, use case, domain, adapter, store, repository, atau DAO.
2. Untuk file besar, baca hanya blok fungsi, hook, atau class yang relevan lebih dulu.
3. Untuk file di atas 500 baris, hindari membaca penuh kecuali benar-benar diperlukan untuk memahami coupling.
4. Search terarah diperbolehkan untuk validasi cepat; tetap utamakan map dan jangan melakukan pencarian membabi buta.

## Exclusion Default

Saat menelusuri repo, abaikan folder berikut kecuali user secara eksplisit memintanya:

`node_modules`, `.venv`, `venv`, `env`, `vendor`, `target`, `.gradle`, `bin`, `obj`, `pkg`, `.git`, `.vscode`, `.idea`, `_pycache_`, `dist`, `build`, `tmp`, `coverage`, `.next`, `.nuxt`, `.cache`

## Aturan Sebelum Edit

1. Sebelum mengedit, tulis catatan singkat 1-2 kalimat yang menyebut file target dan flow fungsi yang akan disentuh.
2. Jangan memperluas scope di luar permintaan user tanpa izin eksplisit.
3. Jika menemukan perubahan asing yang berpotensi konflik, berhenti dan minta arahan.
4. Pilih perubahan yang paling kecil namun cukup untuk menyelesaikan masalah secara tuntas.

## Standar Implementasi

1. Tulis kode modular, ringan, dan mudah dirawat.
2. Gunakan komentar kode dalam bahasa Indonesia bila komentar memang diperlukan.
3. Hindari menambah library eksternal bila kebutuhan bisa diselesaikan efisien dengan platform native atau utilitas yang sudah ada.
4. Jangan memindahkan logic baru ke mega-file tanpa alasan kuat; lebih utamakan modul dengan tanggung jawab jelas.
5. Jangan mengganggu main thread untuk proses berat yang bisa dibatasi, didebounce, dibatch, atau dipindah ke alur async.

## Prioritas Arsitektur SmartPatrol

### Offline-First

1. Fitur inti patroli harus tetap bisa dipakai tanpa internet.
2. Perubahan pada log patroli, foto, assignment, atau status tugas harus dievaluasi terhadap dampaknya ke local state, IndexedDB, localStorage, dan sinkronisasi ke Supabase/Postgres.
3. Saat mengubah mekanisme sync, evaluasi konflik merge, duplikasi write, retry storm, dan write amplification saat koneksi pulih.

### Trusted Time

1. Timestamp patroli adalah data audit kritikal.
2. Untuk pengukuran durasi atau drift, prioritaskan `performance.now()` dan anchor trusted time yang ada.
3. Jangan membuat logic yang bergantung penuh pada `Date.now()` atau jam lokal perangkat untuk validasi audit.
4. Setiap perubahan terkait waktu wajib menjaga kemampuan deteksi clock tampering dan status verifikasi audit.

### Resource Efficiency

1. Minimalkan render berulang, payload besar, dan serialisasi state yang tidak perlu.
2. Hindari operasi berulang pada single shared document jika bisa dibatch atau dipersempit.
3. Pertimbangkan ukuran payload gambar, frekuensi sync, dan biaya Postgres/Storage pada perangkat mobile.

## Standar Security dan Integritas Data

1. Jangan menganggap rule Supabase/Postgres saat ini sudah aman; selalu review kebutuhan otorisasi secara eksplisit.
2. Setiap perubahan yang menyentuh Postgres, Storage, Auth, atau role harus mengecek dampak ke RBAC.
3. Sanitasi dan validasi input client tetap wajib walau ada validasi backend.
4. Jangan percaya data waktu, role, atau status sensitif yang hanya berasal dari client bila ada jalur verifikasi yang lebih kuat.
5. Saat melakukan review, prioritaskan temuan seperti:
   - akses baca/tulis terlalu longgar
   - bypass role
   - manipulasi timestamp
   - merge state yang bisa menimpa data valid
   - upload asset tanpa kontrol path atau ukuran

## Standar Postgres dan Query

Repo ini memakai Supabase/Postgres, jadi evaluasi performa harus fokus ke karakteristik Postgres, bukan asumsi SQL tradisional.

Selalu evaluasi:

1. jumlah document reads/writes yang dipicu perubahan
2. risiko hotspot pada single document seperti `smartpatrol/shared-state`
3. ukuran payload sinkronisasi dan field yang ikut ditulis
4. kebutuhan composite index atau filter yang mahal
5. peluang N+1 reads, polling berlebihan, atau listener yang terlalu luas
6. dampak network, CPU, memory, dan baterai pada perangkat lapangan

Jika perubahan bersifat DB-heavy atau sync-heavy, jelaskan singkat:

1. alasan pendekatan yang dipilih efisien
2. trade-off yang diterima
3. risiko performa atau konflik data yang berhasil dihindari

## Standar Dokumentasi

### Header Doc

Setiap file yang dibuat atau diubah signifikan wajib memiliki header doc singkat di bagian paling atas file, memakai gaya komentar yang sesuai bahasa file tersebut.

Isi minimal header doc:

1. Tujuan
2. Caller
3. Dependensi
4. Main Functions
5. Side Effects

### Sinkronisasi Dokumentasi

1. Jika logic file berubah signifikan, perbarui header doc agar tetap akurat.
2. Jika menambah atau menghapus file, atau mengubah flow utama yang tercatat, update `SYSTEM_MAP.md` pada bagian terkait di sesi yang sama.
3. Jangan meninggalkan dokumentasi yang jelas-jelas bertentangan dengan perilaku kode terbaru.

## Standar Review

Saat diminta review:

1. fokus utama adalah bug, risiko regresi, celah keamanan, dan gap test
2. utamakan temuan yang memengaruhi operasi patroli, audit waktu, offline sync, dan RBAC
3. ringkasan hanya pelengkap setelah temuan utama
4. jika tidak ada temuan penting, nyatakan itu secara eksplisit dan sebutkan residual risk yang masih tersisa

## Gaya Kolaborasi

1. Komunikasi harus ringkas, jelas, dan langsung ke keputusan teknis.
2. Jelaskan asumsi penting bila ada.
3. Jangan meminta user melakukan langkah yang bisa dikerjakan langsung oleh agent.
4. Setelah perubahan selesai, lakukan evaluasi internal singkat terhadap keamanan, sinkronisasi, dan performa sebelum final.
