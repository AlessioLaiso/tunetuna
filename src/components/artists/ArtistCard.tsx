import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { jellyfinClient } from '../../api/jellyfin'
import { User } from 'lucide-react'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useContextMenu } from '../../hooks/useContextMenu'
import { getArtistFallbackArt, getCachedArtistFallbackArt } from '../../utils/artistImageCache'

interface ArtistCardProps {
  artist: BaseItemDto
  showImage?: boolean
  onContextMenu?: (item: BaseItemDto, type: 'artist', mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId?: string | null
}

export default function ArtistCard({ artist, showImage = true, onContextMenu, contextMenuItemId }: ArtistCardProps) {
  const navigate = useNavigate()
  const [imageError, setImageError] = useState(false)
  const [fallbackAlbumArtUrl, setFallbackAlbumArtUrl] = useState<string | null>(null)
  const isThisItemMenuOpen = contextMenuItemId === artist.Id

  useEffect(() => {
    if (!showImage) return

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
  }, [artist.Id, artist.ImageTags, showImage])

  const externalHandler = useCallback((item: BaseItemDto, mode: 'mobile' | 'desktop', position?: { x: number; y: number }) => {
    onContextMenu?.(item, 'artist', mode, position)
  }, [onContextMenu])

  const { handleContextMenu, longPressHandlers, shouldSuppressClick, menuState } = useContextMenu({
    item: artist,
    onContextMenu: onContextMenu ? externalHandler : undefined,
  })

  return (
    <>
      <button
        onClick={(e) => {
          if (shouldSuppressClick()) {
            e.preventDefault()
            e.stopPropagation()
            return
          }
          navigate(`/artist/${artist.Id}`)
        }}
        onContextMenu={handleContextMenu}
        {...longPressHandlers}
        className={`w-full flex items-center gap-4 hover:bg-white/10 transition-colors group px-4 h-[72px] ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
      >
        <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-zinc-900 flex items-center justify-center">
          {!showImage ? (
            <div className="w-full h-full bg-zinc-900" />
          ) : imageError ? (
            <User className="w-6 h-6 text-gray-500" />
          ) : artist.ImageTags?.Primary || fallbackAlbumArtUrl ? (
            <img
              src={
                artist.ImageTags?.Primary
                  ? jellyfinClient.getArtistImageUrl(artist.Id, 96)
                  : fallbackAlbumArtUrl || ''
              }
              alt={artist.Name}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
              loading="lazy"
            />
          ) : (
            <User className="w-6 h-6 text-gray-500" />
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-base font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">
            {artist.Name}
          </div>
        </div>
      </button>
      <ContextMenu
        item={artist}
        itemType="artist"
        isOpen={menuState.isOpen}
        onClose={menuState.close}
        zIndex={99999}
        mode={menuState.mode}
        position={menuState.position || undefined}
      />
    </>
  )
}
