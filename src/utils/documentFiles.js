export function detectDocumentType(fileName = '', mimeType = '') {
  const safeName = String(fileName || '').toLowerCase();
  const safeMime = String(mimeType || '').toLowerCase();

  if (safeMime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(safeName)) {
    return 'image';
  }

  if (safeMime === 'application/pdf' || safeName.endsWith('.pdf')) {
    return 'pdf';
  }

  if (
    safeMime.includes('word')
    || safeMime.includes('officedocument.wordprocessingml')
    || /\.(doc|docx)$/i.test(safeName)
  ) {
    return 'word';
  }

  if (
    safeMime.includes('excel')
    || safeMime.includes('spreadsheet')
    || safeMime.includes('officedocument.spreadsheetml')
    || /\.(xls|xlsx|csv)$/i.test(safeName)
  ) {
    return 'excel';
  }

  if (
    safeMime.includes('powerpoint')
    || safeMime.includes('presentation')
    || safeMime.includes('officedocument.presentationml')
    || /\.(ppt|pptx)$/i.test(safeName)
  ) {
    return 'powerpoint';
  }

  return 'other';
}

export function getDocumentTypeLabel(type) {
  switch (type) {
    case 'pdf':
      return 'PDF';
    case 'word':
      return 'DOC';
    case 'excel':
      return 'XLS';
    case 'powerpoint':
      return 'PPT';
    case 'image':
      return 'IMG';
    default:
      return 'FILE';
  }
}
