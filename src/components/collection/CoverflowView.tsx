import { useEffect, useLayoutEffect, useRef, useState, useCallback, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { cleanDiscogsArtistName } from '../../api/discogs'
import { jellyfinClient } from '../../api/jellyfin'
import { useLibraryLookup } from '../../hooks/useLibraryLookup'
import type { DiscogsRelease } from '../../api/discogs'
import Image from '../shared/Image'
import vinylImage from '../../assets/vinyl.png'
import cdImage from '../../assets/cd.png'
import cassetteImage from '../../assets/cassette.png'

const VINYL_FORMATS = new Set(['Vinyl'])
const CD_FORMATS = new Set(['CD', 'CDr', 'SACD', 'DVD', 'Blu-ray', 'Laserdisc'])

type MediaType = 'vinyl' | 'cd' | 'cassette' | null

function getMediaType(release: DiscogsRelease): MediaType {
  const formats = release.basic_information.formats
  if (formats.some(f => VINYL_FORMATS.has(f.name))) return 'vinyl'
  if (formats.some(f => CD_FORMATS.has(f.name))) return 'cd'
  if (formats.some(f => /cassette/i.test(f.name))) return 'cassette'
  return null
}

interface DiscImageState {
  url: string | null
  ready: boolean // true once we know the final disc src (jellyfin or fallback)
  attempted: boolean
}

const CoverflowItem = memo(function CoverflowItem({
  release,
  index,
  snappedIndex,
  isSnapped,
  onNavigate,
  onSnapTo,
  onContextMenu,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  coverSize,
  discSlide,
  cassetteSlide,
}: {
  release: DiscogsRelease
  index: number
  snappedIndex: number
  isSnapped: boolean
  onNavigate: (id: number) => void
  onSnapTo: (index: number) => void
  onContextMenu: (rel: DiscogsRelease, mode: 'mobile' | 'desktop', pos?: { x: number; y: number }) => void
  onTouchStart: (rel: DiscogsRelease) => void
  onTouchEnd: () => void
  onTouchMove: () => void
  coverSize: number
  discSlide: number
  cassetteSlide: number
}) {
  const info = release.basic_information
  const artistName = cleanDiscogsArtistName(info.artists[0]?.name || '')
  const { findAlbum } = useLibraryLookup()
  const [discImage, setDiscImage] = useState<DiscImageState>({ url: null, ready: false, attempted: false })
  const mediaType = getMediaType(release)
  const showDisc = mediaType === 'vinyl' || mediaType === 'cd'
  const showCassette = mediaType === 'cassette'
  const suppressClickRef = useRef(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)
  // Measure the rendered width of cassette art (object-contain in a square) for consistent slide
  const [coverArtWidth, setCoverArtWidth] = useState<number>(coverSize)

  useEffect(() => {
    if (!showCassette || !info.cover_image) return
    const img = new window.Image()
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight
      // object-contain in a square: if tall (aspect < 1), rendered width = coverSize * aspect
      setCoverArtWidth(aspect < 1 ? coverSize * aspect : coverSize)
    }
    img.src = info.cover_image
  }, [showCassette, info.cover_image, coverSize])

  // Fetch disc image from Jellyfin when this item becomes snapped (only on wide screens)
  useEffect(() => {
    if (!isSnapped || !showDisc || discImage.attempted || discSlide === 0) return
    let cancelled = false

    const timer = setTimeout(() => {
      const album = findAlbum(info.title, artistName)
      if (!album || cancelled) {
        if (!cancelled) setDiscImage({ url: null, ready: true, attempted: true })
        return
      }

      jellyfinClient.getAlbumById(album.albumId).then(albumData => {
        if (cancelled) return
        if (albumData?.ImageTags?.Disc) {
          const url = jellyfinClient.getImageUrl(album.albumId, 'Disc', 600)
          const img = new window.Image()
          img.onload = () => { if (!cancelled) setDiscImage({ url, ready: true, attempted: true }) }
          img.onerror = () => { if (!cancelled) setDiscImage({ url: null, ready: true, attempted: true }) }
          img.src = url
        } else {
          setDiscImage({ url: null, ready: true, attempted: true })
        }
      }).catch(() => {
        if (!cancelled) setDiscImage({ url: null, ready: true, attempted: true })
      })
    }, 800)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [isSnapped, showDisc, discImage.attempted, info.title, artistName, findAlbum])

  // Only slide out once the disc image is ready (loaded or confirmed absent)
  const discReady = discImage.ready
  const fallbackDisc = mediaType === 'cd' ? cdImage : vinylImage
  const discSrc = discImage.url || fallbackDisc

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
                  (e.target as HTMLImageElement).src = fallbackDisc
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Cassette behind the cover — slides right when snapped, rotated 90° CCW for vertical orientation */}
      {showCassette && (() => {
        // Both containers are coverSize wide, centered content. After translateX(N), the cassette
        // center is at coverSize/2 + N. We want 35% of the cassette's visual width visible past
        // the art's right edge: N = coverArtWidth/2 - cassetteVisualWidth * 0.15
        const cassetteVisualWidth = coverSize * 0.95
        const computedSlide = coverArtWidth / 2 - cassetteVisualWidth * 0.15
        // Clip wrapper stays in place so the cassette is only visible past the cover art's
        // right edge. The inner div slides out from under the clip.
        const artLeft = (coverSize - coverArtWidth) / 2
        const clipLeft = artLeft + coverArtWidth
        return (
          <div
            className="absolute top-0 left-0 pointer-events-none"
            style={{
              width: coverSize * 2,
              height: coverSize,
              clipPath: `inset(0 0 0 ${clipLeft}px)`,
            }}
          >
            <div
              className="absolute top-0 left-0 transition-transform duration-500 ease-out"
              style={{
                width: coverSize,
                height: coverSize,
                transform: isSnapped && cassetteSlide > 0 ? `translateX(${computedSlide}px)` : 'translateX(0px)',
              }}
            >
              <div className="w-full h-full flex items-center justify-center">
                <img
                  src={cassetteImage}
                  alt="Cassette"
                  className="object-contain"
                  style={{ height: coverSize * 0.95, transform: 'rotate(-90deg)' }}
                />
              </div>
            </div>
          </div>
        )
      })()}

      {/* Cover art — the 3D-transformed element */}
      <button
        className={`absolute top-0 left-0 rounded overflow-hidden ${showCassette ? '' : 'bg-zinc-900'} block`}
        style={{
          width: coverSize,
          height: coverSize,
          zIndex: 2,
          boxShadow: '0 0 12px 4px rgba(0,0,0,0.45)',
        }}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
          }
          if (index !== snappedIndex && Math.abs(index - snappedIndex) <= 1) {
            onSnapTo(index)
          } else {
            onNavigate(info.id)
          }
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
            className={`w-full h-full ${showCassette ? 'object-contain' : 'object-cover'}`}
            showOutline={!showCassette}
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
})

export default function CoverflowView({
  releases,
  onContextMenu,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  onSnappedIndexChange,
}: {
  releases: DiscogsRelease[]
  onContextMenu: (rel: DiscogsRelease, mode: 'mobile' | 'desktop', pos?: { x: number; y: number }) => void
  onTouchStart: (rel: DiscogsRelease) => void
  onTouchEnd: () => void
  onTouchMove: () => void
  onSnappedIndexChange?: (index: number) => void
}) {
  const navigate = useNavigate()
  const { findArtistImageUrl } = useLibraryLookup()
  const containerRef = useRef<HTMLDivElement>(null)

  // Restore snapped index from session storage if available
  const [snappedIndex, setSnappedIndexState] = useState(() => {
    const saved = sessionStorage.getItem('coverflow-index')
    if (saved !== null) {
      sessionStorage.removeItem('coverflow-index')
      return Number(saved)
    }
    return 0
  })
  const setSnappedIndex = useCallback((idx: number) => {
    setSnappedIndexState(idx)
    onSnappedIndexChange?.(idx)
  }, [onSnappedIndexChange])
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
  // Cached overlay elements to avoid querySelector in hot loop
  const overlayMapRef = useRef<Map<number, HTMLElement>>(new Map())

  // Cache rem value
  useEffect(() => {
    remRef.current = parseFloat(getComputedStyle(document.documentElement).fontSize)
  }, [])

  // Cache overlay elements to avoid querySelector in hot loop
  useEffect(() => {
    const itemsEl = itemsRef.current
    if (!itemsEl) return
    const map = new Map<number, HTMLElement>()
    const children = itemsEl.children as HTMLCollectionOf<HTMLElement>
    for (let i = 0; i < children.length; i++) {
      const idx = parseInt(children[i].dataset.index || '0', 10)
      const overlay = children[i].querySelector('[data-overlay]') as HTMLElement | null
      if (overlay) map.set(idx, overlay)
    }
    overlayMapRef.current = map
  }, [releases])

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

      child.style.transform = `perspective(1200px) translateY(${extraTop}px) rotateX(${rotateX}deg) scale(${Math.max(scale, 0.5)}) translateZ(${translateZ}px)`
      child.style.opacity = String(opacity)
      child.style.zIndex = String(zIndex)

      // Update black overlay from cached ref
      const overlay = overlayMapRef.current.get(index)
      if (overlay) overlay.style.opacity = String(overlayOpacity)
    }
  }, [coverSize, itemSpacing])

  // JS-driven snap: after scroll ends, animate to nearest item with custom easing
  const snapAnimRef = useRef<number | null>(null)
  const isSnappingRef = useRef(false)
  const snapTargetRef = useRef(0)

  const snapTo = useCallback((targetIndex: number) => {
    const container = containerRef.current
    if (!container || itemSpacing === 0) return

    snapTargetRef.current = targetIndex

    // Cancel any in-progress animation — new one starts from current position
    if (snapAnimRef.current) cancelAnimationFrame(snapAnimRef.current)

    const startScroll = container.scrollTop
    const targetScroll = targetIndex * itemSpacing
    const distance = targetScroll - startScroll
    if (Math.abs(distance) < 1) {
      snapAnimRef.current = null
      isSnappingRef.current = false
      setSnappedIndex(targetIndex)
      atRestRef.current = true
      atRestIndexRef.current = targetIndex
      updateTransforms()
      return
    }

    const duration = 300 // ms — consistent, no elastic overshoot
    const startTime = performance.now()
    isSnappingRef.current = true

    const animate = (now: number) => {
      const elapsed = now - startTime
      const t = Math.min(elapsed / duration, 1)
      // Ease-out cubic: decelerates smoothly, no bounce
      const eased = 1 - Math.pow(1 - t, 3)

      container.scrollTop = startScroll + distance * eased
      updateTransforms()
      const nearestIdx = Math.max(0, Math.min(Math.round(container.scrollTop / itemSpacing), releases.length - 1))
      onSnappedIndexChange?.(nearestIdx)

      if (t < 1) {
        snapAnimRef.current = requestAnimationFrame(animate)
      } else {
        snapAnimRef.current = null
        isSnappingRef.current = false
        setSnappedIndex(targetIndex)
        atRestRef.current = true
        atRestIndexRef.current = targetIndex
        updateTransforms()
      }
    }

    snapAnimRef.current = requestAnimationFrame(animate)
  }, [itemSpacing, updateTransforms, releases.length, onSnappedIndexChange])

  const handleScroll = useCallback(() => {
    // Ignore scroll events fired by our own snap animation
    if (isSnappingRef.current) return

    // Cancel any in-progress snap animation (user started scrolling again)
    if (snapAnimRef.current) {
      cancelAnimationFrame(snapAnimRef.current)
      snapAnimRef.current = null
      isSnappingRef.current = false
    }

    atRestRef.current = false

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      updateTransforms()

      const container = containerRef.current
      if (!container || itemSpacing === 0) return
      const progress = container.scrollTop / itemSpacing
      const nearestIdx = Math.max(0, Math.min(Math.round(progress), releases.length - 1))
      onSnappedIndexChange?.(nearestIdx)

      // Debounce: snap after scroll settles
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current)
      scrollEndTimerRef.current = setTimeout(() => {
        const idx = Math.max(0, Math.min(Math.round(progress), releases.length - 1))
        snapTo(idx)
      }, 300)
    })
  }, [updateTransforms, itemSpacing, releases.length, snapTo])

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

  // Arrow key navigation — uses snapTargetRef so rapid presses accumulate
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = e.key === 'ArrowUp' ? snapTargetRef.current - 1 : snapTargetRef.current + 1
        if (next >= 0 && next < releases.length) snapTo(next)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [releases.length, snapTo])

  // Reset scroll to top when releases change (e.g. sorting)
  const prevReleasesRef = useRef(releases)
  useEffect(() => {
    if (prevReleasesRef.current === releases) return
    prevReleasesRef.current = releases
    const container = containerRef.current
    if (!container) return
    if (snapAnimRef.current) {
      cancelAnimationFrame(snapAnimRef.current)
      snapAnimRef.current = null
      isSnappingRef.current = false
    }
    container.scrollTop = 0
    setSnappedIndex(0)
    atRestRef.current = true
    atRestIndexRef.current = 0
    updateTransforms()
  }, [releases, updateTransforms])

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
    container.scrollTop = snappedIndex * itemSpacing
    updateTransforms()
  }, [coverSize, itemSpacing, snappedIndex, updateTransforms])

  const handleNavigate = useCallback((id: number) => {
    sessionStorage.setItem('coverflow-index', String(snappedIndex))
    navigate(`/collection/${id}`)
  }, [navigate, snappedIndex])

  if (coverSize === 0) return null

  // Padding to center first and last items vertically
  const verticalPadding = (window.innerHeight - coverSize) / 2
  // Disc slides 30% on wide screens, cassette 25%, disabled on narrow screens
  const discSlide = showDiscSlide ? coverSize * 0.3 : 0
  const cassetteSlide = showDiscSlide ? coverSize * 0.25 : 0
  const totalHeight = verticalPadding + (releases.length - 1) * itemSpacing + coverSize + verticalPadding

  return (
    <div
      ref={containerRef}
      className="coverflow-container overflow-y-auto relative z-0 coverflow-no-scrollbar"
      style={{
        height: '100vh',
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
                transformOrigin: 'center center',
                backfaceVisibility: 'hidden',
                willChange: 'transform, opacity',
              }}
            >
              <CoverflowItem
                release={release}
                index={index}
                snappedIndex={snappedIndex}
                isSnapped={isSnapped}
                onNavigate={handleNavigate}
                onSnapTo={snapTo}
                onContextMenu={onContextMenu}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                onTouchMove={onTouchMove}
                coverSize={coverSize}
                discSlide={discSlide}
                cassetteSlide={cassetteSlide}
              />
              {/* Release title + artist — fades in when snapped */}
              {(() => {
                const artistId = findArtistImageUrl(artistName)
                return (
                  <div
                    className="absolute left-0 right-0 flex items-baseline justify-center transition-opacity duration-300 text-gray-400"
                    style={{
                      top: coverSize + 4,
                      opacity: isSnapped ? 1 : 0,
                      zIndex: 200,
                      pointerEvents: isSnapped ? 'auto' : 'none',
                    }}
                  >
                    <span className="text-sm text-white font-medium truncate min-w-0 shrink">{info.title}</span>
                    <span className="text-sm text-gray-400 mx-1.5 shrink-0">•</span>
                    {artistId ? (
                      <button
                        className="text-sm text-gray-400 hover:text-[var(--accent-color)] transition-colors cursor-pointer truncate min-w-0 shrink"
                        onClick={() => navigate(`/artist/${artistId}`)}
                      >
                        {artistName}
                      </button>
                    ) : (
                      <span className="text-sm text-gray-400 truncate min-w-0 shrink">{artistName}</span>
                    )}
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>
      <style>{`.coverflow-no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
    </div>
  )
}
