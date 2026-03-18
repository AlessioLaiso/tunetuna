import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { cleanDiscogsArtistName } from '../../api/discogs'
import { jellyfinClient } from '../../api/jellyfin'
import { useLibraryLookup } from '../../hooks/useLibraryLookup'
import type { DiscogsRelease } from '../../api/discogs'
import Image from '../shared/Image'
import vinylImage from '../../assets/vinyl.png'

// Formats that have a physical disc (CD or vinyl)
const DISC_FORMATS = new Set(['Vinyl', 'CD', 'CDr', 'SACD', 'DVD', 'Blu-ray', 'Laserdisc'])

function hasDiscFormat(release: DiscogsRelease): boolean {
  return release.basic_information.formats.some(f => DISC_FORMATS.has(f.name))
}

interface DiscImageState {
  url: string | null
  ready: boolean // true once we know the final disc src (jellyfin or fallback)
  attempted: boolean
}

function CoverflowItem({
  release,
  isSnapped,
  onNavigate,
  onContextMenu,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  coverSize,
  discSlide,
}: {
  release: DiscogsRelease
  isSnapped: boolean
  onNavigate: (id: number) => void
  onContextMenu: (rel: DiscogsRelease, mode: 'mobile' | 'desktop', pos?: { x: number; y: number }) => void
  onTouchStart: (rel: DiscogsRelease) => void
  onTouchEnd: () => void
  onTouchMove: () => void
  coverSize: number
  discSlide: number
}) {
  const info = release.basic_information
  const artistName = cleanDiscogsArtistName(info.artists[0]?.name || '')
  const { findAlbum } = useLibraryLookup()
  const [discImage, setDiscImage] = useState<DiscImageState>({ url: null, ready: false, attempted: false })
  const showDisc = hasDiscFormat(release)
  const suppressClickRef = useRef(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)

  // Fetch disc image from Jellyfin when this item becomes snapped (only on wide screens)
  useEffect(() => {
    if (!isSnapped || !showDisc || discImage.attempted || discSlide === 0) return

    const timer = setTimeout(() => {
      const album = findAlbum(info.title, artistName)
      if (!album) {
        // No library match — use vinyl fallback, mark ready immediately
        setDiscImage({ url: null, ready: true, attempted: true })
        return
      }

      jellyfinClient.getAlbumById(album.albumId).then(albumData => {
        if (albumData?.ImageTags?.Disc) {
          const url = jellyfinClient.getImageUrl(album.albumId, 'Disc', 600)
          // Preload the image before marking ready
          const img = new window.Image()
          img.onload = () => setDiscImage({ url, ready: true, attempted: true })
          img.onerror = () => setDiscImage({ url: null, ready: true, attempted: true })
          img.src = url
        } else {
          setDiscImage({ url: null, ready: true, attempted: true })
        }
      }).catch(() => {
        setDiscImage({ url: null, ready: true, attempted: true })
      })
    }, 800) // Pause after snap before fetching

    return () => clearTimeout(timer)
  }, [isSnapped, showDisc, discImage.attempted, info.title, artistName, findAlbum])

  // Only slide out once the disc image is ready (loaded or confirmed absent)
  const discReady = discImage.ready
  const discSrc = discImage.url || vinylImage

  return (
    <>
      {/* Disc behind the cover — slides right when snapped AND image is ready */}
      {showDisc && (
        <div
          className="absolute top-0 left-0 transition-transform duration-500 ease-out pointer-events-none"
          style={{
            width: coverSize,
            height: coverSize,
            transform: isSnapped && discReady ? `translateX(${discSlide}px)` : 'translateX(0px)',
          }}
        >
          <div className="w-full h-full flex items-center justify-center">
            <div
              className="rounded-full overflow-hidden"
              style={{ width: coverSize * 0.92, height: coverSize * 0.92 }}
            >
              <img
                src={discSrc}
                alt="Disc"
                className="w-full h-full object-cover rounded-full"
                onError={(e) => {
                  if (discImage.url) {
                    setDiscImage(prev => ({ ...prev, url: null }))
                  }
                  (e.target as HTMLImageElement).src = vinylImage
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Cover art — the 3D-transformed element */}
      <button
        className="absolute top-0 left-0 rounded overflow-hidden bg-zinc-900 block"
        style={{ width: coverSize, height: coverSize }}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
          }
          onNavigate(info.id)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu(release, 'desktop', { x: e.clientX, y: e.clientY })
        }}
        onTouchStart={() => {
          longPressFiredRef.current = false
          longPressTimerRef.current = setTimeout(() => {
            longPressFiredRef.current = true
            suppressClickRef.current = true
            onTouchStart(release)
          }, 500)
        }}
        onTouchEnd={() => {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
          }
          if (longPressFiredRef.current) {
            setTimeout(() => { suppressClickRef.current = false }, 300)
          }
          onTouchEnd()
        }}
        onTouchMove={() => {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
          }
          onTouchMove()
        }}
      >
        {info.cover_image ? (
          <Image
            src={info.cover_image}
            alt={info.title}
            className="w-full h-full object-cover"
            showOutline={true}
            rounded="rounded"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
            <div className="text-center px-4">
              <div className="text-sm font-medium text-zinc-400 truncate">{info.title}</div>
              <div className="text-xs text-zinc-500 truncate">{artistName}</div>
            </div>
          </div>
        )}
        {/* Black overlay controlled by rAF loop */}
        <div
          data-overlay
          className="absolute inset-0 bg-black rounded pointer-events-none transition-opacity duration-300"
          style={{ opacity: 0 }}
        />
      </button>
    </>
  )
}

export default function CoverflowView({
  releases,
  onContextMenu,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
}: {
  releases: DiscogsRelease[]
  onContextMenu: (rel: DiscogsRelease, mode: 'mobile' | 'desktop', pos?: { x: number; y: number }) => void
  onTouchStart: (rel: DiscogsRelease) => void
  onTouchEnd: () => void
  onTouchMove: () => void
}) {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  // Restore snapped index from session storage if available
  const [snappedIndex, setSnappedIndex] = useState(() => {
    const saved = sessionStorage.getItem('coverflow-index')
    if (saved !== null) {
      sessionStorage.removeItem('coverflow-index')
      return Number(saved)
    }
    return 0
  })
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Calculate cover size: max 500, fit within container minus 32px left/right margins,
  // and viewport height minus 96px top/bottom margins and player/tab bars.
  const calculateSize = useCallback(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches
    const marginTop = 96
    const marginBottom = 96 + (isDesktop ? 4 * rem : 6 * rem)
    const containerW = containerRef.current?.clientWidth || window.innerWidth
    const maxW = Math.min(500, containerW - 64)
    const maxH = window.innerHeight - marginTop - marginBottom
    return {
      coverSize: Math.max(0, Math.floor(Math.min(maxW, maxH))),
      showDisc: window.innerWidth >= 768,
    }
  }, [])

  const [showDiscSlide, setShowDiscSlide] = useState(() => window.innerWidth >= 768)
  // Initialize coverSize synchronously so the container renders on the first paint
  const [coverSize, setCoverSizeState] = useState(() => calculateSize().coverSize)
  useEffect(() => {
    const onResize = () => {
      const { coverSize: newSize, showDisc } = calculateSize()
      setCoverSizeState(newSize)
      setShowDiscSlide(showDisc)
    }
    // Recalculate once the container ref is available (may refine from window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [calculateSize])

  // Spacing between item centers in scroll-space.
  // Tighter spacing — the visual separation comes from translateY pushes.
  const itemSpacing = coverSize * 0.5

  // Track scroll position via rAF for smooth updates without React re-render overhead
  const scrollProgressRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const itemsRef = useRef<HTMLDivElement>(null)
  // Track snapped state for the rAF loop (ref so no re-render needed)
  const atRestRef = useRef(true)
  const atRestIndexRef = useRef(0)
  const remRef = useRef(16)

  // Cache rem value
  useEffect(() => {
    remRef.current = parseFloat(getComputedStyle(document.documentElement).fontSize)
  }, [])

  const updateTransforms = useCallback(() => {
    const container = containerRef.current
    const itemsEl = itemsRef.current
    if (!container || !itemsEl || coverSize === 0 || itemSpacing === 0) return

    const progress = container.scrollTop / itemSpacing
    scrollProgressRef.current = progress
    const atRest = atRestRef.current
    const atRestIdx = atRestIndexRef.current
    const rem = remRef.current

    // Update transforms directly on DOM elements for smooth 60fps
    const children = itemsEl.children as HTMLCollectionOf<HTMLElement>
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const index = parseInt(child.dataset.index || '0', 10)
      const offset = index - progress
      const absOffset = Math.abs(offset)

      if (absOffset > 3) {
        child.style.display = 'none'
        continue
      }
      child.style.display = ''

      const rawRotateX = offset * -35
      const rotateX = Math.max(-75, Math.min(75, rawRotateX))
      const scale = offset < 0
        ? 1 - Math.min(absOffset, 3) * 0.15
        : 1 - Math.min(absOffset, 3) * 0.08
      const translateZ = -absOffset * 40
      const extraTop = offset > 0 ? offset * coverSize * 0.55 + rem : 0

      // Opacity: items fade by distance. Overlay: 20% black on non-snapped items at rest.
      let opacity: number
      if (absOffset > 1.5) {
        opacity = Math.max(0, 1 - (absOffset - 1.5) / 1.5)
      } else {
        opacity = 1
      }

      // Black overlay: 20% on items above and the first item below when at rest
      let overlayOpacity = 0
      if (atRest && absOffset > 0.1) {
        if (offset < 0 || (offset > 0 && offset < 1.5 && index === atRestIdx + 1)) {
          overlayOpacity = 0.2
        }
      }

      let zIndex: number
      if (offset > 0) {
        zIndex = 100 + Math.round((3 - absOffset) * 10)
      } else if (absOffset < 0.1) {
        zIndex = 50
      } else {
        zIndex = 40 - Math.round(absOffset * 10)
      }

      const vertPad = (window.innerHeight - coverSize) / 2
      child.style.transform = `perspective(1200px) rotateX(${rotateX}deg) scale(${Math.max(scale, 0.5)}) translateZ(${translateZ}px)`
      child.style.top = `${vertPad + index * itemSpacing + extraTop}px`
      child.style.opacity = String(opacity)
      child.style.zIndex = String(zIndex)

      // Update black overlay on the cover button
      const overlay = child.querySelector('[data-overlay]') as HTMLElement | null
      if (overlay) overlay.style.opacity = String(overlayOpacity)
    }
  }, [coverSize, itemSpacing])

  const handleScroll = useCallback(() => {
    // Mark as not at rest when scrolling starts
    atRestRef.current = false

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      updateTransforms()

      const container = containerRef.current
      if (!container || itemSpacing === 0) return
      const progress = container.scrollTop / itemSpacing

      // React state only for snapped index (disc + title), debounced
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current)
      scrollEndTimerRef.current = setTimeout(() => {
        const idx = Math.round(progress)
        setSnappedIndex(Math.max(0, Math.min(idx, releases.length - 1)))
        atRestRef.current = true
        atRestIndexRef.current = idx
        // Run one more transform update to apply at-rest opacity
        updateTransforms()
      }, 150)
    })
  }, [updateTransforms, itemSpacing, releases.length])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // Initial transform application
  useEffect(() => {
    updateTransforms()
  }, [updateTransforms])

  // Scroll to the initial snapped index on first render (handles back navigation restore).
  // useLayoutEffect runs before paint so scroll position is set before the browser renders.
  const initialScrollDone = useRef(false)
  useLayoutEffect(() => {
    if (initialScrollDone.current || coverSize === 0 || itemSpacing === 0) return
    initialScrollDone.current = true
    if (snappedIndex === 0) return

    const container = containerRef.current
    if (!container) return

    atRestRef.current = true
    atRestIndexRef.current = snappedIndex
    // Temporarily disable snap, set position, then re-enable
    container.style.scrollSnapType = 'none'
    container.scrollTop = snappedIndex * itemSpacing
    updateTransforms()
    // Re-enable after browser processes the scroll position
    requestAnimationFrame(() => {
      container.style.scrollSnapType = 'y mandatory'
    })
  }, [coverSize, itemSpacing, snappedIndex, updateTransforms])

  const handleNavigate = useCallback((id: number) => {
    sessionStorage.setItem('coverflow-index', String(snappedIndex))
    navigate(`/collection/${id}`)
  }, [navigate, snappedIndex])

  if (coverSize === 0) return null

  // Padding to center first and last items vertically
  const verticalPadding = (window.innerHeight - coverSize) / 2
  // Disc slides 30% on wide screens, disabled on narrow screens
  const discSlide = showDiscSlide ? coverSize * 0.3 : 0
  const totalHeight = verticalPadding + (releases.length - 1) * itemSpacing + coverSize + verticalPadding

  return (
    <div
      ref={containerRef}
      className="coverflow-container overflow-y-auto relative z-0 coverflow-no-scrollbar"
      style={{
        height: '100vh',
        scrollSnapType: 'y mandatory',
        WebkitOverflowScrolling: 'touch',
        perspective: 1200,
        scrollbarWidth: 'none',
      }}
    >
      <div
        ref={itemsRef}
        className="relative"
        style={{
          width: '100%',
          height: totalHeight,
        }}
      >
        {releases.map((release, index) => {
          const isSnapped = index === snappedIndex
          const info = release.basic_information
          const artistName = cleanDiscogsArtistName(info.artists[0]?.name || '')

          return (
            <div
              key={`${release.id}-${release.basic_information.id}`}
              data-index={index}
              className="absolute overflow-visible"
              style={{
                left: '50%',
                marginLeft: -coverSize / 2,
                top: verticalPadding + index * itemSpacing,
                width: coverSize,
                height: coverSize,
                scrollSnapAlign: 'center',
                transformOrigin: 'center center',
                backfaceVisibility: 'hidden',
                willChange: 'transform, opacity',
              }}
            >
              <CoverflowItem
                release={release}
                isSnapped={isSnapped}
                onNavigate={handleNavigate}
                onContextMenu={onContextMenu}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                onTouchMove={onTouchMove}
                coverSize={coverSize}
                discSlide={discSlide}
              />
              {/* Release title + artist — fades in when snapped */}
              <div
                className="absolute left-0 right-0 text-center pointer-events-none transition-opacity duration-300 truncate"
                style={{
                  top: coverSize + 4,
                  opacity: isSnapped ? 1 : 0,
                  zIndex: 200,
                }}
              >
                <span className="text-sm text-white font-medium">{info.title}</span>
                <span className="text-sm text-gray-400 mx-1.5">•</span>
                <span className="text-sm text-gray-400">{artistName}</span>
              </div>
            </div>
          )
        })}
      </div>
      <style>{`.coverflow-no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
    </div>
  )
}
