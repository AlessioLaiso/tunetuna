/**
 * A short, human name for this device, guessed from the user agent: "iPhone",
 * "Mac", "Android phone"... Sent to Jellyfin as the session's device name so
 * other Tunetuna devices can tell sessions apart. Never names the browser.
 */
export function getDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Web'
  const ua = navigator.userAgent

  if (/iPhone|iPod/.test(ua)) return 'iPhone'
  // iPadOS Safari reports itself as a Mac; touch support gives it away
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet'
  if (/CrOS/.test(ua)) return 'Chromebook'
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  if (/Linux/.test(ua)) return 'Linux PC'
  return 'Web'
}
