// Picks an accent color from album art and adjusts it to stay legible on the darkened artwork
// background. Works in OKLCH so lightness and chroma can be set without shifting the hue.

export interface ArtAccent {
  /** For text, icons and indicators on artwork */
  text: string
  /** For filled controls that carry white text or icons */
  fill: string
}

/** Used when the art has no meaningful hue (black and white, greys) */
export const NEUTRAL_ART_ACCENT: ArtAccent = { text: '#d4d4d8', fill: '#71717a' }

const HUE_BINS = 24
/** Below this chroma a pixel counts as grey */
const MIN_PIXEL_CHROMA = 0.03
/** Share of colorful pixels needed before the art counts as having a hue */
const MIN_COLORFUL_SHARE = 0.03

const TEXT_LIGHTNESS = 0.8
const FILL_LIGHTNESS = 0.62
const MIN_CHROMA = 0.1
const MAX_CHROMA = 0.19

function toLinear(channel: number) {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function toGamma(c: number) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
}

function srgbToOklab(r: number, g: number, b: number) {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

/** Linear sRGB channels for an OKLCH color; may fall outside [0, 1] when out of gamut */
function oklchToLinearSrgb(L: number, C: number, hue: number) {
  const a = C * Math.cos(hue)
  const b = C * Math.sin(hue)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** Hex color for an OKLCH color, lowering chroma until it fits in sRGB */
function oklchToHex(L: number, C: number, hue: number) {
  let low = 0
  let high = C
  let channels = oklchToLinearSrgb(L, C, hue)
  if (channels.some((c) => c < 0 || c > 1)) {
    for (let i = 0; i < 12; i++) {
      const mid = (low + high) / 2
      const candidate = oklchToLinearSrgb(L, mid, hue)
      if (candidate.some((c) => c < 0 || c > 1)) {
        high = mid
      } else {
        low = mid
        channels = candidate
      }
    }
    channels = oklchToLinearSrgb(L, low, hue)
  }
  return '#' + channels
    .map((c) => Math.round(Math.min(1, Math.max(0, toGamma(c))) * 255).toString(16).padStart(2, '0'))
    .join('')
}

/** Accent from RGBA pixel data (e.g. a small canvas of the album art) */
export function computeArtAccent(pixels: Uint8ClampedArray): ArtAccent {
  const weight = new Float64Array(HUE_BINS)
  const sumA = new Float64Array(HUE_BINS)
  const sumB = new Float64Array(HUE_BINS)
  const sumChroma = new Float64Array(HUE_BINS)
  let total = 0
  let colorful = 0

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    total++
    const { L, a, b } = srgbToOklab(pixels[i], pixels[i + 1], pixels[i + 2])
    const C = Math.hypot(a, b)
    // Near-black and near-white pixels carry unreliable hue
    if (C < MIN_PIXEL_CHROMA || L < 0.15 || L > 0.95) continue
    colorful++

    // Favor vivid pixels so a small saturated area can beat a large muddy one
    const w = C * C
    const bin = Math.floor(((Math.atan2(b, a) + Math.PI) / (2 * Math.PI)) * HUE_BINS) % HUE_BINS
    weight[bin] += w
    sumA[bin] += (a / C) * w
    sumB[bin] += (b / C) * w
    sumChroma[bin] += C * w
  }

  if (total === 0 || colorful / total < MIN_COLORFUL_SHARE) return NEUTRAL_ART_ACCENT

  // Strongest hue, smoothed across neighboring bins so a hue split by a bin edge isn't penalized
  let best = 0
  let bestScore = -1
  for (let i = 0; i < HUE_BINS; i++) {
    const score = weight[(i + HUE_BINS - 1) % HUE_BINS] + weight[i] + weight[(i + 1) % HUE_BINS]
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }

  let a = 0
  let b = 0
  let w = 0
  let chroma = 0
  for (const i of [(best + HUE_BINS - 1) % HUE_BINS, best, (best + 1) % HUE_BINS]) {
    a += sumA[i]
    b += sumB[i]
    w += weight[i]
    chroma += sumChroma[i]
  }
  const hue = Math.atan2(b, a)
  const C = Math.min(MAX_CHROMA, Math.max(MIN_CHROMA, (chroma / w) * 1.3))

  return {
    text: oklchToHex(TEXT_LIGHTNESS, C, hue),
    fill: oklchToHex(FILL_LIGHTNESS, C, hue),
  }
}
