import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { jellyfinClient } from '../../api/jellyfin'
import { usePlayerStore } from '../../stores/playerStore'
import { ArrowLeft, Play, Pause, MoreHorizontal } from 'lucide-react'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'
import Image from '../shared/Image'

const INITIAL_VISIBLE_TRACKS = 45
const VISIBLE_TRACKS_INCREMENT = 45

interface PlaylistTrackItemProps {
  track: BaseItemDto
  index: number
  tracks: BaseItemDto[]
  onClick: (track: BaseItemDto, tracks: BaseItemDto[]) => void
  onContextMenu: (track: BaseItemDto, mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId: string | null
}

function PlaylistTrackItem({ track, index, tracks, onClick, onContextMenu, contextMenuItemId }: PlaylistTrackItemProps) {
  const isThisItemMenuOpen = contextMenuItemId === track.Id
  const { currentTrack } = usePlayerStore()
  const formatDuration = (ticks: number): string => {
    const seconds = Math.floor(ticks / 10000000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      onContextMenu(track, 'mobile')
    },
    onClick: () => onClick(track, tracks),
  })
  return (
    <button
      onClick={() => onClick(track, tracks)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(track, 'desktop', { x: e.clientX, y: e.clientY })
      }}
      {...longPressHandlers}
      className={`w-full flex items-center gap-3 hover:bg-white/10 transition-colors group px-4 py-3 ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
    >
      <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-900 self-center">
        <Image
          src={jellyfinClient.getAlbumArtUrl(track.AlbumId || track.Id, 96)}
          alt={track.Name}
          className="w-full h-full object-cover"
          showOutline={true}
          rounded="rounded-sm"
        />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className={`text-sm font-medium truncate transition-colors ${
          currentTrack?.Id === track.Id 
            ? 'text-[var(--accent-color)]' 
            : 'text-white group-hover:text-[var(--accent-color)]'
        }`}>
          {track.Name}
        </div>
        <div className="text-xs text-gray-400 truncate">
          {track.AlbumArtist || track.ArtistItems?.[0]?.Name || 'Unknown Artist'}
          {track.Album && ` • ${track.Album}`}
        </div>
      </div>
      {track.RunTimeTicks && (
        <div className="text-xs text-gray-500 flex-shrink-0 text-right">
          {formatDuration(track.RunTimeTicks)}
        </div>
      )}
    </button>
  )
}

export default function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { playAlbum, playTrack, currentTrack, isPlaying } = usePlayerStore()
  const [playlist, setPlaylist] = useState<BaseItemDto | null>(null)
  const [tracks, setTracks] = useState<BaseItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [playlistContextMenuOpen, setPlaylistContextMenuOpen] = useState(false)
  const [playlistContextMenuMode, setPlaylistContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [playlistContextMenuPosition, setPlaylistContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [visibleTracksCount, setVisibleTracksCount] = useState(INITIAL_VISIBLE_TRACKS)

  useEffect(() => {
    if (!id) return

    const loadPlaylistData = async () => {
      setLoading(true)
      try {
        const tracksList = await jellyfinClient.getAlbumTracks(id)
        setTracks(tracksList)
        
        // Get playlist info
        const playlistsResult = await jellyfinClient.getPlaylists({ limit: 1000 })
        const foundPlaylist = playlistsResult.Items.find(p => p.Id === id)
        
        if (foundPlaylist) {
          setPlaylist(foundPlaylist)
        } else if (tracksList.length > 0) {
          // Fallback: create playlist object from first track
          setPlaylist({
            Id: id,
            Name: 'Playlist',
            Type: 'Playlist',
          } as BaseItemDto)
        }
      } catch (error) {
        console.error('Failed to load playlist data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadPlaylistData()
  }, [id])

  // Reset visible tracks window when tracks change
  useEffect(() => {
    setVisibleTracksCount(INITIAL_VISIBLE_TRACKS)
  }, [tracks.length])

  // Incrementally reveal more tracks as the user scrolls near the bottom
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      const fullHeight = document.documentElement.scrollHeight

      // When the user is within ~1.5 viewports of the bottom, load more rows
      if (scrollTop + viewportHeight * 1.5 >= fullHeight) {
        setVisibleTracksCount((prev) =>
          Math.min(prev + VISIBLE_TRACKS_INCREMENT, tracks.length)
        )
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [tracks.length])

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playAlbum(tracks)
    }
  }

  const isPlaylistPlaying = () => {
    if (!tracks.length || !currentTrack) return false
    // Check if current track is in this playlist
    return tracks.some(track => track.Id === currentTrack.Id)
  }

  if (loading) {
    return (
      <div className="pb-20">
        <div className="flex items-center justify-center h-screen text-gray-400">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!playlist || tracks.length === 0) {
    return (
      <div className="pb-20">
        <div className="flex items-center justify-center h-screen text-gray-400">
          <p>Playlist not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="fixed top-0 left-0 right-0 bg-black z-10" style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}>
        <div className="max-w-[768px] mx-auto">
          <div className="flex items-center justify-between gap-4 px-4" style={{ paddingTop: 'calc(1rem + 8px)', paddingBottom: '1rem' }}>
          <button
            onClick={() => navigate(-1)}
            className="text-white hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          {playlist && (
            <button
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setPlaylistContextMenuMode('desktop')
                setPlaylistContextMenuPosition({
                  x: rect.left + rect.width / 2,
                  y: rect.bottom + 5
                })
                setPlaylistContextMenuOpen(true)
              }}
              className="text-white hover:text-zinc-300 transition-colors"
            >
              <MoreHorizontal className="w-6 h-6" />
            </button>
          )}
          </div>
        </div>
      </div>

      <div className="pt-20">
        <div className="mb-6 px-4 pt-4">
          <div className="w-full">
            <h2 className="text-4xl md:text-5xl font-bold mb-0.5 text-left break-words">{playlist.Name}</h2>
            <div className="flex items-center justify-between gap-4 mt-2">
              <div className="text-gray-400">
                {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
              </div>
              <button
                onClick={isPlaylistPlaying() && isPlaying ? () => usePlayerStore.getState().pause() : handlePlayAll}
                className="bg-white/10 hover:bg-white/20 text-white font-semibold py-1.5 px-3 rounded-full transition-all hover:scale-105 flex items-center gap-1.5 backdrop-blur-sm border border-white/20 flex-shrink-0"
              >
                {isPlaylistPlaying() && isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Play
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div>
          <div className="space-y-0">
            {tracks.slice(0, visibleTracksCount).map((track, index) => (
              <PlaylistTrackItem
                key={track.Id}
                track={track}
                index={index}
                tracks={tracks}
                onClick={(track) => playTrack(track, tracks)}
                onContextMenu={(track, mode, position) => {
                  setContextMenuItem(track)
                  setContextMenuMode(mode || 'mobile')
                  setContextMenuPosition(position || null)
                  setContextMenuOpen(true)
                }}
                contextMenuItemId={contextMenuItem?.Id || null}
              />
            ))}
          </div>
        </div>
      </div>
      <ContextMenu
        item={contextMenuItem}
        itemType="song"
        isOpen={contextMenuOpen}
        onClose={() => {
          setContextMenuOpen(false)
          setContextMenuItem(null)
        }}
      />
      <ContextMenu
        item={playlist}
        itemType="playlist"
        isOpen={playlistContextMenuOpen}
        onClose={() => {
          setPlaylistContextMenuOpen(false)
        }}
        mode={playlistContextMenuMode}
        position={playlistContextMenuPosition || undefined}
      />
    </div>
  )
}

