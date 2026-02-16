import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BaseItemDto, LightweightSong } from '../api/types'
import { jellyfinClient } from '../api/jellyfin'
import { useMusicStore } from './musicStore'
import { useSettingsStore } from './settingsStore'
import { useToastStore } from './toastStore'
import { useStatsStore } from './statsStore'
import { logger } from '../utils/logger'
import { shuffleArray } from '../utils/array'
import { isIOS } from '../utils/formatting'

// Track which items have been reported to prevent duplicate API calls
// Limit size to prevent unbounded memory growth during long sessions
const MAX_REPORTED_ITEMS = 100
const reportedItems = new Set<string>()
const reportingTimeouts = new Map<string, NodeJS.Timeout>()
const refreshTimeouts = new Set<NodeJS.Timeout>() // Track nested refresh timeouts
let shuffleExpansionTimeout: NodeJS.Timeout | null = null // Track shuffle expansion timeout

// Trim reportedItems if it grows too large
function trimReportedItems() {
  if (reportedItems.size > MAX_REPORTED_ITEMS) {
    const items = Array.from(reportedItems)
    const toRemove = items.slice(0, items.length - MAX_REPORTED_ITEMS)
    toRemove.forEach(id => reportedItems.delete(id))
  }
}

// Clear playback tracking state (call on logout to prevent memory leaks)
export function clearPlaybackTrackingState() {
  reportedItems.clear()
  for (const timeout of reportingTimeouts.values()) {
    clearTimeout(timeout)
  }
  reportingTimeouts.clear()
  for (const timeout of refreshTimeouts) {
    clearTimeout(timeout)
  }
  refreshTimeouts.clear()
  if (shuffleExpansionTimeout) {
    clearTimeout(shuffleExpansionTimeout)
    shuffleExpansionTimeout = null
  }
}

// Helper function to report playback after a delay
function reportPlaybackWithDelay(trackId: string, getCurrentTrack: () => BaseItemDto | null, delayMs: number = 5000) {
  const timeoutId = setTimeout(async () => {
    // Check if we're still playing the same track
    const currentTrack = getCurrentTrack()

    if (currentTrack?.Id === trackId) {
      try {
        await jellyfinClient.markItemAsPlayed(trackId)
        reportedItems.add(trackId)
        trimReportedItems()
        // Trigger event to refresh RecentlyPlayed after server updates
        const refreshTimeout = setTimeout(() => {
          window.dispatchEvent(new CustomEvent('trackPlayed', { detail: { trackId } }))
          refreshTimeouts.delete(refreshTimeout)
        }, 4000)
        refreshTimeouts.add(refreshTimeout)
      } catch (error) {
        // Error already logged in markItemAsPlayed
      }
    }
    reportingTimeouts.delete(trackId)
  }, delayMs)

  reportingTimeouts.set(trackId, timeoutId)
}

// Helper function to mark item as reported and clear any pending timeout
export function markItemAsReported(trackId: string) {
  reportedItems.add(trackId)
  trimReportedItems()
  const timeout = reportingTimeouts.get(trackId)
  if (timeout) {
    clearTimeout(timeout)
    reportingTimeouts.delete(trackId)
  }
}

export interface QueueSong extends BaseItemDto {
  source: 'user' | 'recommendation'  // 'user' for manually added, 'recommendation' for auto-added
}

interface PlayerState {
  // Core queue data
  songs: QueueSong[]  // Single source of truth - all songs in playback order

  // Navigation indices
  currentIndex: number  // -1 = no current song
  previousIndex: number // -1 = no previous song (for going back)

  // Ordering modes for user songs
  standardOrder: string[]  // IDs of user songs in standard order
  shuffleOrder: string[]   // IDs of user songs in shuffle order

  // Playback state
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number

  // Modes
  shuffle: boolean
  repeat: 'off' | 'all' | 'one'

  // Audio
  audioElement: HTMLAudioElement | null
  nextAudioElement: HTMLAudioElement | null  // Pre-buffered element for gapless playback
  nextTrackId: string | null  // ID of track loaded into nextAudioElement

  // UI state
  isFetchingRecommendations: boolean
  isLoadingMoreSongs: boolean  // Shows spinner when loading additional shuffle songs
  shuffleHasMoreSongs: boolean // True if more songs available for current shuffle
  lastPlayedTrack: BaseItemDto | null  // Persisted for display on app load
  isShuffleAllActive: boolean  // For backward compatibility
  isShuffleGenreActive: boolean  // For backward compatibility
  manuallyCleared: boolean  // Prevent recommendations after manual clearing
  hasRecordedCurrentTrackStats: boolean  // Prevent double-recording stats for same track

  // Actions
  setAudioElement: (element: HTMLAudioElement | null) => void
  setNextAudioElement: (element: HTMLAudioElement | null) => void
  preBufferNextTrack: () => void
  swapToPreBuffered: () => void
  cancelPreBuffer: () => void
  setIsFetchingRecommendations: (isFetching: boolean) => void
  setIsLoadingMoreSongs: (isLoading: boolean) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number) => void

  // Queue management
  clearQueue: () => void
  addToQueue: (tracks: BaseItemDto[], playNext?: boolean, source?: 'user' | 'recommendation') => void
  addToQueueWithToast: (tracks: BaseItemDto[]) => void
  removeFromQueue: (index: number) => void
  reorderQueue: (fromIndex: number, toIndex: number) => void

  // Playback control
  play: () => void
  pause: () => void
  togglePlayPause: () => void
  next: () => void
  previous: () => void
  seek: (time: number) => void

  // Mode toggles
  toggleShuffle: () => void
  toggleRepeat: () => void

  // Playback initiation
  playTrack: (track: BaseItemDto | LightweightSong, queue?: (BaseItemDto | LightweightSong)[]) => void
  playAlbum: (tracks: (BaseItemDto | LightweightSong)[], startIndex?: number) => void
  playNext: (tracks: BaseItemDto[]) => void
  shuffleArtist: (songs: BaseItemDto[]) => void
  shuffleAllSongs: () => Promise<void>
  shuffleGenreSongs: (genreId: string, genreName: string) => Promise<void>

  // Queue navigation
  skipToTrack: (trackIndex: number) => void

  // Track management
  refreshCurrentTrack: () => Promise<void>

  // Sidebar state
  isQueueSidebarOpen: boolean
  toggleQueueSidebar: () => void
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      // Initial state
      songs: [],
      currentIndex: -1,
      previousIndex: -1,
      standardOrder: [],
      shuffleOrder: [],
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 1,
      shuffle: false,
      repeat: 'off',
      audioElement: null,
      nextAudioElement: null,
      nextTrackId: null,
      isFetchingRecommendations: false,
      isLoadingMoreSongs: false,
      shuffleHasMoreSongs: false,
      lastPlayedTrack: null,
      isShuffleAllActive: false,
      isShuffleGenreActive: false,

      manuallyCleared: false,
      hasRecordedCurrentTrackStats: false,
      isQueueSidebarOpen: false,

      setAudioElement: (element) => {
        set({ audioElement: element })
        if (element) {
          element.volume = get().volume
        }
      },

      setNextAudioElement: (element) => {
        set({ nextAudioElement: element })
        if (element) {
          element.volume = get().volume
        }
      },

      preBufferNextTrack: () => {
        const { nextAudioElement, currentIndex, songs, repeat, nextTrackId } = get()
        if (!nextAudioElement) return
        if (repeat === 'one') return

        let nextIndex = currentIndex + 1
        if (nextIndex >= songs.length) {
          if (repeat === 'all') {
            nextIndex = 0
          } else {
            // End of queue, nothing to pre-buffer
            if (nextTrackId) {
              set({ nextTrackId: null })
              nextAudioElement.removeAttribute('src')
              nextAudioElement.load()
            }
            return
          }
        }

        const nextTrack = songs[nextIndex]
        if (!nextTrack) return
        if (nextTrackId === nextTrack.Id) return // Already pre-buffered

        const baseUrl = jellyfinClient.serverBaseUrl
        if (!baseUrl) return

        const audioUrl = `${baseUrl}/Audio/${nextTrack.Id}/stream?static=true`
        nextAudioElement.src = audioUrl
        nextAudioElement.load()
        set({ nextTrackId: nextTrack.Id })
      },

      swapToPreBuffered: () => {
        const { audioElement, nextAudioElement, nextTrackId, currentIndex, songs, repeat } = get()
        logger.debug('[PlayerStore] swapToPreBuffered called', { nextTrackId, currentIndex })
        if (!nextAudioElement || !nextTrackId) return

        let nextIndex = currentIndex + 1
        if (nextIndex >= songs.length) {
          if (repeat === 'all') {
            nextIndex = 0
          } else {
            return
          }
        }

        const nextTrack = songs[nextIndex]
        if (!nextTrack || nextTrack.Id !== nextTrackId) {
          // Pre-buffer is stale
          get().cancelPreBuffer()
          return
        }

        // Record stats for the finishing track
        const state = get()
        if (!state.hasRecordedCurrentTrackStats && state.currentIndex >= 0 && state.currentIndex < state.songs.length) {
          const finishedTrack = state.songs[state.currentIndex]
          useStatsStore.getState().recordPlay(finishedTrack, state.currentTime * 1000)
        }

        const currentTrack = currentIndex >= 0 ? songs[currentIndex] : null

        // iOS PWA: swapping Audio elements kills the audio session when backgrounded.
        // Instead, reuse the SAME active audio element by changing its src.
        // This keeps the iOS audio session alive so background auto-advance works.
        if (isIOS()) {
          // Cancel the pre-buffer (we won't use the nextAudioElement)
          nextAudioElement.removeAttribute('src')
          nextAudioElement.load()

          const baseUrl = jellyfinClient.serverBaseUrl
          if (!baseUrl || !audioElement) return

          const audioUrl = `${baseUrl}/Audio/${nextTrack.Id}/stream?static=true`

          set({
            nextTrackId: null,
            previousIndex: currentIndex,
            currentIndex: nextIndex,
            lastPlayedTrack: currentTrack,
            hasRecordedCurrentTrackStats: false,
            currentTime: 0,
            duration: 0,
            isPlaying: true,
          })

          audioElement.src = audioUrl
          audioElement.load()
          audioElement.play().then(() => {
            reportPlaybackWithDelay(nextTrack.Id, () => get().songs[get().currentIndex] || null)
            useMusicStore.getState().addToRecentlyPlayed(nextTrack)
            useStatsStore.getState().startPlay(nextTrack)
          }).catch((error) => {
            logger.error('[iOS Gapless] Playback error:', error)
            set({ isPlaying: false })
          })
          return
        }

        // Desktop/Android: swap audio elements for true gapless playback
        // Stop the old active element
        if (audioElement) {
          audioElement.pause()
          audioElement.removeAttribute('src')
          audioElement.load()
        }

        // Swap: nextAudioElement becomes active, old audioElement becomes next
        // Set duration/currentTime from the pre-buffered element since loadedmetadata
        // won't fire again (it already fired during pre-buffering)
        const nextDuration = nextAudioElement.duration && !isNaN(nextAudioElement.duration)
          ? nextAudioElement.duration : 0
        // Set isPlaying atomically with the swap to prevent source-setting
        // effects in PlayerBar from seeing !isPlaying and calling load() on the
        // already-playing element
        set({
          audioElement: nextAudioElement,
          nextAudioElement: audioElement,
          nextTrackId: null,
          previousIndex: currentIndex,
          currentIndex: nextIndex,
          lastPlayedTrack: currentTrack,
          hasRecordedCurrentTrackStats: false,
          currentTime: 0,
          duration: nextDuration,
          isPlaying: true,
        })

        nextAudioElement.play().then(() => {
          reportPlaybackWithDelay(nextTrack.Id, () => get().songs[get().currentIndex] || null)
          useMusicStore.getState().addToRecentlyPlayed(nextTrack)
          useStatsStore.getState().startPlay(nextTrack)
        }).catch((error) => {
          logger.error('[Gapless] Playback error on swapped element:', error)
          set({ isPlaying: false })
        })
      },

      cancelPreBuffer: () => {
        const { nextAudioElement } = get()
        if (nextAudioElement) {
          nextAudioElement.removeAttribute('src')
          nextAudioElement.load()
        }
        set({ nextTrackId: null })
      },

      setIsFetchingRecommendations: (isFetching) => {
        set({ isFetchingRecommendations: isFetching })
      },

      setIsLoadingMoreSongs: (isLoading) => {
        set({ isLoadingMoreSongs: isLoading })
      },

      setCurrentTime: (time) => {
        const { currentIndex, songs, hasRecordedCurrentTrackStats } = get()
        set({ currentTime: time })

        // Record stats when crossing 60s mark (for songs ≥1min)
        // Pass actual listened time for threshold check (recordPlay stores full duration)
        if (time >= 60 && !hasRecordedCurrentTrackStats && currentIndex >= 0 && currentIndex < songs.length) {
          const currentTrack = songs[currentIndex]
          useStatsStore.getState().recordPlay(currentTrack, time * 1000)
          set({ hasRecordedCurrentTrackStats: true })
        }
      },

      setDuration: (duration) => {
        set({ duration })
      },

      setVolume: (volume) => {
        set({ volume })
        const audio = get().audioElement
        if (audio) {
          audio.volume = volume
        }
        const nextAudio = get().nextAudioElement
        if (nextAudio) {
          nextAudio.volume = volume
        }
      },

      clearQueue: () => {
        get().cancelPreBuffer()
        // Cancel any pending shuffle expansion
        if (shuffleExpansionTimeout) {
          clearTimeout(shuffleExpansionTimeout)
          shuffleExpansionTimeout = null
        }
        set((state) => {
          // Keep only the currently playing song, clear everything else
          const currentSong = state.currentIndex >= 0 ? [state.songs[state.currentIndex]] : []
          return {
            songs: currentSong,
            currentIndex: currentSong.length > 0 ? 0 : -1,
            previousIndex: -1,
            standardOrder: currentSong.map(s => s.Id),
            shuffleOrder: currentSong.map(s => s.Id),
            manuallyCleared: true, // Mark as manually cleared to prevent recommendations
            // Keep playback state for current song
            // isPlaying, currentTime, duration stay as they are
          }
        })
      },

      addToQueue: (tracks, playNext = false, source = 'user') => {
        get().cancelPreBuffer()
        set((state) => {
          const currentSong = state.currentIndex >= 0 ? state.songs[state.currentIndex] : null

          const newSongs = tracks.map(track => ({ ...track, source: source as 'user' | 'recommendation' }))

          let finalSongs: QueueSong[]
          const songsToInsert = newSongs

          if (playNext) {
            // Add as play next - insert after current song in the overall queue
            const songsToInsertShuffled = state.shuffle ? shuffleArray([...newSongs]) : newSongs

            // Insert after current song position
            const insertPosition = state.currentIndex + 1
            const songsBeforeInsert = state.songs.slice(0, insertPosition)
            const songsAfterInsert = state.songs.slice(insertPosition)

            // Rebuild the queue with new songs inserted
            finalSongs = [
              ...songsBeforeInsert,
              ...songsToInsertShuffled,
              ...songsAfterInsert
            ]
          } else {
            // Different logic for user tracks vs recommendations
            if (source === 'recommendation') {
              // Recommendations: always append to the end of the queue
              // This prevents shifting currently playing recommendations
              finalSongs = [...state.songs, ...songsToInsert]
            } else {
              // User tracks: insert after current position, before upcoming recommendations
              // Find first recommendation AFTER current position
              const firstUpcomingRecoIdx = state.songs.findIndex((song, idx) =>
                idx > state.currentIndex && song.source === 'recommendation'
              )

              if (firstUpcomingRecoIdx !== -1) {
                // Insert before first upcoming recommendation (after current position)
                finalSongs = [
                  ...state.songs.slice(0, firstUpcomingRecoIdx),
                  ...songsToInsert,
                  ...state.songs.slice(firstUpcomingRecoIdx)
                ]
              } else {
                // No upcoming recommendations, just append to the end
                finalSongs = [...state.songs, ...songsToInsert]
              }
            }
          }

          // Update current index if current song moved (only when inserting user tracks before it)
          let newCurrentIndex = state.currentIndex
          if (state.currentIndex >= 0 && currentSong) {
            // Find current song in the new queue by ID
            const foundIndex = finalSongs.findIndex(s => s.Id === currentSong.Id)
            if (foundIndex !== -1) {
              newCurrentIndex = foundIndex
            } else {
              logger.error(`[addToQueue] CRITICAL: Could not find current song in new queue!`)
            }
          }

          // Enforce max queue size (1000 songs total)
          let trimmedSongs = finalSongs
          if (finalSongs.length > 1000) {
            const songsBeforeCurrent = finalSongs.slice(0, newCurrentIndex)
            const songsAfterCurrent = finalSongs.slice(newCurrentIndex + 1)

            const keepPrevious = songsBeforeCurrent.slice(-5)
            const keepAfter = songsAfterCurrent

            const remainingSlots = 1000 - keepPrevious.length - (currentSong ? 1 : 0) - keepAfter.length
            const keepBefore = songsBeforeCurrent.slice(-Math.max(0, remainingSlots))

            trimmedSongs = [
              ...keepBefore,
              ...(currentSong ? [currentSong] : []),
              ...keepAfter
            ]

            newCurrentIndex = currentSong ? keepBefore.length : -1
          }

          // CRITICAL: Always rebuild order arrays from actual user songs in the final queue
          // This ensures order arrays are always in sync with the queue
          const userSongsInOrder = trimmedSongs.filter(s => s.source === 'user')
          const newOrderArray = userSongsInOrder.map(s => s.Id)

          return {
            songs: trimmedSongs,
            currentIndex: newCurrentIndex,
            // Both arrays now reflect the actual order of user songs in the queue
            standardOrder: newOrderArray,
            shuffleOrder: newOrderArray,
            manuallyCleared: false,
          }
        })
      },

      addToQueueWithToast: (tracks) => {
        get().addToQueue(tracks, false, 'user')
        // Show toast notification
        const count = tracks.length
        const message = count === 1
          ? 'Added to queue'
          : `${count} songs added to queue`
        useToastStore.getState().addToast(message, 'success', 2000)
      },

      removeFromQueue: (index) => {
        get().cancelPreBuffer()
        set((state) => {
          if (index < 0 || index >= state.songs.length) return state

          const songToRemove = state.songs[index]
          const newSongs = state.songs.filter((_, i) => i !== index)

          // Update order arrays
          let newStandardOrder = state.standardOrder.filter(id => id !== songToRemove.Id)
          let newShuffleOrder = state.shuffleOrder.filter(id => id !== songToRemove.Id)

          // Update indices
          let newCurrentIndex = state.currentIndex
          let newPreviousIndex = state.previousIndex

          if (index < state.currentIndex) {
            newCurrentIndex = state.currentIndex - 1
          } else if (index === state.currentIndex) {
            // Current song removed - stop playback but keep the song as lastPlayedTrack
            newCurrentIndex = -1
            // Don't clear lastPlayedTrack here, let it persist
          }

          if (index < state.previousIndex) {
            newPreviousIndex = state.previousIndex - 1
          } else if (index === state.previousIndex) {
            newPreviousIndex = -1 // Previous song removed
          }

          return {
            songs: newSongs,
            currentIndex: newCurrentIndex,
            previousIndex: newPreviousIndex,
            standardOrder: newStandardOrder,
            shuffleOrder: newShuffleOrder,
          }
        })
      },

      reorderQueue: (fromIndex, toIndex) => {
        get().cancelPreBuffer()
        set((state) => {
          if (fromIndex < 0 || toIndex < 0 ||
            fromIndex >= state.songs.length || toIndex >= state.songs.length ||
            fromIndex === toIndex) {
            return state
          }

          const fromSong = state.songs[fromIndex]
          const toSong = state.songs[toIndex]

          // Don't allow dragging between user songs and recommendations
          if (fromSong.source !== toSong.source) {
            return state
          }

          const newSongs = [...state.songs]
          const [removed] = newSongs.splice(fromIndex, 1)
          newSongs.splice(toIndex, 0, removed)

          // Update order arrays for user songs
          if (fromSong.source === 'user') {
            const orderArray = state.shuffle ? 'shuffleOrder' : 'standardOrder'
            const currentOrder = state[orderArray] as string[]

            // Remove and reinsert in the order array
            const orderIndex = currentOrder.indexOf(fromSong.Id)
            if (orderIndex >= 0) {
              const newOrder = [...currentOrder]
              newOrder.splice(orderIndex, 1)

              // Find where to insert in the user songs section
              const userSongsBeforeTo = newSongs.slice(0, toIndex + 1).filter(s => s.source === 'user')
              const insertIndex = userSongsBeforeTo.length - 1

              newOrder.splice(insertIndex, 0, fromSong.Id)

              const newCurrentIndex = toIndex === state.currentIndex ? toIndex :
                fromIndex === state.currentIndex ? toIndex :
                  state.currentIndex
              return {
                songs: newSongs,
                [orderArray]: newOrder,
                currentIndex: newCurrentIndex,
                previousIndex: toIndex === state.previousIndex ? toIndex :
                  fromIndex === state.previousIndex ? toIndex :
                    state.previousIndex,
              }
            }
          }

          // For recommendations, just update indices
          const newCurrentIndex2 = toIndex === state.currentIndex ? toIndex :
            fromIndex === state.currentIndex ? toIndex :
              state.currentIndex
          return {
            songs: newSongs,
            currentIndex: newCurrentIndex2,
            previousIndex: toIndex === state.previousIndex ? toIndex :
              fromIndex === state.previousIndex ? toIndex :
                state.previousIndex,
          }
        })
      },

      play: () => {
        const { audioElement, currentIndex, songs, currentTime } = get()
        logger.debug('[PlayerStore] play() called', { currentIndex, hasAudio: !!audioElement })
        if (audioElement && currentIndex >= 0 && currentIndex < songs.length) {
          const track = songs[currentIndex]

          // Ensure audio source is set
          const baseUrl = jellyfinClient.serverBaseUrl
          const audioUrl = baseUrl
            ? `${baseUrl}/Audio/${track.Id}/stream?static=true`
            : ''
          if (audioElement.src !== audioUrl) {
            audioElement.src = audioUrl
            audioElement.load()
          } else if (currentTime === 0 && audioElement.currentTime > 0.5) {
            // Same URL but state says we want to restart from beginning
            // (e.g., clicking currently playing song from album/search)
            audioElement.currentTime = 0
            // Restore duration from audio element since loadedmetadata won't fire again
            if (audioElement.duration && !isNaN(audioElement.duration)) {
              set({ duration: audioElement.duration })
            }
          }

          audioElement.play().then(() => {
            set({ isPlaying: true, hasRecordedCurrentTrackStats: false })
            reportPlaybackWithDelay(track.Id, () => get().songs[get().currentIndex] || null)
            // Track locally played songs for recently played list
            useMusicStore.getState().addToRecentlyPlayed(track)
            // Start tracking for stats
            useStatsStore.getState().startPlay(track)
          }).catch((error) => {
            logger.error('Playback error:', error)
            set({ isPlaying: false })
          })
        }
      },

      pause: () => {
        const audio = get().audioElement
        if (audio) {
          audio.pause()
          set({ isPlaying: false })
          logger.debug('[PlayerStore] pause() called')
        }
      },

      togglePlayPause: () => {
        const { isPlaying, play, pause } = get()
        logger.debug('[PlayerStore] togglePlayPause() called', { isPlaying })
        if (isPlaying) {
          pause()
        } else {
          play()
        }
      },

      next: () => {
        const state = get()
        logger.debug('[PlayerStore] next() called', { currentIndex: state.currentIndex, queueLength: state.songs.length })

        if (state.songs.length === 0) return

        // Handle repeat-one mode
        if (state.repeat === 'one' && state.currentIndex >= 0) {
          get().seek(0)
          get().play()
          return
        }

        let nextIndex = state.currentIndex + 1

        // Handle end of queue
        if (nextIndex >= state.songs.length) {
          if (state.repeat === 'all') {
            nextIndex = 0
          } else {
            // Record stats for finishing track
            if (!state.hasRecordedCurrentTrackStats && state.currentIndex >= 0 && state.currentIndex < state.songs.length) {
              const finishedTrack = state.songs[state.currentIndex]
              useStatsStore.getState().recordPlay(finishedTrack, state.currentTime * 1000)
            }
            get().pause()
            return
          }
        }

        // Try gapless swap if pre-buffer matches the expected next track
        const expectedNextTrack = state.songs[nextIndex]
        if (state.nextTrackId && expectedNextTrack && state.nextTrackId === expectedNextTrack.Id) {
          get().swapToPreBuffered()
          return
        }

        // Fallback: no valid pre-buffer, do standard next
        if (!state.hasRecordedCurrentTrackStats && state.currentIndex >= 0 && state.currentIndex < state.songs.length) {
          const finishedTrack = state.songs[state.currentIndex]
          useStatsStore.getState().recordPlay(finishedTrack, state.currentTime * 1000)
        }

        const currentTrack = state.currentIndex >= 0 ? state.songs[state.currentIndex] : null

        set({
          previousIndex: state.currentIndex,
          currentIndex: nextIndex,
          lastPlayedTrack: currentTrack,
        })

        // Play the next track
        get().play()
      },

      previous: () => {
        get().cancelPreBuffer()
        set((state) => {
          if (state.songs.length === 0) return state

          let newCurrentIndex = state.currentIndex
          let newPreviousIndex = state.currentIndex // Remember where we came from

          if (state.currentIndex > 0) {
            // Go to previous song in queue
            newCurrentIndex = state.currentIndex - 1
          } else {
            // At start of queue, wrap around if repeat all
            if (state.repeat === 'all') {
              newCurrentIndex = state.songs.length - 1
            } else {
              return state // Can't go previous
            }
          }

          return {
            currentIndex: newCurrentIndex,
            previousIndex: newPreviousIndex,
          }
        })

        // Play the previous track (this reads fresh state after the update)
        get().play()
      },

      seek: (time) => {
        const audio = get().audioElement
        if (audio) {
          audio.currentTime = time
          set({ currentTime: time })
        }
        // Dispatch event so PlayerBar can reset preemptive advance flag
        window.dispatchEvent(new CustomEvent('playerSeek'))
      },

      toggleShuffle: () => {
        get().cancelPreBuffer()
        set((state) => {
          const newShuffle = !state.shuffle

          if (newShuffle) {
            // Shuffle only upcoming songs, preserve previous songs and current song position
            const previousSongs = state.songs.slice(0, state.currentIndex) // Songs before current
            const currentSong = state.currentIndex >= 0 ? state.songs[state.currentIndex] : null
            const upcomingSongs = state.songs.slice(state.currentIndex + 1).filter(s => s.source === 'user') // User songs after current
            const recommendations = state.songs.filter(s => s.source === 'recommendation')

            // Shuffle the upcoming songs
            const shuffledUpcomingIds = shuffleArray(upcomingSongs.map(s => s.Id))
            const shuffledUpcomingSongs = shuffledUpcomingIds.map(id =>
              upcomingSongs.find(s => s.Id === id)
            ).filter(Boolean) as QueueSong[]

            // Rebuild queue: previous + current + shuffled upcoming + recommendations
            const newSongs = [
              ...previousSongs,
              ...(currentSong ? [currentSong] : []),
              ...shuffledUpcomingSongs,
              ...recommendations
            ]

            // Update shuffleOrder for the upcoming songs only
            const newShuffleOrder = [...state.standardOrder.slice(0, state.currentIndex + 1), ...shuffledUpcomingIds]

            return {
              shuffle: newShuffle,
              shuffleOrder: newShuffleOrder,
              songs: newSongs,
              // currentIndex remains the same
            }
          } else {

            // Restore standard order for upcoming songs, preserve previous songs and current song position
            const previousSongs = state.songs.slice(0, state.currentIndex) // Songs before current
            const currentSong = state.currentIndex >= 0 ? state.songs[state.currentIndex] : null
            const upcomingStandardIds = state.standardOrder.slice(state.currentIndex + 1) // Standard order IDs after current


            const upcomingStandardSongs = upcomingStandardIds
              .map(id => state.songs.find(s => s.Id === id && s.source === 'user'))
              .filter(Boolean) as QueueSong[]


            const recommendations = state.songs.filter(s => s.source === 'recommendation')

            // Rebuild queue: previous + current + standard upcoming + recommendations
            const newSongs = [
              ...previousSongs,
              ...(currentSong ? [currentSong] : []),
              ...upcomingStandardSongs,
              ...recommendations
            ]


            return {
              shuffle: newShuffle,
              songs: newSongs,
              // currentIndex remains the same
            }
          }
        })
      },

      toggleRepeat: () => {
        get().cancelPreBuffer()
        set((state) => {
          const nextRepeat: 'off' | 'all' | 'one' =
            state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off'
          return { repeat: nextRepeat }
        })
      },

      playTrack: (track, queue) => {
        get().cancelPreBuffer()
        // If queue is provided, maintain the original order and set currentIndex to the selected track
        let tracks: (BaseItemDto | LightweightSong)[]
        let currentIndex: number

        if (queue) {
          // Keep the original order from queue, but put the selected track at the right position
          tracks = queue
          currentIndex = queue.findIndex(t => t.Id === track.Id)
          if (currentIndex === -1) {
            // Fallback if track not found in queue
            tracks = [track, ...queue.filter(t => t.Id !== track.Id)]
            currentIndex = 0
          }
        } else {
          tracks = [track]
          currentIndex = 0
        }

        const songs = tracks.map(t => ({ ...t, source: 'user' as const }))

        set({
          songs,
          standardOrder: songs.map(s => s.Id),
          shuffleOrder: songs.map(s => s.Id),
          currentIndex,
          previousIndex: currentIndex > 0 ? currentIndex - 1 : -1,
          shuffle: false,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          manuallyCleared: false,

        })

        // Start playback
        get().play()
      },

      playAlbum: (tracks, startIndex = 0) => {
        get().cancelPreBuffer()
        const songs = tracks.map(t => ({ ...t, source: 'user' as const }))

        set({
          songs,
          standardOrder: songs.map(s => s.Id),
          shuffleOrder: songs.map(s => s.Id),
          currentIndex: startIndex,
          previousIndex: startIndex > 0 ? startIndex - 1 : -1,
          shuffle: false,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          manuallyCleared: false,

        })

        // Start playback
        get().play()
      },

      playNext: (tracks) => {
        get().addToQueue(tracks, true) // playNext = true
        // Show toast notification
        const count = tracks.length
        const message = count === 1
          ? 'Playing next'
          : `${count} songs playing next`
        useToastStore.getState().addToast(message, 'success', 2000)
      },

      shuffleArtist: (songs) => {
        get().cancelPreBuffer()
        const standardSongs = songs.map(t => ({ ...t, source: 'user' as const }))
        const shuffled = shuffleArray(standardSongs)

        set({
          songs: shuffled,
          standardOrder: standardSongs.map(s => s.Id),
          shuffleOrder: shuffled.map(s => s.Id),
          currentIndex: 0,
          previousIndex: -1,
          shuffle: true,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          manuallyCleared: false,
        })

        // Start playback
        get().play()
      },

      shuffleAllSongs: async () => {

        // Clear the queue first
        get().clearQueue()

        // Disable recommendations
        const { setShowQueueRecommendations } = useSettingsStore.getState()
        setShowQueueRecommendations(false)

        // Device detection for song limits
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
        const maxSongs = isMobile ? 400 : 800


        // Try to use shuffle pool for instant start
        const musicStore = useMusicStore.getState()


        let instantSongs: LightweightSong[] = []
        let remainingSongs: LightweightSong[] = []

        if (musicStore.shufflePool.length >= 1) {
          // Use available songs from shuffle pool for instant playback (up to 5)
          const availableFromPool = Math.min(5, musicStore.shufflePool.length)
          instantSongs = musicStore.shufflePool.slice(0, availableFromPool)
          // Refresh the pool by removing used songs and adding new ones
          const remainingPool = musicStore.shufflePool.slice(availableFromPool)
          const poolSongs = musicStore.songs
          const recentlyPlayedIds = new Set(musicStore.recentlyPlayed.slice(0, 10).map(s => s.Id))
          const availableForPool = poolSongs.filter(s => !recentlyPlayedIds.has(s.Id))
          const newPoolSongs = shuffleArray(availableForPool).slice(0, availableFromPool)
          const refreshedPool = [...remainingPool, ...newPoolSongs]

          useMusicStore.setState({
            shufflePool: refreshedPool,
            lastPoolUpdate: Date.now()
          })
        } else {

          // Fallback: quick load from cache or API
          let allSongs = musicStore.songs

          if (!allSongs || allSongs.length === 0) {

            try {
              const result = await jellyfinClient.getSongs({
                limit: Math.max(50, maxSongs), // Load at least 50 for instant start
                sortBy: ['SortName'],
                sortOrder: 'Ascending'
              })
              allSongs = result.Items || []
            } catch (error) {
              logger.error('Failed to fetch songs for shuffle all:', error)
              return
            }
          }

          // Use first 5 for instant start
          instantSongs = shuffleArray(allSongs).slice(0, 5)
          remainingSongs = allSongs.filter(s => !instantSongs.some(inst => inst.Id === s.Id))


          // Initialize shuffle pool for future use
          useMusicStore.setState({
            songs: allSongs, // Cache the fetched songs
            shufflePool: shuffleArray(allSongs).slice(0, 30), // Create pool from fetched songs
            lastPoolUpdate: Date.now()
          })
        }

        // PHASE 1: Start with available songs for instant playback
        const instantQueueSongs = instantSongs.map(t => ({ ...t, source: 'user' as const }))
        const initialSongCount = instantSongs.length

        // Check if there are more songs available
        const totalAvailableSongs = musicStore.songs.length + Object.values(musicStore.genreSongs).flat().length
        const hasMoreSongs = totalAvailableSongs > instantSongs.length


        set({
          songs: instantQueueSongs,
          standardOrder: instantQueueSongs.map(s => s.Id),
          shuffleOrder: instantQueueSongs.map(s => s.Id),
          currentIndex: 0,
          previousIndex: -1,
          shuffle: true,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          isLoadingMoreSongs: false, // No spinner in queue
          shuffleHasMoreSongs: hasMoreSongs,
          manuallyCleared: true,
        })


        // Start playback immediately
        get().play()


        // PHASE 2: Background load remaining songs (up to maxSongs - initialSongCount)
        // Clear any previous shuffle expansion timeout
        if (shuffleExpansionTimeout) {
          clearTimeout(shuffleExpansionTimeout)
        }
        shuffleExpansionTimeout = setTimeout(async () => {
          shuffleExpansionTimeout = null // Clear reference once started

          try {
            const currentState = get()

            // Safety check - ensure we're still in shuffle mode and have expected initial count
            if (!currentState.shuffle || currentState.songs.length !== initialSongCount) {
              return // State changed, abort expansion
            }

            let fullSongPool = musicStore.songs

            // If main songs cache is empty, fetch from API
            if (!fullSongPool || fullSongPool.length === 0) {

              const result = await jellyfinClient.getSongs({
                limit: maxSongs,
                sortBy: ['SortName'],
                sortOrder: 'Ascending'
              })
              fullSongPool = result.Items || []
            }

            // Combine with genre songs and deduplicate
            const genreSongs = Object.values(musicStore.genreSongs).flat()
            const combinedPool = [...fullSongPool, ...genreSongs]
            const songMap = new Map()
            combinedPool.forEach(song => songMap.set(song.Id, song))
            const deduplicatedPool = Array.from(songMap.values())

            // Remove songs already in queue
            const currentSongIds = new Set(instantQueueSongs.map(s => s.Id))
            const availablePool = deduplicatedPool.filter(s => !currentSongIds.has(s.Id))


            if (availablePool.length > 0) {
              // Take up to maxSongs - initialSongCount more songs
              const additionalNeeded = Math.min(maxSongs - initialSongCount, availablePool.length)
              const additionalSongs = shuffleArray(availablePool).slice(0, additionalNeeded)
              const additionalQueueSongs = additionalSongs.map(t => ({ ...t, source: 'user' as const }))

              // Use functional set to safely merge with any user-added songs during expansion
              set((state) => {
                // Find songs added by user during the background expansion
                const instantSongIds = new Set(instantQueueSongs.map(s => s.Id))
                const userAddedDuringExpansion = state.songs.filter(
                  s => !instantSongIds.has(s.Id) && s.source === 'user'
                )

                // Merge: instant songs + user-added + expansion songs
                const newQueueSongs = [
                  ...instantQueueSongs,
                  ...userAddedDuringExpansion,
                  ...additionalQueueSongs
                ]

                // Recalculate current index if user songs were added
                let newCurrentIndex = state.currentIndex
                if (userAddedDuringExpansion.length > 0 && state.currentIndex >= instantQueueSongs.length) {
                  // Adjust index to account for reordering
                  const currentSong = state.songs[state.currentIndex]
                  if (currentSong) {
                    newCurrentIndex = newQueueSongs.findIndex(s => s.Id === currentSong.Id)
                  }
                }

                return {
                  songs: newQueueSongs,
                  currentIndex: newCurrentIndex >= 0 ? newCurrentIndex : state.currentIndex,
                  standardOrder: newQueueSongs.map(s => s.Id),
                  shuffleOrder: newQueueSongs.map(s => s.Id),
                  shuffleHasMoreSongs: availablePool.length > additionalNeeded,
                  // Reset manuallyCleared after shuffle expansion completes
                  // so recommendations can resume if user enables them
                  manuallyCleared: false
                }
              })

              // Refresh shuffle pool after shuffle operation
              useMusicStore.getState().refreshShufflePool()

            }
          } catch (error) {
            logger.error('Failed to expand shuffle queue:', error)
            // Keep the initial 5 songs - better than nothing
          }
        }, 100)
      },

      shuffleGenreSongs: async (genreId, genreName) => {
        // Clear the queue first
        get().clearQueue()

        // Disable recommendations
        const { setShowQueueRecommendations } = useSettingsStore.getState()
        setShowQueueRecommendations(false)

        // Device detection for song limits
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
        const maxSongs = isMobile ? 400 : 800

        // Get genre songs from music store
        const genreSongs = useMusicStore.getState().genreSongs[genreId]

        if (!genreSongs || genreSongs.length === 0) {
          logger.warn(`No songs found for genre: ${genreName}`)
          return
        }

        // Use first 5 songs for instant start
        const instantSongs = shuffleArray(genreSongs).slice(0, 5)
        const remainingGenreSongs = genreSongs.filter(s => !instantSongs.some(inst => inst.Id === s.Id))
        const instantQueueSongs = instantSongs.map(t => ({ ...t, source: 'user' as const }))

        // Check if there are more songs available in this genre
        const hasMoreSongs = genreSongs.length > 5

        set({
          songs: instantQueueSongs,
          standardOrder: instantQueueSongs.map(s => s.Id),
          shuffleOrder: instantQueueSongs.map(s => s.Id),
          currentIndex: 0,
          previousIndex: -1,
          shuffle: true,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          isLoadingMoreSongs: false, // No spinner in queue
          shuffleHasMoreSongs: hasMoreSongs,
          manuallyCleared: true,
        })

        // Start playback immediately
        get().play()

        // Background load remaining genre songs
        // Clear any previous shuffle expansion timeout
        if (shuffleExpansionTimeout) {
          clearTimeout(shuffleExpansionTimeout)
        }
        shuffleExpansionTimeout = setTimeout(async () => {
          shuffleExpansionTimeout = null // Clear reference once started

          try {
            const currentState = get()

            // Safety check
            if (!currentState.shuffle || currentState.songs.length !== 5) {
              return // State changed, abort expansion
            }

            if (remainingGenreSongs.length > 0) {
              const additionalNeeded = Math.min(maxSongs - 5, remainingGenreSongs.length)
              const additionalSongs = shuffleArray(remainingGenreSongs).slice(0, additionalNeeded)
              const additionalQueueSongs = additionalSongs.map(t => ({ ...t, source: 'user' as const }))

              // Use functional set to safely merge with any user-added songs during expansion
              set((state) => {
                // Find songs added by user during the background expansion
                const instantSongIds = new Set(instantQueueSongs.map(s => s.Id))
                const userAddedDuringExpansion = state.songs.filter(
                  s => !instantSongIds.has(s.Id) && s.source === 'user'
                )

                // Merge: instant songs + user-added + expansion songs
                const newQueueSongs = [
                  ...instantQueueSongs,
                  ...userAddedDuringExpansion,
                  ...additionalQueueSongs
                ]

                // Recalculate current index if user songs were added
                let newCurrentIndex = state.currentIndex
                if (userAddedDuringExpansion.length > 0 && state.currentIndex >= instantQueueSongs.length) {
                  const currentSong = state.songs[state.currentIndex]
                  if (currentSong) {
                    newCurrentIndex = newQueueSongs.findIndex(s => s.Id === currentSong.Id)
                  }
                }

                return {
                  songs: newQueueSongs,
                  currentIndex: newCurrentIndex >= 0 ? newCurrentIndex : state.currentIndex,
                  standardOrder: newQueueSongs.map(s => s.Id),
                  shuffleOrder: newQueueSongs.map(s => s.Id),
                  shuffleHasMoreSongs: remainingGenreSongs.length > additionalNeeded,
                  // Reset manuallyCleared after shuffle expansion completes
                  manuallyCleared: false
                }
              })
            }
          } catch (error) {
            logger.error('Failed to expand genre shuffle queue:', error)
          }
        }, 100)
      },

      skipToTrack: (trackIndex) => {
        get().cancelPreBuffer()
        const { songs, currentIndex } = get()

        if (trackIndex < 0 || trackIndex >= songs.length) return

        // Set previous to current position, then move to new position
        const currentTrack = currentIndex >= 0 ? songs[currentIndex] : null
        set({
          previousIndex: currentIndex >= 0 ? currentIndex : -1,
          currentIndex: trackIndex,
          lastPlayedTrack: currentTrack,
          // Reset currentTime so play() knows to restart from beginning
          // This handles duplicate songs in queue (same ID at different positions)
          currentTime: 0,
        })

        // Start playback
        get().play()
      },

      refreshCurrentTrack: async () => {
        const { currentIndex, songs } = get()

        if (currentIndex < 0 || currentIndex >= songs.length) return

        const currentSong = songs[currentIndex]

        try {
          const freshTrack = await jellyfinClient.getSongById(currentSong.Id)
          if (freshTrack) {
            set((state) => {
              const newSongs = [...state.songs]
              newSongs[state.currentIndex] = { ...newSongs[state.currentIndex], ...freshTrack }
              return { songs: newSongs }
            })
          }
        } catch (error) {
          logger.error('Failed to refresh current track:', error)
        }
      },

      toggleQueueSidebar: () => {
        set((state) => ({ isQueueSidebarOpen: !state.isQueueSidebarOpen }))
      },
    }),
    {
      name: 'player-storage',
      partialize: (state) => ({
        // Core queue state
        songs: state.songs,
        currentIndex: state.currentIndex,
        previousIndex: state.previousIndex,
        standardOrder: state.standardOrder,
        shuffleOrder: state.shuffleOrder,

        // Playback preferences
        volume: state.volume,
        shuffle: state.shuffle,
        repeat: state.repeat,
        lastPlayedTrack: state.lastPlayedTrack,
        isShuffleAllActive: state.isShuffleAllActive,
        isShuffleGenreActive: state.isShuffleGenreActive,
        manuallyCleared: state.manuallyCleared,
        isQueueSidebarOpen: state.isQueueSidebarOpen,
      }),

      onRehydrateStorage: (state) => {
        if (state) {
          // Validate state consistency and fix corrupted states
          if (state.songs.length === 0) {
            // Empty queue - reset indices
            state.currentIndex = -1
            state.previousIndex = -1
            state.standardOrder = []
            state.shuffleOrder = []
          } else if (state.currentIndex >= state.songs.length) {
            // currentIndex out of bounds - reset to first track
            state.currentIndex = 0
            state.previousIndex = -1
          } else if (state.currentIndex < -1) {
            // Invalid negative index - reset
            state.currentIndex = -1
            state.previousIndex = -1
          }

          // Reset runtime state
          state.isPlaying = false
          state.currentTime = 0
          state.duration = 0
          state.audioElement = null
          state.nextAudioElement = null
          state.nextTrackId = null
          state.isFetchingRecommendations = false
          // Keep lastPlayedTrack as persisted
          state.isShuffleAllActive = false
          state.isShuffleGenreActive = false
        }
      }
    }
  )
)
