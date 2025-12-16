import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Disc } from 'lucide-react'
import { useMusicStore } from '../../stores/musicStore'
import { jellyfinClient } from '../../api/jellyfin'
import Image from '../shared/Image'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'
import type { BaseItemDto } from '../../api/types'

interface RecentlyAddedAlbumItemProps {
  album: BaseItemDto
  onNavigate: (id: string) => void
  onContextMenu: (album: BaseItemDto) => void
}

function RecentlyAddedAlbumItem({ album, onNavigate, onContextMenu }: RecentlyAddedAlbumItemProps) {
  const [imageError, setImageError] = useState(false)
  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      onContextMenu(album)
    },
    onClick: () => onNavigate(album.Id),
  })
  return (
    <button
      onClick={() => onNavigate(album.Id)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(album)
      }}
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
      <div className="text-sm font-medium text-white truncate">{album.Name}</div>
      <div className="text-xs text-gray-400 truncate">
        {album.AlbumArtist || album.ArtistItems?.[0]?.Name || 'Unknown Artist'}
      </div>
    </button>
  )
}

export default function RecentlyAdded() {
  const { recentlyAdded, setRecentlyAdded, setLoading } = useMusicStore()
  const navigate = useNavigate()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)

  useEffect(() => {
    const loadRecentlyAdded = async () => {
      setLoading('recentlyAdded', true)
      try {
        const result = await jellyfinClient.getRecentlyAdded(18)
        setRecentlyAdded(result.Items || [])
      } catch (error) {
        console.error('Failed to load recently added:', error)
      } finally {
        setLoading('recentlyAdded', false)
      }
    }

    loadRecentlyAdded()
  }, [setRecentlyAdded, setLoading])


  // Handle scroll to update current page
  const handleScroll = () => {
    if (!scrollContainerRef.current) return
    const container = scrollContainerRef.current
    const scrollLeft = container.scrollLeft
    const pageWidth = container.clientWidth
    const page = Math.round(scrollLeft / pageWidth)
    setCurrentPage(page)
  }

  // Scroll to specific page
  const scrollToPage = (page: number) => {
    if (!scrollContainerRef.current) return
    const container = scrollContainerRef.current
    const pageWidth = container.clientWidth
    container.scrollTo({
      left: page * pageWidth,
      behavior: 'smooth',
    })
  }

  if (!recentlyAdded || recentlyAdded.length === 0) {
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
          onScroll={handleScroll}
          className="overflow-x-auto snap-x snap-mandatory scrollbar-hide"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <div className="flex" style={{ width: `${pages.length * 100}%` }}>
            {pages.map((pageAlbums, pageIndex) => {
              // Calculate rows needed for this page (3 columns per row)
              const rowsNeeded = Math.ceil(pageAlbums.length / 3)
              return (
                <div
                  key={pageIndex}
                  className="snap-start flex-shrink-0 w-full"
                  style={{ width: `${100 / pages.length}%` }}
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
                        onContextMenu={(album) => {
                          setContextMenuItem(album)
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
        {pages.length > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            {pages.map((_, pageIndex) => (
              <button
                key={pageIndex}
                onClick={() => scrollToPage(pageIndex)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  pageIndex === currentPage ? 'bg-white' : 'bg-zinc-600'
                }`}
                aria-label={`Go to page ${pageIndex + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Large screens: static 2x4 grid, 8 albums, no pagination */}
      <div className="hidden md:block">
        <div className="grid grid-cols-4 gap-3">
          {recentlyAdded.slice(0, 8).map((album) => (
            <RecentlyAddedAlbumItem
              key={album.Id}
              album={album}
              onNavigate={(id) => navigate(`/album/${id}`)}
              onContextMenu={(album) => {
                setContextMenuItem(album)
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
      />
    </div>
  )
}

