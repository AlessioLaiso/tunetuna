import { useEffect, useMemo, useRef, useState } from 'react'
import { jellyfinClient } from '../api/jellyfin'
import { getProcessedArt } from '../utils/blurredArt'
import type { ArtAccent } from '../utils/artAccent'

/** How long the previous image stays mounted underneath while the new one fades in */
const CROSSFADE_MS = 1600

async function resolveArt(itemId: string, fallbackItemId: string | null) {
  const rawUrl = jellyfinClient.getAlbumArtUrl(itemId)
  const art = await getProcessedArt(rawUrl)
  if (art) return { url: art.blurredUrl, accent: art.accent }
  if (!fallbackItemId || fallbackItemId === itemId) return { url: rawUrl, accent: null }

  const fallbackRawUrl = jellyfinClient.getAlbumArtUrl(fallbackItemId)
  const fallbackArt = await getProcessedArt(fallbackRawUrl)
  return fallbackArt
    ? { url: fallbackArt.blurredUrl, accent: fallbackArt.accent }
    : { url: fallbackRawUrl, accent: null }
}

/**
 * Pre-blurs an item's art and keeps the previous image around for a crossfade.
 * `url` is a data URL when blurring succeeded, otherwise the raw art URL (e.g. CORS failure or
 * missing image). When `fallbackItemId` is given, its art is used if the item's can't be blurred.
 * `accent` is picked from the same art (null when it couldn't be read).
 * `changedAt` is when `url` last changed (performance.now()), so late-mounting copies of the
 * background can join the fade-in where it is instead of restarting it.
 */
export function useBlurredArt(itemId: string | null, fallbackItemId: string | null = null) {
  const [art, setArt] = useState<{ url: string | null; accent: ArtAccent | null; changedAt: number }>({
    url: null,
    accent: null,
    changedAt: 0,
  })
  const [prevUrl, setPrevUrl] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)
  const prevTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!itemId) return

    let cancelled = false
    resolveArt(itemId, fallbackItemId).then(({ url: nextUrl, accent }) => {
      if (cancelled || nextUrl === urlRef.current) return
      if (urlRef.current) {
        setPrevUrl(urlRef.current)
        clearTimeout(prevTimeoutRef.current)
        prevTimeoutRef.current = setTimeout(() => setPrevUrl(null), CROSSFADE_MS)
      }
      urlRef.current = nextUrl
      setArt({ url: nextUrl, accent, changedAt: performance.now() })
    })
    return () => {
      cancelled = true
    }
  }, [itemId, fallbackItemId])

  useEffect(() => () => clearTimeout(prevTimeoutRef.current), [])

  return useMemo(() => ({ url: art.url, prevUrl, accent: art.accent, changedAt: art.changedAt }), [art, prevUrl])
}
