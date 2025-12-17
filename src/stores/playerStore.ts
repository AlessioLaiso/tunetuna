import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BaseItemDto, LightweightSong } from '../api/types'
import { jellyfinClient } from '../api/jellyfin'
import { useMusicStore } from './musicStore'
import { useSettingsStore } from './settingsStore'

// Track which items have been reported to prevent duplicate API calls
const reportedItems = new Set<string>()
const reportingTimeouts = new Map<string, NodeJS.Timeout>()

// Helper function to report playback after a delay
function reportPlaybackWithDelay(trackId: string, getCurrentTrack: () => BaseItemDto | null, delayMs: number = 5000) {
  const timeoutId = setTimeout(async () => {
    // Check if we're still playing the same track
    const currentTrack = getCurrentTrack()

    if (currentTrack?.Id === trackId) {
      try {
        await jellyfinClient.markItemAsPlayed(trackId)
        reportedItems.add(trackId)
        // Trigger event to refresh RecentlyPlayed after server updates
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('trackPlayed', { detail: { trackId } }))
        }, 4000)
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
  const timeout = reportingTimeouts.get(trackId)
  if (timeout) {
    clearTimeout(timeout)
    reportingTimeouts.delete(trackId)
  }
}

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
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

  // UI state
  isFetchingRecommendations: boolean
  isLoadingMoreSongs: boolean  // Shows spinner when loading additional shuffle songs
  shuffleHasMoreSongs: boolean // True if more songs available for current shuffle
  lastPlayedTrack: BaseItemDto | null  // Persisted for display on app load
  isShuffleAllActive: boolean  // For backward compatibility
  isShuffleGenreActive: boolean  // For backward compatibility
  manuallyCleared: boolean  // Prevent recommendations after manual clearing

  // Actions
  setAudioElement: (element: HTMLAudioElement | null) => void
  setIsFetchingRecommendations: (isFetching: boolean) => void
  setIsLoadingMoreSongs: (isLoading: boolean) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number) => void

  // Queue management
  clearQueue: () => void
  addToQueue: (tracks: BaseItemDto[], playNext?: boolean, source?: 'user' | 'recommendation') => void
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
}

// Custom hook to get current track (computed from songs and currentIndex)
export const useCurrentTrack = () => {
  const { songs, currentIndex } = usePlayerStore()
  return currentIndex >= 0 && songs.length > currentIndex ? songs[currentIndex] : null
}

// Custom hook to get last played track
export const useLastPlayedTrack = () => {
  const { lastPlayedTrack } = usePlayerStore()
  return lastPlayedTrack
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
      isFetchingRecommendations: false,
      isLoadingMoreSongs: false,
      shuffleHasMoreSongs: false,
      lastPlayedTrack: null,
      isShuffleAllActive: false,
      isShuffleGenreActive: false,
      manuallyCleared: false,

      setAudioElement: (element) => {
        set({ audioElement: element })
        if (element) {
          element.volume = get().volume
        }
      },

      setIsFetchingRecommendations: (isFetching) => {
        set({ isFetchingRecommendations: isFetching })
      },

      setIsLoadingMoreSongs: (isLoading) => {
        set({ isLoadingMoreSongs: isLoading })
      },

      setCurrentTime: (time) => {
        set({ currentTime: time })
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
      },

      clearQueue: () => {
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

        set((state) => {
          const newSongs = tracks.map(track => ({ ...track, source: source as 'user' | 'recommendation' }))

          // Separate existing user songs and recommendations
          const userSongs = state.songs.filter(song => song.source === 'user')
          const recommendations = state.songs.filter(song => song.source === 'recommendation')

          let updatedUserSongs: QueueSong[]
          let newStandardOrder = [...state.standardOrder]
          let newShuffleOrder = [...state.shuffleOrder]
          let finalSongs: QueueSong[]

          if (playNext) {
            // Add as play next - insert after current song in the overall queue
            const songsToInsert = state.shuffle ? shuffleArray([...newSongs]) : newSongs

            // Insert after current song position
            const insertPosition = state.currentIndex + 1
            const songsBeforeInsert = state.songs.slice(0, insertPosition)
            const songsAfterInsert = state.songs.slice(insertPosition)

            // Rebuild the queue with new songs inserted
            finalSongs = [
              ...songsBeforeInsert,
              ...songsToInsert,
              ...songsAfterInsert
            ]

            // Separate user songs and recommendations
            updatedUserSongs = finalSongs.filter(song => song.source === 'user')
            const newRecommendations = finalSongs.filter(song => song.source === 'recommendation')

            // Update order arrays
            const newSongIds = songsToInsert.map(s => s.Id)

            if (state.shuffle) {
              // For shuffle mode, insert new songs after current position in shuffle order
              const currentShuffleIndex = state.currentIndex
              newShuffleOrder = [
                ...state.shuffleOrder.slice(0, currentShuffleIndex + 1),
                ...newSongIds,
                ...state.shuffleOrder.slice(currentShuffleIndex + 1)
              ]
            } else {
              // For standard mode, maintain the order of updatedUserSongs
              newStandardOrder = updatedUserSongs.map(s => s.Id)
            }
          } else {
            // Add to queue with priority over recommendations
            const songsToInsert = newSongs

            // If current song is a recommendation, insert user songs after current but before remaining recommendations
            const currentSong = state.currentIndex >= 0 ? state.songs[state.currentIndex] : null
            if (currentSong?.source === 'recommendation') {
              // Find remaining recommendations after current song
              const remainingRecommendations = state.songs.slice(state.currentIndex + 1).filter(song => song.source === 'recommendation')
              const insertPosition = state.currentIndex + 1

              // Insert user songs after current song, before remaining recommendations
              finalSongs = [
                ...state.songs.slice(0, insertPosition),
                ...songsToInsert,
                ...remainingRecommendations,
                ...state.songs.slice(state.currentIndex + 1 + remainingRecommendations.length)
              ]
            } else {
              // Add to end of overall queue
              finalSongs = [...state.songs, ...songsToInsert]
            }

            // Separate user songs and recommendations for order arrays
            updatedUserSongs = finalSongs.filter(song => song.source === 'user')

            // Update order arrays
            const newSongIds = songsToInsert.map(s => s.Id)
            if (state.shuffle) {
              // For shuffle mode, insert new songs at the right position in shuffle order
              const insertPos = currentSong?.source === 'recommendation' ? state.currentIndex + 1 : state.shuffleOrder.length
              newShuffleOrder = [
                ...state.shuffleOrder.slice(0, insertPos),
                ...newSongIds,
                ...state.shuffleOrder.slice(insertPos)
              ]
            } else {
              // For standard mode, insert new songs at the right position in standard order
              const insertPos = currentSong?.source === 'recommendation' ? state.currentIndex + 1 : state.standardOrder.length
              newStandardOrder = [
                ...state.standardOrder.slice(0, insertPos),
                ...newSongIds,
                ...state.standardOrder.slice(insertPos)
              ]
            }
          }

          // Update indices if current song moved
          let newCurrentIndex = state.currentIndex
          if (playNext) {
            // For playNext, current song stays at the same index
            newCurrentIndex = state.currentIndex
          } else if (state.currentIndex >= 0) {
            // For regular add, find where current song moved to
            const currentSong = state.songs[state.currentIndex]
            newCurrentIndex = finalSongs.findIndex(s => s.Id === currentSong?.Id)
          }

          // Enforce max queue size (1000 songs total)
          let trimmedSongs = finalSongs
          if (finalSongs.length > 1000) {
            // Keep newest 5 previous songs, then current song, then next songs up to 1000 total
            const currentSong = newCurrentIndex >= 0 ? finalSongs[newCurrentIndex] : null
            const songsBeforeCurrent = finalSongs.slice(0, newCurrentIndex)
            const songsAfterCurrent = finalSongs.slice(newCurrentIndex + 1)

            // Keep newest 5 previous songs
            const keepPrevious = songsBeforeCurrent.slice(-5)
            // Keep all songs after current
            const keepAfter = songsAfterCurrent

            // Calculate how many more we can keep before current
            const remainingSlots = 1000 - keepPrevious.length - (currentSong ? 1 : 0) - keepAfter.length
            const keepBefore = songsBeforeCurrent.slice(-Math.max(0, remainingSlots))

            trimmedSongs = [
              ...keepBefore,
              ...(currentSong ? [currentSong] : []),
              ...keepAfter
            ]

            // Adjust current index
            newCurrentIndex = currentSong ? keepBefore.length : -1
          }


          return {
            songs: trimmedSongs,
            currentIndex: newCurrentIndex,
            standardOrder: newStandardOrder,
            shuffleOrder: newShuffleOrder,
            manuallyCleared: false, // Allow recommendations again since user added songs
          }
        })
      },

      removeFromQueue: (index) => {
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
        const { audioElement, currentIndex, songs } = get()
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
          }

          audioElement.play().then(() => {
            set({ isPlaying: true })
            reportPlaybackWithDelay(track.Id, () => get().songs[get().currentIndex] || null)
            // Track locally played songs for recently played list
            useMusicStore.getState().addToRecentlyPlayed(track)
          }).catch((error) => {
            console.error('Playback error:', error)
            set({ isPlaying: false })
          })
        }
      },

      pause: () => {
        const audio = get().audioElement
        if (audio) {
          audio.pause()
          set({ isPlaying: false })
        }
      },

      togglePlayPause: () => {
        const { isPlaying, play, pause } = get()
        if (isPlaying) {
          pause()
        } else {
          play()
        }
      },

      next: () => {
        const { songs, currentIndex, repeat, previousIndex } = get()

        if (songs.length === 0) return

        let nextIndex = currentIndex + 1

        // Handle end of queue
        if (nextIndex >= songs.length) {
          if (repeat === 'all') {
            nextIndex = 0
          } else {
            return // Can't go next
          }
        }

        // Update previous index and move current
        const currentTrack = currentIndex >= 0 ? songs[currentIndex] : null
        set({
          previousIndex: currentIndex, // Remember where we came from for back navigation
          currentIndex: nextIndex,
          lastPlayedTrack: currentTrack,
        })

        // Play the next track
        get().play()
      },

      previous: () => {
        const { songs, currentIndex, previousIndex } = get()

        if (songs.length === 0) return

        let newCurrentIndex = currentIndex
        let newPreviousIndex = currentIndex // Remember where we came from

        if (currentIndex > 0) {
          // Go to previous song in queue
          newCurrentIndex = currentIndex - 1
        } else {
          // At start of queue, wrap around if repeat all
          const { repeat } = get()
          if (repeat === 'all') {
            newCurrentIndex = songs.length - 1
          } else {
            return // Can't go previous
          }
        }

        set({
          currentIndex: newCurrentIndex,
          previousIndex: newPreviousIndex,
        })

        // Play the previous track
        get().play()
      },

      seek: (time) => {
        const audio = get().audioElement
        if (audio) {
          audio.currentTime = time
          set({ currentTime: time })
        }
      },

      toggleShuffle: () => {
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
        set((state) => {
          const nextRepeat: 'off' | 'all' | 'one' =
            state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off'
          return { repeat: nextRepeat }
        })
      },

      playTrack: (track, queue) => {
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
          manuallyCleared: false, // Allow recommendations for fresh queue
        })

        // Start playback
        get().play()
      },

      playAlbum: (tracks, startIndex = 0) => {
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
          manuallyCleared: false, // Allow recommendations for fresh queue
        })

        // Start playback
        get().play()
      },

      playNext: (tracks) => {
        get().addToQueue(tracks, true) // playNext = true
      },

      shuffleArtist: (songs) => {
        const shuffled = shuffleArray(songs)
        const queueSongs = shuffled.map(t => ({ ...t, source: 'user' as const }))

        set({
          songs: queueSongs,
          standardOrder: queueSongs.map(s => s.Id),
          shuffleOrder: queueSongs.map(s => s.Id),
          currentIndex: 0,
          previousIndex: -1,
          shuffle: false, // Already shuffled, so disable shuffle mode
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          manuallyCleared: false, // Allow recommendations for fresh queue
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
              console.error('Failed to fetch songs for shuffle all:', error)
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
        setTimeout(async () => {

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

              // Add to queue
              const newQueueSongs = [...instantQueueSongs, ...additionalQueueSongs]

              set({
                songs: newQueueSongs,
                standardOrder: newQueueSongs.map(s => s.Id),
                shuffleOrder: newQueueSongs.map(s => s.Id),
                shuffleHasMoreSongs: availablePool.length > additionalNeeded
              })

              // Refresh shuffle pool after shuffle operation
              useMusicStore.getState().refreshShufflePool()

            } else {
            }
          } catch (error) {
            console.error('Failed to expand shuffle queue:', error)
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
          console.warn(`No songs found for genre: ${genreName}`)
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
        setTimeout(async () => {
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

              const newQueueSongs = [...instantQueueSongs, ...additionalQueueSongs]

              set({
                songs: newQueueSongs,
                standardOrder: newQueueSongs.map(s => s.Id),
                shuffleOrder: newQueueSongs.map(s => s.Id),
                shuffleHasMoreSongs: remainingGenreSongs.length > additionalNeeded
              })
            }
          } catch (error) {
            console.error('Failed to expand genre shuffle queue:', error)
          }
        }, 100)
      },

      skipToTrack: (trackIndex) => {
        const { songs, currentIndex } = get()

        if (trackIndex < 0 || trackIndex >= songs.length) return

        // Set previous to current position, then move to new position
        const currentTrack = currentIndex >= 0 ? songs[currentIndex] : null
        set({
          previousIndex: currentIndex >= 0 ? currentIndex : -1,
          currentIndex: trackIndex,
          lastPlayedTrack: currentTrack,
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
          console.error('Failed to refresh current track:', error)
        }
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
      }),

      onRehydrateStorage: (state) => {
        if (state) {
          // Reset runtime state
          state.isPlaying = false
          state.currentTime = 0
          state.duration = 0
          state.audioElement = null
          state.isFetchingRecommendations = false
          // Keep lastPlayedTrack as persisted
          state.isShuffleAllActive = false
          state.isShuffleGenreActive = false
        }
      }
    }
  )
)
