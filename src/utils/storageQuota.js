export function getLocalStorageUsage() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    // JS strings are UTF-16, so 2 bytes per character
    total += localStorage.getItem(key).length * 2;
  }
  return total;
}

export function checkStorageQuota() {
  const usedBytes = getLocalStorageUsage();
  const limitBytes = 5 * 1024 * 1024; // typical browser limit 5MB
  const percentage = (usedBytes / limitBytes) * 100;
  
  if (percentage > 80) {
    const usedKB = (usedBytes / 1024).toFixed(0);
    const percStr = percentage.toFixed(1);
    console.warn(`WARNING: LocalStorage is ${percStr}% full (${usedKB} KB / 5 MB)`);
    return { warning: true, percentage, usedBytes, message: `Penyimpanan perangkat mendekati penuh (${percStr}%). Pertimbangkan untuk membersihkan data.` };
  }
  
  return { warning: false, percentage, usedBytes };
}
