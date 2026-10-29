import { useLayoutEffect, useRef, useState } from 'react'
import { useAppBackground, type AppBackgroundArt } from '../../hooks/useAppBackground'

/** Darkening over the art; a bit stronger than the player's so library content stays readable */
const DEFAULT_TINT = 'bg-black/65'

// Only pre-blurred art is used: a live CSS blur this large shows tile seams while content scrolls
function blurredOnly(url: string | null) {
  return url?.startsWith('data:') ? url : null
}

/**
 * Copies mounted mid-fade (e.g. a new page's header) pick up at the same point, and ones mounted
 * after it finished show the art straight away. The offset is fixed at mount: recomputing it on
 * re-render would push a running animation further ahead each time and desync the copies.
 */
function FadeInLayer({ url, changedAt }: { url: string; changedAt: number }) {
  const [animationDelay] = useState(() => `${-(performance.now() - changedAt)}ms`)
  return (
    <div
      className="absolute inset-0 bg-cover bg-center app-bg-fade-in"
      style={{ backgroundImage: `url(${url})`, animationDelay }}
    />
  )
}

function ArtLayers({ art, tint }: { art: AppBackgroundArt; tint: string }) {
  const url = blurredOnly(art.url)
  const prevUrl = blurredOnly(art.prevUrl)
  return (
    <>
      {prevUrl && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${prevUrl})` }} />}
      {url && <FadeInLayer key={url} url={url} changedAt={art.changedAt} />}
      <div className={`absolute inset-0 ${tint}`} />
    </>
  )
}

/** Blurred art behind the whole app, rendered once by Layout */
export default function AppBackground() {
  const art = useAppBackground()
  if (!art) return null

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="app-bg-layer absolute top-0 left-0">
        <ArtLayers art={art} tint={DEFAULT_TINT} />
      </div>
    </div>
  )
}

interface SurfaceBackdropProps {
  /** Overlay color class; defaults to the app background's tint */
  tint?: string
}

/**
 * A copy of the app background lined up with the viewport, for fixed surfaces (headers, bars,
 * sidebars) that must hide the content scrolling underneath while looking see-through.
 * Place it as the first child of a positioned element that forms a stacking context.
 */
export function SurfaceBackdrop({ tint = DEFAULT_TINT }: SurfaceBackdropProps) {
  const art = useAppBackground()
  const ref = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const isActive = art !== null

  useLayoutEffect(() => {
    const el = ref.current
    const layer = layerRef.current
    if (!el || !layer) return

    let frame = 0
    const align = () => {
      frame = 0
      const rect = el.getBoundingClientRect()
      layer.style.transform = `translate(${-rect.left}px, ${-rect.top}px)`
    }
    const scheduleAlign = () => {
      if (!frame) frame = requestAnimationFrame(align)
    }

    align()
    // Fixed surfaces only move when they resize (breakpoints, queue sidebar opening)
    const observer = new ResizeObserver(scheduleAlign)
    observer.observe(el)
    window.addEventListener('resize', scheduleAlign)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', scheduleAlign)
    }
  }, [isActive])

  if (!art) return null

  return (
    <div
      ref={ref}
      className="absolute inset-0 -z-10 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      <div ref={layerRef} className="app-bg-layer absolute top-0 left-0">
        <ArtLayers art={art} tint={tint} />
      </div>
    </div>
  )
}
