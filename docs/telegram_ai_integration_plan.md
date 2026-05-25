# Implementation Plan: Telegram Notification & AI Bot Integration

Dokumen ini menguraikan strategi integrasi notifikasi otomatis dan fitur AI Chatbot ke dalam aplikasi SmartPatrol menggunakan **Telegram Bot API**.

## 1. Overview
Penggunaan Telegram dipilih karena stabilitasnya, API yang resmi (100% gratis), dan kemudahan integrasi dengan layanan AI. Sistem akan berfungsi sebagai:
- **Broadcaster**: Mengirimkan notifikasi operasional (SOS, Temuan, Summary) ke Grup Telegram.
- **AI Assistant**: Merespon pertanyaan user di grup mengenai data patroli atau SOP menggunakan AI (Gemini/OpenAI).

## 2. Persiapan (Prerequisites)
1. **Telegram Bot Token**: Didapatkan melalui `@BotFather`.
2. **Chat ID**: ID Grup Telegram tujuan (didapatkan setelah Bot masuk ke grup).
3. **AI API Key**: Google Gemini API Key (Rekomendasi) atau OpenAI API Key.
4. **Supabase Secrets**: Untuk menyimpan Token dan API Key secara aman.

## 3. Daftar Skenario Notifikasi

Format pesan akan mengikuti gaya visual yang sudah disepakati (Header Emoji, Kapital, Bersih):

### 1. SOS Alert (Darurat)
```text
🚨 SOS ALERT 🚨
Kapal: MT MENGGALA
Pengirim: Sertu Agus
Waktu: 12:45 WIB
Keterangan: Tombol darurat ditekan oleh personel di lokasi.

🔗 Titik Lokasi GPS (Google Maps):
https://maps.google.com/?q=-6.1021,106.8833
```

### 2. Temuan Baru & Update
*(Sama seperti perencanaan sebelumnya, dikirim otomatis saat data disubmit)*

### 3. Summary Laporan Per Shift (Shift Wrap Up)
```text
📊 SUMMARY LAPORAN SHIFT 2 (12:00 - 18:00) 📊

🚢 Kapal: MT MENGGALA
✅ Aman: 8
⚠️ Temuan: 1
❌ Missed: 0

🚢 Kapal: MT SRIWIJAYA
✅ Aman: 10
⚠️ Temuan: 1
❌ Missed: 0

🔗 Semua laporan telah disimpan dalam riwayat dan siap untuk dicek:
https://domain-smartpatrol.web.app/riwayat
```

## 4. Fitur AI Chatbot (Assistant)

Bot AI akan diintegrasikan menggunakan **Supabase Edge Functions (Webhook)**.

- **Mekanisme**: Telegram Webhook -> Supabase Edge Function -> AI API (Gemini) -> Telegram SendMessage.
- **Kemampuan AI**:
    - **Tanya Data**: "Berapa total temuan hari ini?"
    - **Analisis**: "Rangkum laporan untuk Kapal MT Menggala."
    - **Pengetahuan SOP**: Memberikan arahan jika ada temuan teknis berdasarkan basis data prosedur.

## 5. Arsitektur Backend (Cloud Functions)

Update `functions/index.js` untuk mencakup:

1. **`notifyTelegram`**: Fungsi utility untuk mengirim pesan ke Telegram.
2. **`telegramWebhook`**: Fungsi untuk menerima pesan dari Grup, memprosesnya via AI, dan mengirim balasan.
3. **`onDocumentWrite` Triggers**: Trigger otomatis saat ada data SOS/Temuan/Insiden baru di Firestore.

### Contoh Snippet Integrasi AI (Gemini):
```javascript
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function askAI(prompt) {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const result = await model.generateContent(prompt);
  return result.response.text();
}
```

## 6. Implementation Steps

### Phase 1: Setup Bot & Security
- Register bot di @BotFather.
- Set `supabase secrets set TELEGRAM_BOT_TOKEN`.
- Set `supabase secrets set GEMINI_API_KEY`.

### Phase 2: Core Notification
- Implementasi fungsi `notifyTelegram`.
- Tambahkan trigger Firestore untuk SOS dan Temuan.

### Phase 3: AI Webhook
- Deploy fungsi `telegramWebhook`.
- Daftarkan URL function ke Telegram via `setWebhook`.
- Implementasi logika AI untuk menjawab pertanyaan di grup.

## 7. Security & Resource Efficiency
- **Filter Chat ID**: Bot hanya akan merespon pesan dari ID Grup yang sudah ditentukan.
- **Rate Limiting**: Membatasi frekuensi panggilan AI untuk menghemat kuota API.
- **Sanitization**: Tetap mensanitasi input sebelum dikirim ke AI.
