import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BaseItemDto, LightweightSong } from '../api/types'
import { jellyfinClient } from '../api/jellyfin'
import { useMusicStore } from './musicStore'

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

interface QueueSong extends BaseItemDto {
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

  // Actions
  setAudioElement: (element: HTMLAudioElement | null) => void
  setIsFetchingRecommendations: (isFetching: boolean) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number) => void

  // Queue management
  clearQueue: () => void
  addToQueue: (tracks: BaseItemDto[], playNext?: boolean) => void
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
  playAlbum: (tracks: (BaseItemDto | LightweightSong)[]) => void
  playNext: (tracks: BaseItemDto[]) => void
  shuffleArtist: (songs: BaseItemDto[]) => void
  shuffleAllSongs: () => Promise<void>
  shuffleGenreSongs: (genreId: string, genreName: string) => Promise<void>

  // Queue navigation
  skipToTrack: (trackIndex: number) => void

  // Track management
  refreshCurrentTrack: () => Promise<void>
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

      setAudioElement: (element) => {
        set({ audioElement: element })
        if (element) {
          element.volume = get().volume
        }
      },

      setIsFetchingRecommendations: (isFetching) => {
        set({ isFetchingRecommendations: isFetching })
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
        set({
          songs: [],
          currentIndex: -1,
          previousIndex: -1,
          standardOrder: [],
          shuffleOrder: [],
          isPlaying: false,
          currentTime: 0,
          duration: 0,
        })
      },

      addToQueue: (tracks, playNext = false) => {
        set((state) => {
          const newSongs = tracks.map(track => ({ ...track, source: 'user' as const }))

          // Separate existing user songs and recommendations
          const userSongs = state.songs.filter(song => song.source === 'user')
          const recommendations = state.songs.filter(song => song.source === 'recommendation')

          let updatedUserSongs: QueueSong[]
          let newStandardOrder = [...state.standardOrder]
          let newShuffleOrder = [...state.shuffleOrder]

          if (playNext) {
            // Add as play next - insert after current song in user songs
            const currentUserIndex = state.currentIndex >= 0 ?
              state.songs.slice(0, state.currentIndex + 1).filter(s => s.source === 'user').length - 1 : -1

            if (currentUserIndex >= 0) {
              // Insert after current user song
              updatedUserSongs = [
                ...userSongs.slice(0, currentUserIndex + 1),
                ...newSongs,
                ...userSongs.slice(currentUserIndex + 1)
              ]
            } else {
              // No current song or current song is recommendation, add to beginning
              updatedUserSongs = [...newSongs, ...userSongs]
            }

            // Update order arrays
            const newSongIds = newSongs.map(s => s.Id)
            if (state.shuffle) {
              // In shuffle mode, add to shuffle order at same relative position
              const currentShuffleIndex = currentUserIndex >= 0 ? currentUserIndex : -1
              if (currentShuffleIndex >= 0) {
                newShuffleOrder = [
                  ...newShuffleOrder.slice(0, currentShuffleIndex + 1),
                  ...newSongIds,
                  ...newShuffleOrder.slice(currentShuffleIndex + 1)
                ]
              } else {
                newShuffleOrder = [...newSongIds, ...newShuffleOrder]
              }
            } else {
              // In standard mode, add to standard order at same relative position
              const currentStandardIndex = currentUserIndex >= 0 ? currentUserIndex : -1
              if (currentStandardIndex >= 0) {
                newStandardOrder = [
                  ...newStandardOrder.slice(0, currentStandardIndex + 1),
                  ...newSongIds,
                  ...newStandardOrder.slice(currentStandardIndex + 1)
                ]
              } else {
                newStandardOrder = [...newSongIds, ...newStandardOrder]
              }
            }
          } else {
            // Add to end of user songs (before recommendations)
            updatedUserSongs = [...userSongs, ...newSongs]

            // Update order arrays
            const newSongIds = newSongs.map(s => s.Id)
            newStandardOrder = [...newStandardOrder, ...newSongIds]
            newShuffleOrder = [...newShuffleOrder, ...newSongIds]
          }

          // Build final queue: user songs in current order + recommendations
          const userSongOrder = state.shuffle ? newShuffleOrder : newStandardOrder
          const orderedUserSongs = userSongOrder.map(id =>
            updatedUserSongs.find(s => s.Id === id)
          ).filter(Boolean) as QueueSong[]

          const finalSongs = [...orderedUserSongs, ...recommendations]

          // Update indices if current song moved
          let newCurrentIndex = state.currentIndex
          if (state.currentIndex >= 0) {
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
            newCurrentIndex = -1 // Current song removed
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

              return {
                songs: newSongs,
                [orderArray]: newOrder,
                currentIndex: toIndex === state.currentIndex ? toIndex :
                             fromIndex === state.currentIndex ? toIndex :
                             state.currentIndex,
                previousIndex: toIndex === state.previousIndex ? toIndex :
                              fromIndex === state.previousIndex ? toIndex :
                              state.previousIndex,
              }
            }
          }

          // For recommendations, just update indices
          return {
            songs: newSongs,
            currentIndex: toIndex === state.currentIndex ? toIndex :
                         fromIndex === state.currentIndex ? toIndex :
                         state.currentIndex,
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
        set({
          previousIndex: currentIndex >= 0 ? currentIndex : previousIndex,
          currentIndex: nextIndex,
        })

        // Play the next track
        get().play()
      },

      previous: () => {
        const { songs, currentIndex, previousIndex } = get()

        if (songs.length === 0) return

        // If we have a previous index, go back to it
        if (previousIndex >= 0 && previousIndex < songs.length) {
          set({
            currentIndex: previousIndex,
            previousIndex: -1, // Clear previous after using it
          })
        } else if (currentIndex > 0) {
          // Otherwise go to previous song in queue
          set({
            previousIndex: currentIndex,
            currentIndex: currentIndex - 1,
          })
        } else {
          // At start of queue, wrap around if repeat all
          const { repeat } = get()
          if (repeat === 'all') {
            set({
              previousIndex: currentIndex,
              currentIndex: songs.length - 1,
            })
          } else {
            return // Can't go previous
          }
        }

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
            // Generate new shuffle order for user songs
            const userSongs = state.songs.filter(s => s.source === 'user')
            const shuffledIds = shuffleArray(userSongs.map(s => s.Id))

            // Rebuild queue with shuffled user songs + recommendations
            const shuffledUserSongs = shuffledIds.map(id =>
              userSongs.find(s => s.Id === id)
            ).filter(Boolean) as QueueSong[]

            const recommendations = state.songs.filter(s => s.source === 'recommendation')
            const newSongs = [...shuffledUserSongs, ...recommendations]

            // Update current index
            let newCurrentIndex = -1
            if (state.currentIndex >= 0) {
              const currentSong = state.songs[state.currentIndex]
              newCurrentIndex = newSongs.findIndex(s => s.Id === currentSong?.Id)
            }

            return {
              shuffle: newShuffle,
              shuffleOrder: shuffledIds,
              songs: newSongs,
              currentIndex: newCurrentIndex,
            }
          } else {
            // Switch back to standard order
            const userSongs = state.songs.filter(s => s.source === 'user')
            const standardUserSongs = state.standardOrder.map(id =>
              userSongs.find(s => s.Id === id)
            ).filter(Boolean) as QueueSong[]

            const recommendations = state.songs.filter(s => s.source === 'recommendation')
            const newSongs = [...standardUserSongs, ...recommendations]

            // Update current index
            let newCurrentIndex = -1
            if (state.currentIndex >= 0) {
              const currentSong = state.songs[state.currentIndex]
              newCurrentIndex = newSongs.findIndex(s => s.Id === currentSong?.Id)
            }

            return {
              shuffle: newShuffle,
              songs: newSongs,
              currentIndex: newCurrentIndex,
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
        // Clear current queue and start fresh with this track and optional queue
        const tracks = queue ? [track, ...queue.filter(t => t.Id !== track.Id)] : [track]
        const songs = tracks.map(t => ({ ...t, source: 'user' as const }))

        set({
          songs,
          standardOrder: songs.map(s => s.Id),
          shuffleOrder: songs.map(s => s.Id),
          currentIndex: 0,
          previousIndex: -1,
          shuffle: false,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
        })

        // Start playback
        get().play()
      },

      playAlbum: (tracks) => {
        const songs = tracks.map(t => ({ ...t, source: 'user' as const }))

        set({
          songs,
          standardOrder: songs.map(s => s.Id),
          shuffleOrder: songs.map(s => s.Id),
          currentIndex: 0,
          previousIndex: -1,
          shuffle: false,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
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
        })

        // Start playback
        get().play()
      },

      shuffleAllSongs: async () => {
        // Get all songs from music store
        let allSongs = useMusicStore.getState().songs

        if (!allSongs || allSongs.length === 0) {
          // Fallback to API fetch
          try {
            const result = await jellyfinClient.getSongs({
              limit: 500,
              startIndex: 0,
              sortBy: ['SortName'],
              sortOrder: 'Ascending'
            })
            allSongs = result.Items || []
          } catch (error) {
            console.error('Failed to fetch songs for shuffle all:', error)
            return
          }
        }

        const shuffled = shuffleArray(allSongs)
        const songs = shuffled.map(t => ({ ...t, source: 'user' as const }))

        set({
          songs,
          standardOrder: songs.map(s => s.Id),
          shuffleOrder: songs.map(s => s.Id),
          currentIndex: 0,
          previousIndex: -1,
          shuffle: false, // Already shuffled
          isPlaying: false,
          currentTime: 0,
          duration: 0,
        })

        // Start playback
        get().play()
      },

      shuffleGenreSongs: async (genreId, genreName) => {
        // Get genre songs from music store
        const genreSongs = useMusicStore.getState().genreSongs[genreId]

        if (!genreSongs || genreSongs.length === 0) {
          console.warn(`No songs found for genre: ${genreName}`)
          return
        }

        const shuffled = shuffleArray(genreSongs)
        const songs = shuffled.map(t => ({ ...t, source: 'user' as const }))

        set({
          songs,
          standardOrder: songs.map(s => s.Id),
          shuffleOrder: songs.map(s => s.Id),
          currentIndex: 0,
          previousIndex: -1,
          shuffle: false, // Already shuffled
          isPlaying: false,
          currentTime: 0,
          duration: 0,
        })

        // Start playback
        get().play()
      },

      skipToTrack: (trackIndex) => {
        const { songs, currentIndex } = get()

        if (trackIndex < 0 || trackIndex >= songs.length) return

        // Set previous to current position, then move to new position
        set({
          previousIndex: currentIndex >= 0 ? currentIndex : -1,
          currentIndex: trackIndex,
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
      }),

      onRehydrateStorage: () => (state) => {
        if (state) {
          // Reset runtime state
          state.isPlaying = false
          state.currentTime = 0
          state.duration = 0
          state.audioElement = null
          state.isFetchingRecommendations = false
        }
      }
    }
  )
)


