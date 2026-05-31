/*
Tujuan: Kompresi gambar ke WebP dengan resize dan quality yang bisa diatur.
Caller: PatrolCameraModal, PatrolFormView, IncidentFormView, dan komponen lain yang perlu upload foto.
Dependensi: Canvas API browser.
Main Functions: readImageFileAsDataUrl (resize + WebP), readFileAsDataUrl (fallback baca mentah).
Side Effects: Memakai canvas 2D untuk kompresi WebP. Me-revoke objectURL setelah selesai.
*/

export async function readImageFileAsDataUrl(file, maxEdge = 1600, quality = 0.88) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("File yang dipilih bukan gambar.");
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    try {
      const image = await loadImage(objectUrl);
      const longestSide = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height, 1);
      const scale = Math.min(1, maxEdge / longestSide);
      const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
      const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        throw new Error("Browser tidak mendukung kompresi gambar.");
      }

      context.drawImage(image, 0, 0, width, height);
      // Encode ASINKRON via toBlob: encoding WebP berjalan di luar main thread sehingga
      // UI tidak beku saat kompres foto besar (akar lag "setelah take foto").
      return await canvasToCompressedDataUrl(canvas, "image/webp", quality);
    } catch (error) {
      // Fallback ini menjaga upload tetap jalan untuk format kamera tertentu
      // yang gagal dirender ulang lewat canvas/browser.
      console.warn("Kompresi gambar gagal, memakai file asli.", error);
      return readFileAsDataUrl(file);
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Gagal membaca gambar."));
    image.src = source;
  });
}

export function readFileAsDataUrl(file) {
  if (!file) {
    return Promise.reject(new Error("File tidak ditemukan."));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Gagal membaca file."));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Gagal membaca blob gambar."));
    reader.readAsDataURL(blob);
  });
}

/*
Encode kanvas ke data URL secara ASINKRON memakai canvas.toBlob. Berbeda dari
canvas.toDataURL yang SINKRON dan membekukan main thread selama encoding, toBlob
menjalankan encoding di luar main thread lalu memanggil callback — sehingga UI tetap
responsif saat mengompres foto besar. Fallback ke toDataURL sinkron bila toBlob tidak
tersedia atau gagal menghasilkan blob (mis. WebView lama tanpa dukungan WebP via toBlob).
*/
export function canvasToCompressedDataUrl(canvas, type = "image/webp", quality = 0.8) {
  return new Promise((resolve, reject) => {
    const fallbackToDataUrl = () => {
      try {
        resolve(canvas.toDataURL(type, quality));
      } catch (error) {
        reject(error);
      }
    };

    if (typeof canvas.toBlob !== "function") {
      fallbackToDataUrl();
      return;
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          fallbackToDataUrl();
          return;
        }
        blobToDataUrl(blob).then(resolve, fallbackToDataUrl);
      },
      type,
      quality,
    );
  });
}