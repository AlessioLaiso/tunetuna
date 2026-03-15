import { useState, useEffect, useCallback, memo } from 'react'
import { User } from 'lucide-react'
import { jellyfinClient } from '../../api/jellyfin'
import { useContextMenu } from '../../hooks/useContextMenu'
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
  const isThisItemMenuOpen = contextMenuItemId === artist.Id
  const [fallbackAlbumArtUrl, setFallbackAlbumArtUrl] = useState<string | null>(null)

  useEffect(() => {
    if (artist.ImageTags?.Primary) {
      setFallbackAlbumArtUrl(null)
      return
    }

    const cached = getCachedArtistFallbackArt(artist.Id)
    if (cached !== undefined) {
      setFallbackAlbumArtUrl(cached)
      return
    }

    let isCancelled = false
    getArtistFallbackArt(artist.Id).then((url) => {
      if (!isCancelled) {
        setFallbackAlbumArtUrl(url)
      }
    })

    return () => {
      isCancelled = true
    }
  }, [artist.Id, artist.ImageTags])

  const externalHandler = useCallback((item: BaseItemDto, mode: 'mobile' | 'desktop', position?: { x: number; y: number }) => {
    onContextMenu(item, 'artist', mode, position)
  }, [onContextMenu])

  const { handleContextMenu, longPressHandlers, shouldSuppressClick } = useContextMenu({
    item: artist,
    onContextMenu: externalHandler,
  })

  const imageUrl = artist.ImageTags?.Primary
    ? jellyfinClient.getArtistImageUrl(artist.Id, 96)
    : fallbackAlbumArtUrl

  return (
    <button
      onClick={(e) => {
        if (isThisItemMenuOpen || shouldSuppressClick()) {
          e.preventDefault()
          e.stopPropagation()
          return
        }
        onClick(artist.Id)
      }}
      onContextMenu={handleContextMenu}
      {...longPressHandlers}
      className={`group w-full flex items-center gap-4 hover:bg-white/10 transition-colors text-left cursor-pointer px-4 h-[72px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-inset ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
      aria-label={`Go to artist ${artist.Name}`}
    >
      <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-zinc-900 flex items-center justify-center relative">
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
        <div className="absolute inset-0 pointer-events-none border rounded-full" style={{ borderColor: 'rgba(117, 117, 117, 0.3)', borderWidth: '1px' }} />
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
