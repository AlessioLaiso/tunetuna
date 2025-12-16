import { useState, useRef } from 'react'
import Image from '../shared/Image'
import { jellyfinClient } from '../../api/jellyfin'
import { usePlayerStore } from '../../stores/playerStore'
import type { LightweightSong } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'
import { Disc } from 'lucide-react'

interface SongItemProps {
  song: LightweightSong
  showImage?: boolean
}

export default function SongItem({ song, showImage = true }: SongItemProps) {
  const { playTrack, currentTrack } = usePlayerStore()
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const contextMenuJustOpenedRef = useRef(false)
  const [imageError, setImageError] = useState(false)

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

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      setContextMenuMode('mobile')
      setContextMenuPosition(null)
      setContextMenuOpen(true)
    },
    onClick: handleClick,
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
    }, 100)
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
        className={`w-full flex items-center gap-3 hover:bg-white/10 transition-colors group px-4 py-3 ${contextMenuOpen ? 'bg-white/10' : ''}`}
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






