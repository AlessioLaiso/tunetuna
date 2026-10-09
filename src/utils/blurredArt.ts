import * as StackBlur from 'stackblur-canvas'

// Large CSS blur filters are rasterized in tiles by Firefox and WebKit, which shows up as
// moving square seams when content scrolls over them. We blur the art once into a small
// canvas instead and let the browser upscale it smoothly.
const CANVAS_SIZE = 96
const BLUR_RADIUS = 12

const cache = new Map<string, Promise<string | null>>()

export function getBlurredArtUrl(url: string): Promise<string | null> {
  let pending = cache.get(url)
  if (!pending) {
    pending = blur(url)
    cache.set(url, pending)
  }
  return pending
}

function blur(url: string): Promise<string | null> {
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
        StackBlur.canvasRGB(canvas, 0, 0, CANVAS_SIZE, CANVAS_SIZE, BLUR_RADIUS)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      } catch {
        // Tainted canvas (CORS) or other failure; caller falls back to the raw image
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}
