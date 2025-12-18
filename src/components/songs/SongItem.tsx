import { useState, useRef } from 'react'
import Image from '../shared/Image'
import { jellyfinClient } from '../../api/jellyfin'
import { usePlayerStore } from '../../stores/playerStore'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import type { LightweightSong } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'
import { Disc } from 'lucide-react'

interface SongItemProps {
  song: LightweightSong
  showImage?: boolean
  onContextMenu?: (item: LightweightSong, type: 'song', mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId?: string | null
}

export default function SongItem({ song, showImage = true, onContextMenu, contextMenuItemId }: SongItemProps) {
  const { playTrack } = usePlayerStore()
  const currentTrack = useCurrentTrack()
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const contextMenuJustOpenedRef = useRef(false)
  const [imageError, setImageError] = useState(false)
  const isThisItemMenuOpen = contextMenuItemId === song.Id

  const formatDuration = (ticks: number): string => {
    const seconds = Math.floor(ticks / 10000000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleClick = (e: React.MouseEvent) => {
    // Don't play if context menu was just opened
    if (contextMenuJustOpenedRef.current) {
      e.preventDefault()
      contextMenuJustOpenedRef.current = false
      return
    }
    playTrack(song)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Prevent any default browser behavior
    e.nativeEvent?.preventDefault?.()
    e.nativeEvent?.stopImmediatePropagation?.()

    // Prevent any click action for the next 300ms
    contextMenuJustOpenedRef.current = true
    if (onContextMenu) {
      onContextMenu(song, 'song', 'desktop', { x: e.clientX, y: e.clientY })
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
        onContextMenu(song, 'song', 'mobile')
      } else {
        // Fallback to local context menu
        contextMenuJustOpenedRef.current = true
        setContextMenuMode('mobile')
        setContextMenuPosition(null)
        setContextMenuOpen(true)
      }
    },
    onClick: handleClick,
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
        onContextMenu={handleContextMenu}
        className={`w-full flex items-center gap-3 hover:bg-white/10 transition-colors group px-4 py-3 ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
        {...longPressHandlers}
      >
        <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-900 self-center flex items-center justify-center">
        {imageError ? (
          <Disc className="w-7 h-7 text-gray-500" />
        ) : showImage ? (
          <Image
            src={jellyfinClient.getAlbumArtUrl(song.AlbumId || song.Id, 96)}
            alt={song.Name}
            className="w-full h-full object-cover"
            showOutline={true}
            rounded="rounded-sm"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full bg-zinc-900" />
        )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className={`text-sm font-medium truncate transition-colors ${
            currentTrack?.Id === song.Id 
              ? 'text-[var(--accent-color)]' 
              : 'text-white group-hover:text-[var(--accent-color)]'
          }`}>
            {song.Name}
          </div>
          <div className="text-xs text-gray-400 truncate">
            {song.AlbumArtist || song.ArtistItems?.[0]?.Name || 'Unknown Artist'}
            {song.Album && ` • ${song.Album}`}
          </div>
        </div>
        {song.RunTimeTicks && (
          <div className="text-xs text-gray-500 flex-shrink-0 text-right">
            {formatDuration(song.RunTimeTicks)}
          </div>
        )}
      </button>
      <ContextMenu
        item={song}
        itemType="song"
        isOpen={contextMenuOpen}
        onClose={() => setContextMenuOpen(false)}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </>
  )
}






