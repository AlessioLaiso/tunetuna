import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListMusic } from 'lucide-react'
import Image from '../shared/Image'
import { jellyfinClient } from '../../api/jellyfin'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'

interface PlaylistItemProps {
  playlist: BaseItemDto
}

export default function PlaylistItem({ playlist }: PlaylistItemProps) {
  const navigate = useNavigate()
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const contextMenuJustOpenedRef = useRef(false)

  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if context menu was just opened
    if (contextMenuJustOpenedRef.current) {
      e.preventDefault()
      contextMenuJustOpenedRef.current = false
      return
    }
    navigate(`/playlist/${playlist.Id}`)
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      setContextMenuMode('mobile')
      setContextMenuPosition(null)
      setContextMenuOpen(true)
    },
  })

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuJustOpenedRef.current = true
    setContextMenuMode('desktop')
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
    setContextMenuOpen(true)
    // Reset the flag after a short delay to allow click prevention
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
        className="text-left group"
      >
        <div className="aspect-square rounded overflow-hidden bg-zinc-900 relative flex items-center justify-center">
          <Image
            src={jellyfinClient.getAlbumArtUrl(playlist.Id, 474)}
            alt={playlist.Name}
            className="w-full h-full object-cover"
            showOutline={true}
            rounded="rounded"
            fallbackIcon={ListMusic}
          />
        </div>
        <div className="text-sm font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">{playlist.Name}</div>
        <div className="text-xs text-gray-400 truncate">
          {playlist.ChildCount ? `${playlist.ChildCount} tracks` : 'Playlist'}
        </div>
      </button>
      <ContextMenu
        item={playlist}
        itemType="playlist"
        isOpen={contextMenuOpen}
        onClose={() => setContextMenuOpen(false)}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </>
  )
}


