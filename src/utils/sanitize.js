const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;
const ANGLE_BRACKETS = /[<>]/g;

function sanitizeCore(value) {
  return String(value ?? "")
    .replace(CONTROL_CHARACTERS, "")
    .replace(ANGLE_BRACKETS, "");
}

export function sanitizeText(value, maxLength = 120) {
  return sanitizeCore(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeMultilineText(value, maxLength = 480) {
  return sanitizeCore(value)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeEmail(value) {
  return sanitizeText(value, 120).toLowerCase();
}

export function sanitizePhone(value) {
  return String(value ?? "")
    .replace(/[^\d+]/g, "")
    .slice(0, 20);
}

export function sanitizeCoordinate(value) {
  const normalized = String(value ?? "").replace(/[^\d.,-]/g, "").replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number)) {
    return "";
  }

  return String(Math.round(number * 10000) / 10000);
}

export function sanitizeUrl(value) {
  const candidate = String(value ?? "").trim();

  if (!candidate) {
    return "";
  }

  if (candidate.startsWith("data:image/")) {
    return candidate;
  }

  if (candidate.startsWith("idb://")) {
    return candidate;
  }

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function normalizeLookup(value) {
  return sanitizeText(value, 120).toLowerCase();
}

export function makeId(prefix = "item") {
  const random = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${random ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
}
