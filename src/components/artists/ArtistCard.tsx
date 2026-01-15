import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { jellyfinClient } from '../../api/jellyfin'
import { User } from 'lucide-react'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'
import { getArtistFallbackArt, getCachedArtistFallbackArt } from '../../utils/artistImageCache'

interface ArtistCardProps {
  artist: BaseItemDto
  onContextMenu?: (item: BaseItemDto, type: 'artist', mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId?: string | null
}

export default function ArtistCard({ artist, onContextMenu, contextMenuItemId }: ArtistCardProps) {
  const navigate = useNavigate()
  const [imageError, setImageError] = useState(false)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const contextMenuJustOpenedRef = useRef(false)
  const [fallbackAlbumArtUrl, setFallbackAlbumArtUrl] = useState<string | null>(null)
  const isThisItemMenuOpen = contextMenuItemId === artist.Id

  useEffect(() => {
    // If the artist already has a primary image, we don't need a fallback
    if (artist.ImageTags?.Primary) {
      setFallbackAlbumArtUrl(null)
      return
    }

    // Check shared cache first
    const cached = getCachedArtistFallbackArt(artist.Id)
    if (cached !== undefined) {
      setFallbackAlbumArtUrl(cached)
      return
    }

    let isCancelled = false

    // Use shared cache utility
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
      if (onContextMenu) {
        contextMenuJustOpenedRef.current = true
        onContextMenu(artist, 'artist', 'mobile')
      } else {
        // Fallback to local context menu
        contextMenuJustOpenedRef.current = true
        setContextMenuMode('mobile')
        setContextMenuPosition(null)
        setContextMenuOpen(true)
      }
    },
  })

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Prevent any default browser behavior
    e.nativeEvent?.preventDefault?.()
    e.nativeEvent?.stopImmediatePropagation?.()

    // Prevent navigation/click for the next 300ms
    contextMenuJustOpenedRef.current = true

    if (onContextMenu) {
      onContextMenu(artist, 'artist', 'desktop', { x: e.clientX, y: e.clientY })
    } else {
      // Fallback to local context menu
      setContextMenuMode('desktop')
      setContextMenuPosition({ x: e.clientX, y: e.clientY })
      setContextMenuOpen(true)
    }

    // Reset the flag after a longer delay
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 300)
  }

  return (
    <>
      <button
        onClick={(e) => {
          // Prevent click if context menu is open or was just opened
          if (contextMenuOpen || contextMenuJustOpenedRef.current) {
            e.preventDefault()
            e.stopPropagation()
            return
          }
          handleClick(e)
        }}
        onContextMenu={handleContextMenu}
        {...longPressHandlers}
        className={`w-full flex items-center gap-4 hover:bg-white/10 transition-colors group px-4 h-[72px] ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
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
        zIndex={99999}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </>
  )
}

