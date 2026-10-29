import { describe, expect, it } from 'vitest'
import { computeArtAccent, NEUTRAL_ART_ACCENT } from './artAccent'

function pixels(...colors: [number, number, number, number][]) {
  const data: number[] = []
  for (const [r, g, b, count] of colors) {
    for (let i = 0; i < count; i++) data.push(r, g, b, 255)
  }
  return new Uint8ClampedArray(data)
}

function channels(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('computeArtAccent', () => {
  it('returns the neutral accent for greyscale art', () => {
    expect(computeArtAccent(pixels([20, 20, 20, 50], [200, 200, 200, 50], [120, 120, 120, 50]))).toEqual(NEUTRAL_ART_ACCENT)
  })

  it('returns the neutral accent for empty data', () => {
    expect(computeArtAccent(new Uint8ClampedArray())).toEqual(NEUTRAL_ART_ACCENT)
  })

  it('keeps the hue of a dominant red', () => {
    const [r, g, b] = channels(computeArtAccent(pixels([180, 20, 30, 100], [30, 30, 30, 100])).text)
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })

  it('prefers a small vivid area over a large muddy one', () => {
    const [r, g, b] = channels(computeArtAccent(pixels([110, 100, 85, 300], [20, 60, 230, 40])).text)
    expect(b).toBeGreaterThan(r)
    expect(b).toBeGreaterThan(g)
  })

  it('brightens dark art enough to read on a dark background', () => {
    const { text } = computeArtAccent(pixels([40, 10, 60, 100]))
    expect(contrast(text, '#1a1a1a')).toBeGreaterThan(7)
  })

  it('keeps white legible on the fill color', () => {
    for (const color of [[255, 230, 0], [0, 200, 255], [60, 255, 60], [255, 0, 200]] as const) {
      const { fill } = computeArtAccent(pixels([...color, 100]))
      expect(contrast(fill, '#ffffff')).toBeGreaterThan(2.8)
    }
  })
})
