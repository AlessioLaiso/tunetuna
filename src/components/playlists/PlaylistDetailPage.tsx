import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { jellyfinClient } from '../../api/jellyfin'
import { usePlayerStore } from '../../stores/playerStore'
import { useMusicStore } from '../../stores/musicStore'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import { useScrollLazyLoad } from '../../hooks/useScrollLazyLoad'
import { ArrowLeft, Play, Pause, Shuffle, MoreHorizontal, ArrowUpDown } from 'lucide-react'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'
import Image from '../shared/Image'
import { logger } from '../../utils/logger'
import { formatDuration, parseGroupingTag } from '../../utils/formatting'

type PlaylistSortOrder = 'PlaylistOrder' | 'Alphabetical'

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
  const currentTrack = useCurrentTrack()
  const contextMenuJustOpenedRef = useRef(false)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuJustOpenedRef.current = true
    onContextMenu(track, 'desktop', { x: e.clientX, y: e.clientY })
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 300)
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      onContextMenu(track, 'mobile')
    },
    onClick: () => {
      if (contextMenuJustOpenedRef.current) {
        contextMenuJustOpenedRef.current = false
        return
      }
      onClick(track, tracks)
    },
  })
  return (
    <button
      onClick={() => {
        if (contextMenuJustOpenedRef.current) {
          contextMenuJustOpenedRef.current = false
          return
        }
        onClick(track, tracks)
      }}
      onContextMenu={handleContextMenu}
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
        <div className={`text-sm font-medium truncate transition-colors ${currentTrack?.Id === track.Id
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

/**
 * Capitalize the first letter of a string.
 */
function capitalizeFirst(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export default function PlaylistDetailPage() {
  const { id, moodValue } = useParams<{ id?: string; moodValue?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { playAlbum, playTrack, isPlaying, shuffleArtist } = usePlayerStore()
  const { songs, recordMoodAccess } = useMusicStore()
  const currentTrack = useCurrentTrack()
  const [playlist, setPlaylist] = useState<BaseItemDto | null>(null)
  const [tracks, setTracks] = useState<BaseItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [playlistContextMenuOpen, setPlaylistContextMenuOpen] = useState(false)
  const [playlistContextMenuMode, setPlaylistContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [playlistContextMenuPosition, setPlaylistContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [visibleTracksCount, setVisibleTracksCount] = useState(INITIAL_VISIBLE_TRACKS)
  const [playlistSortOrder, setPlaylistSortOrder] = useState<PlaylistSortOrder>('PlaylistOrder')
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)

  // Detect if this is a mood route
  const isMoodRoute = location.pathname.startsWith('/mood/')

  useEffect(() => {
    // Handle mood route - filter from cached songs (same as search does)
    if (isMoodRoute && moodValue) {
      const decodedMood = decodeURIComponent(moodValue).toLowerCase()
      recordMoodAccess(decodedMood)

      // Filter songs by mood category and value (same logic as search)
      const moodSongs = songs.filter(song => {
        if (!song.Grouping || song.Grouping.length === 0) return false

        return song.Grouping.some(tag => {
          const parsed = parseGroupingTag(tag)
          return parsed && parsed.category === 'mood' && parsed.value === decodedMood
        })
      })

      setPlaylist({
        Id: `mood-${decodedMood}`,
        Name: capitalizeFirst(decodedMood),
        Type: 'Mood',
      } as BaseItemDto)

      // Convert to BaseItemDto format, sorted by name
      const sortedTracks = [...moodSongs]
        .sort((a, b) => (a.Name || '').localeCompare(b.Name || ''))
        .map(song => ({
          Id: song.Id,
          Name: song.Name,
          AlbumArtist: song.AlbumArtist,
          ArtistItems: song.ArtistItems,
          Album: song.Album,
          AlbumId: song.AlbumId,
          RunTimeTicks: song.RunTimeTicks,
          Type: 'Audio',
        } as BaseItemDto))

      setTracks(sortedTracks)
      setLoading(false)
      return
    }

    // Handle regular playlist route
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
        logger.error('Failed to load playlist data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadPlaylistData()
  }, [id, isMoodRoute, moodValue, recordMoodAccess, songs])

  // Reset visible tracks window when tracks change
  useEffect(() => {
    setVisibleTracksCount(INITIAL_VISIBLE_TRACKS)
  }, [tracks.length])

  // Scroll-based lazy loading using .main-scrollable container
  useScrollLazyLoad({
    totalCount: tracks.length,
    visibleCount: visibleTracksCount,
    increment: VISIBLE_TRACKS_INCREMENT,
    setVisibleCount: setVisibleTracksCount,
    threshold: 1.5
  })

  // Sorted tracks for playlist (mood pages don't get sorting)
  const sortedTracks = useMemo(() => {
    if (isMoodRoute) return tracks
    if (playlistSortOrder === 'Alphabetical') {
      return [...tracks].sort((a, b) => (a.Name || '').localeCompare(b.Name || ''))
    }
    return tracks // PlaylistOrder = original order from API
  }, [tracks, playlistSortOrder, isMoodRoute])

  const handlePlayAll = () => {
    if (sortedTracks.length > 0) {
      playAlbum(sortedTracks)
    }
  }

  const handleShuffleAll = () => {
    if (sortedTracks.length > 0) {
      shuffleArtist(sortedTracks)
    }
  }

  const isPlaylistPlaying = () => {
    if (!sortedTracks.length || !currentTrack) return false
    return sortedTracks.some(track => track.Id === currentTrack.Id)
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
          <p>{isMoodRoute ? 'No songs found for this mood' : 'Playlist not found'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div
        className={`fixed top-0 left-0 right-0 bg-black z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
      >
        <div className="max-w-[768px] mx-auto">
          <div className="flex items-center justify-between gap-4 pl-3 pr-4" style={{ paddingTop: 'calc(1rem + 8px)', paddingBottom: '1rem' }}>
            <button
              onClick={() => navigate(-1)}
              className="text-white hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            {playlist && !isMoodRoute && (
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
                {sortedTracks.length} {sortedTracks.length === 1 ? 'track' : 'tracks'}
              </div>
              <button
                onClick={isPlaylistPlaying() && isPlaying ? () => usePlayerStore.getState().pause() : isMoodRoute ? handleShuffleAll : handlePlayAll}
                className="bg-white/10 hover:bg-white/20 text-white font-semibold py-1.5 px-3 rounded-full transition-all hover:scale-105 flex items-center gap-1.5 backdrop-blur-sm border border-white/20 flex-shrink-0"
              >
                {isPlaylistPlaying() && isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </>
                ) : isMoodRoute ? (
                  <>
                    <Shuffle className="w-3.5 h-3.5" />
                    Shuffle
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

        {!isMoodRoute && (
          <div className="px-4 mb-1">
            <button
              type="button"
              onClick={() => setPlaylistSortOrder(s => s === 'PlaylistOrder' ? 'Alphabetical' : 'PlaylistOrder')}
              className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              {playlistSortOrder === 'PlaylistOrder' ? 'Playlist Order' : 'Alphabetically'}
              <ArrowUpDown className="w-4 h-4" />
            </button>
          </div>
        )}

        <div>
          <div className="space-y-0">
            {sortedTracks.slice(0, visibleTracksCount).map((track, index) => (
              <PlaylistTrackItem
                key={track.Id}
                track={track}
                index={index}
                tracks={sortedTracks}
                onClick={(track) => playTrack(track, sortedTracks)}
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
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
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

