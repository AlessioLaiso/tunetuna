import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { jellyfinClient } from '../../api/jellyfin'
import { usePlayerStore } from '../../stores/playerStore'
import { useMusicStore } from '../../stores/musicStore'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import { useScrollLazyLoad } from '../../hooks/useScrollLazyLoad'
import { ArrowLeft, Play, Pause, Shuffle, MoreHorizontal, ArrowUpDown, ListMinus, GripHorizontal } from 'lucide-react'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useToastStore } from '../../stores/toastStore'
import { useLongPress } from '../../hooks/useLongPress'
import Image from '../shared/Image'
import Spinner from '../shared/Spinner'
import { logger } from '../../utils/logger'
import { formatDuration, parseGroupingTag } from '../../utils/formatting'

// Cassette animation constants
// Wheel image is 712px on a 1233px cassette — ratio preserved at native size
const WHEEL_SIZE_PERCENT = (712 / 1233) * 100 // ~57.7%
// Hole centres measured from the cassette image
const WHEEL_CENTER_Y_PERCENT = 48.8   // % from top
const WHEEL_LEFT_CENTER_X_PERCENT = 29  // % from left
const WHEEL_RIGHT_CENTER_X_PERCENT = 71 // % from left

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
  reorderable?: boolean
  onReorderDragStart?: (e: React.DragEvent, index: number) => void
  onReorderDragEnd?: () => void
  onReorderDrop?: (e: React.DragEvent, index: number) => void
  onDragEnterRow?: (index: number) => void
  isDragOver?: boolean
}

function PlaylistTrackItem({ track, index, tracks, onClick, onContextMenu, contextMenuItemId, reorderable, onReorderDragStart, onReorderDragEnd, onReorderDrop, onDragEnterRow, isDragOver }: PlaylistTrackItemProps) {
  const navigate = useNavigate()
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    onDragEnterRow?.(index)
  }, [onDragEnterRow, index])

  const handleDrop = useCallback((e: React.DragEvent) => {
    onReorderDrop?.(e, index)
  }, [onReorderDrop, index])

  return (
    <div
      className={`relative w-full flex items-center gap-3 hover:bg-white/10 transition-colors group px-4 py-3 cursor-pointer ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
      onClick={() => {
        if (contextMenuJustOpenedRef.current) {
          contextMenuJustOpenedRef.current = false
          return
        }
        onClick(track, tracks)
      }}
      onContextMenu={handleContextMenu}
      {...longPressHandlers}
      {...(reorderable ? {
        onDragOver: handleDragOver,
        onDragEnter: handleDragEnter,
        onDrop: handleDrop,
      } : {})}
    >
      {isDragOver && (
        <div className="absolute left-3 right-3 top-0 h-0.5 bg-[var(--accent-color)] rounded-full pointer-events-none" />
      )}
      <div className="playlist-drag-art w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-900 self-center">
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
          {track.ArtistItems?.[0]?.Id ? (
            <span
              className="clickable-text"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/artist/${track.ArtistItems![0].Id}`)
              }}
            >
              {track.ArtistItems[0].Name || track.AlbumArtist || 'Unknown Artist'}
            </span>
          ) : (
            track.AlbumArtist || 'Unknown Artist'
          )}
          {track.Album && (
            <>
              {' • '}
              {track.AlbumId ? (
                <span
                  className="clickable-text"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/album/${track.AlbumId}`)
                  }}
                >
                  {track.Album}
                </span>
              ) : (
                track.Album
              )}
            </>
          )}
        </div>
      </div>
      {track.RunTimeTicks && (
        <div className="text-xs text-gray-500 flex-shrink-0 text-right">
          {formatDuration(track.RunTimeTicks)}
        </div>
      )}
      {reorderable && (
        <button
          draggable
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            e.stopPropagation()
            onReorderDragStart?.(e, index)
          }}
          onDragEnd={(e) => {
            e.stopPropagation()
            onReorderDragEnd?.()
          }}
          className="text-gray-500 hover:text-zinc-300 transition-colors p-2 cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] rounded"
          aria-label="Drag to reorder"
        >
          <GripHorizontal className="w-4 h-4" />
        </button>
      )}
    </div>
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
  const songs = useMusicStore(s => s.songs)
  const recordMoodAccess = useMusicStore(s => s.recordMoodAccess)
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
  const [hasImage, setHasImage] = useState(false)
  const [imageCacheBust, setImageCacheBust] = useState(0)
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)

  // Cassette animation state
  const [showCassette, setShowCassette] = useState(false)
  const [hideCover, setHideCover] = useState(false)
  const [wheelRotation, setWheelRotation] = useState(0)
  const wheelRotationRef = useRef<number>(0)
  const wheelAnimFrameRef = useRef<number | null>(null)
  const wheelLastTimeRef = useRef<number>(0)
  const cassetteInitRef = useRef<boolean>(false)
  const reverseCassetteRef = useRef<boolean>(false)
  const previousPlayingRef = useRef<boolean>(false)
  const shouldSplitRef = useRef<boolean>(false)

  // Drag-to-reorder state (only active when PlaylistOrder)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const draggingIndexRef = useRef<number | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
    setDraggingIndex(index)
    draggingIndexRef.current = index

    const gripEl = e.currentTarget as HTMLElement | null
    const rowEl = gripEl?.closest('.playlist-track-row') as HTMLElement | null
    if (rowEl && e.dataTransfer.setDragImage) {
      const artEl = rowEl.querySelector<HTMLElement>('.playlist-drag-art')
      const dragEl = artEl ?? rowEl
      const rect = dragEl.getBoundingClientRect()
      e.dataTransfer.setDragImage(dragEl, rect.width / 2, rect.height / 2)
    }
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggingIndex(null)
    setDragOverIndex(null)
    draggingIndexRef.current = null
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    const data = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/html')
    const dragIndex = parseInt(data, 10)
    setDragOverIndex(null)
    setDraggingIndex(null)
    draggingIndexRef.current = null

    if (Number.isNaN(dragIndex) || dragIndex === dropIndex) return

    // Optimistically update local state
    setTracks(prev => {
      const newTracks = [...prev]
      const [removed] = newTracks.splice(dragIndex, 1)
      newTracks.splice(dropIndex, 0, removed)
      return newTracks
    })

    // Call Jellyfin API to persist the move
    const track = tracks[dragIndex]
    if (id && track?.PlaylistItemId) {
      try {
        await jellyfinClient.movePlaylistItem(id, track.PlaylistItemId, dropIndex)
      } catch (error) {
        logger.error('Failed to reorder playlist item:', error)
        useToastStore.getState().addToast('Failed to reorder track', 'error', 3000)
        // Revert on failure
        setTracks(prev => {
          const newTracks = [...prev]
          const [removed] = newTracks.splice(dropIndex, 1)
          newTracks.splice(dragIndex, 0, removed)
          return newTracks
        })
      }
    }
  }, [tracks, id])

  const handleDragEnterRow = useCallback((index: number) => {
    if (draggingIndexRef.current == null) return
    setDragOverIndex(index)
  }, [])

  // --- Cassette animation effects (mirrors vinyl logic from AlbumDetailPage) ---

  const isPlaylistCurrentlyPlaying = useMemo(() => {
    if (!currentTrack || tracks.length === 0) return false
    return tracks.some(t => t.Id === currentTrack.Id) && isPlaying
  }, [currentTrack, tracks, isPlaying])

  // Handle cassette visibility with animation delay
  useEffect(() => {
    const playing = isPlaylistCurrentlyPlaying
    const playbackChanged = previousPlayingRef.current !== playing

    if (playbackChanged) {
      reverseCassetteRef.current = false
    }
    previousPlayingRef.current = playing

    if (playing) {
      if (!cassetteInitRef.current || !showCassette) {
        setShowCassette(true)
        setHideCover(false)
        cassetteInitRef.current = true
      }

      shouldSplitRef.current = window.innerWidth >= 560

      if (!reverseCassetteRef.current) {
        reverseCassetteRef.current = true
        setTimeout(() => {
          // Re-check playing state
          const ps = usePlayerStore.getState()
          const ct = ps.currentIndex >= 0 && ps.songs[ps.currentIndex] ? ps.songs[ps.currentIndex] : null
          const stillPlaying = ct && tracks.some(t => t.Id === ct.Id) && ps.isPlaying
          if (stillPlaying) {
            setHideCover(true)
          }
        }, 500)
      }
    } else if (cassetteInitRef.current && showCassette && !playing) {
      if (!reverseCassetteRef.current) {
        reverseCassetteRef.current = true
        setHideCover(false)
      }
    } else if (!cassetteInitRef.current) {
      setShowCassette(false)
      setHideCover(false)
      cassetteInitRef.current = true
    } else {
      setShowCassette(false)
      setHideCover(false)
    }
  }, [isPlaylistCurrentlyPlaying, showCassette, tracks])

  // Handle window resize for cassette animation
  useEffect(() => {
    const handleResize = () => {
      if (isPlaylistCurrentlyPlaying && showCassette) {
        const newSplit = window.innerWidth >= 560
        shouldSplitRef.current = newSplit
        if (hideCover) {
          setHideCover(false)
          setTimeout(() => setHideCover(true), 10)
        }
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isPlaylistCurrentlyPlaying, showCassette, hideCover])

  // Handle wheel rotation animation
  useEffect(() => {
    if (isPlaylistCurrentlyPlaying) {
      const animate = (currentTime: number) => {
        if (wheelLastTimeRef.current === 0) {
          wheelLastTimeRef.current = currentTime
        }
        const dt = currentTime - wheelLastTimeRef.current
        const speed = 360 / 10000 // 360° per 10s
        wheelRotationRef.current = (wheelRotationRef.current + speed * dt) % 360
        setWheelRotation(wheelRotationRef.current)
        wheelLastTimeRef.current = currentTime
        wheelAnimFrameRef.current = requestAnimationFrame(animate)
      }
      wheelLastTimeRef.current = 0
      wheelAnimFrameRef.current = requestAnimationFrame(animate)
    } else {
      if (wheelAnimFrameRef.current) {
        cancelAnimationFrame(wheelAnimFrameRef.current)
        wheelAnimFrameRef.current = null
      }
      wheelLastTimeRef.current = 0
    }
    return () => {
      if (wheelAnimFrameRef.current) {
        cancelAnimationFrame(wheelAnimFrameRef.current)
      }
    }
  }, [isPlaylistCurrentlyPlaying])

  // Detect if this is a mood route
  const isMoodRoute = location.pathname.startsWith('/mood/')

  // Refresh playlist data when playlists are updated elsewhere (rename, etc.)
  useEffect(() => {
    if (isMoodRoute || !id) return
    const handler = () => {
      const loadPlaylistData = async () => {
        try {
          const tracksList = await jellyfinClient.getPlaylistItems(id)
          setTracks(tracksList)
          const playlistsResult = await jellyfinClient.getPlaylists({ limit: 1000 })
          const foundPlaylist = playlistsResult.Items.find(p => p.Id === id)
          if (foundPlaylist) {
            setPlaylist(foundPlaylist)
            setHasImage(!!foundPlaylist.ImageTags?.Primary)
            setImageCacheBust(Date.now())
          }
        } catch (error) {
          logger.error('Failed to refresh playlist data:', error)
        }
      }
      loadPlaylistData()
    }
    window.addEventListener('playlistUpdated', handler)
    return () => window.removeEventListener('playlistUpdated', handler)
  }, [id, isMoodRoute])

  const handleRemoveFromPlaylist = async (_actionId: string, item: BaseItemDto | import('../../api/types').LightweightSong) => {
    if (!id || !('PlaylistItemId' in item) || !item.PlaylistItemId) return
    try {
      await jellyfinClient.removeItemsFromPlaylist(id, [item.PlaylistItemId])
      useToastStore.getState().addToast('Removed from playlist', 'success', 2000)
      setTracks(prev => prev.filter(t => t.PlaylistItemId !== item.PlaylistItemId))
    } catch {
      useToastStore.getState().addToast('Failed to remove track', 'error', 3000)
    }
  }

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
        const tracksList = await jellyfinClient.getPlaylistItems(id)
        setTracks(tracksList)

        // Get playlist info
        const playlistsResult = await jellyfinClient.getPlaylists({ limit: 1000 })
        const foundPlaylist = playlistsResult.Items.find(p => p.Id === id)

        if (foundPlaylist) {
          setPlaylist(foundPlaylist)
          setHasImage(!!foundPlaylist.ImageTags?.Primary)
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
        <div className="flex items-center justify-center h-screen">
          <Spinner />
        </div>
      </div>
    )
  }

  if (!playlist) {
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
            {!isMoodRoute && (
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
          <div className="flex justify-center mb-6">
              <div
                className="relative"
                style={{
                  overflow: 'visible',
                  width: '256px',
                  height: '256px',
                }}
              >
                {/* Cassette with spinning wheels */}
                <div
                  className="absolute inset-0"
                  style={{
                    opacity: hasImage ? (showCassette ? 1 : 0) : 1,
                    zIndex: 1,
                    transform: (isPlaylistCurrentlyPlaying && hasImage && shouldSplitRef.current)
                      ? 'translateX(calc(50% + 8px))'
                      : 'translateX(0)',
                    transition: 'transform 500ms ease-in-out, opacity 300ms ease-in-out',
                  }}
                >
                  {/* Left wheel — behind cassette */}
                  <img
                    src="/assets/wheel.png"
                    alt=""
                    style={{
                      position: 'absolute',
                      width: `${WHEEL_SIZE_PERCENT}%`,
                      height: `${WHEEL_SIZE_PERCENT}%`,
                      left: `${WHEEL_LEFT_CENTER_X_PERCENT - WHEEL_SIZE_PERCENT / 2}%`,
                      top: `${WHEEL_CENTER_Y_PERCENT - WHEEL_SIZE_PERCENT / 2}%`,
                      transform: `rotate(${wheelRotation}deg)`,
                      transformOrigin: 'center center',
                      zIndex: 3,
                    }}
                  />
                  {/* Right wheel — behind cassette */}
                  <img
                    src="/assets/wheel.png"
                    alt=""
                    style={{
                      position: 'absolute',
                      width: `${WHEEL_SIZE_PERCENT}%`,
                      height: `${WHEEL_SIZE_PERCENT}%`,
                      left: `${WHEEL_RIGHT_CENTER_X_PERCENT - WHEEL_SIZE_PERCENT / 2}%`,
                      top: `${WHEEL_CENTER_Y_PERCENT - WHEEL_SIZE_PERCENT / 2}%`,
                      transform: `rotate(${wheelRotation}deg)`,
                      transformOrigin: 'center center',
                      zIndex: 3,
                    }}
                  />
                  {/* Cassette image */}
                  <img
                    src="/assets/cassette.png"
                    alt="Cassette"
                    className="w-full h-full object-contain"
                    style={{ position: 'relative', zIndex: 2 }}
                    onError={(e) => {
                      logger.error('Failed to load cassette image')
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                  {/* Playlist/mood title on the cassette label */}
                  <div
                    className="absolute font-handwritten text-black text-center truncate pointer-events-none"
                    style={{
                      top: '27%',
                      left: '6%',
                      width: '88%',
                      fontSize: '1.1rem',
                      lineHeight: 1.2,
                      zIndex: 4,
                    }}
                  >
                    {playlist.Name}
                  </div>
                </div>

                {/* Playlist Cover Art — on top, slides away when playing */}
                {hasImage && (
                  <div
                    className="absolute inset-0 rounded overflow-hidden bg-zinc-900"
                    style={{
                      transform: isPlaylistCurrentlyPlaying
                        ? shouldSplitRef.current
                          ? 'translateX(calc(-50% - 8px))'
                          : 'translateX(calc(-100% - 24px))'
                        : hideCover
                          ? shouldSplitRef.current
                            ? 'translateX(calc(-50% - 8px))'
                            : 'translateX(calc(-100% - 24px))'
                          : 'translateX(0)',
                      transitionProperty: 'transform',
                      transitionDuration: '500ms',
                      transitionTimingFunction: 'ease-in-out',
                      zIndex: 10,
                    }}
                  >
                    <Image
                      src={jellyfinClient.getImageUrl(playlist.Id, 'Primary', 474) + (imageCacheBust ? `&cb=${imageCacheBust}` : '')}
                      alt={playlist.Name}
                      className="w-full h-full object-cover"
                      showOutline={true}
                      rounded="rounded"
                      onError={() => setHasImage(false)}
                    />
                  </div>
                )}
              </div>
            </div>
          <div className="w-full">
            <h2 className="text-4xl md:text-5xl font-bold mb-0.5 text-left break-words">{playlist.Name}</h2>
            {sortedTracks.length > 0 && (
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
            )}
          </div>
        </div>

        {sortedTracks.length === 0 ? (
          <div className="flex items-center justify-center px-8 pt-24">
            <p className="text-gray-400 text-center">Long press or right click on songs and albums to add them to playlists</p>
          </div>
        ) : (
          <>
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
                  <div key={track.Id} className="playlist-track-row">
                    <PlaylistTrackItem
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
                      reorderable={playlistSortOrder === 'PlaylistOrder' && !isMoodRoute}
                      onReorderDragStart={handleDragStart}
                      onReorderDragEnd={handleDragEnd}
                      onReorderDrop={handleDrop}
                      onDragEnterRow={handleDragEnterRow}
                      isDragOver={dragOverIndex === index}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
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
        extraActions={!isMoodRoute ? [{ id: 'removeFromPlaylist', label: 'Remove from Playlist', icon: ListMinus }] : undefined}
        onExtraAction={!isMoodRoute ? handleRemoveFromPlaylist : undefined}
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

