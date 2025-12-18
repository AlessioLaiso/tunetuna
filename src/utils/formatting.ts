export function formatDuration(ticks: number): string {
  const seconds = Math.floor(ticks / 10000000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Normalizes quotes and apostrophes to straight versions for flexible search matching.
 * Converts smart quotes (curly quotes) to straight quotes and apostrophes.
 * This allows searching with smart quotes to match items with straight quotes and vice versa.
 */
export function normalizeQuotes(text: string): string {
  if (!text) return text
  
  return text
    // Smart single quotes (left U+2018 and right U+2019) → straight apostrophe
    .replace(/[\u2018\u2019]/g, "'")
    // Smart double quotes (left U+201C and right U+201D) → straight double quote
    .replace(/[\u201C\u201D]/g, '"')
    // Also handle prime and double prime marks that might be used as quotes
    .replace(/[\u2032\u2033]/g, "'")
}

/**
 * Normalizes text for search matching by removing apostrophes and other punctuation.
 * This allows searching "dont" to match "don't", "cant" to match "can't", etc.
 * First normalizes quotes, then removes apostrophes for flexible matching.
 */
export function normalizeForSearch(text: string): string {
  if (!text) return text

  return normalizeQuotes(text)
    // Remove apostrophes for search matching
    .replace(/'/g, '')
}

/**
 * Detects if the current device is running iOS (iPhone, iPad, iPod)
 * iOS Safari doesn't allow programmatic volume control in web apps/PWAs
 */
export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
}






