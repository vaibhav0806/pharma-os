/**
 * Generate a human-readable order number
 * Format: PH-XXXXXX (6 alphanumeric characters)
 */
export function generateOrderNumber(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars: 0, O, I, 1
  let result = 'PH-';

  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}
