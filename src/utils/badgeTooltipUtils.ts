/** The accent fill at the given opacity; follows the accent as it changes or fades */
export function getAccentColorRgba(opacity: number): string {
  return `color-mix(in srgb, var(--accent-fill) ${opacity * 100}%, transparent)`
}
