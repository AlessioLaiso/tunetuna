import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { usePlayerStore } from '../../stores/playerStore'
import { useLargeViewport } from '../../hooks/useLargeViewport'

const LINE_WIDTHS = ['w-2/3', 'w-1/2', 'w-3/5', 'w-2/5', 'w-3/4']

/**
 * Wraps placeholder shapes in the soft pulse. It stays invisible for the first second (see
 * .skeleton-soft), so only slow loads ever show a skeleton.
 */
export function SkeletonGroup({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`skeleton-soft ${className}`} role="status" aria-label="Loading">
      {children}
    </div>
  )
}

/**
 * Rows shaped like SongItem and ArtistCard (`round` for the artist avatar, which has no duration).
 * Text bars are capped because real titles stay short however wide the row gets.
 */
export function SkeletonRows({ count = 12, round = false }: { count?: number; round?: boolean }) {
  return (
    <SkeletonGroup>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 h-[72px]">
          <div className={`w-12 h-12 flex-shrink-0 bg-white/10 ${round ? 'rounded-full' : 'rounded-sm'}`} />
          <div className="flex-1 min-w-0">
            <div className={`h-3.5 max-w-[16rem] rounded bg-white/10 mb-2 ${LINE_WIDTHS[i % LINE_WIDTHS.length]}`} />
            <div className="h-3 max-w-[20rem] rounded bg-white/10 w-1/2" />
          </div>
          {!round && <div className="h-3 w-8 flex-shrink-0 rounded bg-white/10" />}
        </div>
      ))}
    </SkeletonGroup>
  )
}

/** Cards shaped like AlbumCard and PlaylistItem, in the same grid as the list pages */
export function SkeletonCardGrid({ count = 12, lines = 2 }: { count?: number; lines?: 1 | 2 }) {
  return (
    <SkeletonGroup className="grid grid-cols-3 md:grid-cols-4 gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="aspect-square rounded bg-white/10 mb-2" />
          <div className={`h-3.5 rounded bg-white/10 ${LINE_WIDTHS[i % LINE_WIDTHS.length]}`} />
          {lines === 2 && <div className="h-3 rounded bg-white/10 w-1/2 mt-1.5" />}
        </div>
      ))}
    </SkeletonGroup>
  )
}

/** Lines of text, e.g. lyrics */
export function SkeletonTextLines({ count = 6, centered = false }: { count?: number; centered?: boolean }) {
  return (
    <SkeletonGroup className={`space-y-3 ${centered ? 'flex flex-col items-center' : ''}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`h-4 rounded bg-white/10 ${LINE_WIDTHS[i % LINE_WIDTHS.length]}`} />
      ))}
    </SkeletonGroup>
  )
}

/** The stats pages: summary cards above a list of ranked rows */
export function SkeletonStats() {
  return (
    <div className="px-4">
      <SkeletonGroup className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6 mb-8">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-white/10" />
        ))}
      </SkeletonGroup>
      <div className="-mx-4">
        <SkeletonRows count={5} />
      </div>
    </div>
  )
}

function SkeletonTitle() {
  return (
    <SkeletonGroup className="mb-6">
      <div className="h-10 md:h-12 rounded bg-white/10 w-2/3 mb-3" />
      <div className="h-4 rounded bg-white/10 w-2/5" />
    </SkeletonGroup>
  )
}

interface SkeletonDetailPageProps {
  /** art: centered artwork. hero: edge-to-edge image. list: title and rows. grid: title and cards. */
  variant: 'art' | 'hero' | 'list' | 'grid'
}

/** A detail page while its item loads. The back button is live, so a slow load can be left. */
export function SkeletonDetailPage({ variant }: SkeletonDetailPageProps) {
  const navigate = useNavigate()
  const isLargeViewport = useLargeViewport()
  const isQueueSidebarOpen = usePlayerStore(s => s.isQueueSidebarOpen)
  const artSize = isLargeViewport ? '360px' : '256px'

  return (
    <div className="pb-20">
      <div
        className={`fixed top-0 left-0 right-0 z-20 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
      >
        <div className="max-w-page mx-auto">
          <div className="flex items-center py-4 pl-3 pr-4">
            <button
              onClick={() => navigate(-1)}
              className="text-white hover:text-white/80 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {variant === 'hero' && (
        <SkeletonGroup
          className={`hero-breakout ${isQueueSidebarOpen ? 'hero-breakout-sidebar' : ''}`}
        >
          <div
            className="h-64 md:h-80 bg-white/10"
            style={{
              marginTop: 'calc(-1 * env(safe-area-inset-top))',
              maskImage: 'linear-gradient(to bottom, black, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)',
            }}
          />
        </SkeletonGroup>
      )}

      <div className={variant === 'hero' ? 'pt-6' : variant === 'art' ? 'pt-11' : 'pt-20'}>
        <div className={`px-4 ${variant === 'art' ? 'pt-4' : ''}`}>
          {variant === 'art' && (
            <SkeletonGroup className="flex justify-center mb-6">
              <div className="rounded bg-white/10" style={{ width: artSize, height: artSize }} />
            </SkeletonGroup>
          )}
          <SkeletonTitle />
        </div>
        {variant === 'grid' ? (
          <div className="px-4">
            <SkeletonCardGrid lines={1} />
          </div>
        ) : (
          <SkeletonRows count={6} />
        )}
      </div>
    </div>
  )
}

/** Shown while a page's code loads, before it can render its own skeleton */
export function SkeletonPage() {
  return (
    <div className="pt-20 pb-20">
      <div className="px-4">
        <SkeletonTitle />
      </div>
      <SkeletonRows count={6} />
    </div>
  )
}
