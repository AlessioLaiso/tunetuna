import { useState, useCallback, memo, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Image from '../shared/Image'
import { jellyfinClient } from '../../api/jellyfin'
import { usePlayerStore } from '../../stores/playerStore'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import type { LightweightSong } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useContextMenu } from '../../hooks/useContextMenu'
import { Disc } from 'lucide-react'
import { formatDuration } from '../../utils/formatting'

interface SongItemProps {
  song: LightweightSong
  showImage?: boolean
  onContextMenu?: (item: LightweightSong, type: 'song', mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId?: string | null
}

// Memoized component to prevent unnecessary re-renders when parent updates
const SongItem = memo(function SongItem({ song, showImage = true, onContextMenu, contextMenuItemId }: SongItemProps) {
  // Use selector to only get playTrack function - stable reference
  const playTrack = usePlayerStore((state) => state.playTrack)
  const navigate = useNavigate()
  const currentTrack = useCurrentTrack()
  const [imageError, setImageError] = useState(false)
  const isThisItemMenuOpen = contextMenuItemId === song.Id

  const externalHandler = useCallback((item: LightweightSong, mode: 'mobile' | 'desktop', position?: { x: number; y: number }) => {
    onContextMenu?.(item, 'song', mode, position)
  }, [onContextMenu])

  const { handleContextMenu, longPressHandlers, shouldSuppressClick, menuState } = useContextMenu({
    item: song,
    onContextMenu: onContextMenu ? externalHandler : undefined,
  })

  // Memoize the image URL to prevent recalculation on every render
  const imageUrl = useMemo(() =>
    jellyfinClient.getAlbumArtUrl(song.AlbumId || song.Id, 96),
    [song.AlbumId, song.Id]
  )

  return (
    <>
      <button
        onClick={(e) => {
          if (shouldSuppressClick()) {
            e.preventDefault()
            e.stopPropagation()
            return
          }
          playTrack(song)
        }}
        onContextMenu={handleContextMenu}
        className={`w-full flex items-center gap-3 hover:bg-white/10 transition-colors group px-4 py-3 ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
        {...longPressHandlers}
      >
        <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-900 self-center flex items-center justify-center">
          {imageError ? (
            <Disc className="w-6 h-6 text-gray-500" />
          ) : showImage ? (
            <Image
              src={imageUrl}
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
          <div className={`text-sm font-medium truncate transition-colors ${currentTrack?.Id === song.Id
              ? 'text-[var(--accent-color)]'
              : 'text-white group-hover:text-[var(--accent-color)]'
            }`}>
            {song.Name}
          </div>
          <div className="text-xs text-gray-400 truncate">
            {song.ArtistItems?.[0]?.Id ? (
              <span
                className="clickable-text"
                onClick={(e) => {
                  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
                  e.stopPropagation()
                  navigate(`/artist/${song.ArtistItems![0].Id}`)
                }}
              >
                {song.ArtistItems[0].Name || song.AlbumArtist || 'Unknown Artist'}
              </span>
            ) : (
              song.AlbumArtist || 'Unknown Artist'
            )}
            {song.Album && (
              <>
                {' • '}
                {song.AlbumId ? (
                  <span
                    className="clickable-text"
                    onClick={(e) => {
                      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
                      e.stopPropagation()
                      navigate(`/album/${song.AlbumId}`)
                    }}
                  >
                    {song.Album}
                  </span>
                ) : (
                  song.Album
                )}
              </>
            )}
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
        isOpen={menuState.isOpen}
        onClose={menuState.close}
        mode={menuState.mode}
        position={menuState.position || undefined}
      />
    </>
  )
})

export default SongItem
