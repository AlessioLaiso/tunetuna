import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Disc } from 'lucide-react'
import Image from '../shared/Image'
import { jellyfinClient } from '../../api/jellyfin'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'

interface AlbumCardProps {
  album: BaseItemDto
}

export default function AlbumCard({ album }: AlbumCardProps) {
  const navigate = useNavigate()
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [imageError, setImageError] = useState(false)
  const contextMenuJustOpenedRef = useRef(false)

  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if context menu was just opened
    if (contextMenuJustOpenedRef.current) {
      e.preventDefault()
      contextMenuJustOpenedRef.current = false
      return
    }
    navigate(`/album/${album.Id}`)
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
        className="text-left group"
      >
        <div className="aspect-square rounded overflow-hidden mb-2 bg-zinc-900 relative flex items-center justify-center">
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
      <ContextMenu
        item={album}
        itemType="album"
        isOpen={contextMenuOpen}
        onClose={() => setContextMenuOpen(false)}
      />
    </>
  )
}

