import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMusicStore } from '../../stores/musicStore'
import { jellyfinClient } from '../../api/jellyfin'
import AlbumCard from '../albums/AlbumCard'
import ContextMenu from '../shared/ContextMenu'
import type { BaseItemDto } from '../../api/types'
import { logger } from '../../utils/logger'
import HorizontalScrollContainer from '../shared/HorizontalScrollContainer'

const ROWS = 2

function useRecentlyAddedCount() {
  const getCount = () => {
    const width = window.innerWidth
    // small: 3 cols × 2 rows × 3 pages = 18
    // medium: 4 cols × 2 rows × 2 pages = 16
    // large: 5 cols × 2 rows × 2 pages = 20
    if (width >= 1500) return 5 * ROWS * 2
    if (width >= 768) return 4 * ROWS * 2
    return 3 * ROWS * 3
  }
  const [count, setCount] = useState(getCount)
  useEffect(() => {
    const onResize = () => setCount(getCount())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return count
}

/**
 * CSS grid-flow-col fills columns first; this reorders so visual reading order is left-to-right, top-to-bottom.
 * Reorders per page so the most recent items fill page 1 completely before page 2.
 */
function reorderForRowFlow<T>(items: T[], rows: number, cols: number): T[] {
  const pageSize = rows * cols
  const result: T[] = []
  for (let offset = 0; offset < items.length; offset += pageSize) {
    const page = items.slice(offset, offset + pageSize)
    const pageCols = Math.ceil(page.length / rows)
    for (let col = 0; col < pageCols; col++) {
      for (let row = 0; row < rows; row++) {
        const srcIndex = row * pageCols + col
        if (srcIndex < page.length) {
          result.push(page[srcIndex])
        }
      }
    }
  }
  return result
}

function SkeletonAlbumItem() {
  return (
    <div>
      <div className="aspect-square rounded bg-zinc-800 mb-2" />
      <div className="h-3.5 bg-zinc-800 rounded w-3/4 mb-1.5" />
      <div className="h-3 bg-zinc-800 rounded w-1/2" />
    </div>
  )
}

function RecentlyAddedSkeleton() {
  return (
    <div className="px-4 mb-8 animate-pulse">
      <h2 className="text-xl font-bold mb-4">Recently Added</h2>
      {/* Mobile: 3-col, 2-row grid */}
      <div className="md:hidden">
        <div className="grid grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <SkeletonAlbumItem key={i} />
          ))}
        </div>
      </div>
      {/* md to <1680px: 4-col, 2-row grid */}
      <div className="hidden md:block min-[1500px]:hidden">
        <div className="grid grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <SkeletonAlbumItem key={i} />
          ))}
        </div>
      </div>
      {/* >=1680px: 5-col, 2-row grid */}
      <div className="hidden min-[1500px]:block">
        <div className="grid grid-cols-5 gap-3">
          {[...Array(10)].map((_, i) => (
            <SkeletonAlbumItem key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function RecentlyAdded() {
  const { recentlyAdded, setRecentlyAdded, setLoading, loading } = useMusicStore()
  const navigate = useNavigate()
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const count = useRecentlyAddedCount()

  useEffect(() => {
    const loadRecentlyAdded = async () => {
      setLoading('recentlyAdded', true)
      try {
        const result = await jellyfinClient.getRecentlyAdded(count)
        setRecentlyAdded(result.Items || [])
      } catch (error) {
        logger.error('Failed to load recently added:', error)
      } finally {
        setLoading('recentlyAdded', false)
      }
    }

    loadRecentlyAdded()
  }, [count, setRecentlyAdded, setLoading])

  // Show skeleton while loading, null if loaded with no data
  if (!recentlyAdded || recentlyAdded.length === 0) {
    if (loading.recentlyAdded) {
      return <RecentlyAddedSkeleton />
    }
    return null
  }

  const handleContextMenu = (item: BaseItemDto, _type: 'album', mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => {
    setContextMenuItem(item)
    setContextMenuMode(mode || 'desktop')
    setContextMenuPosition(position || null)
    setContextMenuOpen(true)
  }

  const renderAlbum = (album: BaseItemDto) => (
    <AlbumCard
      key={album.Id}
      album={album}
      onContextMenu={handleContextMenu}
    />
  )

  return (
    <div className="px-4 mb-8">
      <h2 className="text-xl font-bold mb-4">Recently Added</h2>
      {/* Small screens (<768px): 3-col, 2-row with arrow navigation */}
      <div className="md:hidden">
        <HorizontalScrollContainer gap={12}>
          <div className="grid grid-rows-2 grid-flow-col gap-3" style={{ gridAutoColumns: 'calc((100% - 24px) / 3)' }}>
            {reorderForRowFlow(recentlyAdded, 2, 3).map(renderAlbum)}
          </div>
        </HorizontalScrollContainer>
      </div>

      {/* Medium screens (768px–1500px): 4-col, 2-row with arrow navigation */}
      <div className="hidden md:block min-[1500px]:hidden">
        <HorizontalScrollContainer gap={12}>
          <div className="grid grid-rows-2 grid-flow-col gap-3" style={{ gridAutoColumns: 'calc((100% - 36px) / 4)' }}>
            {reorderForRowFlow(recentlyAdded, 2, 4).map(renderAlbum)}
          </div>
        </HorizontalScrollContainer>
      </div>

      {/* Large screens (>=1500px): 5-col, 2-row with arrow navigation */}
      <div className="hidden min-[1500px]:block">
        <HorizontalScrollContainer gap={12}>
          <div className="grid grid-rows-2 grid-flow-col gap-3" style={{ gridAutoColumns: 'calc((100% - 48px) / 5)' }}>
            {reorderForRowFlow(recentlyAdded, 2, 5).map(renderAlbum)}
          </div>
        </HorizontalScrollContainer>
      </div>
      <ContextMenu
        item={contextMenuItem}
        itemType="album"
        isOpen={contextMenuOpen}
        onClose={() => {
          setContextMenuOpen(false)
          setContextMenuItem(null)
        }}
        zIndex={999999}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </div>
  )
}

