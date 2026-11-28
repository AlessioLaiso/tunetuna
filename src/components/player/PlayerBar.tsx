import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { useShallow } from 'zustand/react/shallow'
import { logger } from '../../utils/logger'
import { useStatsStore } from '../../stores/statsStore'
import { useLocalCurrentTrack } from '../../hooks/useCurrentTrack'
import { usePlayer, usePlayerTime } from '../../hooks/usePlayer'
import { useRemoteStore } from '../../remote/remoteStore'
import { DevicesButton } from './DevicePicker'
import { useLastPlayedTrack } from '../../hooks/useLastPlayedTrack'
import { jellyfinClient } from '../../api/jellyfin'
import Image from '../shared/Image'
import ContextMenu from '../shared/ContextMenu'
import PlayerModal from './PlayerModal'
import VolumeControl from '../layout/VolumeControl'
import { useState } from 'react'
import { Play, Pause, SkipForward, Shuffle, SkipBack, Repeat, Repeat1, ListVideo } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isIOS, formatTime } from '../../utils/formatting'
import { SurfaceBackdrop } from '../layout/AppBackground'
import { BOTTOM_BAR_TINT, useAppBackgroundActive } from '../../hooks/useAppBackground'

export default function PlayerBar() {
  // This device's playback: drives the audio elements and the lock screen controls
  const {
    songs,
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
    previous,
    isQueueSidebarOpen,
    toggleQueueSidebar,
    setNextAudioElement,
    preBufferNextTrack,
    overlapSwap,
  } = usePlayerStore(useShallow(s => ({ songs: s.songs, isPlaying: s.isPlaying, currentTime: s.currentTime, duration: s.duration, audioElement: s.audioElement, setAudioElement: s.setAudioElement, togglePlayPause: s.togglePlayPause, next: s.next, setCurrentTime: s.setCurrentTime, setDuration: s.setDuration, playTrack: s.playTrack, previous: s.previous, isQueueSidebarOpen: s.isQueueSidebarOpen, toggleQueueSidebar: s.toggleQueueSidebar, setNextAudioElement: s.setNextAudioElement, preBufferNextTrack: s.preBufferNextTrack, overlapSwap: s.overlapSwap })))

  const currentTrack = useLocalCurrentTrack()
  // What the bar shows and controls: this device, or the one being controlled
  const view = usePlayer()
  const shownTime = usePlayerTime()
  const hasOtherDevices = useRemoteStore(s => s.devices.length > 0)
  const lastPlayedTrack = useLastPlayedTrack()
  const hasAppBackground = useAppBackgroundActive()

  const [showModal, setShowModal] = useState(false)
  // Write-only: setter drives modal close animation timing via effects below.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isModalClosing, setIsModalClosing] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [showVolumePopover, setShowVolumePopover] = useState(false)
  const [volumePopoverPosition, setVolumePopoverPosition] = useState<{ top: number; left: number } | null>(null)
  const [volumeButtonElement, setVolumeButtonElement] = useState<HTMLElement | null>(null)
  const [mobileVolumeButtonElement, setMobileVolumeButtonElement] = useState<HTMLElement | null>(null)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const nextAudioRef = useRef<HTMLAudioElement | null>(null)
  const closeModalRef = useRef<(() => void) | null>(null)
  const preemptiveAdvanceRef = useRef<boolean>(false) // Track if we already advanced preemptively (iOS background fix)
  const location = useLocation()
  const navigate = useNavigate()
  const touchStartX = useRef<number | null>(null)
  const touchStartTime = useRef<number | null>(null)
  const playerBarRef = useRef<HTMLDivElement>(null)
  const mobileContentRef = useRef<HTMLDivElement>(null)
  const swipeAnimatingRef = useRef(false)
  const didSwipeRef = useRef(false) // Track if a swipe happened to suppress modal open

  // Close modal when navigating to a different route
  useEffect(() => {
    if (showModal) {
      setIsModalClosing(true)
      setTimeout(() => {
        setShowModal(false)
        setIsModalClosing(false)
      }, 300) // Match animation duration
    }
    // Only react to route changes, not to the modal opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Non-iOS gapless overlap handoff: rAF-driven watch that fires overlapSwap when
    // ~100ms remain. We can't use 'timeupdate' for this — it fires every ~250ms and
    // would miss the window. rAF gives us ~16ms resolution. The loop is only armed
    // when we're in the final 2s of the track, so it's cheap.
    let overlapRafId: number | null = null
    const overlapTick = () => {
      overlapRafId = null
      if (!isActive) return
      if (preemptiveAdvanceRef.current) return
      if (isIOS()) return

      const remaining = audioElement.duration - audioElement.currentTime
      if (!audioElement.duration || audioElement.paused) {
        // Not playing or duration unknown — stop polling; timeupdate will rearm
        return
      }

      // Fire the overlap near the end. 100ms gives the browser's audio graph time to
      // actually start the new element's output before the old one's tail ends.
      if (remaining > 0 && remaining <= 0.1) {
        const state = usePlayerStore.getState()
        const expectedNextTrack = state.currentIndex >= 0 && state.currentIndex + 1 < state.songs.length
          ? state.songs[state.currentIndex + 1]
          : (state.repeat === 'all' && state.songs.length > 0 ? state.songs[0] : null)

        if (state.nextTrackId && expectedNextTrack && state.nextTrackId === expectedNextTrack.Id) {
          logger.debug('[PlayerBar] Overlap handoff triggered', { remaining })
          preemptiveAdvanceRef.current = true
          const fired = overlapSwap()
          if (!fired) {
            // overlapSwap declined (e.g. overlap already in progress) — fall back to 'ended'
            preemptiveAdvanceRef.current = false
          }
          return
        }
        // No valid pre-buffer — let 'ended' handle it
        return
      }

      overlapRafId = requestAnimationFrame(overlapTick)
    }

    const handleTimeUpdate = () => {
      if (!isActive) return
      setCurrentTime(audioElement.currentTime)

      const remaining = audioElement.duration - audioElement.currentTime

      // Trigger pre-buffering of next track when ~15 seconds remain
      if (audioElement.duration > 0 && remaining <= 15 && remaining > 0) {
        // Log once when entering the window
        if (remaining > 14.5) logger.debug('[PlayerBar] Pre-buffer window reached', { remaining })
        preBufferNextTrack()
      }

      // Arm the rAF-driven overlap watcher when we enter the final 2s (non-iOS only).
      // The loop self-terminates after firing or if playback stops.
      if (
        !isIOS() &&
        !preemptiveAdvanceRef.current &&
        overlapRafId === null &&
        audioElement.duration > 0 &&
        remaining <= 2 &&
        remaining > 0
      ) {
        overlapRafId = requestAnimationFrame(overlapTick)
      }

      // iOS PWA background playback fix: preemptively advance to next track
      // when ~1 second remains. iOS suspends JS when app is backgrounded,
      // so the 'ended' event handler may not fire.
      // Only on iOS — other platforms fire the 'ended' event reliably, and
      // the coarse timeupdate interval can cause this to cut off ~2s early.
      if (
        isIOS() &&
        !preemptiveAdvanceRef.current &&
        audioElement.duration > 0 &&
        remaining <= 1 &&
        remaining > 0
      ) {
        logger.debug('[PlayerBar] iOS Preemptive Advance Triggered', { remaining, isIOS: isIOS() })
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

        next()
      }
    }

    const handleLoadedMetadata = () => {
      if (!isActive) return
      setDuration(audioElement.duration)
      preemptiveAdvanceRef.current = false
      logger.debug('[PlayerBar] Metadata loaded', { duration: audioElement.duration })
    }

    const handleEnded = async () => {
      logger.debug('[PlayerBar] handleEnded fired', { preemptive: preemptiveAdvanceRef.current })
      if (!isActive) return
      if (preemptiveAdvanceRef.current) {
        logger.debug('[PlayerBar] Skipping handleEnded due to preemptive advance')
        preemptiveAdvanceRef.current = false
        return
      }

      const state = usePlayerStore.getState()
      const track = state.currentIndex >= 0 && state.currentIndex < state.songs.length
        ? state.songs[state.currentIndex]
        : null

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
        audioElement.play().catch((err) => {
          logger.warn('[PlayerBar] repeat-one play() failed', err)
        })
        return
      }

      logger.debug('[PlayerBar] Calling next() from handleEnded')
      next()
    }

    const handlePlay = () => {
      if (!isActive) return
      // Ignore events from a stale element (e.g. old element during gapless swap).
      // The isActive flag only resets on effect cleanup (next render), but pause/play
      // events fire synchronously before that.
      if (usePlayerStore.getState().audioElement !== audioElement) return
      usePlayerStore.setState({ isPlaying: true })
      logger.debug('[PlayerBar] handlePlay', { src: audioElement.src })
    }

    const handlePause = () => {
      if (!isActive) return
      if (usePlayerStore.getState().audioElement !== audioElement) return
      // If the element is actually still playing (e.g. a play() raced in after
      // a pause-fade completed), ignore this stale pause event.
      if (!audioElement.paused) {
        logger.debug('[PlayerBar] handlePause ignored — element not paused')
        return
      }
      usePlayerStore.setState({ isPlaying: false })
      logger.debug('[PlayerBar] handlePause', { paused: audioElement.paused })
    }

    audioElement.addEventListener('timeupdate', handleTimeUpdate)
    audioElement.addEventListener('loadedmetadata', handleLoadedMetadata)
    audioElement.addEventListener('ended', handleEnded)
    audioElement.addEventListener('play', handlePlay)
    audioElement.addEventListener('pause', handlePause)

    return () => {
      isActive = false
      if (overlapRafId !== null) cancelAnimationFrame(overlapRafId)
      audioElement.removeEventListener('timeupdate', handleTimeUpdate)
      audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audioElement.removeEventListener('ended', handleEnded)
      audioElement.removeEventListener('play', handlePlay)
      audioElement.removeEventListener('pause', handlePause)
    }
  }, [audioElement, setCurrentTime, setDuration, next, preBufferNextTrack, overlapSwap])

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

  // Keep Media Session playback state in sync
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
    }
  }, [isPlaying])

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

  // Show player bar if there's a current track, last played track, or songs in queue.
  // While controlling another device, show what plays there instead.
  const firstQueueTrack = songs.length > 0 ? songs[0] : null
  const displayTrack = currentTrack || lastPlayedTrack || firstQueueTrack
  const shownTrack = view.isRemote ? view.currentTrack : displayTrack

  // Reset image error when track changes
  useEffect(() => {
    setImageError(false)
  }, [shownTrack?.Id])

  // Switching (from the player screen) to a device with nothing playing leaves the screen nothing to show
  useEffect(() => {
    if (showModal && !shownTrack) handleCloseModal()
  }, [showModal, shownTrack])

  const progressPercent = view.duration > 0 ? (shownTime / view.duration) * 100 : 0

  // Check if there's a next song available
  const hasNext = view.songs.length > 0 && (
    view.currentIndex < 0 || // No current track, but queue has songs
    view.currentIndex < view.songs.length - 1 || // Not at the end of queue
    view.repeat !== 'off' // Repeat is enabled
  )

  // Previous should be active if there are songs before current index, repeat
  // uses wrap-around, or the current track is past 3s (restart-from-0 behavior,
  // which applies even on the first track in the queue).
  const hasPrevious =
    view.currentIndex > 0 ||
    (view.repeat === 'all' && view.songs.length > 0) ||
    (view.songs.length > 0 && view.currentIndex >= 0 && shownTime > 3)

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

  const handleSongContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenuMode('desktop')
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
    setContextMenuOpen(true)
  }

  // Swipe gesture handlers for next/previous with animation
  const handleTouchStart = (e: React.TouchEvent) => {
    if (swipeAnimatingRef.current) return
    touchStartX.current = e.touches[0].clientX
    touchStartTime.current = Date.now()
    didSwipeRef.current = false
    // Remove transition during drag for immediate feedback
    if (mobileContentRef.current) {
      mobileContentRef.current.style.transition = 'none'
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (swipeAnimatingRef.current || touchStartX.current === null || !mobileContentRef.current) return

    const deltaX = e.touches[0].clientX - touchStartX.current
    const opacity = Math.max(0.3, 1 - Math.abs(deltaX) / 300)
    mobileContentRef.current.style.transform = `translateX(${deltaX}px)`
    mobileContentRef.current.style.opacity = String(opacity)

    // Mark as swiping if moved more than 10px to suppress modal open
    if (Math.abs(deltaX) > 10) {
      didSwipeRef.current = true
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (swipeAnimatingRef.current || touchStartX.current === null || touchStartTime.current === null) {
      touchStartX.current = null
      touchStartTime.current = null
      return
    }

    const el = mobileContentRef.current
    if (!el) {
      touchStartX.current = null
      touchStartTime.current = null
      return
    }

    const touchEndX = e.changedTouches[0].clientX
    const deltaX = touchEndX - touchStartX.current
    const deltaTime = Date.now() - touchStartTime.current
    const swipeThreshold = 75
    const velocityThreshold = 0.45

    const velocity = Math.abs(deltaX) / deltaTime
    const isSwipeRight = deltaX > swipeThreshold || (deltaX > 45 && velocity > velocityThreshold)
    const isSwipeLeft = deltaX < -swipeThreshold || (deltaX < -45 && velocity > velocityThreshold)

    const canSwipeRight = isSwipeRight && hasPrevious
    const canSwipeLeft = isSwipeLeft && hasNext

    if (canSwipeRight || canSwipeLeft) {
      // Animate out in swipe direction
      swipeAnimatingRef.current = true
      const direction = canSwipeRight ? 1 : -1
      const exitX = direction * window.innerWidth

      el.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out'
      el.style.transform = `translateX(${exitX}px)`
      el.style.opacity = '0'

      setTimeout(() => {
        // Change track
        if (canSwipeRight) view.previous()
        else view.next()

        // Position new content from opposite side (no transition)
        el.style.transition = 'none'
        el.style.transform = `translateX(${-exitX}px)`
        el.style.opacity = '0'

        // Force reflow so the position takes effect before animating in
        void el.offsetHeight

        // Animate in
        el.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out'
        el.style.transform = 'translateX(0)'
        el.style.opacity = '1'

        setTimeout(() => {
          el.style.transition = ''
          el.style.transform = ''
          el.style.opacity = ''
          swipeAnimatingRef.current = false
        }, 200)
      }, 200)
    } else {
      // Spring back to center
      el.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out'
      el.style.transform = 'translateX(0)'
      el.style.opacity = '1'
      setTimeout(() => {
        el.style.transition = ''
        el.style.transform = ''
        el.style.opacity = ''
      }, 200)
    }

    touchStartX.current = null
    touchStartTime.current = null
  }

  // Always show the bar if there's a track to display (current or last played),
  // and while other devices are around so the device picker stays reachable
  if (!shownTrack && !view.isRemote && !hasOtherDevices) {
    return null
  }

  // Tablet layout right-aligns the controls next to these icons, so leave room for both
  const tabletRightIcons = (!isIOS() && !view.isRemote ? 1 : 0) + (hasOtherDevices || view.isRemote ? 1 : 0)

  // "On Mac" while controlling another device
  const remoteLabel = view.isRemote && (
    <span className="flex-shrink-0 text-[var(--accent-color)]">On {view.remoteDeviceName ?? 'other device'}</span>
  )

  return (
    <>
      <div
        ref={playerBarRef}
        className={`fixed left-0 right-0 bg-zinc-900 ${hasAppBackground ? 'max-lg:border-t max-lg:border-white/15' : 'border-t border-white/15'} z-40 cursor-pointer bottom-[calc(4rem-8px)] lg:bottom-0`}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}
        onClick={() => {
          if (!didSwipeRef.current && shownTrack) {
            setShowModal(true)
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <SurfaceBackdrop tint={BOTTOM_BAR_TINT} />
        {/* Seek bar at top for desktop - positioned absolutely to not affect layout */}
        {shownTrack && (
          <div
            className="hidden lg:block absolute left-0 right-0 cursor-pointer group"
            style={{ top: '-10px', height: '24px' }}
            onClick={(e) => {
              e.stopPropagation() // Prevent opening the modal
              if (!view.duration) return
              const rect = e.currentTarget.getBoundingClientRect()
              const percent = (e.clientX - rect.left) / rect.width
              view.seek(Math.max(0, Math.min(1, percent)) * view.duration)
            }}
            onTouchStart={(e) => {
              e.stopPropagation() // Prevent opening the modal
              if (!view.duration) return
              const touch = e.touches[0]
              const rect = e.currentTarget.getBoundingClientRect()
              const percent = (touch.clientX - rect.left) / rect.width
              view.seek(Math.max(0, Math.min(1, percent)) * view.duration)
            }}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={view.duration || 100}
            aria-valuenow={shownTime}
          >
            {/* Visual bar - positioned at bottom of touch target to align with player bar top edge */}
            <div className="absolute left-0 right-0 bottom-[10px] h-1 bg-white/10 group-hover:bg-white/20 transition-colors duration-200">
              <div
                className="h-full w-full origin-left bg-[var(--accent-fill)] transition-transform"
                style={{ transform: `scaleX(${progressPercent / 100})` }}
              />
            </div>
          </div>
        )}

        {/* Desktop layout: absolute positioning for perfect centering */}
        <div className="hidden md:block md:relative md:px-4 md:pt-3 md:pb-1 lg:pb-3">
          {/* Left: Album art + song info with max width to prevent overlap */}
          <div className="flex items-center gap-3 min-w-0 max-w-[37%]" onContextMenu={handleSongContextMenu}>
            {!shownTrack ? (
              <div className="w-12 h-12 rounded-sm flex-shrink-0 bg-white/10" />
            ) : !imageError && (
              <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-white/10">
                <Image
                  key={shownTrack.Id}
                  src={jellyfinClient.getAlbumArtUrl(
                    shownTrack.AlbumId || shownTrack.Id,
                    96
                  )}
                  alt={shownTrack.Name}
                  className="w-full h-full object-cover"
                  showOutline={true}
                  rounded="rounded-sm"
                  onError={() => setImageError(true)}
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white truncate">
                {shownTrack ? shownTrack.Name : 'Nothing playing'}
              </div>
              <div className="text-xs text-white/60 truncate flex items-center gap-1.5 min-w-0">
                {remoteLabel}
                {remoteLabel && shownTrack && <span className="flex-shrink-0">•</span>}
                {!shownTrack ? null : shownTrack.ArtistItems?.[0]?.Id ? (
                  <span
                    className="clickable-text truncate"
                    onClick={(e) => {
                      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
                      e.stopPropagation()
                      navigate(`/artist/${shownTrack.ArtistItems![0].Id}`)
                    }}
                  >
                    {shownTrack.ArtistItems![0].Name || shownTrack.AlbumArtist || 'Unknown artist'}
                  </span>
                ) : (
                  <span className="truncate">{shownTrack.AlbumArtist || 'Unknown artist'}</span>
                )}
                {shownTrack && (
                  <>
                    <span className="flex-shrink-0">•</span>
                    <span className="tabular-nums flex-shrink-0">{formatTime(shownTime)}/{formatTime(view.duration)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Absolutely centered: Player controls on Desktop, Right aligned on Tablet */}
          <div className={`absolute top-1/2 md:top-[calc(50%+4px)] lg:top-1/2 -translate-y-1/2 ${tabletRightIcons > 1 ? 'md:right-[7.5rem]' : 'md:right-16'} md:left-auto md:translate-x-0 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 flex items-center gap-2`}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                view.toggleShuffle()
              }}
              aria-label={view.shuffle ? 'Disable shuffle' : 'Enable shuffle'}
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${view.shuffle ? 'text-[var(--accent-color)]' : 'text-white/60 hover:text-white/80'
                }`}
            >
              <Shuffle className="w-5 h-5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation()
                if (hasPrevious) {
                  view.previous()
                }
              }}
              disabled={!hasPrevious}
              aria-label="Previous track"
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${hasPrevious
                ? 'text-white hover:bg-white/15'
                : 'text-white/30 cursor-not-allowed'
                }`}
            >
              <SkipBack className="w-5 h-5" />
            </button>

            {/* Play button with extra margin */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (view.currentTrack) {
                  view.togglePlayPause()
                } else if (view.songs.length > 0) {
                  // Start playing from the beginning of the queue
                  view.skipToTrack(0)
                } else if (displayTrack && !view.isRemote) {
                  // Resume last played track
                  playTrack(displayTrack)
                }
              }}
              aria-label={view.isPlaying && view.currentTrack ? 'Pause' : 'Play'}
              className="w-10 h-10 mx-2 flex items-center justify-center rounded-full transition-colors text-white bg-[var(--accent-fill)] hover:opacity-90"
            >
              {view.isPlaying && view.currentTrack ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation()
                if (hasNext) {
                  view.next()
                }
              }}
              disabled={!hasNext}
              aria-label="Next track"
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${hasNext
                ? 'text-white hover:bg-white/15'
                : 'text-white/30 cursor-not-allowed'
                }`}
            >
              <SkipForward className="w-5 h-5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation()
                view.toggleRepeat()
              }}
              aria-label={view.repeat === 'off' ? 'Enable repeat' : view.repeat === 'all' ? 'Repeat one' : 'Disable repeat'}
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${view.repeat !== 'off' ? 'text-[var(--accent-color)]' : 'text-white/60 hover:text-white/80'
                }`}
            >
              {view.repeat === 'one' ? (
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
                  className="text-white/60 hover:text-white hover:bg-white/15 transition-colors flex items-center justify-center w-10 h-10 rounded-full"
                  title="Open queue"
                  aria-label="Open queue"
                >
                  <ListVideo className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Devices: left of the volume control (tablet and desktop) */}
            <DevicesButton className="hidden md:flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/15 transition-colors" />
            {/* Volume is this device's: hidden while controlling another one */}
            <div className="hidden lg:block" onClick={(e) => e.stopPropagation()}>
              {!isIOS() && !view.isRemote && <VolumeControl variant="horizontal" />}
            </div>
            <div className="hidden md:block lg:hidden">
              {!isIOS() && !view.isRemote && (
                <VolumeControl
                  variant="compact"
                  onOpenPopover={handleOpenVolumePopover}
                  onRef={setVolumeButtonElement}
                  className="w-10 h-10 flex items-center justify-center text-white hover:text-white/80 hover:bg-white/15 rounded-full transition-colors"
                />
              )}
            </div>
          </div>
        </div>

        {/* Mobile layout */}
        <div className="flex items-center gap-3 pt-3 pb-1 pr-3 pl-4 md:hidden">
          {/* Animated content: album art + text */}
          <div ref={mobileContentRef} className="flex items-center gap-3 flex-1 min-w-0" onContextMenu={handleSongContextMenu}>
            {!shownTrack ? (
              <div className="w-12 h-12 rounded-sm flex-shrink-0 bg-white/10" />
            ) : !imageError && (
              <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-white/10">
                <Image
                  key={shownTrack.Id}
                  src={jellyfinClient.getAlbumArtUrl(
                    shownTrack.AlbumId || shownTrack.Id,
                    96
                  )}
                  alt={shownTrack.Name}
                  className="w-full h-full object-cover"
                  showOutline={true}
                  rounded="rounded-sm"
                  onError={() => setImageError(true)}
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white truncate">
                {shownTrack ? shownTrack.Name : 'Nothing playing'}
              </div>
              <div className="text-xs text-white/60 truncate">
                {remoteLabel}
                {remoteLabel && shownTrack && ' • '}
                {shownTrack && (shownTrack.ArtistItems?.[0]?.Name || shownTrack.AlbumArtist || 'Unknown artist')}
              </div>
            </div>
          </div>
          {/* Mobile layout: Volume + Play/Pause buttons (stay fixed during swipe) */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isIOS() && !view.isRemote && (
              <VolumeControl
                variant="compact"
                onOpenPopover={handleOpenVolumePopover}
                onRef={setMobileVolumeButtonElement}
                className="text-white hover:text-white/80 transition-colors"
              />
            )}
            {/* Devices: left of the play button (mobile) */}
            <DevicesButton className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (view.currentTrack) {
                  view.togglePlayPause()
                } else if (view.songs.length > 0) {
                  view.skipToTrack(0)
                } else if (displayTrack && !view.isRemote) {
                  playTrack(displayTrack)
                }
              }}
              aria-label={view.isPlaying && view.currentTrack ? 'Pause' : 'Play'}
              className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/15 rounded-full transition-colors"
            >
              {view.isPlaying && view.currentTrack ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
        {/* Mobile seek bar - keep at bottom, 24px touch target with 4px visual bar centered */}
        {/* Always rendered, even with no song (e.g. while another device's state loads):
            it sets the bar's height, and the bar is pinned by its bottom edge */}
        <div className="lg:hidden" style={{ marginBottom: '-10px' }}>
          <div
            className={`relative group flex items-center ${shownTrack ? 'cursor-pointer' : ''}`}
            style={{ height: '24px' }}
            onClick={(e) => {
              e.stopPropagation() // Prevent opening the modal
              if (!shownTrack || !view.duration) return
              const rect = e.currentTarget.getBoundingClientRect()
              const percent = (e.clientX - rect.left) / rect.width
              view.seek(Math.max(0, Math.min(1, percent)) * view.duration)
            }}
            onTouchStart={(e) => {
              e.stopPropagation() // Prevent opening the modal
              if (!shownTrack || !view.duration) return
              const touch = e.touches[0]
              const rect = e.currentTarget.getBoundingClientRect()
              const percent = (touch.clientX - rect.left) / rect.width
              view.seek(Math.max(0, Math.min(1, percent)) * view.duration)
            }}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={view.duration || 100}
            aria-valuenow={shownTime}
          >
            {/* Visual bar - centered within touch target */}
            <div className="absolute left-0 right-0 h-1 bg-white/10 group-hover:bg-white/20 transition-colors duration-200">
              <div
                className="h-full w-full origin-left bg-[var(--accent-fill)] transition-transform"
                style={{ transform: `scaleX(${shownTrack ? progressPercent / 100 : 0})` }}
              />
            </div>
          </div>
        </div>
      </div>
      {showModal && (
        <PlayerModal
          onClose={handleCloseModal}
          onClosingStart={() => setIsModalClosing(true)}
          closeRef={closeModalRef}
        />
      )}
      {showVolumePopover && volumePopoverPosition && !isIOS() && !view.isRemote && (
        <VolumeControl
          variant="vertical"
          onClose={() => setShowVolumePopover(false)}
          popoverPosition={volumePopoverPosition}
        />
      )}
      <ContextMenu
        item={shownTrack as import('../../api/types').BaseItemDto}
        itemType="song"
        isOpen={contextMenuOpen}
        onClose={() => {
          setContextMenuOpen(false)
          setContextMenuPosition(null)
        }}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </>
  )
}

