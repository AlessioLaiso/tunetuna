import { useEffect, useRef } from 'react'
import { oklchToHex, srgbToOklab } from '../utils/artAccent'

/** Matches the app background's fade-in (.app-bg-fade-in in index.css) */
const FADE_MS = 1500

interface AccentColors {
  text: string
  fill: string
}

/** OKLCH; hue in radians */
interface Lch {
  L: number
  C: number
  h: number
}

/** Below this chroma a color counts as grey, and its hue is meaningless */
const GREY_CHROMA = 0.02

function parseHex(hex: string): Lch {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const lab = srgbToOklab(r, g, b)
  return { L: lab.L, C: Math.hypot(lab.a, lab.b), h: Math.atan2(lab.b, lab.a) }
}

/**
 * Blends in OKLCH, turning the hue the short way round, so the color goes straight from one hue
 * to the next; blending RGB channels would pass through grey between distant hues
 */
function mix(from: Lch, to: Lch, t: number): Lch {
  // A grey end takes the other end's hue, so only its chroma changes
  const fromH = from.C < GREY_CHROMA ? to.h : from.h
  const toH = to.C < GREY_CHROMA ? fromH : to.h
  let dh = toH - fromH
  if (dh > Math.PI) dh -= 2 * Math.PI
  if (dh < -Math.PI) dh += 2 * Math.PI
  return { L: from.L + (to.L - from.L) * t, C: from.C + (to.C - from.C) * t, h: fromH + dh * t }
}

function toHex({ L, C, h }: Lch) {
  return oklchToHex(L, C, h)
}

/** CSS `ease-out`, i.e. cubic-bezier(0, 0, 0.58, 1) */
function easeOut(t: number) {
  // Solve x(s) = t for the curve parameter s, then return y(s)
  let low = 0
  let high = 1
  for (let i = 0; i < 20; i++) {
    const s = (low + high) / 2
    const x = 3 * (1 - s) * s * s * 0.58 + s * s * s
    if (x < t) low = s
    else high = s
  }
  const s = (low + high) / 2
  return 3 * (1 - s) * s * s + s * s * s
}

/**
 * Sets --accent-color and --accent-fill, fading from the previous colors with the background's
 * curve and duration so the two move together.
 * `changedAt` is when the art behind these colors changed (performance.now()); the fade starts
 * then, in step with the background, rather than whenever this effect gets to run.
 * Pass null when the change doesn't come from new art (e.g. picking a preset).
 */
export function useAccentFade({ text, fill }: AccentColors, changedAt: number | null) {
  const currentRef = useRef<{ text: Lch; fill: Lch } | null>(null)
  const lastChangedAtRef = useRef<number | null>(null)

  useEffect(() => {
    const root = document.documentElement.style
    const to = { text: parseHex(text), fill: parseHex(fill) }
    const from = currentRef.current
    const isNewArt = changedAt !== null && changedAt !== lastChangedAtRef.current
    lastChangedAtRef.current = changedAt

    const apply = (colors: { text: Lch; fill: Lch }) => {
      currentRef.current = colors
      root.setProperty('--accent-color', toHex(colors.text))
      root.setProperty('--accent-fill', toHex(colors.fill))
    }

    if (!from || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apply(to)
      return
    }

    const start = isNewArt ? changedAt : performance.now()
    let frame = 0
    const step = () => {
      const t = Math.min(1, Math.max(0, (performance.now() - start) / FADE_MS))
      const eased = easeOut(t)
      apply({ text: mix(from.text, to.text, eased), fill: mix(from.fill, to.fill, eased) })
      if (t < 1) frame = requestAnimationFrame(step)
    }
    step()
    return () => cancelAnimationFrame(frame)
  }, [text, fill, changedAt])
}
