import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Image from '../shared/Image'
import { jellyfinClient } from '../../api/jellyfin'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'

interface AlbumCardProps {
  album: BaseItemDto
  onContextMenu?: (item: BaseItemDto, type: 'album', mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId?: string | null
  showImage?: boolean
}

export default function AlbumCard({ album, onContextMenu, contextMenuItemId, showImage = true }: AlbumCardProps) {
  const navigate = useNavigate()
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const contextMenuJustOpenedRef = useRef(false)
  const isThisItemMenuOpen = contextMenuItemId === album.Id


  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if context menu was just opened
    if (contextMenuJustOpenedRef.current) {
      e.preventDefault()
      contextMenuJustOpenedRef.current = false
      return
    }
    navigate(`/album/${album.Id}`)
  }

  const handleContextMenu = (e: React.MouseEvent) => {

    e.preventDefault()
    e.stopPropagation()
    // Prevent any default browser behavior
    e.nativeEvent?.preventDefault?.()
    e.nativeEvent?.stopImmediatePropagation?.()

    // Prevent navigation/click for the next 300ms
    contextMenuJustOpenedRef.current = true

    if (onContextMenu) {

      onContextMenu(album, 'album', 'desktop', { x: e.clientX, y: e.clientY })
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

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      if (onContextMenu) {
        contextMenuJustOpenedRef.current = true
        onContextMenu(album, 'album', 'mobile')
      } else {
        // Fallback to local context menu
        contextMenuJustOpenedRef.current = true
        setContextMenuMode('mobile')
        setContextMenuPosition(null)
        setContextMenuOpen(true)
      }
    },
  })


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
        onContextMenu={(e) => {

          handleContextMenu(e)
        }}
        {...longPressHandlers}
        className={`text-left group ${isThisItemMenuOpen ? 'ring-2 ring-blue-500' : ''}`}
      >
        <div className="aspect-square rounded overflow-hidden bg-zinc-900 relative flex items-center justify-center">
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
        <div className="text-xs text-gray-400 truncate">
          {album.AlbumArtist || album.ArtistItems?.[0]?.Name || 'Unknown Artist'}
        </div>
      </button>
      <ContextMenu
        item={album}
        itemType="album"
        isOpen={contextMenuOpen}
        onClose={() => setContextMenuOpen(false)}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </>
  )
}

