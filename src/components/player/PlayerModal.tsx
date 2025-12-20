import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { usePlayerStore } from '../../stores/playerStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import { useLastPlayedTrack } from '../../hooks/useLastPlayedTrack'
import { jellyfinClient } from '../../api/jellyfin'
import Image from '../shared/Image'
import QueueView from './QueueView'
import LyricsModal from './LyricsModal'
import VolumeControl from '../layout/VolumeControl'
import { ChevronDown, ListVideo, SquarePlay, Shuffle, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1, User, Disc, MicVocal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { isIOS } from '../../utils/formatting'

interface PlayerModalProps {
  onClose: () => void
  onClosingStart?: () => void
  closeRef?: React.MutableRefObject<(() => void) | null>
}

export default function PlayerModal({ onClose, onClosingStart, closeRef }: PlayerModalProps) {
  const navigate = useNavigate()
  const {
    songs,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    shuffle,
    repeat,
    togglePlayPause,
    next,
    previous,
    seek,
    setVolume,
    toggleShuffle,
    toggleRepeat,
    playTrack,
  } = usePlayerStore()

  const currentTrack = useCurrentTrack()
  const lastPlayedTrack = useLastPlayedTrack()

  // Use lastPlayedTrack as fallback for display, matching PlayerBar behavior
  const displayTrack = currentTrack || lastPlayedTrack
  const [showQueue, setShowQueue] = useState(false)

  // Ensure queue view is closed on mount to prevent flash
  useEffect(() => {
    setShowQueue(false)
  }, [])
  const [showLyricsModal, setShowLyricsModal] = useState(false)
  const [showVolumePopover, setShowVolumePopover] = useState(false)
  const [volumePopoverPosition, setVolumePopoverPosition] = useState<{ top: number; left: number } | null>(null)
  const [volumePopoverDirection, setVolumePopoverDirection] = useState<'up' | 'down'>('up')
  const [volumeButtonElement, setVolumeButtonElement] = useState<HTMLElement | null>(null)
  const [volumeHeaderButtonElement, setVolumeHeaderButtonElement] = useState<HTMLElement | null>(null)
  const [hasLyrics, setHasLyrics] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [imageError, setImageError] = useState(false)
  const progressRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef<number | null>(null)
  const touchStartTime = useRef<number | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragStartX = useRef<number | null>(null)

  useEffect(() => {
    // Prevent body scrolling when modal is open - use overflow only to avoid layout shifts
    const bodyOriginalOverflowY = window.getComputedStyle(document.body).overflowY
    const htmlOriginalOverflowY = window.getComputedStyle(document.documentElement).overflowY
    const rootOriginalOverflowY = document.getElementById('root') ? window.getComputedStyle(document.getElementById('root')!).overflowY : 'N/A'

    // Use overflow: hidden only - no position changes to avoid TabBar jumps
    document.body.style.overflowY = 'hidden'
    document.documentElement.style.overflowY = 'hidden'

    const rootEl = document.getElementById('root')
    if (rootEl) {
      rootEl.style.overflowY = 'hidden'
    }

    return () => {
      // Restore overflow - no position changes means no TabBar jump
      document.body.style.overflowY = bodyOriginalOverflowY
      document.documentElement.style.overflowY = htmlOriginalOverflowY
      if (rootEl) {
        rootEl.style.overflowY = rootOriginalOverflowY !== 'N/A' ? rootOriginalOverflowY : ''
      }
    }
  }, [])

  useEffect(() => {
    // Trigger slide-down animation on mount
    requestAnimationFrame(() => {
      setIsAnimating(true)
    })
  }, [])

  const hasNext = currentIndex >= 0 && currentIndex < songs.length - 1
  const hasPrevious = currentIndex > 0



  // Check if current song has lyrics
  useEffect(() => {
    const checkLyrics = async () => {
      if (!displayTrack) {
        setHasLyrics(false)
        return
      }

      try {
        const lyrics = await jellyfinClient.getLyrics(displayTrack.Id)
        const hasLyricsValue = lyrics !== null && lyrics.trim().length > 0
        setHasLyrics(hasLyricsValue)
      } catch (error) {
        console.warn('[PlayerModal] Lyrics check failed:', error)
        setHasLyrics(false)
      }
    }

    checkLyrics()
  }, [displayTrack])

  // Get display name: use Name if available, otherwise extract filename from Path
  const getDisplayNameForMetadata = (track: typeof displayTrack) => {
    if (!track) return 'Unknown'
    if (track.Name && track.Name.trim()) {
      return track.Name
    }
    // Try to extract filename from Path if available
    const path = (track as any).Path
    if (path && typeof path === 'string') {
      const filename = path.split('/').pop() || path.split('\\').pop()
      return filename || 'Unknown'
    }
    return 'Unknown'
  }

  // Get artist name if available
  const getArtistNameForMetadata = (track: typeof displayTrack) => {
    if (!track) return ''
    return track.ArtistItems?.[0]?.Name || track.AlbumArtist || ''
  }

  useEffect(() => {
    if ('mediaSession' in navigator && displayTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: getDisplayNameForMetadata(displayTrack),
        artist: getArtistNameForMetadata(displayTrack),
        album: displayTrack.Album || '',
        artwork: [
          {
            src: jellyfinClient.getAlbumArtUrl(displayTrack.AlbumId || displayTrack.Id, 512),
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
  }, [displayTrack, isPlaying, togglePlayPause, next, previous])

  // Reset image error when track changes
  useEffect(() => {
    setImageError(false)
  }, [displayTrack?.Id])

  if (!displayTrack) {
    return null
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get display name: use Name if available, otherwise extract filename from Path
  const getDisplayName = () => {
    if (displayTrack.Name && displayTrack.Name.trim()) {
      return displayTrack.Name
    }
    // Try to extract filename from Path if available
    const path = (displayTrack as any).Path
    if (path && typeof path === 'string') {
      const filename = path.split('/').pop() || path.split('\\').pop()
      return filename || 'Unknown'
    }
    return 'Unknown'
  }

  // Get artist name if available
  const getArtistName = () => {
    return displayTrack.ArtistItems?.[0]?.Name || displayTrack.AlbumArtist
  }

  // Check if album exists
  const hasAlbum = displayTrack.AlbumId && displayTrack.Album && displayTrack.Album.trim()

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration || isDragging.current) return
    const rect = progressRef.current.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    seek(Math.max(0, Math.min(1, percent)) * duration)
  }

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return
    isDragging.current = true
    dragStartX.current = e.clientX
    const rect = progressRef.current.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    seek(Math.max(0, Math.min(1, percent)) * duration)
  }


  const handleProgressMouseUp = () => {
    isDragging.current = false
    dragStartX.current = null
  }

  const handleProgressTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return
    e.stopPropagation() // Prevent modal swipe gesture
    isDragging.current = true
    const touch = e.touches[0]
    const rect = progressRef.current.getBoundingClientRect()
    const percent = (touch.clientX - rect.left) / rect.width
    seek(Math.max(0, Math.min(1, percent)) * duration)
  }

  const handleProgressTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging.current || !progressRef.current || !duration) return
    e.stopPropagation() // Prevent modal swipe gesture
    e.preventDefault() // Prevent scrolling
    const touch = e.touches[0]
    const rect = progressRef.current.getBoundingClientRect()
    const percent = (touch.clientX - rect.left) / rect.width
    seek(Math.max(0, Math.min(1, percent)) * duration)
  }

  const handleProgressTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation() // Prevent modal swipe gesture
    isDragging.current = false
    dragStartX.current = null
  }

  // Add global mouse event listeners for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !progressRef.current || !duration) return
      const rect = progressRef.current.getBoundingClientRect()
      const percent = (e.clientX - rect.left) / rect.width
      seek(Math.max(0, Math.min(1, percent)) * duration)
    }

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        dragStartX.current = null
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [duration, seek])

  const handleClose = () => {
    setIsClosing(true)
    onClosingStart?.() // Notify parent that closing has started
    setTimeout(() => {
      onClose()
    }, 300) // Match transition duration
  }

  // Handle volume popover opening
  const handleOpenVolumePopover = (direction: 'up' | 'down' = 'up') => {
    const element = direction === 'down' ? volumeHeaderButtonElement : volumeButtonElement
    if (element) {
      const rect = element.getBoundingClientRect()
      setVolumePopoverPosition({
        top: direction === 'down' ? rect.bottom : rect.top,
        left: rect.left + rect.width / 2
      })
      setVolumePopoverDirection(direction)
      setShowVolumePopover(true)
    }
  }

  // Expose close function via ref so parent can trigger it with animation
  useEffect(() => {
    if (closeRef) {
      closeRef.current = handleClose
    }
    return () => {
      if (closeRef) {
        closeRef.current = null
      }
    }
  }, [closeRef])

  // Swipe down gesture handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    // Only handle swipe if not in queue view or lyrics modal (both have their own scrolling)
    if (showQueue || showLyricsModal) return

    touchStartY.current = e.touches[0].clientY
    touchStartTime.current = Date.now()
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    // Only handle swipe if not in queue view or lyrics modal
    if (showQueue || showLyricsModal || touchStartY.current === null) return

    const currentY = e.touches[0].clientY
    const deltaY = currentY - touchStartY.current

    // Only allow downward swipes
    if (deltaY > 0 && modalRef.current) {
      // Apply transform to follow finger
      const maxDelta = Math.min(deltaY, window.innerHeight * 0.5)
      modalRef.current.style.transform = `translateY(${maxDelta}px)`
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (showQueue || showLyricsModal || touchStartY.current === null || touchStartTime.current === null) {
      touchStartY.current = null
      touchStartTime.current = null
      if (modalRef.current) {
        modalRef.current.style.transform = ''
      }
      return
    }

    const currentY = e.changedTouches[0].clientY
    const deltaY = currentY - touchStartY.current
    const deltaTime = Date.now() - touchStartTime.current
    const swipeThreshold = 50 // Minimum pixels to trigger close
    const velocityThreshold = 0.3 // Minimum velocity (px/ms) to trigger close

    // Reset transform
    if (modalRef.current) {
      modalRef.current.style.transform = ''
    }

    // Check if swipe down is sufficient to close
    const velocity = deltaY / deltaTime
    if (deltaY > swipeThreshold || (deltaY > 30 && velocity > velocityThreshold)) {
      handleClose()
    }

    touchStartY.current = null
    touchStartTime.current = null
  }

  return (
    <>
      <style>{`
      @media (min-aspect-ratio: 4/3) and (min-width: 768px) {
        .landscape\\:flex-row { flex-direction: row; }
        .landscape\\:items-center { align-items: center; }
        .landscape\\:gap-8 { gap: 2rem; }
        .landscape\\:order-1 { order: 1; }
        .landscape\\:flex-shrink-0 { flex-shrink: 0; }
        .landscape\\:order-2 { order: 2; }
        .landscape\\:text-left { text-align: left; }
        .landscape\\:flex-1 { flex: 1; }
        .landscape\\:max-w-xs { max-width: 20rem; }
        .landscape\\:justify-start { justify-content: flex-start; }
        .landscape\\:mx-0 { margin-left: 0; margin-right: 0; }
      }

      @media (min-width: 1024px) {
        .lg\\:max-w-\\[864px\\] { max-width: 864px; }
      }
    `}</style>
      <div
        ref={modalRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`fixed left-0 right-0 bg-zinc-900 z-[70] flex flex-col transition-transform duration-300 ease-out ${isClosing
          ? 'translate-y-full'
          : isAnimating
            ? 'translate-y-0'
            : 'translate-y-full'
          }`}
        style={{
          top: `var(--header-offset, 0px)`,
          paddingTop: `calc(env(safe-area-inset-top) + var(--header-offset, 0px))`,
          bottom: `calc(-1 * env(safe-area-inset-bottom))`,
          height: `calc(100% + env(safe-area-inset-bottom) + var(--header-offset, 0px))`,
          transition: touchStartY.current === null ? 'transform 300ms ease-out' : 'none'
        }}
      >
        <div className="flex items-center justify-between p-4 relative">
          <div className="flex items-center gap-2 z-10 flex-shrink-0">
            <button
              onClick={handleClose}
              className="text-white hover:text-zinc-300 transition-colors z-10 flex-shrink-0"
            >
              <ChevronDown className="w-8 h-8" />
            </button>
          </div>
          {showLyricsModal && displayTrack && (
            <h2 className="absolute left-0 right-0 text-center text-white text-sm sm:text-base font-medium px-20 truncate">
              {getDisplayName()}
            </h2>
          )}
          <div className="flex items-center gap-2 z-10 flex-shrink-0">
            {/* Volume button on <768px screens, next to lyrics and queue */}
            <div className={`md:hidden ${showLyricsModal ? 'hidden' : ''}`}>
              {!isIOS() && (
                <VolumeControl
                  variant="compact"
                  onOpenPopover={() => handleOpenVolumePopover('down')}
                  onRef={setVolumeHeaderButtonElement}
                  className="text-white hover:text-zinc-300 transition-colors p-2"
                />
              )}
            </div>
            {/* Lyrics button on all screens */}
            {hasLyrics && !showQueue && (
              <button
                onClick={() => setShowLyricsModal(!showLyricsModal)}
                className={`transition-colors p-2 ${showLyricsModal
                  ? 'text-[var(--accent-color)] hover:text-[var(--accent-color)]'
                  : 'text-white hover:text-zinc-300'
                  }`}
              >
                <MicVocal className="w-6 h-6" />
              </button>
            )}
            <button
              onClick={() => {
                if (!showQueue) {
                  // Opening queue - close lyrics modal
                  setShowLyricsModal(false)
                }
                setShowQueue(!showQueue)
              }}
              className="text-white hover:text-zinc-300 transition-colors p-2 xl:hidden"
            >
              {showQueue ? (
                <SquarePlay className="w-6 h-6" />
              ) : (
                <ListVideo className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {showQueue ? (
          <QueueView
            onClose={() => setShowQueue(false)}
            onNavigateFromContextMenu={() => {
              // When navigating from the queue's context menu (e.g. to album/artist/genre),
              // close the full-screen player modal so the destination page is visible.
              handleClose()
            }}
          />
        ) : (
          <div className="flex-1 flex flex-col min-h-0 max-w-[768px] lg:max-w-[864px] mx-auto w-full relative" style={{ paddingBottom: `env(safe-area-inset-bottom)` }}>
            <div className="flex-1 overflow-hidden min-h-0 flex items-center justify-center">
              <div className="w-full flex flex-col items-center px-4 sm:px-8 md:pr-0">
                <div className="w-full flex flex-col items-center landscape:flex-row landscape:items-center landscape:gap-8">
                  <div className="landscape:order-1 landscape:flex-shrink-0">
                    <div
                      className={`rounded overflow-hidden mb-4 lg:mb-8 bg-zinc-900 ${!imageError ? 'shadow-2xl' : ''}`}
                      style={{
                        width: 'clamp(224px, min(70vw, 50vh), 480px)',
                        height: 'clamp(224px, min(70vw, 50vh), 480px)',
                        maxWidth: '100%'
                      }}
                    >
                      {imageError ? (
                        <div className="w-full h-full rounded-full overflow-hidden bg-zinc-900 flex items-center justify-center relative">
                          <img
                            src="/assets/vinyl.png"
                            alt="Vinyl Record"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              console.error('Failed to load vinyl image')
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        </div>
                      ) : (
                        <Image
                          src={jellyfinClient.getAlbumArtUrl(displayTrack.AlbumId || displayTrack.Id)}
                          alt={displayTrack.Name}
                          className="w-full h-full object-cover"
                          showOutline={true}
                          rounded="rounded"
                          onError={() => setImageError(true)}
                        />
                      )}
                    </div>
                  </div>
                  <div className="text-center landscape:text-left w-full landscape:order-2 landscape:flex-1 landscape:max-w-xs">
                    <h3 className="text-xl sm:text-2xl font-bold mb-2">{getDisplayName()}</h3>
                    {getArtistName() && (
                      <button
                        onClick={() => {
                          const artistId = displayTrack.ArtistItems?.[0]?.Id
                          if (artistId) {
                            onClose()
                            navigate(`/artist/${artistId}`)
                          }
                        }}
                        className="flex items-center justify-start landscape:justify-start gap-2 text-gray-400 text-base sm:text-lg hover:text-white transition-colors mx-auto landscape:mx-0 landscape:text-left max-w-full min-w-0"
                      >
                        <User className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <span className="break-words min-w-0">{getArtistName()}</span>
                      </button>
                    )}
                    {hasAlbum && (
                      <button
                        onClick={() => {
                          onClose()
                          navigate(`/album/${displayTrack.AlbumId}`)
                        }}
                        className="flex items-center justify-start landscape:justify-start gap-2 text-gray-400 text-base sm:text-lg hover:text-white transition-colors mx-auto landscape:mx-0 landscape:text-left mt-1 max-w-full min-w-0"
                      >
                        <Disc className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <span className="break-words min-w-0">{displayTrack.Album}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div
              className="pt-2 space-y-6 flex-shrink-0 mt-4 sm:mt-0 max-w-[768px] lg:max-w-[864px] mx-auto w-full"
              style={{ paddingBottom: `1.5rem` }}
            >
              <div className="space-y-3 px-4 w-full">
                <div className="max-w-[768px] lg:max-w-[864px] mx-auto">
                  <div
                    ref={progressRef}
                    className="h-2 bg-zinc-800 rounded-full cursor-pointer w-full select-none overflow-hidden"
                    onClick={handleProgressClick}
                    onMouseDown={handleProgressMouseDown}
                    onMouseUp={handleProgressMouseUp}
                    onMouseLeave={handleProgressMouseUp}
                    onTouchStart={handleProgressTouchStart}
                    onTouchMove={handleProgressTouchMove}
                    onTouchEnd={handleProgressTouchEnd}
                  >
                    <div
                      className="h-full bg-[var(--accent-color)] transition-all"
                      style={{
                        width: `${progressPercent}%`,
                        borderTopLeftRadius: '9999px',
                        borderBottomLeftRadius: '9999px',
                        borderTopRightRadius: progressPercent >= 100 ? '9999px' : '0',
                        borderBottomRightRadius: progressPercent >= 100 ? '9999px' : '0'
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-2">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-8 px-6 relative">
                <button
                  onClick={toggleShuffle}
                  className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${shuffle ? 'text-[var(--accent-color)]' : 'text-gray-400 hover:text-zinc-300'
                    }`}
                >
                  <Shuffle className="w-6 h-6" />
                </button>

                <button
                  onClick={previous}
                  disabled={!hasPrevious}
                  className={`w-12 h-12 flex-shrink-0 aspect-square flex items-center justify-center rounded-full transition-colors ${hasPrevious
                    ? 'text-white hover:bg-zinc-800 active:bg-zinc-800'
                    : 'text-gray-600 cursor-not-allowed'
                    }`}
                >
                  <SkipBack className="w-8 h-8" />
                </button>

                <button
                  onClick={() => {
                    if (currentTrack) {
                      togglePlayPause()
                    } else if (displayTrack) {
                      // Resume last played track
                      playTrack(displayTrack)
                    }
                  }}
                  className="w-16 h-16 flex items-center justify-center rounded-full transition-colors aspect-square bg-[var(--accent-color)] text-white hover:opacity-90"
                >
                  {isPlaying && currentTrack ? (
                    <Pause className="w-8 h-8" />
                  ) : (
                    <Play className="w-8 h-8" />
                  )}
                </button>

                {/* Next button hidden on <768px screens */}
                <button
                  onClick={next}
                  disabled={!hasNext}
                  className={`w-12 h-12 flex-shrink-0 aspect-square flex items-center justify-center rounded-full transition-colors ${hasNext
                    ? 'text-white hover:bg-zinc-800 active:bg-zinc-800'
                    : 'text-gray-600 cursor-not-allowed'
                    }`}
                >
                  <SkipForward className="w-8 h-8" />
                </button>

                <button
                  onClick={toggleRepeat}
                  className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${repeat !== 'off' ? 'text-[var(--accent-color)]' : 'text-gray-400 hover:text-zinc-300'
                    }`}
                >
                  {repeat === 'one' ? (
                    <Repeat1 className="w-6 h-6" />
                  ) : (
                    <Repeat className="w-6 h-6" />
                  )}
                </button>

                {/* Volume control on 768px+, horizontal variant on the right */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 hidden md:flex">
                  {!isIOS() && <VolumeControl variant="horizontal" />}
                </div>
              </div>
            </div>
          </div>
        )}
        {showLyricsModal && (
          <LyricsModal />
        )}
        {showVolumePopover && volumePopoverPosition && !isIOS() && (
          <VolumeControl
            variant="vertical"
            onClose={() => setShowVolumePopover(false)}
            popoverPosition={volumePopoverPosition}
            popoverDirection={volumePopoverDirection}
          />
        )}
      </div>
    </>
  )
}
