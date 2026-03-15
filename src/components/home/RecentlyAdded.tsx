import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Disc } from 'lucide-react'
import { useMusicStore } from '../../stores/musicStore'
import { jellyfinClient } from '../../api/jellyfin'
import Image from '../shared/Image'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'
import type { BaseItemDto } from '../../api/types'
import { logger } from '../../utils/logger'
import HorizontalScrollContainer from '../shared/HorizontalScrollContainer'

/**
 * CSS grid-flow-col fills columns first; this reorders so visual reading order is left-to-right, top-to-bottom.
 */
function reorderForRowFlow<T>(items: T[], rows: number): T[] {
  const cols = Math.ceil(items.length / rows)
  const result: T[] = []
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const srcIndex = row * cols + col
      if (srcIndex < items.length) {
        result.push(items[srcIndex])
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

interface RecentlyAddedAlbumItemProps {
  album: BaseItemDto
  onNavigate: (id: string) => void
  onContextMenu: (album: BaseItemDto, mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
}


function RecentlyAddedAlbumItem({ album, onNavigate, onContextMenu }: RecentlyAddedAlbumItemProps) {
  const navigate = useNavigate()
  const [imageError, setImageError] = useState(false)
  const contextMenuJustOpenedRef = useRef(false)

  const handleClick = (e?: React.MouseEvent) => {
    if (contextMenuJustOpenedRef.current) {
      e?.preventDefault()
      e?.stopPropagation()
      contextMenuJustOpenedRef.current = false
      return
    }
    onNavigate(album.Id)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuJustOpenedRef.current = true
    onContextMenu(album, 'desktop', { x: e.clientX, y: e.clientY })
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 300)
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      onContextMenu(album, 'mobile')
    },
    onClick: () => {
      if (contextMenuJustOpenedRef.current) {
        contextMenuJustOpenedRef.current = false
        return
      }
      handleClick()
    },
  })
  return (
    <button
      onClick={() => {
        if (contextMenuJustOpenedRef.current) {
          contextMenuJustOpenedRef.current = false
          return
        }
        handleClick()
      }}
      onContextMenu={handleContextMenu}
      {...longPressHandlers}
      className="text-left group"
    >
      <div className="aspect-square rounded overflow-hidden mb-2 bg-zinc-900 flex items-center justify-center">
        {imageError ? (
          <Disc className="w-12 h-12 text-gray-500" />
        ) : (
          <Image
            src={jellyfinClient.getAlbumArtUrl(album.Id, 474)}
            alt={album.Name}
            className="w-full h-full object-cover"
            showOutline={true}
            rounded="rounded"
            onError={() => setImageError(true)}
          />
        )}
      </div>
      <div className="text-sm font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">{album.Name}</div>
      <div className="text-xs text-gray-400 truncate">
        {(album.AlbumArtists?.[0]?.Id || album.ArtistItems?.[0]?.Id) ? (
          <span
            className="clickable-text"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
              e.stopPropagation()
              navigate(`/artist/${album.AlbumArtists?.[0]?.Id || album.ArtistItems![0].Id}`)
            }}
          >
            {album.AlbumArtist || album.AlbumArtists?.[0]?.Name || album.ArtistItems?.[0]?.Name || 'Unknown Artist'}
          </span>
        ) : (
          album.AlbumArtist || album.AlbumArtists?.[0]?.Name || album.ArtistItems?.[0]?.Name || 'Unknown Artist'
        )}
      </div>
    </button>
  )
}

export default function RecentlyAdded() {
  const { recentlyAdded, setRecentlyAdded, setLoading, loading } = useMusicStore()
  const navigate = useNavigate()
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)

  useEffect(() => {
    const loadRecentlyAdded = async () => {
      setLoading('recentlyAdded', true)
      try {
        const result = await jellyfinClient.getRecentlyAdded(18)
        setRecentlyAdded(result.Items || [])
      } catch (error) {
        logger.error('Failed to load recently added:', error)
      } finally {
        setLoading('recentlyAdded', false)
      }
    }

    loadRecentlyAdded()
  }, [setRecentlyAdded, setLoading])

  // Show skeleton while loading, null if loaded with no data
  if (!recentlyAdded || recentlyAdded.length === 0) {
    if (loading.recentlyAdded) {
      return <RecentlyAddedSkeleton />
    }
    return null
  }

  const handleContextMenu = (album: BaseItemDto, mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => {
    setContextMenuItem(album)
    setContextMenuMode(mode || 'desktop')
    setContextMenuPosition(position || null)
    setContextMenuOpen(true)
  }

  const renderAlbum = (album: BaseItemDto) => (
    <RecentlyAddedAlbumItem
      key={album.Id}
      album={album}
      onNavigate={(id) => navigate(`/album/${id}`)}
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
            {reorderForRowFlow(recentlyAdded, 2).map(renderAlbum)}
          </div>
        </HorizontalScrollContainer>
      </div>

      {/* Medium screens (768px–1500px): 4-col, 2-row with arrow navigation */}
      <div className="hidden md:block min-[1500px]:hidden">
        <HorizontalScrollContainer gap={12}>
          <div className="grid grid-rows-2 grid-flow-col gap-3" style={{ gridAutoColumns: 'calc((100% - 36px) / 4)' }}>
            {reorderForRowFlow(recentlyAdded, 2).map(renderAlbum)}
          </div>
        </HorizontalScrollContainer>
      </div>

      {/* Large screens (>=1500px): 5-col, 2-row with arrow navigation */}
      <div className="hidden min-[1500px]:block">
        <HorizontalScrollContainer gap={12}>
          <div className="grid grid-rows-2 grid-flow-col gap-3" style={{ gridAutoColumns: 'calc((100% - 48px) / 5)' }}>
            {reorderForRowFlow(recentlyAdded, 2).map(renderAlbum)}
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

