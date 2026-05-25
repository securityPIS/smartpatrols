const longDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value) {
  if (!value) {
    return "-";
  }

  return longDateFormatter.format(new Date(value));
}

export function formatShortDate(value) {
  if (!value) {
    return "-";
  }

  return shortDateFormatter.format(new Date(value));
}

export function formatTime(value) {
  if (!value) {
    return "-";
  }

  return timeFormatter.format(new Date(value));
}

export function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return `${shortDateFormatter.format(date)} • ${timeFormatter.format(date)}`;
}

export function buildMapsUrl(lat, lng) {
  return `https://maps.google.com/?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

export function getWeatherDescriptor(code) {
  if (code === 0) {
    return { label: "Cerah", tone: "sun" };
  }

  if (code >= 1 && code <= 3) {
    return { label: "Berawan", tone: "cloud" };
  }

  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 84)) {
    return { label: "Hujan Ringan", tone: "rain" };
  }

  if (code >= 85 && code <= 99) {
    return { label: "Cuaca Buruk", tone: "storm" };
  }

  return { label: "Tidak Diketahui", tone: "cloud" };
}
