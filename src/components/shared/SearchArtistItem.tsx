import { useState, useRef, useEffect, memo } from 'react'
import { User } from 'lucide-react'
import { jellyfinClient } from '../../api/jellyfin'
import { useLongPress } from '../../hooks/useLongPress'
import { getArtistFallbackArt, getCachedArtistFallbackArt } from '../../utils/artistImageCache'
import type { BaseItemDto } from '../../api/types'

interface SearchArtistItemProps {
  artist: BaseItemDto
  onClick: (id: string) => void
  onContextMenu: (item: BaseItemDto, type: 'artist', mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId: string | null
}

// Memoized component to prevent unnecessary re-renders
const SearchArtistItem = memo(function SearchArtistItem({
  artist,
  onClick,
  onContextMenu,
  contextMenuItemId
}: SearchArtistItemProps) {
  const [imageError, setImageError] = useState(false)
  const contextMenuJustOpenedRef = useRef(false)
  const isThisItemMenuOpen = contextMenuItemId === artist.Id
  const [fallbackAlbumArtUrl, setFallbackAlbumArtUrl] = useState<string | null>(null)

  useEffect(() => {
    // If the artist already has a primary image, prefer that
    if (artist.ImageTags?.Primary) {
      setFallbackAlbumArtUrl(null)
      return
    }

    // Check cache first
    const cached = getCachedArtistFallbackArt(artist.Id)
    if (cached !== undefined) {
      setFallbackAlbumArtUrl(cached)
      return
    }

    let isCancelled = false

    // Load fallback art using shared cache
    getArtistFallbackArt(artist.Id).then((url) => {
      if (!isCancelled) {
        setFallbackAlbumArtUrl(url)
      }
    })

    return () => {
      isCancelled = true
    }
  }, [artist.Id, artist.ImageTags])

  const handleClick = (e: React.MouseEvent) => {
    if (isThisItemMenuOpen || contextMenuJustOpenedRef.current) {
      e.preventDefault()
      e.stopPropagation()
      contextMenuJustOpenedRef.current = false
      return
    }
    onClick(artist.Id)
  }

  const handleContextMenuClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuJustOpenedRef.current = true
    onContextMenu(artist, 'artist', 'desktop', { x: e.clientX, y: e.clientY })
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 300)
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      onContextMenu(artist, 'artist', 'mobile')
    },
    onClick: handleClick,
  })

  const imageUrl = artist.ImageTags?.Primary
    ? jellyfinClient.getArtistImageUrl(artist.Id, 96)
    : fallbackAlbumArtUrl

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContextMenuClick}
      {...longPressHandlers}
      className={`w-full flex items-center gap-4 hover:bg-white/10 transition-colors text-left cursor-pointer px-4 h-[72px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-inset ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
      aria-label={`Go to artist ${artist.Name}`}
    >
      <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-zinc-900 flex items-center justify-center">
        {imageError ? (
          <User className="w-6 h-6 text-gray-500" />
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={artist.Name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <User className="w-6 h-6 text-gray-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">
          {artist.Name}
        </div>
      </div>
    </button>
  )
})

export default SearchArtistItem
