import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveScrollPosition } from '../../ScrollToTop'
import Image from '../shared/Image'
import { jellyfinClient } from '../../api/jellyfin'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useContextMenu } from '../../hooks/useContextMenu'

interface AlbumCardProps {
  album: BaseItemDto
  onContextMenu?: (item: BaseItemDto, type: 'album', mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId?: string | null
  showImage?: boolean
  subtitle?: string | null
  onNavigate?: (id: string) => void
  onArtistClick?: (id: string) => void
}

export default function AlbumCard({ album, onContextMenu, contextMenuItemId, showImage = true, subtitle, onNavigate, onArtistClick }: AlbumCardProps) {
  const navigate = useNavigate()
  const isThisItemMenuOpen = contextMenuItemId === album.Id

  const externalHandler = useCallback((item: BaseItemDto, mode: 'mobile' | 'desktop', position?: { x: number; y: number }) => {
    onContextMenu?.(item, 'album', mode, position)
  }, [onContextMenu])

  const { handleContextMenu, longPressHandlers, shouldSuppressClick, menuState } = useContextMenu({
    item: album,
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
          saveScrollPosition()
          if (onNavigate) {
            onNavigate(album.Id)
          } else {
            navigate(`/album/${album.Id}`)
          }
        }}
        onContextMenu={handleContextMenu}
        {...longPressHandlers}
        className={`text-left group ${isThisItemMenuOpen ? 'ring-2 ring-blue-500' : ''}`}
      >
        <div className="aspect-square rounded overflow-hidden bg-zinc-900 relative flex items-center justify-center mb-1">
          {showImage ? (
            <Image
              src={jellyfinClient.getAlbumArtUrl(album.Id, 474)}
              alt={album.Name}
              className="w-full h-full object-cover"
              showOutline={true}
              rounded="rounded"
            />
          ) : (
            <div className="w-full h-full bg-zinc-900" />
          )}
        </div>
        <div className="text-sm font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">{album.Name}</div>
        {subtitle !== undefined ? (
          subtitle && <div className="text-xs text-gray-400 truncate">{subtitle}</div>
        ) : (
          <div className="text-xs text-gray-400 truncate">
            {(album.AlbumArtists?.[0]?.Id || album.ArtistItems?.[0]?.Id) ? (
              <span
                className="clickable-text"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  const artistId = album.AlbumArtists?.[0]?.Id || album.ArtistItems![0].Id
                  if (onArtistClick) {
                    onArtistClick(artistId)
                  } else {
                    navigate(`/artist/${artistId}`)
                  }
                }}
              >
                {album.AlbumArtist || album.AlbumArtists?.[0]?.Name || album.ArtistItems?.[0]?.Name || 'Unknown Artist'}
              </span>
            ) : (
              album.AlbumArtist || album.AlbumArtists?.[0]?.Name || album.ArtistItems?.[0]?.Name || 'Unknown Artist'
            )}
          </div>
        )}
      </button>
      {!onContextMenu && (
        <ContextMenu
          item={album}
          itemType="album"
          isOpen={menuState.isOpen}
          onClose={menuState.close}
          mode={menuState.mode}
          position={menuState.position || undefined}
        />
      )}
    </>
  )
}
