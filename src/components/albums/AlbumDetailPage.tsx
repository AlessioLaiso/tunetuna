import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { jellyfinClient } from '../../api/jellyfin'
import { usePlayerStore } from '../../stores/playerStore'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import Image from '../shared/Image'
import Spinner from '../shared/Spinner'
import { ArrowLeft, Play, Pause, ChevronDown, ChevronUp, MoreHorizontal } from 'lucide-react'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'

interface AlbumTrackItemProps {
  track: BaseItemDto
  trackNumber: number | null
  tracks: BaseItemDto[]
  onClick: (track: BaseItemDto, tracks: BaseItemDto[]) => void
  onContextMenu: (track: BaseItemDto, mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId: string | null
}

function AlbumTrackItem({ track, trackNumber, tracks, onClick, onContextMenu, contextMenuItemId }: AlbumTrackItemProps) {
  const isThisItemMenuOpen = contextMenuItemId === track.Id
  const currentTrack = useCurrentTrack()
  const contextMenuJustOpenedRef = useRef(false)

  const formatDuration = (ticks: number): string => {
    const seconds = Math.floor(ticks / 10000000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

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
      className={`w-full flex items-baseline hover:bg-white/10 transition-colors group py-3 ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
    >
      <span className={`text-sm w-6 text-right flex-shrink-0 mr-4 ${currentTrack?.Id === track.Id
        ? 'text-[var(--accent-color)]'
        : 'text-gray-500'
        }`}>{trackNumber && trackNumber > 0 ? trackNumber : '-'}</span>
      <div className="flex-1 min-w-0 text-left">
        <div className={`text-sm font-medium truncate transition-colors ${currentTrack?.Id === track.Id
          ? 'text-[var(--accent-color)]'
          : 'text-white group-hover:text-[var(--accent-color)]'
          }`}>
          {track.Name}
        </div>
      </div>
      {track.RunTimeTicks && (
        <div className="text-xs text-gray-500 flex-shrink-0 text-right mr-4">
          {formatDuration(track.RunTimeTicks)}
        </div>
      )}
    </button>
  )
}

function formatDuration(ticks: number): string {
  const seconds = Math.floor(ticks / 10000000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function AlbumDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { playAlbum, playTrack, isPlaying, play, pause } = usePlayerStore()
  const currentTrack = useCurrentTrack()
  const [album, setAlbum] = useState<BaseItemDto | null>(null)
  const [tracks, setTracks] = useState<BaseItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const [bioExpanded, setBioExpanded] = useState(false)
  const [hasImage, setHasImage] = useState(true)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [albumContextMenuOpen, setAlbumContextMenuOpen] = useState(false)
  const [albumContextMenuMode, setAlbumContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [albumContextMenuPosition, setAlbumContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [artistLogoUrl, setArtistLogoUrl] = useState<string | null>(null)
  const [hasArtistLogo, setHasArtistLogo] = useState(false)
  const [showVinyl, setShowVinyl] = useState(false)
  const [hideAlbumArt, setHideAlbumArt] = useState(false)
  const reverseAnimationStartedRef = useRef<boolean>(false)

  // Add new ref for split animation
  const shouldSplitRef = useRef<boolean>(false)

  const [rotationAngle, setRotationAngle] = useState(0)
  const rotationRef = useRef<number>(0)
  const animationFrameRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)
  const hasInitializedRef = useRef<boolean>(false)
  const albumArtRef = useRef<HTMLDivElement | null>(null)
  const previousAlbumIdRef = useRef<string | null>(null)
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)

  const previousPlayingRef = useRef<boolean>(false)

  useEffect(() => {
    if (!id) return

    // Track if component is still mounted to prevent state updates after unmount
    let isMounted = true

    const loadAlbumData = async () => {
      setLoading(true)
      try {
        const tracksList = await jellyfinClient.getAlbumTracks(id)

        if (!isMounted) return
        setTracks(tracksList)

        // Get album info with Overview field
        const albumDetail = await jellyfinClient.getAlbumById(id)
        let currentAlbum = albumDetail
        if (!currentAlbum) {
          // Fallback to getAlbums if getAlbumById doesn't work
          const albumsResult = await jellyfinClient.getAlbums({ limit: 1 })
          const foundAlbum = albumsResult.Items.find(a => a.Id === id)
          if (foundAlbum) {
            currentAlbum = foundAlbum
          }
        }

        if (!isMounted) return

        if (!currentAlbum) {
          // Try to get from tracks
          if (tracksList.length > 0 && tracksList[0].AlbumId === id) {
            currentAlbum = {
              Id: id,
              Name: tracksList[0].Album || 'Unknown Album',
              AlbumArtist: tracksList[0].AlbumArtist,
            } as BaseItemDto
          }
        }

        if (currentAlbum) {
          setAlbum(currentAlbum)
          setHasImage(true) // Reset image state when album changes
        }

        // Load artist logo if available
        const artistId = getArtistIdFromTracks(tracksList, currentAlbum)
        if (artistId) {
          try {
            const artist = await jellyfinClient.getArtistById(artistId)
            if (!isMounted) return
            if (artist?.ImageTags?.Logo) {
              setArtistLogoUrl(jellyfinClient.getImageUrl(artistId, 'Logo'))
              setHasArtistLogo(true)
            } else {
              setHasArtistLogo(false)
              setArtistLogoUrl(null)
            }
          } catch (error) {
            if (!isMounted) return
            console.warn('Failed to load artist logo:', error)
            setHasArtistLogo(false)
            setArtistLogoUrl(null)
          }
        } else {
          setHasArtistLogo(false)
          setArtistLogoUrl(null)
        }
      } catch (error) {
        if (!isMounted) return
        console.error('Failed to load album data:', error)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadAlbumData()

    return () => {
      isMounted = false
    }
  }, [id])

  // Handle vinyl visibility with animation delay
  useEffect(() => {
    const isCurrentAlbumPlaying = currentTrack?.AlbumId === album?.Id && isPlaying
    const currentAlbumId = album?.Id || null
    const albumChanged = previousAlbumIdRef.current !== null && previousAlbumIdRef.current !== currentAlbumId
    const playbackStateChanged = previousPlayingRef.current !== isCurrentAlbumPlaying

    // Reset animation flag when playback state changes
    if (playbackStateChanged) {
      reverseAnimationStartedRef.current = false
    }

    // Update previous playing state at the end
    previousPlayingRef.current = isCurrentAlbumPlaying

    // Don't show vinyl if there's no album art
    if (!hasImage) {
      setShowVinyl(false)
      setHideAlbumArt(false)
      previousAlbumIdRef.current = currentAlbumId
      return
    }

    if (isCurrentAlbumPlaying) {

      // Show vinyl when current album starts playing
      // Only change state if album actually changed (not just track within same album)
      // or if not yet initialized, OR if vinyl is not currently showing
      if (albumChanged || !hasInitializedRef.current || !showVinyl) {
        setShowVinyl(true)
        setHideAlbumArt(false)
        hasInitializedRef.current = true
      }

      // Check if we should use split animation (screens >= 560px)
      shouldSplitRef.current = window.innerWidth >= 560

      // Set up animation delay (500ms) - no fade, just positioning
      if (!reverseAnimationStartedRef.current) { // Reuse this flag for animation setup
        reverseAnimationStartedRef.current = true // Prevent multiple setups
        setTimeout(() => {
          // Double-check that album is still playing
          const stillPlaying = currentTrack?.AlbumId === album?.Id && isPlaying
          if (stillPlaying) {
            setHideAlbumArt(true) // This will trigger the animation (split or full slide)
          }
        }, 500)
      }

      // Update previous album ID to track changes
      previousAlbumIdRef.current = currentAlbumId
    } else if (hasInitializedRef.current && showVinyl && !isCurrentAlbumPlaying) {
      // Only start reverse animation once - prevent multiple triggers
      if (!reverseAnimationStartedRef.current) {
        reverseAnimationStartedRef.current = true

        // Reverse animation: just slide back immediately
        setHideAlbumArt(false)
      }

      previousAlbumIdRef.current = currentAlbumId
    } else if (!hasInitializedRef.current) {
      // On initial load, if not playing, keep vinyl hidden (no animation)
      setShowVinyl(false)
      setHideAlbumArt(false)
      hasInitializedRef.current = true
      previousAlbumIdRef.current = currentAlbumId
    } else {
      // If vinyl wasn't showing, keep it hidden
      setShowVinyl(false)
      setHideAlbumArt(false)
      previousAlbumIdRef.current = currentAlbumId
    }
  }, [currentTrack?.AlbumId, album?.Id, isPlaying, showVinyl, hasImage, hideAlbumArt])


  // Handle window resize to update animation behavior
  useEffect(() => {
    const handleResize = () => {
      const isCurrentAlbumPlaying = currentTrack?.AlbumId === album?.Id && isPlaying

      if (isCurrentAlbumPlaying && showVinyl) {
        const newShouldSplit = window.innerWidth >= 560
        shouldSplitRef.current = newShouldSplit

        // If we're currently animated, adjust positioning immediately
        if (hideAlbumArt) {
          // Force a re-render by toggling hideAlbumArt briefly
          setHideAlbumArt(false)
          setTimeout(() => setHideAlbumArt(true), 10)
        }
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [currentTrack?.AlbumId, album?.Id, isPlaying, showVinyl, hideAlbumArt])

  // Handle rotation animation
  useEffect(() => {
    const isCurrentAlbumPlaying = currentTrack?.AlbumId === album?.Id && isPlaying

    if (isCurrentAlbumPlaying) {
      // Start rotation animation
      const animate = (currentTime: number) => {
        if (lastTimeRef.current === 0) {
          lastTimeRef.current = currentTime
        }

        const deltaTime = currentTime - lastTimeRef.current
        const rotationSpeed = 360 / 10000 // 360 degrees per 10 seconds (10s = 10000ms)
        rotationRef.current = (rotationRef.current + rotationSpeed * deltaTime) % 360
        setRotationAngle(rotationRef.current)
        lastTimeRef.current = currentTime

        animationFrameRef.current = requestAnimationFrame(animate)
      }

      lastTimeRef.current = 0
      animationFrameRef.current = requestAnimationFrame(animate)
    } else {
      // Stop rotation but keep current angle
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      lastTimeRef.current = 0
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [currentTrack?.AlbumId, album?.Id, isPlaying])

  const getArtistIdFromTracks = (tracksList: BaseItemDto[], currentAlbum: BaseItemDto | null): string | null => {
    if (tracksList.length > 0 && tracksList[0].ArtistItems && tracksList[0].ArtistItems.length > 0) {
      return tracksList[0].ArtistItems[0].Id
    }
    if (currentAlbum?.ArtistItems && currentAlbum.ArtistItems.length > 0) {
      return currentAlbum.ArtistItems[0].Id
    }
    return null
  }

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playAlbum(tracks)
    }
  }

  const getAlbumYear = (): string | null => {
    if (tracks.length > 0) {
      const firstTrack = tracks[0]
      if (firstTrack.ProductionYear && firstTrack.ProductionYear > 0) {
        return firstTrack.ProductionYear.toString()
      }
      if (firstTrack.PremiereDate) {
        const year = new Date(firstTrack.PremiereDate).getFullYear()
        if (year > 0) {
          return year.toString()
        }
      }
    }
    return null
  }

  const getArtistId = (): string | null => {
    if (tracks.length > 0 && tracks[0].ArtistItems && tracks[0].ArtistItems.length > 0) {
      return tracks[0].ArtistItems[0].Id
    }
    if (album?.ArtistItems && album.ArtistItems.length > 0) {
      return album.ArtistItems[0].Id
    }
    return null
  }

  const getArtistName = (): string | null => {
    return album.AlbumArtist || album.ArtistItems?.[0]?.Name || null
  }

  const handleArtistClick = () => {
    const artistId = getArtistId()
    if (artistId) {
      navigate(`/artist/${artistId}`)
    }
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

  if (!album || tracks.length === 0) {
    return (
      <div className="pb-20">
        <div className="flex items-center justify-center h-screen text-gray-400">
          <p>Album not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20" style={{ overflowX: 'hidden', maxWidth: '100vw', width: '100%' }}>
      {/* Make status bar transparent by covering Layout's black overlay */}
      <div
        className="fixed top-0 left-0 right-0 z-[55] pointer-events-none"
        style={{
          height: `env(safe-area-inset-top)`,
          top: `var(--header-offset, 0px)`,
          background: 'transparent'
        }}
      />
      {/* Gradient overlay from status bar to header end - below header in z-index */}
      <div
        className="fixed top-0 left-0 right-0 z-10 pointer-events-none"
        style={{
          height: `calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 4rem)`,
          top: `var(--header-offset, 0px)`,
          background: `linear-gradient(to bottom,
            #000000 0%,
            #000000 calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 0.5rem),
            rgba(0, 0, 0, 0.95) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 1rem),
            rgba(0, 0, 0, 0.85) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 1.5rem),
            rgba(0, 0, 0, 0.7) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 2rem),
            rgba(0, 0, 0, 0.5) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 2.5rem),
            rgba(0, 0, 0, 0.3) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 3rem),
            rgba(0, 0, 0, 0.15) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 3.5rem),
            rgba(0, 0, 0, 0) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 4rem)
          )`
        }}
      />
      <div
        className={`fixed top-0 left-0 right-0 z-20 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
      >
        <div className="max-w-[768px] mx-auto relative">
          <div className="flex items-center justify-between gap-4 p-4 relative z-10">
            <button
              onClick={() => navigate(-1)}
              className="text-white hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            {album && (
              <button
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setAlbumContextMenuMode('desktop')
                  setAlbumContextMenuPosition({
                    x: rect.left + rect.width / 2,
                    y: rect.bottom + 5
                  })
                  setAlbumContextMenuOpen(true)
                }}
                className="text-white hover:text-zinc-300 transition-colors"
              >
                <MoreHorizontal className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ paddingTop: `calc(5rem + 12px - 48px)` }}>
        <div className={`mb-6 px-4 ${!hasImage ? 'pt-4' : 'pt-4'}`} style={{ overflow: 'visible' }}>
          {hasImage && (
            <div className="flex justify-center mb-6 relative" style={{ overflowX: 'visible', overflowY: 'visible', paddingLeft: '16px', paddingRight: '16px' }}>
              <div ref={albumArtRef} className="w-64 h-64 relative" style={{ overflow: 'visible' }}>
                {/* Vinyl Record - always present in center, hidden behind album art */}
                <div
                  className="absolute inset-0 rounded-full overflow-hidden"
                  style={{
                    opacity: showVinyl ? 1 : 0,
                    zIndex: 1,
                    transform: (currentTrack?.AlbumId === album.Id && isPlaying && shouldSplitRef.current)
                      ? 'translateX(calc(50% + 8px))'
                      : 'translateX(0)',
                    transition: 'transform 500ms ease-in-out, opacity 300ms ease-in-out',
                  }}
                >
                  <div
                    className="w-full h-full"
                    style={{
                      transformOrigin: 'center center',
                      transform: `rotate(${rotationAngle}deg)`,
                    }}
                  >
                    <img
                      src="/assets/vinyl.png"
                      alt="Vinyl Record"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        console.error('Failed to load vinyl image')
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                    {/* Zinc 400 circle covering white center */}
                    <div
                      className="absolute top-1/2 left-1/2 rounded-full"
                      style={{
                        width: '52%',
                        height: '52%',
                        backgroundColor: '#a1a1aa', // zinc-400
                        transform: 'translate(-50%, -50%)',
                        transformOrigin: 'center center',
                      }}
                    />
                    {/* Artist Logo or Album Art Overlay - centered */}
                    {hasArtistLogo && artistLogoUrl ? (
                      <div
                        className="absolute top-1/2 left-1/2 rounded-full overflow-hidden flex items-center justify-center"
                        style={{
                          width: '47%',
                          height: '47%',
                          transform: 'translate(-50%, -50%)',
                          transformOrigin: 'center center',
                        }}
                      >
                        <img
                          src={artistLogoUrl}
                          alt="Artist Logo"
                          className="w-full h-full object-contain"
                          onError={() => {
                            setHasArtistLogo(false)
                            setArtistLogoUrl(null)
                          }}
                        />
                      </div>
                    ) : hasImage ? (
                      <div
                        className="absolute top-1/2 left-1/2 rounded-full overflow-hidden flex items-center justify-center"
                        style={{
                          width: '52%',
                          height: '52%',
                          transform: 'translate(-50%, -50%)',
                          transformOrigin: 'center center',
                        }}
                      >
                        <img
                          src={jellyfinClient.getAlbumArtUrl(album.Id)}
                          alt={album.Name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Album Art */}
                <div
                  className="absolute inset-0 rounded overflow-hidden bg-zinc-900 transition-all duration-500"
                  style={{
                    transform:
                      currentTrack?.AlbumId === album.Id && isPlaying
                        ? shouldSplitRef.current
                          ? 'translateX(calc(-50% - 8px))'  // Split: move halfway left + 8px
                          : 'translateX(calc(-100% - 24px))'  // Small screens: move completely left
                        : hideAlbumArt
                          ? shouldSplitRef.current
                            ? 'translateX(calc(-50% - 8px))'  // Split: move halfway left + 8px
                            : 'translateX(calc(-100% - 24px))'  // Small screens: move completely left
                          : 'translateX(0)',  // Center position
                    opacity: 1,  // Always fully opaque - no fading
                    transitionProperty: 'transform',
                    transitionDuration: '500ms',
                    transitionTimingFunction: 'ease-in-out',
                    zIndex: 10,
                  }}
                >
                  <Image
                    src={jellyfinClient.getAlbumArtUrl(album.Id)}
                    alt={album.Name}
                    className="w-full h-full object-cover"
                    showOutline={true}
                    rounded="rounded"
                    onError={() => setHasImage(false)}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="w-full">
            <h2 className="text-4xl md:text-5xl font-bold mb-0.5 text-left break-words">{album.Name}</h2>
            <div className="flex items-center justify-between gap-4 mt-2">
              <div className="text-gray-400 flex items-center gap-1.5">
                {getArtistName() && (
                  <>
                    <button
                      onClick={handleArtistClick}
                      className={`hover:text-white transition-colors ${getArtistId() ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      {getArtistName()}
                    </button>
                    {getAlbumYear() && <span>•</span>}
                  </>
                )}
                {getAlbumYear() && (
                  <button
                    onClick={() => navigate(`/albums?year=${getAlbumYear()}`)}
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    {getAlbumYear()}
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  if (currentTrack?.AlbumId === album.Id && isPlaying) {
                    pause()
                  } else if (currentTrack?.AlbumId === album.Id && !isPlaying) {
                    play()
                  } else {
                    handlePlayAll()
                  }
                }}
                className="bg-white/10 hover:bg-white/20 text-white font-semibold py-1.5 px-3 rounded-full transition-all hover:scale-105 flex items-center gap-1.5 backdrop-blur-sm border border-white/20 flex-shrink-0"
              >
                {currentTrack?.AlbumId === album.Id && isPlaying ? (
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

        {/* Bio section - always collapsed by default with chevron, regardless of length */}
        {album.Overview && (
          <div className="mb-6 px-4">
            <div className="text-white relative">
              {!bioExpanded && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBioExpanded(true)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-sm text-gray-300 leading-relaxed line-clamp-2">
                      {album.Overview}
                    </p>
                  </button>
                  <button
                    onClick={() => setBioExpanded(true)}
                    className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              )}

              {bioExpanded && (
                <div>
                  <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                    {album.Overview}
                  </p>
                  <button
                    onClick={() => setBioExpanded(false)}
                    className="mt-2 flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors ml-auto"
                  >
                    Show less
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <div className="space-y-0">
            {(() => {
              // Group tracks by disc number
              const tracksByDisc = new Map<number, BaseItemDto[]>()
              tracks.forEach(track => {
                const discNumber = track.ParentIndexNumber ?? 1
                if (!tracksByDisc.has(discNumber)) {
                  tracksByDisc.set(discNumber, [])
                }
                tracksByDisc.get(discNumber)!.push(track)
              })

              // Check if we have multiple discs
              const hasMultipleDiscs = tracksByDisc.size > 1

              // Sort disc numbers
              const sortedDiscNumbers = Array.from(tracksByDisc.keys()).sort((a, b) => a - b)

              return sortedDiscNumbers.map(discNumber => {
                const discTracks = tracksByDisc.get(discNumber)!
                return (
                  <div key={discNumber}>
                    {hasMultipleDiscs && (
                      <div className={`px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider ${discNumber > 1 ? 'pt-4' : ''}`}>
                        Disc {discNumber}
                      </div>
                    )}
                    {discTracks.map(track => (
                      <AlbumTrackItem
                        key={track.Id}
                        track={track}
                        trackNumber={track.IndexNumber ?? null}
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
                )
              })
            })()}
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
        item={album}
        itemType="album"
        isOpen={albumContextMenuOpen}
        onClose={() => {
          setAlbumContextMenuOpen(false)
        }}
        mode={albumContextMenuMode}
        position={albumContextMenuPosition || undefined}
      />
    </div>
  )
}
