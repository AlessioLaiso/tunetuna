import { useState } from 'react'
import { Disc } from 'lucide-react'
import { useMusicStore } from '../../stores/musicStore'
import { jellyfinClient } from '../../api/jellyfin'
import { usePlayerStore } from '../../stores/playerStore'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import Image from '../shared/Image'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'
import type { BaseItemDto } from '../../api/types'

interface RecentlyPlayedSongItemProps {
  song: BaseItemDto
  onClick: (song: BaseItemDto) => void
  onContextMenu: (song: BaseItemDto, mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId: string | null
}

function RecentlyPlayedSongItem({ song, onClick, onContextMenu, contextMenuItemId }: RecentlyPlayedSongItemProps) {
  const currentTrack = useCurrentTrack()
  const [imageError, setImageError] = useState(false)
  const isThisItemMenuOpen = contextMenuItemId === song.Id
  const formatDuration = (ticks: number): string => {
    const seconds = Math.floor(ticks / 10000000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      onContextMenu(song, 'mobile')
    },
    onClick: () => onClick(song),
  })
  return (
    <button
      onClick={() => onClick(song)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(song, 'desktop', { x: e.clientX, y: e.clientY })
      }}
      {...longPressHandlers}
      className={`w-full flex items-center gap-3 hover:bg-white/10 transition-colors group px-4 py-3 ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
    >
      <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-900 self-center flex items-center justify-center">
        {imageError ? (
          <Disc className="w-7 h-7 text-gray-500" />
        ) : (
          <Image
            src={jellyfinClient.getAlbumArtUrl(song.AlbumId || song.Id, 96)}
            alt={song.Name}
            className="w-full h-full object-cover"
            showOutline={true}
            rounded="rounded-sm"
            onError={() => setImageError(true)}
          />
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
  )
}

export default function RecentlyPlayed() {
  const { recentlyPlayed } = useMusicStore()
  const { playTrack } = usePlayerStore()
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)

  const handleSongClick = (song: typeof recentlyPlayed[0]) => {
    playTrack(song, recentlyPlayed)
  }

  if (!recentlyPlayed || recentlyPlayed.length === 0) {
    return null
  }

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold mb-2 px-4">Recently Played</h2>
      <div className="space-y-0">
        {recentlyPlayed.map((song) => (
          <RecentlyPlayedSongItem
            key={song.Id}
            song={song}
            onClick={handleSongClick}
            onContextMenu={(song, mode, position) => {
              setContextMenuItem(song)
              setContextMenuMode(mode || 'mobile')
              setContextMenuPosition(position || null)
              setContextMenuOpen(true)
            }}
            contextMenuItemId={contextMenuItem?.Id || null}
          />
        ))}
      </div>
      <ContextMenu
        item={contextMenuItem}
        itemType="song"
        isOpen={contextMenuOpen}
        onClose={() => {
          setContextMenuOpen(false)
          setContextMenuItem(null)
        }}
        zIndex={99999}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </div>
  )
}


