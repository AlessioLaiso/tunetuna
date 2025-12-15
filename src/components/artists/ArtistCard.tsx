import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { jellyfinClient } from '../../api/jellyfin'
import { User } from 'lucide-react'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'

interface ArtistCardProps {
  artist: BaseItemDto
}

const artistAlbumArtCache = new Map<string, string | null>()

export default function ArtistCard({ artist }: ArtistCardProps) {
  const navigate = useNavigate()
  const [imageError, setImageError] = useState(false)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const contextMenuJustOpenedRef = useRef(false)
  const [fallbackAlbumArtUrl, setFallbackAlbumArtUrl] = useState<string | null>(null)

  useEffect(() => {
    // If the artist already has a primary image, we don't need a fallback
    if (artist.ImageTags?.Primary) {
      setFallbackAlbumArtUrl(null)
      return
    }

    const cached = artistAlbumArtCache.get(artist.Id)
    if (cached !== undefined) {
      setFallbackAlbumArtUrl(cached)
      return
    }

    let isCancelled = false

    const loadFallback = async () => {
      try {
        const { albums, songs } = await jellyfinClient.getArtistItems(artist.Id)

        // Prefer an album if available, otherwise fall back to a song's album art.
        const firstAlbum = albums[0]
        const firstSongWithAlbum = songs.find((song) => song.AlbumId) || songs[0]
        const artItem = firstAlbum || firstSongWithAlbum
        const artId = artItem ? (artItem.AlbumId || artItem.Id) : null
        const url = artId ? jellyfinClient.getAlbumArtUrl(artId, 96) : null
        artistAlbumArtCache.set(artist.Id, url)
        if (!isCancelled) {
          setFallbackAlbumArtUrl(url)
        }
      } catch (error) {
        console.error('Failed to load fallback album art for artist:', artist.Id, error)
        artistAlbumArtCache.set(artist.Id, null)
      }
    }

    loadFallback()

    return () => {
      isCancelled = true
    }
  }, [artist.Id, artist.ImageTags])

  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if context menu was just opened
    if (contextMenuJustOpenedRef.current) {
      e.preventDefault()
      contextMenuJustOpenedRef.current = false
      return
    }
    navigate(`/artist/${artist.Id}`)
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      setContextMenuOpen(true)
    },
    onClick: handleClick,
  })

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuJustOpenedRef.current = true
    setContextMenuOpen(true)
    // Reset the flag after a short delay to allow click prevention
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 100)
  }

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        {...longPressHandlers}
        className="w-full flex items-center gap-4 hover:bg-white/10 transition-colors group px-4 h-[72px]"
      >
        <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-zinc-900 flex items-center justify-center">
          {imageError ? (
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
        isOpen={contextMenuOpen}
        onClose={() => setContextMenuOpen(false)}
      />
    </>
  )
}

