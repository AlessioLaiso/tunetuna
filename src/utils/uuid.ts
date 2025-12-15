/**
 * Generates a UUID v4. Uses crypto.randomUUID() if available,
 * otherwise falls back to a polyfill using crypto.getRandomValues()
 * which is supported in older browsers including mobile Safari.
 */
export function generateUUID(): string {
  // Use native randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  // Fallback polyfill for older browsers (including mobile Safari)
  // Generate UUID v4 using crypto.getRandomValues()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  
  // Set version (4) and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // Variant 10
  
  // Convert to hex string with proper formatting
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join('-')
}





