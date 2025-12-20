import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
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
  const closeModalRef = useRef<(() => void) | null>(null)
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

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio()
      // Enable background playback for iOS
      audioRef.current.setAttribute('playsinline', 'true')
      audioRef.current.setAttribute('preload', 'auto')
      setAudioElement(audioRef.current)
    }

    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
    }

    const handleEnded = async () => {
      // Report playback when track ends
      if (currentTrack) {
        try {
          await jellyfinClient.markItemAsPlayed(currentTrack.Id)
          // Trigger a custom event to notify RecentlyPlayed to refresh after a short delay
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('trackPlayed', { detail: { trackId: currentTrack.Id } }))
          }, 4000)
        } catch (error) {
          // Error already logged in markItemAsPlayed
        }
      }

      // Handle repeat mode 'one' - replay the current track
      if (repeat === 'one' && audio) {
        audio.currentTime = 0
        audio.play()
        return
      }

      next()
    }

    const handlePlay = () => {
      usePlayerStore.setState({ isPlaying: true })
    }

    const handlePause = () => {
      usePlayerStore.setState({ isPlaying: false })
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
    }
  }, [setAudioElement, setCurrentTime, setDuration, next])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = usePlayerStore.getState().volume
    }
  }, [])

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

  // Ensure audio source is set when audio element becomes available and we have a currentTrack
  useEffect(() => {
    if (audioElement && currentTrack && !isPlaying) {
      // Check if audio source needs to be set
      const baseUrl = jellyfinClient.serverBaseUrl
      const audioUrl = baseUrl
        ? `${baseUrl}/Audio/${currentTrack.Id}/stream?static=true`
        : ''
      if (audioElement.src !== audioUrl) {
        audioElement.src = audioUrl
        audioElement.load()
      }
    }
  }, [audioElement, currentTrack, isPlaying])

  // Show player bar if there's a current track, last played track, or songs in queue
  const firstQueueTrack = songs.length > 0 ? songs[0] : null
  const displayTrack = currentTrack || lastPlayedTrack || firstQueueTrack

  // Reset image error when track changes
  useEffect(() => {
    setImageError(false)
  }, [displayTrack?.Id])

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  // Check if there's a next song available
  const hasNext = songs.length > 0 && (
    currentIndex < 0 || // No current track, but queue has songs
    currentIndex < songs.length - 1 || // Not at the end of queue
    repeat === 'all' // Repeat all is enabled
  )

  // Previous should be active if there are songs before current index
  const hasPrevious = currentIndex > 0

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
            <div className="absolute left-0 right-0 bottom-[10px] h-1 bg-zinc-800 group-hover:bg-zinc-600 transition-colors duration-200">
              <div
                className="h-full bg-[var(--accent-color)] transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Desktop layout: absolute positioning for perfect centering */}
        <div className="hidden md:block md:relative md:px-4 md:py-3">
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
              <div className="text-xs text-gray-400 truncate">
                {(currentTrack || displayTrack).ArtistItems?.[0]?.Name || (currentTrack || displayTrack).AlbumArtist || 'Unknown Artist'}
              </div>
            </div>
          </div>

          {/* Absolutely centered: Player controls on Desktop, Right aligned on Tablet */}
          <div className="absolute top-1/2 -translate-y-1/2 md:right-16 md:left-auto md:translate-x-0 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 flex items-center gap-2">
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
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-4">
            {/* Queue Button for Desktop > 1280px */}
            <div className="hidden xl:block">
              {!isQueueSidebarOpen && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleQueueSidebar()
                  }}
                  className="text-gray-400 hover:text-white transition-colors flex items-center justify-center w-10 h-10"
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
                  className="w-10 h-10 flex items-center justify-center text-white hover:text-zinc-300 transition-colors"
                />
              )}
            </div>
          </div>
        </div>

        {/* Mobile layout */}
        <div className="flex items-center gap-3 py-3 pr-3 pl-4 md:hidden">
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
              <div className="absolute left-0 right-0 h-1 bg-zinc-800 group-hover:bg-zinc-600 transition-colors duration-200">
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

