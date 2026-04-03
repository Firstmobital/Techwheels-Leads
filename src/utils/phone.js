// @ts-nocheck
export function normalizePhoneDigits(phone) {
  if (!phone) return "";
  return String(phone).replace(/\D/g, "");
}

export function normalizePhoneForWhatsApp(phone) {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return "";

  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;

  return digits;
}

export function normalizePhoneForCall(phone) {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return "";

  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;

  return `+${digits}`;
}

export function buildWhatsAppUrl(phone, message) {
  const normalizedPhone = normalizePhoneForWhatsApp(phone);
  if (!normalizedPhone) return "";

  const encodedMessage = encodeURIComponent(message ?? "");
  return `https://wa.me/${normalizedPhone}?text=${encodedMessage}`;
}

export function buildCallUrl(phone) {
  const normalizedPhone = normalizePhoneForCall(phone);
  if (!normalizedPhone) return "";

  return `tel:${normalizedPhone}`;
}
