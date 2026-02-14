import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { useStatsStore } from '../../stores/statsStore'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import { useLastPlayedTrack } from '../../hooks/useLastPlayedTrack'
import { jellyfinClient } from '../../api/jellyfin'
import Image from '../shared/Image'
import PlayerModal from './PlayerModal'
import VolumeControl from '../layout/VolumeControl'
import { useState } from 'react'
import { Play, Pause, SkipForward, Shuffle, SkipBack, Repeat, Repeat1, ListVideo } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { isIOS } from '../../utils/formatting'

export default function PlayerBar() {
  const {
    songs,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    audioElement,
    setAudioElement,
    togglePlayPause,
    next,
    setCurrentTime,
    setDuration,
    playTrack,
    repeat,
    shuffle,
    toggleShuffle,
    toggleRepeat,
    previous,
    seek,
    skipToTrack,
    isQueueSidebarOpen,
    toggleQueueSidebar,
    setNextAudioElement,
    preBufferNextTrack,
  } = usePlayerStore()

  const currentTrack = useCurrentTrack()
  const lastPlayedTrack = useLastPlayedTrack()

  const [showModal, setShowModal] = useState(false)
  const [isModalClosing, setIsModalClosing] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [showVolumePopover, setShowVolumePopover] = useState(false)
  const [volumePopoverPosition, setVolumePopoverPosition] = useState<{ top: number; left: number } | null>(null)
  const [volumeButtonElement, setVolumeButtonElement] = useState<HTMLElement | null>(null)
  const [mobileVolumeButtonElement, setMobileVolumeButtonElement] = useState<HTMLElement | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const nextAudioRef = useRef<HTMLAudioElement | null>(null)
  const closeModalRef = useRef<(() => void) | null>(null)
  const trackPlayedTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const preemptiveAdvanceRef = useRef<boolean>(false) // Track if we already advanced preemptively (iOS background fix)
  const location = useLocation()
  const touchStartX = useRef<number | null>(null)
  const touchStartTime = useRef<number | null>(null)
  const playerBarRef = useRef<HTMLDivElement>(null)

  // Close modal when navigating to a different route
  useEffect(() => {
    if (showModal) {
      setIsModalClosing(true)
      setTimeout(() => {
        setShowModal(false)
        setIsModalClosing(false)
      }, 300) // Match animation duration
    }
  }, [location.pathname])

  // Ensure modal is closed on initial mount to prevent flash from browser cache
  useEffect(() => {
    setShowModal(false)
    setIsModalClosing(false)
  }, [])

  // Listen for close modal event from TabBar
  useEffect(() => {
    const handleCloseModalEvent = () => {
      if (showModal && closeModalRef.current) {
        // Trigger the modal's internal close function to ensure animation
        closeModalRef.current()
      }
    }

    window.addEventListener('closePlayerModal', handleCloseModalEvent)
    return () => {
      window.removeEventListener('closePlayerModal', handleCloseModalEvent)
    }
  }, [showModal])

  const handleCloseModal = () => {
    setIsModalClosing(true)
    setTimeout(() => {
      setShowModal(false)
      setIsModalClosing(false)
    }, 300) // Match animation duration
  }

  // Create both audio elements once on mount
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio()
      audioRef.current.setAttribute('playsinline', 'true')
      audioRef.current.setAttribute('preload', 'auto')
      setAudioElement(audioRef.current)
    }
    if (!nextAudioRef.current) {
      nextAudioRef.current = new Audio()
      nextAudioRef.current.setAttribute('playsinline', 'true')
      nextAudioRef.current.setAttribute('preload', 'auto')
      setNextAudioElement(nextAudioRef.current)
    }
    const vol = usePlayerStore.getState().volume
    if (audioRef.current) audioRef.current.volume = vol
    if (nextAudioRef.current) nextAudioRef.current.volume = vol
  }, [setAudioElement, setNextAudioElement])

  // Reset preemptive advance flag on seek to prevent auto-advance when user
  // seeks near end of track
  useEffect(() => {
    const handleSeek = () => {
      preemptiveAdvanceRef.current = false
    }
    window.addEventListener('playerSeek', handleSeek)
    return () => window.removeEventListener('playerSeek', handleSeek)
  }, [])

  // iOS PWA background recovery: detect when the app returns from background
  // and the state thinks it's playing but audio is actually paused (common when
  // iOS suspends JS and .play() silently fails). Retry playback to recover.
  useEffect(() => {
    if (!isIOS()) return

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return

      // Small delay to let iOS settle after waking
      setTimeout(() => {
        const state = usePlayerStore.getState()
        const audio = state.audioElement

        if (!audio || !state.isPlaying) return

        // State says playing but audio is actually paused — desync detected
        if (audio.paused) {
          audio.play().catch(() => {
            // If retry also fails, sync the state to match reality
            usePlayerStore.setState({ isPlaying: false })
          })
        }
      }, 300)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Attach event listeners to the ACTIVE audio element from the store.
  // This re-runs when audioElement changes (e.g. after a gapless swap).
  useEffect(() => {
    if (!audioElement) return

    // Track whether this element is still the active one. When swapToPreBuffered()
    // pauses the old element, stray pause/ended events should be ignored.
    let isActive = true

    // Reset preemptive advance flag for the new active element (e.g. after gapless swap).
    // Without this, the flag stays true from the previous track's preemptive advance
    // and the new track's preemptive advance would never trigger.
    preemptiveAdvanceRef.current = false

    const handleTimeUpdate = () => {
      if (!isActive) return
      setCurrentTime(audioElement.currentTime)

      const remaining = audioElement.duration - audioElement.currentTime

      // Trigger pre-buffering of next track when ~15 seconds remain
      if (audioElement.duration > 0 && remaining <= 15 && remaining > 0) {
        preBufferNextTrack()
      }

      // iOS PWA background playback fix: preemptively advance to next track
      // when ~1 second remains. iOS suspends JS when app is backgrounded,
      // so the 'ended' event handler may not fire.
      if (
        !preemptiveAdvanceRef.current &&
        audioElement.duration > 0 &&
        remaining <= 1 &&
        remaining > 0
      ) {
        preemptiveAdvanceRef.current = true

        const state = usePlayerStore.getState()
        const track = state.currentIndex >= 0 && state.currentIndex < state.songs.length
          ? state.songs[state.currentIndex]
          : null

        // Handle repeat 'one' mode
        if (state.repeat === 'one') {
          if (track && !state.hasRecordedCurrentTrackStats) {
            const actualDurationMs = audioElement.currentTime * 1000
            useStatsStore.getState().recordPlay(track, actualDurationMs)
          }
          usePlayerStore.setState({ hasRecordedCurrentTrackStats: false })
          audioElement.currentTime = 0
          preemptiveAdvanceRef.current = false
          return
        }

        // Report playback before advancing
        if (track) {
          jellyfinClient.markItemAsPlayed(track.Id).catch(() => { })
          if (trackPlayedTimeoutRef.current) {
            clearTimeout(trackPlayedTimeoutRef.current)
          }
          const trackId = track.Id
          trackPlayedTimeoutRef.current = setTimeout(() => {
            window.dispatchEvent(new CustomEvent('trackPlayed', { detail: { trackId } }))
            trackPlayedTimeoutRef.current = null
          }, 4000)
        }

        next()
      }
    }

    const handleLoadedMetadata = () => {
      if (!isActive) return
      setDuration(audioElement.duration)
      preemptiveAdvanceRef.current = false
    }

    const handleEnded = async () => {
      if (!isActive) return
      if (preemptiveAdvanceRef.current) {
        preemptiveAdvanceRef.current = false
        return
      }

      // Report playback when track ends
      const state = usePlayerStore.getState()
      const track = state.currentIndex >= 0 && state.currentIndex < state.songs.length
        ? state.songs[state.currentIndex]
        : null

      if (track) {
        try {
          await jellyfinClient.markItemAsPlayed(track.Id)
          if (trackPlayedTimeoutRef.current) {
            clearTimeout(trackPlayedTimeoutRef.current)
          }
          const trackId = track.Id
          trackPlayedTimeoutRef.current = setTimeout(() => {
            window.dispatchEvent(new CustomEvent('trackPlayed', { detail: { trackId } }))
            trackPlayedTimeoutRef.current = null
          }, 4000)
        } catch (error) {
          // Error already logged in markItemAsPlayed
        }
      }

      // Handle repeat mode 'one'
      const currentRepeat = state.repeat
      if (currentRepeat === 'one') {
        const hasRecorded = state.hasRecordedCurrentTrackStats
        if (track && !hasRecorded) {
          const actualDurationMs = audioElement.currentTime * 1000
          useStatsStore.getState().recordPlay(track, actualDurationMs)
        }
        usePlayerStore.setState({ hasRecordedCurrentTrackStats: false })
        audioElement.currentTime = 0
        audioElement.play()
        return
      }

      next()
    }

    const handlePlay = () => {
      if (!isActive) return
      // Ignore events from a stale element (e.g. old element during gapless swap).
      // The isActive flag only resets on effect cleanup (next render), but pause/play
      // events fire synchronously before that.
      if (usePlayerStore.getState().audioElement !== audioElement) return
      usePlayerStore.setState({ isPlaying: true })
    }

    const handlePause = () => {
      if (!isActive) return
      if (usePlayerStore.getState().audioElement !== audioElement) return
      usePlayerStore.setState({ isPlaying: false })
    }

    audioElement.addEventListener('timeupdate', handleTimeUpdate)
    audioElement.addEventListener('loadedmetadata', handleLoadedMetadata)
    audioElement.addEventListener('ended', handleEnded)
    audioElement.addEventListener('play', handlePlay)
    audioElement.addEventListener('pause', handlePause)

    return () => {
      isActive = false
      audioElement.removeEventListener('timeupdate', handleTimeUpdate)
      audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audioElement.removeEventListener('ended', handleEnded)
      audioElement.removeEventListener('play', handlePlay)
      audioElement.removeEventListener('pause', handlePause)
      if (trackPlayedTimeoutRef.current) {
        clearTimeout(trackPlayedTimeoutRef.current)
        trackPlayedTimeoutRef.current = null
      }
    }
  }, [audioElement, setCurrentTime, setDuration, next, preBufferNextTrack])

  // Set up Media Session metadata and action handlers (iOS PWA fix)
  // This runs in PlayerBar which is always mounted, ensuring Media Session works
  // even when PlayerModal is closed
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.Name || 'Unknown',
        artist: currentTrack.ArtistItems?.[0]?.Name || currentTrack.AlbumArtist || '',
        album: currentTrack.Album || '',
        artwork: [
          {
            src: jellyfinClient.getAlbumArtUrl(currentTrack.AlbumId || currentTrack.Id, 512),
            sizes: '512x512',
            type: 'image/jpeg',
          },
        ],
      })

      navigator.mediaSession.setActionHandler('play', togglePlayPause)
      navigator.mediaSession.setActionHandler('pause', togglePlayPause)
      navigator.mediaSession.setActionHandler('previoustrack', previous)
      navigator.mediaSession.setActionHandler('nexttrack', next)
    }
  }, [currentTrack, togglePlayPause, next, previous])

  // Update Media Session position state to keep notification seek bar in sync (iOS PWA fix)
  // This runs in PlayerBar which is always mounted, unlike PlayerModal
  useEffect(() => {
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: duration,
          playbackRate: 1,
          position: Math.min(currentTime, duration), // Clamp to prevent errors
        })
      } catch (e) {
        // setPositionState can throw if values are invalid
      }
    }
  }, [currentTime, duration])

  // Initialize playback if we have a current track but audio isn't playing
  useEffect(() => {
    if (currentTrack && !isPlaying && audioElement) {
      // Ensure audio source is set for the current track
      const baseUrl = jellyfinClient.serverBaseUrl
      const audioUrl = baseUrl
        ? `${baseUrl}/Audio/${currentTrack.Id}/stream?static=true`
        : ''
      if (audioElement.src !== audioUrl) {
        audioElement.src = audioUrl
        audioElement.load()
      }
    }
  }, [currentTrack, isPlaying, audioElement])

  // Show player bar if there's a current track, last played track, or songs in queue
  const firstQueueTrack = songs.length > 0 ? songs[0] : null
  const displayTrack = currentTrack || lastPlayedTrack || firstQueueTrack

  // Reset image error when track changes
  useEffect(() => {
    setImageError(false)
  }, [displayTrack?.Id])

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // Check if there's a next song available
  const hasNext = songs.length > 0 && (
    currentIndex < 0 || // No current track, but queue has songs
    currentIndex < songs.length - 1 || // Not at the end of queue
    repeat !== 'off' // Repeat is enabled
  )

  // Previous should be active if there are songs before current index or repeat uses wrap-around
  const hasPrevious = currentIndex > 0 || (repeat === 'all' && songs.length > 0)

  // Handle volume popover opening
  const handleOpenVolumePopover = () => {
    // Determine which layout is active based on screen size
    const isMobile = window.innerWidth < 768
    const element = isMobile ? mobileVolumeButtonElement : volumeButtonElement

    if (element) {
      const rect = element.getBoundingClientRect()
      setVolumePopoverPosition({
        top: rect.top,
        left: rect.left + rect.width / 2
      })
      setShowVolumePopover(true)
    }
  }

  // Swipe gesture handlers for next/previous
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartTime.current = Date.now()
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartTime.current === null) {
      touchStartX.current = null
      touchStartTime.current = null
      return
    }

    const touchEndX = e.changedTouches[0].clientX
    const deltaX = touchEndX - touchStartX.current
    const deltaTime = Date.now() - touchStartTime.current
    const swipeThreshold = 50 // Minimum pixels to trigger swipe
    const velocityThreshold = 0.3 // Minimum velocity (px/ms) to trigger swipe

    const velocity = Math.abs(deltaX) / deltaTime

    // Swipe right = previous track
    if (deltaX > swipeThreshold || (deltaX > 30 && velocity > velocityThreshold)) {
      if (hasPrevious) {
        previous()
      }
    }
    // Swipe left = next track
    else if (deltaX < -swipeThreshold || (deltaX < -30 && velocity > velocityThreshold)) {
      if (hasNext) {
        next()
      }
    }

    touchStartX.current = null
    touchStartTime.current = null
  }

  // Always show the bar if there's a track to display (current or last played)
  if (!displayTrack) {
    return null
  }

  return (
    <>
      <div
        ref={playerBarRef}
        className="fixed left-0 right-0 bg-zinc-900 border-t border-zinc-800 z-40 cursor-pointer bottom-[calc(4rem-8px)] lg:bottom-0"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}
        onClick={() => {
          setShowModal(true)
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Seek bar at top for desktop - positioned absolutely to not affect layout */}
        {displayTrack && (
          <div
            className="hidden lg:block absolute left-0 right-0 cursor-pointer group"
            style={{ top: '-10px', height: '24px' }}
            onClick={(e) => {
              e.stopPropagation() // Prevent opening the modal
              if (!duration) return
              const rect = e.currentTarget.getBoundingClientRect()
              const percent = (e.clientX - rect.left) / rect.width
              seek(Math.max(0, Math.min(1, percent)) * duration)
            }}
            onTouchStart={(e) => {
              e.stopPropagation() // Prevent opening the modal
              if (!duration) return
              const touch = e.touches[0]
              const rect = e.currentTarget.getBoundingClientRect()
              const percent = (touch.clientX - rect.left) / rect.width
              seek(Math.max(0, Math.min(1, percent)) * duration)
            }}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={duration || 100}
            aria-valuenow={currentTime}
          >
            {/* Visual bar - positioned at bottom of touch target to align with player bar top edge */}
            <div className="absolute left-0 right-0 bottom-[10px] h-1 bg-white/10 group-hover:bg-white/20 transition-colors duration-200">
              <div
                className="h-full bg-[var(--accent-color)] transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Desktop layout: absolute positioning for perfect centering */}
        <div className="hidden md:block md:relative md:px-4 md:pt-3 md:pb-1 lg:pb-3">
          {/* Left: Album art + song info with max width to prevent overlap */}
          <div className="flex items-center gap-3 min-w-0 max-w-[37%]">
            {!imageError && (
              <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-900">
                <Image
                  key={currentTrack?.Id || displayTrack.Id}
                  src={jellyfinClient.getAlbumArtUrl(
                    (currentTrack || displayTrack).AlbumId || (currentTrack || displayTrack).Id,
                    96
                  )}
                  alt={(currentTrack || displayTrack).Name}
                  className="w-full h-full object-cover"
                  showOutline={true}
                  rounded="rounded-sm"
                  onError={() => setImageError(true)}
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white truncate">
                {(currentTrack || displayTrack).Name}
              </div>
              <div className="text-xs text-gray-400 truncate flex items-center gap-1.5 min-w-0">
                <span className="truncate">{(currentTrack || displayTrack).ArtistItems?.[0]?.Name || (currentTrack || displayTrack).AlbumArtist || 'Unknown Artist'}</span>
                <span className="flex-shrink-0">•</span>
                <span className="tabular-nums flex-shrink-0">{formatTime(currentTime)}/{formatTime(duration)}</span>
              </div>
            </div>
          </div>

          {/* Absolutely centered: Player controls on Desktop, Right aligned on Tablet */}
          <div className="absolute top-1/2 md:top-[calc(50%+4px)] lg:top-1/2 -translate-y-1/2 md:right-16 md:left-auto md:translate-x-0 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleShuffle()
              }}
              aria-label={shuffle ? 'Disable shuffle' : 'Enable shuffle'}
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${shuffle ? 'text-[var(--accent-color)]' : 'text-gray-400 hover:text-zinc-300'
                }`}
            >
              <Shuffle className="w-5 h-5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation()
                if (hasPrevious) {
                  previous()
                }
              }}
              disabled={!hasPrevious}
              aria-label="Previous track"
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${hasPrevious
                ? 'text-white hover:bg-zinc-800'
                : 'text-gray-600 cursor-not-allowed'
                }`}
            >
              <SkipBack className="w-5 h-5" />
            </button>

            {/* Play button with extra margin */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (currentTrack) {
                  togglePlayPause()
                } else if (songs.length > 0) {
                  // Start playing from the beginning of the queue
                  skipToTrack(0)
                } else if (displayTrack) {
                  // Resume last played track
                  playTrack(displayTrack)
                }
              }}
              aria-label={isPlaying && currentTrack ? 'Pause' : 'Play'}
              className="w-10 h-10 mx-2 flex items-center justify-center rounded-full transition-colors text-white bg-[var(--accent-color)] hover:opacity-90"
            >
              {isPlaying && currentTrack ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation()
                if (hasNext) {
                  next()
                }
              }}
              disabled={!hasNext}
              aria-label="Next track"
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${hasNext
                ? 'text-white hover:bg-zinc-800'
                : 'text-gray-600 cursor-not-allowed'
                }`}
            >
              <SkipForward className="w-5 h-5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleRepeat()
              }}
              aria-label={repeat === 'off' ? 'Enable repeat' : repeat === 'all' ? 'Repeat one' : 'Disable repeat'}
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${repeat !== 'off' ? 'text-[var(--accent-color)]' : 'text-gray-400 hover:text-zinc-300'
                }`}
            >
              {repeat === 'one' ? (
                <Repeat1 className="w-5 h-5" />
              ) : (
                <Repeat className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Right: Volume control and Queue */}
          <div className="absolute right-4 top-1/2 md:top-[calc(50%+4px)] lg:top-1/2 -translate-y-1/2 flex items-center gap-4">
            {/* Queue Button for Desktop > 1280px */}
            <div className="hidden xl:block">
              {!isQueueSidebarOpen && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleQueueSidebar()
                  }}
                  className="text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors flex items-center justify-center w-10 h-10 rounded-full"
                  title="Open Queue"
                  aria-label="Open queue"
                >
                  <ListVideo className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="hidden lg:block" onClick={(e) => e.stopPropagation()}>
              {!isIOS() && <VolumeControl variant="horizontal" />}
            </div>
            <div className="hidden md:block lg:hidden">
              {!isIOS() && (
                <VolumeControl
                  variant="compact"
                  onOpenPopover={handleOpenVolumePopover}
                  onRef={setVolumeButtonElement}
                  className="w-10 h-10 flex items-center justify-center text-white hover:text-zinc-300 hover:bg-zinc-800 rounded-full transition-colors"
                />
              )}
            </div>
          </div>
        </div>

        {/* Mobile layout */}
        <div className="flex items-center gap-3 pt-3 pb-1 pr-3 pl-4 md:hidden">
          {!imageError && (
            <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-900">
              <Image
                key={currentTrack?.Id || displayTrack.Id}
                src={jellyfinClient.getAlbumArtUrl(
                  (currentTrack || displayTrack).AlbumId || (currentTrack || displayTrack).Id,
                  96
                )}
                alt={(currentTrack || displayTrack).Name}
                className="w-full h-full object-cover"
                showOutline={true}
                rounded="rounded-sm"
                onError={() => setImageError(true)}
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">
              {(currentTrack || displayTrack).Name}
            </div>
            <div className="text-xs text-gray-400 truncate">
              {(currentTrack || displayTrack).ArtistItems?.[0]?.Name || (currentTrack || displayTrack).AlbumArtist || 'Unknown Artist'}
            </div>
          </div>
          {/* Mobile layout: Volume + Play/Pause buttons */}
          <div className="flex items-center gap-2">
            {!isIOS() && (
              <VolumeControl
                variant="compact"
                onOpenPopover={handleOpenVolumePopover}
                onRef={setMobileVolumeButtonElement}
                className="text-white hover:text-zinc-300 transition-colors"
              />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (currentTrack) {
                  togglePlayPause()
                } else if (songs.length > 0) {
                  // Start playing from the beginning of the queue
                  skipToTrack(0)
                } else if (displayTrack) {
                  // Resume last played track
                  playTrack(displayTrack)
                }
              }}
              aria-label={isPlaying && currentTrack ? 'Pause' : 'Play'}
              className="w-10 h-10 flex items-center justify-center text-white hover:bg-zinc-800 rounded-full transition-colors"
            >
              {isPlaying && currentTrack ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
        {/* Mobile seek bar - keep at bottom, 24px touch target with 4px visual bar centered */}
        <div className="lg:hidden" style={{ marginBottom: '-10px' }}>
          {displayTrack && (
            <div
              className="relative cursor-pointer group flex items-center"
              style={{ height: '24px' }}
              onClick={(e) => {
                e.stopPropagation() // Prevent opening the modal
                if (!duration) return
                const rect = e.currentTarget.getBoundingClientRect()
                const percent = (e.clientX - rect.left) / rect.width
                seek(Math.max(0, Math.min(1, percent)) * duration)
              }}
              onTouchStart={(e) => {
                e.stopPropagation() // Prevent opening the modal
                if (!duration) return
                const touch = e.touches[0]
                const rect = e.currentTarget.getBoundingClientRect()
                const percent = (touch.clientX - rect.left) / rect.width
                seek(Math.max(0, Math.min(1, percent)) * duration)
              }}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={duration || 100}
              aria-valuenow={currentTime}
            >
              {/* Visual bar - centered within touch target */}
              <div className="absolute left-0 right-0 h-1 bg-white/10 group-hover:bg-white/20 transition-colors duration-200">
                <div
                  className="h-full bg-[var(--accent-color)] transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      {showModal && (
        <PlayerModal
          onClose={handleCloseModal}
          onClosingStart={() => setIsModalClosing(true)}
          closeRef={closeModalRef}
        />
      )}
      {showVolumePopover && volumePopoverPosition && !isIOS() && (
        <VolumeControl
          variant="vertical"
          onClose={() => setShowVolumePopover(false)}
          popoverPosition={volumePopoverPosition}
        />
      )}
    </>
  )
}

