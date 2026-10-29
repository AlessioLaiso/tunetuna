import * as StackBlur from 'stackblur-canvas'
import { computeArtAccent, type ArtAccent } from './artAccent'

// Large CSS blur filters are rasterized in tiles by Firefox and WebKit, which shows up as
// moving square seams when content scrolls over them. We blur the art once into a small
// canvas instead and let the browser upscale it smoothly.
const CANVAS_SIZE = 96
const BLUR_RADIUS = 12

export interface ProcessedArt {
  /** Data URL of the blurred art */
  blurredUrl: string
  /** Accent color picked from the art (sampled before blurring, which would mute it) */
  accent: ArtAccent
}

const cache = new Map<string, Promise<ProcessedArt | null>>()

/** Blurred art and its accent color; null when the image can't be read (missing, CORS) */
export function getProcessedArt(url: string): Promise<ProcessedArt | null> {
  let pending = cache.get(url)
  if (!pending) {
    pending = process(url)
    cache.set(url, pending)
  }
  return pending
}

function process(url: string): Promise<ProcessedArt | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = CANVAS_SIZE
        canvas.height = CANVAS_SIZE
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        // Cover-fit the image into the square canvas
        const scale = Math.max(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (CANVAS_SIZE - w) / 2, (CANVAS_SIZE - h) / 2, w, h)
        const accent = computeArtAccent(ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data)
        StackBlur.canvasRGB(canvas, 0, 0, CANVAS_SIZE, CANVAS_SIZE, BLUR_RADIUS)
        resolve({ blurredUrl: canvas.toDataURL('image/jpeg', 0.9), accent })
      } catch {
        // Tainted canvas (CORS) or other failure; caller falls back to the raw image
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}
