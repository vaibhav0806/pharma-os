/**
 * Convert phone number to E.164 format
 * Assumes Indian numbers if no country code provided
 */
export function toE164(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // If already has country code (starts with country code like 91)
  if (digits.length > 10) {
    return `+${digits}`;
  }

  // Assume Indian number, add +91
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  // Return as-is with + prefix
  return `+${digits}`;
}

/**
 * Extract phone number from WhatsApp format (whatsapp:+919876543210)
 */
export function fromWhatsAppFormat(whatsappNumber: string): string {
  return whatsappNumber.replace('whatsapp:', '');
}

/**
 * Convert to WhatsApp format
 */
export function toWhatsAppFormat(phone: string): string {
  const e164 = phone.startsWith('+') ? phone : toE164(phone);
  return `whatsapp:${e164}`;
}

/**
 * Format phone number for display
 */
export function formatForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 12 && digits.startsWith('91')) {
    // Indian number: +91 98765 43210
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }

  return phone;
}
