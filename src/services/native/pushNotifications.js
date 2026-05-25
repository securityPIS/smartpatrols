/*
Tujuan: Menyediakan adapter no-op untuk notifikasi native pada versi SQL tanpa Firebase/FCM.
Caller: AppContextRuntime setelah user operasional berhasil login.
Dependensi: Tidak ada; Supabase Realtime in-app menangani notifikasi saat aplikasi aktif.
Main Functions: Mengembalikan cleanup kosong agar flow runtime tetap kompatibel.
Side Effects: Tidak meminta izin push, tidak mendaftarkan token, dan tidak membuka service background.
*/

export async function setupNativePushNotifications() {
  return () => {};
}
