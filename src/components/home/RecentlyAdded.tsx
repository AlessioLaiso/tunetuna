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
      <div className="hidden md:block min-[1680px]:hidden">
        <div className="grid grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <SkeletonAlbumItem key={i} />
          ))}
        </div>
      </div>
      {/* >=1680px: 5-col, 2-row grid */}
      <div className="hidden min-[1680px]:block">
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
  const scrollContainerRef = useRef<HTMLDivElement>(null)
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

  // Group albums into pages of 6 (2 rows × 3 columns)
  const albumsPerPage = 6
  const pages = []
  for (let i = 0; i < recentlyAdded.length; i += albumsPerPage) {
    pages.push(recentlyAdded.slice(i, i + albumsPerPage))
  }

  return (
    <div className="px-4 mb-8">
      <h2 className="text-xl font-bold mb-4">Recently Added</h2>
      {/* Mobile / small screens: horizontal paged carousel */}
      <div className="md:hidden">
        <div
          ref={scrollContainerRef}
          className="overflow-x-auto snap-x snap-mandatory scrollbar-hide"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <div className="flex gap-3">
            {pages.map((pageAlbums, pageIndex) => {
              // Calculate rows needed for this page (3 columns per row)
              const rowsNeeded = Math.ceil(pageAlbums.length / 3)
              return (
                <div
                  key={pageIndex}
                  className="snap-start flex-shrink-0"
                  style={{ width: 'calc(100% - 12px)' }}
                >
                  <div
                    className="grid grid-cols-3 gap-3"
                    style={{ gridTemplateRows: `repeat(${rowsNeeded}, minmax(0, 1fr))` }}
                  >
                    {pageAlbums.map((album) => (
                      <RecentlyAddedAlbumItem
                        key={album.Id}
                        album={album}
                        onNavigate={(id) => navigate(`/album/${id}`)}
                        onContextMenu={(album, mode, position) => {
                          setContextMenuItem(album)
                          const newMode = mode || 'desktop'
                          setContextMenuMode(newMode)
                          setContextMenuPosition(position || null)
                          setContextMenuOpen(true)
                        }}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Large screens: 2x4 grid (8 albums) on md to <1680px, 2x5 grid (10 albums) on >=1680px */}
      <div className="hidden md:block min-[1680px]:hidden">
        <div className="grid grid-cols-4 gap-3">
          {recentlyAdded.slice(0, 8).map((album) => (
            <RecentlyAddedAlbumItem
              key={album.Id}
              album={album}
              onNavigate={(id) => navigate(`/album/${id}`)}
              onContextMenu={(album, mode, position) => {
                setContextMenuItem(album)
                const newMode = mode || 'desktop'
                setContextMenuMode(newMode)
                setContextMenuPosition(position || null)
                setContextMenuOpen(true)
              }}
            />
          ))}
        </div>
      </div>
      <div className="hidden min-[1680px]:block">
        <div className="grid grid-cols-5 gap-3">
          {recentlyAdded.slice(0, 10).map((album) => (
            <RecentlyAddedAlbumItem
              key={album.Id}
              album={album}
              onNavigate={(id) => navigate(`/album/${id}`)}
              onContextMenu={(album, mode, position) => {
                setContextMenuItem(album)
                const newMode = mode || 'desktop'
                setContextMenuMode(newMode)
                setContextMenuPosition(position || null)
                setContextMenuOpen(true)
              }}
            />
          ))}
        </div>
      </div>
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
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

