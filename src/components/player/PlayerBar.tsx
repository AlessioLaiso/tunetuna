import { useEffect, useRef } from 'react'
import { usePlayerStore, markItemAsReported } from '../../stores/playerStore'
import { jellyfinClient } from '../../api/jellyfin'
import Image from '../shared/Image'
import PlayerModal from './PlayerModal'
import { useState } from 'react'
import { Play, Pause, SkipForward } from 'lucide-react'
import { useLocation } from 'react-router-dom'

export default function PlayerBar() {
  const {
    currentTrack,
    lastPlayedTrack,
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
    queue,
    currentIndex,
    repeat,
  } = usePlayerStore()
  const [showModal, setShowModal] = useState(false)
  const [isModalClosing, setIsModalClosing] = useState(false)
  const [imageError, setImageError] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const closeModalRef = useRef<(() => void) | null>(null)
  const location = useLocation()

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
      const queue = usePlayerStore.getState().queue
      const trackIsRecommended = currentTrack ? (queue.find(t => t.Id === currentTrack.Id) as any)?._isRecommended : false
      // Report playback when track ends
      if (currentTrack) {
        try {
          await jellyfinClient.markItemAsPlayed(currentTrack.Id)
          // Mark as reported to prevent duplicate delayed reports
          markItemAsReported(currentTrack.Id)
          // Trigger a custom event to notify RecentlyPlayed to refresh after a short delay
          // This ensures the server has time to update its database
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('trackPlayed', { detail: { trackId: currentTrack.Id } }))
          }, 4000) // 4 second delay after markItemAsPlayed completes to allow server to update
        } catch (error) {
          // Error already logged in markItemAsPlayed
        }
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

  // Initialize queue from lastPlayedTrack on app load if queue is empty
  useEffect(() => {
    const state = usePlayerStore.getState()
    // If we have a lastPlayedTrack but no currentTrack and empty queue, restore it
    if (state.lastPlayedTrack && !state.currentTrack && state.queue.length === 0) {
      const track = state.lastPlayedTrack
      // Add the track to the queue and set it as current
      // Use setQueue to properly initialize the queue, then setCurrentTrack to set up audio
      usePlayerStore.getState().setQueue([track])
      // setCurrentTrack will handle setting up the audio source (if audio element exists)
      usePlayerStore.getState().setCurrentTrack(track)
      // Reset manuallyCleared to false so recommendations can trigger
      // This is an automatic restoration, not a manual user action
      usePlayerStore.setState({ manuallyCleared: false })
    }
  }, [])

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

  const displayTrack = currentTrack || lastPlayedTrack
  
  // Reset image error when track changes
  useEffect(() => {
    setImageError(false)
  }, [displayTrack?.Id])
  
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  
  // Check if there's a next song available
  const hasNext = queue.length > 0 && (
    currentIndex < 0 || // No current track, but queue has songs
    currentIndex < queue.length - 1 || // Not at the end of queue
    repeat === 'all' // Repeat all is enabled
  )

  // Always show the bar if there's a track to display (current or last played)
  if (!displayTrack) {
    return null
  }

  return (
    <>
      <div
        className="fixed left-0 right-0 bg-zinc-900 border-t border-zinc-800 z-40 cursor-pointer"
        style={{ bottom: `calc(4rem + env(safe-area-inset-bottom) - 8px)` }}
        onClick={() => {
          setShowModal(true)
        }}
      >
          <div className="flex items-center gap-3 py-3 pr-3 pl-4">
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
                {(currentTrack || displayTrack).AlbumArtist || (currentTrack || displayTrack).ArtistItems?.[0]?.Name || 'Unknown Artist'}
              </div>
            </div>
            <div className="flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (currentTrack) {
                    togglePlayPause()
                  } else if (displayTrack) {
                    // Resume last played track
                    playTrack(displayTrack)
                  }
                }}
                className="w-10 h-10 flex items-center justify-center text-white hover:bg-zinc-800 rounded-full transition-colors ml-4"
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
                className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ml-1 ${
                  hasNext
                    ? 'text-white hover:bg-zinc-800'
                    : 'text-zinc-600 cursor-not-allowed'
                }`}
                disabled={!hasNext}
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>
          </div>
          {displayTrack && (
            <div className="h-1 bg-zinc-800">
              <div
                className="h-full bg-[var(--accent-color)] transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
      </div>
      {showModal && (
        <PlayerModal 
          onClose={handleCloseModal} 
          onClosingStart={() => setIsModalClosing(true)}
          closeRef={closeModalRef}
        />
      )}
    </>
  )
}

