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
        const { queue, currentIndex, repeat, shuffle, currentTrack, isShuffleAllSession, isShuffleGenreSession } = get()
        if (queue.length === 0) return

        // Check if we need to add more songs during shuffle sessions
        const tracksRemaining = queue.length - currentIndex - 1
        if ((isShuffleAllSession || isShuffleGenreSession) && tracksRemaining <= 5) {
          // Add more songs when running low during shuffle sessions
          get().addMoreShuffleSongs()
        }

        // Determine the next index (sequential navigation works for both shuffled and unshuffled queues)
        let nextIndex = currentIndex + 1

        // Special restore cases:
        // 1) currentIndex === -1 and no currentTrack, but queue has items:
        //    treat first `next()` as "skip the first item" (go to index 1).
        // 2) currentIndex === -1 but currentTrack exists:
        //    find its position in the queue and advance to the song after it.
        if (currentIndex === -1 && queue.length > 0) {
          if (!currentTrack && queue.length > 1) {
            // Case 1: no currentTrack, just skip the first queue item
            nextIndex = 1
          } else if (currentTrack) {
            // Case 2: align with currentTrack in the queue, then move to the next one
            const currentIdxInQueue = queue.findIndex(t => t.Id === currentTrack.Id)
            if (currentIdxInQueue >= 0) {
              nextIndex = currentIdxInQueue + 1
            }
          }
        }
        if (nextIndex >= queue.length) {
          if (repeat === 'all') {
            nextIndex = 0
          } else {
            return
          }
        }



        // If shuffle is on, ensure we never play recommendations before all "Added By You" songs are done
        if (shuffle && nextIndex < queue.length) {
          const nextTrack = queue[nextIndex]
          const isNextRecommended = nextTrack && (nextTrack as any)._isRecommended
          
          
          if (isNextRecommended) {
            // CRITICAL FIX: Check if there are ANY unplayed user-added songs in the entire queue
            // We need to check both before and after the current position
            // Get all user-added songs
            const allUserAddedSongs = queue.filter(t => !(t as any)._isRecommended)
            // Get played user-added songs (from playedSongIds array)
            const { playedSongIds } = get()
            const playedUserAddedIds = new Set(playedSongIds)
            // Find unplayed user-added songs
            const unplayedUserAddedSongs = allUserAddedSongs.filter(
              t => !playedUserAddedIds.has(t.Id) && t.Id !== get().currentTrack?.Id
            )
            
            if (unplayedUserAddedSongs.length > 0) {
              // Find the next unplayed user-added song (prefer after current position, but can be before if needed)
              let nextUserAddedIndex = -1
              
              // First try to find one after current position
              nextUserAddedIndex = queue.findIndex(
                (t, idx) => idx > currentIndex && !(t as any)._isRecommended && !playedUserAddedIds.has(t.Id) && t.Id !== get().currentTrack?.Id
              )
              
              // If none found after, find the first unplayed one (could be before current position)
              if (nextUserAddedIndex === -1) {
                nextUserAddedIndex = queue.findIndex(
                  (t, idx) => !(t as any)._isRecommended && !playedUserAddedIds.has(t.Id) && t.Id !== get().currentTrack?.Id
                )
              }
              
              
              if (nextUserAddedIndex >= 0) {
                nextIndex = nextUserAddedIndex
              } else {
              }
            } else {
            }
          }
        }

        set((state) => {
          const newQueue = [...state.queue]
          const newPreviousSongs = [...state.previousSongs]
          let newPlayedSongIds = [...state.playedSongIds]
          let newOriginalQueue = [...state.originalQueue]
          let adjustedNextIndex = nextIndex
          
          
          // CRITICAL FIX: When shuffle is on, don't remove tracks from queue - just advance the index
          // This ensures all shuffled songs can be played
          if (shuffle) {
            // Add current song to previousSongs for history (but don't remove from queue)
            // IMPORTANT: handle the case where currentIndex is -1 but currentTrack exists
            let currentIndexForShuffle = state.currentIndex
            if (currentIndexForShuffle < 0 && state.currentTrack) {
              currentIndexForShuffle = newQueue.findIndex(t => t.Id === state.currentTrack?.Id)
            }

            if (currentIndexForShuffle >= 0 && currentIndexForShuffle < newQueue.length) {
              const currentSong = newQueue[currentIndexForShuffle]
              if (currentSong) {
                // Add to previousSongs if not already there (limit to 10)
                if (!newPreviousSongs.some(t => t.Id === currentSong.Id)) {
                  newPreviousSongs.unshift(currentSong)
                  if (newPreviousSongs.length > 10) {
                    newPreviousSongs.pop()
                  }
                }
                // Add to playedSongIds (unlimited, for UI filtering)
                if (!newPlayedSongIds.includes(currentSong.Id)) {
                  newPlayedSongIds.push(currentSong.Id)
                }
              }
            }
            
            // If we're jumping to a different index (not sequential), mark all skipped songs as played
            if (
              currentIndexForShuffle >= 0 &&
              nextIndex !== currentIndexForShuffle + 1 &&
              nextIndex !== 0
            ) {
              const startIdx = Math.min(currentIndexForShuffle + 1, nextIndex)
              const endIdx = Math.max(currentIndexForShuffle + 1, nextIndex)
              for (let i = startIdx; i < endIdx && i < newQueue.length; i++) {
                const skippedSong = newQueue[i]
                if (skippedSong && !newPlayedSongIds.includes(skippedSong.Id)) {
                  newPlayedSongIds.push(skippedSong.Id)
                }
              }
            }
            
            // Just update the index, don't remove from queue
            adjustedNextIndex = nextIndex
            
          } else {
            // When shuffle is off, use the original removal logic
            // Add current song to previousSongs before removing it
            // (unless it's the only song and we're wrapping around)
            if (state.currentIndex >= 0 && state.currentIndex < newQueue.length) {
              const isOnlySong = newQueue.length === 1
              const isWrappingAround = repeat === 'all' && nextIndex === 0 && state.currentIndex === newQueue.length - 1
              const currentSong = newQueue[state.currentIndex]
              
              
              if (!isOnlySong || !isWrappingAround) {
                // Add to previousSongs (limit to 10)
                if (currentSong) {
                  newPreviousSongs.unshift(currentSong)
                  if (newPreviousSongs.length > 10) {
                    newPreviousSongs.pop()
                  }
                  
                  // Also remove from originalQueue
                  const originalIndex = newOriginalQueue.findIndex(t => t.Id === currentSong.Id)
                  if (originalIndex >= 0) {
                    newOriginalQueue.splice(originalIndex, 1)
                  }
                }
                
                newQueue.splice(state.currentIndex, 1)
                
                
                // Adjust nextIndex if we removed an item before it
                if (state.currentIndex < nextIndex) {
                  adjustedNextIndex = nextIndex - 1
                } else if (state.currentIndex === nextIndex && nextIndex >= newQueue.length) {
                  // If we removed the item at nextIndex and it was the last item
                  adjustedNextIndex = repeat === 'all' ? 0 : Math.max(0, newQueue.length - 1)
                }
                
              }
            }
          }
          
          // Ensure adjustedNextIndex is valid
          if (adjustedNextIndex >= newQueue.length) {
            adjustedNextIndex = repeat === 'all' && newQueue.length > 0 ? 0 : Math.max(0, newQueue.length - 1)
          }
          if (adjustedNextIndex < 0) {
            adjustedNextIndex = 0
          }

          // Keep recommendations array in sync with the queue:
          // only include recommendation tracks that are still ahead of the current song.
          // This prevents already-played recommendations from reappearing in the UI.
          const newRecommendations = newQueue.filter(
            (t, idx) => (t as any)._isRecommended && idx > adjustedNextIndex
          )
          return {
            queue: newQueue,
            originalQueue: newOriginalQueue,
            previousSongs: newPreviousSongs,
            playedSongIds: newPlayedSongIds,
            currentIndex: adjustedNextIndex,
            recommendations: newRecommendations,
          }
        })
        
        // Get the updated state and play the next track
        const updatedState = get()
        const trackToPlay = updatedState.queue[updatedState.currentIndex]

        if (trackToPlay) {
          get().setCurrentTrack(trackToPlay)
          get().play()

        } else {
          console.error('[Shuffle] next() - trackToPlay is null! This is the stuck state.', {
            currentIndex: updatedState.currentIndex,
            queueLength: updatedState.queue.length,
            queue: updatedState.queue,
          })
        }
      },

      previous: () => {
        const { queue, previousSongs, currentIndex, currentTrack } = get()
        
        
        // If we have previous songs in history and we're at the start of the queue, use them
        if (previousSongs.length > 0 && (currentIndex <= 0 || queue.length === 0)) {
          const prevTrack = previousSongs[0]
          
          
          if (prevTrack) {
            set((state) => {
              const newQueue = [...state.queue]
              const newPreviousSongs = [...state.previousSongs]
              let newOriginalQueue = [...state.originalQueue]
              
              // Take the previous song from history
              const songToPlay = newPreviousSongs.shift()!
              
              
              // CRITICAL FIX: Don't add current track back to previousSongs when going backwards
              // previousSongs should only be populated when going forward (via next())
              // Adding it here creates a cycle: A -> B -> A -> B...
              // The current track will be added to previousSongs when we go forward again via next()
              
              
              // Add the previous song to queue at the beginning
              newQueue.unshift(songToPlay)
              
              // Also add to originalQueue if it's not already there
              if (!newOriginalQueue.some(t => t.Id === songToPlay.Id)) {
                newOriginalQueue.unshift(songToPlay)
              }
              
              // Remove the restored song from skippedSongIds so it appears in the UI
              const newSkippedSongIds = [...state.skippedSongIds]
              const skippedIndex = newSkippedSongIds.indexOf(songToPlay.Id)
              if (skippedIndex >= 0) {
                newSkippedSongIds.splice(skippedIndex, 1)
              }

              return {
                queue: newQueue,
                originalQueue: newOriginalQueue,
                previousSongs: newPreviousSongs,
                skippedSongIds: newSkippedSongIds,
                currentIndex: 0,
              }
            })
            get().setCurrentTrack(prevTrack)
            get().play()
          }
          return
        }
        
        // Otherwise, use the queue as before
        if (queue.length === 0) return

        // Sequential navigation works for both shuffled and unshuffled queues
        let prevIndex = currentIndex - 1
        if (prevIndex < 0) {
          prevIndex = queue.length - 1
        }
        

        const prevTrack = queue[prevIndex]
        
        
        if (prevTrack) {
          set({ currentIndex: prevIndex })
          get().setCurrentTrack(prevTrack)
          get().play()
        } else {
          console.error('[Shuffle] previous() - prevTrack is null! This is the stuck state.', {
            prevIndex,
            currentIndex,
            queueLength: queue.length,
            queue: queue,
          })
        }
      },

      seek: (time) => {
        const audio = get().audioElement
        if (audio) {
          audio.currentTime = time
          set({ currentTime: time })
        }
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

      toggleShuffle: () => {
        set((state) => {
          const newShuffle = !state.shuffle
          const currentTrack = state.currentTrack
          
          if (newShuffle) {
            // Enabling shuffle: Generate shuffled order for "Added by You" songs
            // Only shuffle songs AFTER the current song

            // Find current track position in originalQueue
            let currentTrackInOriginal = -1
            if (currentTrack) {
              currentTrackInOriginal = state.originalQueue.findIndex(t => t.Id === currentTrack.Id)
            }
            
            let shuffledOrder: QueueItem[]
            
            if (currentTrackInOriginal >= 0) {
              // For collection playback, only shuffle songs that are part of the current collection
              let songsToShuffle: typeof state.originalQueue
              let beforeCurrent: typeof state.originalQueue = []

              if (state.collectionStartIndex > 0) {
                // We started from middle of collection, only shuffle from collectionStartIndex onwards
                songsToShuffle = state.originalQueue.slice(state.collectionStartIndex)
                // Find current track position within the collection slice
                const currentInCollection = songsToShuffle.findIndex(t => t.Id === currentTrack.Id)
                if (currentInCollection >= 0) {
                  beforeCurrent = songsToShuffle.slice(0, currentInCollection + 1)
                  const afterCurrent = songsToShuffle.slice(currentInCollection + 1)
                  const shuffledAfter = shuffleArray(afterCurrent)
                  shuffledOrder = [...beforeCurrent, ...shuffledAfter]
                } else {
                  // Current track not found in collection, shuffle everything in collection
                  shuffledOrder = shuffleArray(songsToShuffle)
                }
              } else {
                // Normal case: keep everything up to current track, shuffle the rest
                beforeCurrent = state.originalQueue.slice(0, currentTrackInOriginal + 1)
                const afterCurrent = state.originalQueue.slice(currentTrackInOriginal + 1)
                const shuffledAfter = shuffleArray(afterCurrent)
                shuffledOrder = [...beforeCurrent, ...shuffledAfter]
              }

            } else if (state.originalQueue.length > 0) {
              // Current track not in originalQueue, shuffle everything
              shuffledOrder = shuffleArray(state.originalQueue)
            } else {
              // No originalQueue, nothing to shuffle
              shuffledOrder = []
            }

            // Build final queue using shuffled order + recommendations
            const finalQueue = [...shuffledOrder, ...state.recommendations]
            console.log('[toggleShuffle] Final shuffled queue:', {
              finalQueueLength: finalQueue.length,
              shuffledSongs: shuffledOrder.length,
              recommendations: state.recommendations.length
            })
            
            // Find current track position in new queue
            let newIndex = state.currentIndex
            if (currentTrack) {
              const trackIndex = finalQueue.findIndex(t => t.Id === currentTrack.Id)
              if (trackIndex >= 0) {
                newIndex = trackIndex
              }
            }
            
            return {
              shuffle: newShuffle,
              shuffledOrder: shuffledOrder,
              queue: finalQueue,
              currentIndex: newIndex,
            }
          } else {
            // Disabling shuffle: Use originalQueue (unshuffled order) + recommendations
            let queueToUse = state.originalQueue

            // If we have a collection start index > 0, slice to only show tracks from that point onwards
            // (collectionStartIndex = 0 means we already sliced when starting playback)
            if (state.collectionStartIndex > 0) {
              queueToUse = state.originalQueue.slice(state.collectionStartIndex)
            }

            const finalQueue = [...queueToUse, ...state.recommendations]

            // Find current track position in the final queue
            let newIndex = 0
            if (currentTrack) {
              const queueIndex = finalQueue.findIndex(t => t.Id === currentTrack.Id)
              if (queueIndex >= 0) {
                newIndex = queueIndex
              }
            }

            return {
              shuffle: newShuffle,
              queue: finalQueue,
              shuffledOrder: [...queueToUse], // Keep shuffledOrder in sync (same as queue when shuffle is off)
              currentIndex: newIndex,
              playedSongIds: [], // Clear played song tracking when disabling shuffle
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
        const currentQueue = get().queue
        const shuffle = get().shuffle
        // Check if the track is in the current queue
        const isInCurrentQueue = currentQueue.some(t => t.Id === track.Id)

        // Sort tracks by disc number first, then by track number within each disc (if queue is provided)
        const rawTracks = queue || [track]
        const sortedTracks = queue ? [...rawTracks].sort((a, b) => {
          const discA = a.ParentIndexNumber ?? 1
          const discB = b.ParentIndexNumber ?? 1
          if (discA !== discB) {
            return discA - discB
          }
          const trackA = a.IndexNumber ?? 0
          const trackB = b.IndexNumber ?? 0
          return trackA - trackB
        }) : rawTracks

        // Find the selected track's position
        const index = sortedTracks.findIndex((t) => t.Id === track.Id)

        let tracksToQueue: typeof sortedTracks
        let previousTracks: typeof sortedTracks = []
        let collectionStartIndex = -1

        // If we have a queue context (multiple tracks), apply collection behavior
        if (queue && queue.length > 1) {
          if (!shuffle) {
            // Shuffle OFF: only include tracks from selected track onwards
            tracksToQueue = sortedTracks.slice(index)
            // Set previous tracks in reverse order for previous button (most recent first)
            previousTracks = sortedTracks.slice(0, index).reverse()
            collectionStartIndex = 0 // Reset to 0 since we're slicing the queue to start from the selected track
          } else {
            // Shuffle ON: include all tracks (they'll be shuffled later if needed)
            tracksToQueue = sortedTracks
            collectionStartIndex = index // Remember where we started for future slicing
          }
        } else {
          // Individual song playback: use single track
          tracksToQueue = sortedTracks
          collectionStartIndex = -1
        }

        // Always use the determined tracks for queue
        const tracks = tracksToQueue.map(t => ({ ...t, _isRecommended: false }))
        const finalIndex = tracks.findIndex((t) => t.Id === track.Id)

        set({
          queue: tracks,
          originalQueue: [...tracks],
          shuffledOrder: [...tracks], // Initially same as original
          recommendations: [], // Clear recommendations when starting new playback
          collectionStartIndex,
          currentIndex: finalIndex >= 0 ? finalIndex : 0,
          manuallyCleared: false, // Reset manuallyCleared when user plays a new track
          // Clear previous songs if this is a new track not in the current queue,
          // otherwise preserve existing previousSongs and add any new ones
          previousSongs: isInCurrentQueue ? get().previousSongs : previousTracks,
        })
        const audio = get().audioElement
        if (audio) {
          const baseUrl = jellyfinClient.serverBaseUrl
          const audioUrl = baseUrl
            ? `${baseUrl}/Audio/${track.Id}/stream?static=true`
            : ''
          audio.src = audioUrl
          audio.load()
          get().setCurrentTrack(track)
          audio.play().then(() => {
            set({ isPlaying: true })
            // Report playback after delay
            reportPlaybackWithDelay(track.Id, () => get().currentTrack)
          }).catch((error) => {
            console.error('Playback error:', error)
            set({ isPlaying: false })
          })
        }
      },

      playAlbum: (tracks) => {
        if (tracks.length === 0) return
        // Preserve the order of tracks as provided by the caller
        const orderedTracks = [...tracks]
        const queueItems = orderedTracks.map(t => ({ ...t, _isRecommended: false }))
        const firstTrack = orderedTracks[0]
        set({
          queue: queueItems,
          originalQueue: [...queueItems],
          shuffledOrder: [...queueItems], // Initially same as original
          recommendations: [], // Clear recommendations when starting new playback
          collectionStartIndex: 0, // Play album starts from the beginning
          currentIndex: 0,
          manuallyCleared: false,
          previousSongs: [], // Clear previous songs when playing a new album
          playedSongIds: [], // Clear played songs when playing a new album
          shuffle: false, // Disable shuffle when playing a new album
        })
        const audio = get().audioElement
        if (audio) {
          const baseUrl = jellyfinClient.serverBaseUrl
          const audioUrl = baseUrl
            ? `${baseUrl}/Audio/${firstTrack.Id}/stream?static=true`
            : ''
          audio.src = audioUrl
          audio.load()
          get().setCurrentTrack(firstTrack)
          audio.play().then(() => {
            set({ isPlaying: true })
            // Report playback after delay
            reportPlaybackWithDelay(firstTrack.Id, () => get().currentTrack)
          }).catch((error) => {
            console.error('Playback error:', error)
            set({ isPlaying: false })
          })
        }
      },

      playNext: (tracks) => {
        if (tracks.length === 0) return
        set((state) => {
          const queueItems = tracks.map(t => ({ ...t, _isRecommended: false }))
          const currentIndex = state.currentIndex
          
          let newQueue: QueueItem[]
          let newOriginalQueue: QueueItem[]
          let newShuffledOrder: QueueItem[]
          let newCurrentIndex = currentIndex
          
          // Add to originalQueue first
          const originalInsertIndex = currentIndex >= 0 && currentIndex < state.originalQueue.length 
            ? currentIndex + 1 
            : state.originalQueue.length
          newOriginalQueue = [...state.originalQueue]
          newOriginalQueue.splice(originalInsertIndex, 0, ...queueItems)
          
          if (tracks.length === 1) {
            // Single song: Insert immediately after current track (even if shuffle is ON)
            const insertIndex = currentIndex >= 0 ? currentIndex + 1 : 0
            
            if (state.shuffle) {
              // Shuffle is ON: Use shuffledOrder, insert after current
              const currentTrackInShuffled = state.shuffledOrder.findIndex(t => t.Id === state.currentTrack?.Id)
              if (currentTrackInShuffled >= 0) {
                const beforeInsert = state.shuffledOrder.slice(0, currentTrackInShuffled + 1)
                const afterInsert = state.shuffledOrder.slice(currentTrackInShuffled + 1)
                newShuffledOrder = [...beforeInsert, ...queueItems, ...afterInsert]
              } else {
                newShuffledOrder = [...state.shuffledOrder, ...queueItems]
              }
              newQueue = [...newShuffledOrder, ...state.recommendations]
            } else {
              // Shuffle is OFF: Use originalQueue order
              newShuffledOrder = [...newOriginalQueue] // Keep in sync
              newQueue = [...newOriginalQueue, ...state.recommendations]
            }
          } else {
            // Multiple songs
            if (state.shuffle) {
              // Shuffle is ON: Insert right after current track, but shuffle them among themselves
              const shuffledNewTracks = shuffleArray(queueItems)
              const currentTrackInShuffled = state.shuffledOrder.findIndex(t => t.Id === state.currentTrack?.Id)
              if (currentTrackInShuffled >= 0) {
                const beforeInsert = state.shuffledOrder.slice(0, currentTrackInShuffled + 1)
                const afterInsert = state.shuffledOrder.slice(currentTrackInShuffled + 1)
                newShuffledOrder = [...beforeInsert, ...shuffledNewTracks, ...afterInsert]
              } else {
                newShuffledOrder = [...state.shuffledOrder, ...shuffledNewTracks]
              }
              newQueue = [...newShuffledOrder, ...state.recommendations]
            } else {
              // Shuffle is OFF: Insert right after current track
              newShuffledOrder = [...newOriginalQueue] // Keep in sync
              newQueue = [...newOriginalQueue, ...state.recommendations]
            }
          }
          
          // If current track exists, find its new position in the queue
          if (state.currentTrack) {
            const foundIndex = newQueue.findIndex(t => t.Id === state.currentTrack?.Id)
            if (foundIndex >= 0) {
              newCurrentIndex = foundIndex
            }
          }
          
          return {
            queue: newQueue,
            originalQueue: newOriginalQueue,
            shuffledOrder: newShuffledOrder,
            currentIndex: newCurrentIndex,
            manuallyCleared: false,
          }
        })
      },

      shuffleArtist: (songs) => {
        if (songs.length === 0) return
        const shuffled = shuffleArray(songs)
        const queueItems = shuffled.map(t => ({ ...t, _isRecommended: false }))
        const firstTrack = shuffled[0]
        set({
          queue: queueItems,
          originalQueue: [...queueItems],
          shuffledOrder: [...queueItems], // Initially same as original
          recommendations: [], // Clear recommendations when starting new playback
          currentIndex: 0,
          manuallyCleared: false,
          previousSongs: [],
          playedSongIds: [],
          shuffle: false, // Don't enable shuffle mode, we already shuffled the songs
        })
        const audio = get().audioElement
        if (audio) {
          const baseUrl = jellyfinClient.serverBaseUrl
          const audioUrl = baseUrl
            ? `${baseUrl}/Audio/${firstTrack.Id}/stream?static=true`
            : ''
          audio.src = audioUrl
          audio.load()
          get().setCurrentTrack(firstTrack)
          audio.play().then(() => {
            set({ isPlaying: true })
            // Report playback after delay
            reportPlaybackWithDelay(firstTrack.Id, () => get().currentTrack)
          }).catch((error) => {
            console.error('Playback error:', error)
            set({ isPlaying: false })
          })
        }
      },

      reorderQueue: (fromIndex, toIndex) => {
        set((state) => {
          const newQueue = [...state.queue]
          const [removed] = newQueue.splice(fromIndex, 1)

          // Adjust insertion index so dropping ON a row feels consistent
          // with the visual indicator (insert before that row).
          // After removing fromIndex, elements after it shift left by 1.
          let insertionIndex = toIndex
          if (fromIndex < toIndex) {
            insertionIndex = Math.max(0, toIndex - 1)
          }
          newQueue.splice(insertionIndex, 0, removed)
          
          // Also reorder originalQueue to match the new queue order
          // When user manually reorders, we update originalQueue to reflect the new standard order
          let newOriginalQueue: QueueItem[] = []
          if (state.shuffle) {
            // If shuffle is on, rebuild originalQueue based on the new queue order
            // Find each track in the original queue and add them in the new order
            const trackMap = new Map(state.originalQueue.map(t => [t.Id, t]))
            for (const track of newQueue) {
              const originalTrack = trackMap.get(track.Id)
              if (originalTrack) {
                newOriginalQueue.push(originalTrack)
              }
            }
            // Add any tracks from originalQueue that weren't in the new queue
            for (const track of state.originalQueue) {
              if (!newQueue.some(t => t.Id === track.Id)) {
                newOriginalQueue.push(track)
              }
            }
          } else {
            // If shuffle is off, queue and originalQueue should be in sync
            newOriginalQueue = [...newQueue]
          }
          
          let newCurrentIndex = state.currentIndex
          if (state.currentIndex === fromIndex) {
            newCurrentIndex = insertionIndex
          } else if (fromIndex < state.currentIndex && toIndex >= state.currentIndex) {
            newCurrentIndex = state.currentIndex - 1
          } else if (fromIndex > state.currentIndex && toIndex <= state.currentIndex) {
            newCurrentIndex = state.currentIndex + 1
          }
          return {
            queue: newQueue,
            originalQueue: newOriginalQueue,
            currentIndex: newCurrentIndex,
          }
        })
      },

      skipToTrack: (trackIndex) => {
        const { queue, originalQueue, shuffle, isShuffleAllSession, isShuffleGenreSession } = get()
        if (trackIndex < 0 || trackIndex >= queue.length) return

        const selectedTrack = queue[trackIndex]

        // In shuffle mode, handle skipping differently to allow previous navigation
        if (shuffle) {
          // Add skipped songs to previousSongs so they can be accessed via previous button
          const skippedSongs = queue.slice(0, trackIndex)
          const currentPreviousSongs = get().previousSongs

          // Add skipped songs to the beginning of previousSongs (in reverse order so most recent is first)
          const newPreviousSongs = [...skippedSongs.reverse(), ...currentPreviousSongs]

          // Limit previousSongs to 10 items
          if (newPreviousSongs.length > 10) {
            newPreviousSongs.splice(10)
          }

          // Mark skipped songs as skipped for UI filtering (separate from played songs)
          const skippedSongIds = skippedSongs.map(s => s.Id)
          const currentSkippedSongIds = get().skippedSongIds
          const newSkippedSongIds = [...currentSkippedSongIds, ...skippedSongIds]

          set({
            currentIndex: trackIndex,
            previousSongs: newPreviousSongs,
            skippedSongIds: newSkippedSongIds,
            manuallyCleared: false,
          })

          // Set the current track
          get().setCurrentTrack(selectedTrack)

          // If we have an audio element, update the source and play
          const audio = get().audioElement
          if (audio && selectedTrack) {
            const baseUrl = jellyfinClient.serverBaseUrl
            const audioUrl = baseUrl
              ? `${baseUrl}/Audio/${selectedTrack.Id}/stream?static=true`
              : ''
            audio.src = audioUrl
            audio.load()
            if (get().isPlaying) {
              audio.play().catch((error) => {
                console.error('Playback error after skip:', error)
                set({ isPlaying: false })
              })
            }
          }
          return
        }

        // For non-shuffle mode, use the original behavior (truncate queue)
        // Remove all tracks before the selected index
        const newQueue = queue.slice(trackIndex)

        // Also update originalQueue to match - find the selected track in originalQueue
        let newOriginalQueue = [...originalQueue]
        if (selectedTrack) {
          const originalIndex = newOriginalQueue.findIndex(t => t.Id === selectedTrack.Id)
          if (originalIndex >= 0) {
            newOriginalQueue = newOriginalQueue.slice(originalIndex)
          }
        }

        // Rebuild recommendations to only include items that are still
        // after the selected track in the new queue.
        // This ensures that when you jump to a recommendation (or any later song),
        // everything before it disappears from the UI (both user-added and recs).
        const newRecommendations = newQueue.filter(
          (t, idx) => (t as any)._isRecommended && idx > 0
        )

        set({
          queue: newQueue,
          originalQueue: newOriginalQueue,
          recommendations: newRecommendations,
          currentIndex: 0,
          manuallyCleared: false,
          previousSongs: [], // Clear previous songs when skipping to a new track
          // Clear shuffle session when skipping to maintain proper shuffle behavior
          isShuffleAllSession: false,
          isShuffleGenreSession: false,
          currentShuffleGenreId: null,
        })
        
        const audio = get().audioElement
        if (audio && selectedTrack) {
          const baseUrl = jellyfinClient.serverBaseUrl
          const audioUrl = baseUrl
            ? `${baseUrl}/Audio/${selectedTrack.Id}/stream?static=true`
            : ''
          audio.src = audioUrl
          audio.load()
          set({ currentTrack: selectedTrack, lastPlayedTrack: selectedTrack })
          audio.play().then(() => {
            set({ isPlaying: true })
            // Report playback after delay
            reportPlaybackWithDelay(selectedTrack.Id, () => get().currentTrack)
          }).catch((error) => {
            console.error('Playback error:', error)
            set({ isPlaying: false })
          })
        }
      },

      refreshCurrentTrack: async () => {
        const currentTrack = get().currentTrack
        if (!currentTrack?.Id) return

        try {
          const freshTrack = await jellyfinClient.getSongById(currentTrack.Id)
          if (freshTrack) {
            // Update currentTrack with fresh metadata
            set({ currentTrack: freshTrack })

            // Also update in queue if the track is in the queue
            const queue = get().queue
            const originalQueue = get().originalQueue
            const queueIndex = queue.findIndex(t => t.Id === currentTrack.Id)
            const originalQueueIndex = originalQueue.findIndex(t => t.Id === currentTrack.Id)

            if (queueIndex >= 0 || originalQueueIndex >= 0) {
              const newQueue = queueIndex >= 0 ? [...queue] : queue
              const newOriginalQueue = originalQueueIndex >= 0 ? [...originalQueue] : originalQueue

              if (queueIndex >= 0) {
                newQueue[queueIndex] = { ...newQueue[queueIndex], ...freshTrack }
              }
              if (originalQueueIndex >= 0) {
                newOriginalQueue[originalQueueIndex] = { ...newOriginalQueue[originalQueueIndex], ...freshTrack }
              }

              set({ queue: newQueue, originalQueue: newOriginalQueue })
            }
          }
        } catch (error) {
          console.error('Failed to refresh current track:', error)
        }
      },

      shuffleAllSongs: async () => {
        // Get all cached songs from the music store
        let allSongs = useMusicStore.getState().songs

        if (!allSongs || allSongs.length === 0) {
          console.warn('No cached songs available for shuffle all - attempting to fetch from API')

          // Fallback: Fetch songs from API if none are cached
          try {
            console.log('Fetching songs from API for shuffle all...')

            // Fetch a reasonable number of songs (500 should be enough for good randomization)
            const result = await jellyfinClient.getSongs({
              limit: 500,
              startIndex: 0,
              sortBy: ['SortName'], // Use default sort, we'll shuffle anyway
              sortOrder: 'Ascending'
            })

            if (!result.Items || result.Items.length === 0) {
              console.error('No songs found in API either')
              alert('No songs found in your library. Please check your Jellyfin server.')
              return
            }

            console.log(`Fetched ${result.Items.length} songs from API for shuffle all`)
            allSongs = result.Items

          } catch (error) {
            console.error('Failed to fetch songs from API:', error)
            const lastSync = useMusicStore.getState().lastSyncCompleted
            if (lastSync) {
              console.error('Songs cache is empty despite having sync history. This indicates a sync failure.')
              alert('Song cache is empty and API fetch failed. Please try syncing your library again in Settings.')
            } else {
              alert('No songs available and failed to fetch from server. Please sync your library first in Settings > Sync Library.')
            }
            return
          }
        }

        // Always clear current queue and start fresh, regardless of previous state
        set({
          queue: [],
          originalQueue: [],
          shuffledOrder: [],
          recommendations: [],
          isShuffleAllActive: false, // No background loading needed - using cached data
          isShuffleAllSession: true, // Mark that we're in a shuffle all session
          shuffleAllLoadedCount: 0,
          playedSongIds: [], // Reset played songs for new shuffle session
          shuffle: true, // Enable shuffle mode for shuffle all
          manuallyCleared: false,
          isPlaying: false, // Ensure playback state is reset
          currentTrack: null,
          currentIndex: -1
        })

        // Wait for audio element to be initialized if it's not ready yet
        const waitForAudioElement = () => {
          let attempts = 0
          const maxAttempts = 100 // 5 seconds max (100 * 50ms)

          return new Promise<void>((resolve, reject) => {
            const checkAudio = () => {
              attempts++
              if (get().audioElement) {
                resolve()
              } else if (attempts >= maxAttempts) {
                reject(new Error(`Audio element not available after ${maxAttempts} attempts`))
              } else {
                setTimeout(checkAudio, 50) // Check every 50ms
              }
            }
            checkAudio()
          })
        }

        await waitForAudioElement()

        // Reset audio element to ensure clean state
        const audio = get().audioElement
        if (audio) {
          audio.pause()
          audio.currentTime = 0
          audio.src = ''
        }

        // Shuffle all cached songs
        const shuffledSongs = shuffleArray([...allSongs])
        const queueItems = shuffledSongs.map(song => ({ ...song, _isRecommended: false }))


        set({
          queue: queueItems,
          originalQueue: [...queueItems],
          shuffledOrder: [...queueItems],
          currentIndex: 0,
        })

        get().setCurrentTrack(queueItems[0])
        get().play()
      },

      shuffleGenreSongs: async (genreId: string, genreName: string) => {
        // Get cached songs for this genre from the music store
        const cachedSongs = useMusicStore.getState().genreSongs[genreId]

        if (!cachedSongs || cachedSongs.length === 0) {
          console.warn(`No cached songs found for genre: ${genreName}`)
          return
        }

        // Always clear current queue and start fresh, regardless of previous state
        set({
          queue: [],
          originalQueue: [],
          shuffledOrder: [],
          recommendations: [],
          isShuffleAllActive: false, // Disable shuffle-all mode
          shuffleAllLoadedCount: 0,
          isShuffleGenreActive: true, // Enable genre shuffle mode
          shuffleGenreLoadedCount: 0,
          playedSongIds: [], // Reset played songs for new shuffle session
          shuffle: true, // Enable shuffle mode for genre shuffle
          manuallyCleared: false,
          isPlaying: false, // Ensure playback state is reset
          currentTrack: null,
          currentIndex: -1
        })

        // Wait for audio element to be initialized if it's not ready yet
        const waitForAudioElement = () => {
          let attempts = 0
          const maxAttempts = 100 // 5 seconds max (100 * 50ms)

          return new Promise<void>((resolve, reject) => {
            const checkAudio = () => {
              attempts++
              if (get().audioElement) {
                resolve()
              } else if (attempts >= maxAttempts) {
                reject(new Error(`Audio element not available after ${maxAttempts} attempts`))
              } else {
                setTimeout(checkAudio, 50) // Check every 50ms
              }
            }
            checkAudio()
          })
        }

        await waitForAudioElement()

        // Reset audio element to ensure clean state
        const audio = get().audioElement
        if (audio) {
          audio.pause()
          audio.currentTime = 0
          audio.src = ''
        }

        // Shuffle the cached songs
        const shuffledSongs = shuffleArray([...cachedSongs])
        const queueItems = shuffledSongs.map(song => ({ ...song, _isRecommended: false }))


        set({
          queue: queueItems,
          originalQueue: [...queueItems],
          shuffledOrder: [...queueItems],
          currentIndex: 0,
          currentShuffleGenreId: genreId, // Store which genre we're shuffling
          isShuffleGenreActive: false, // No background loading needed - using cached data
          isShuffleGenreSession: true, // Mark that we're in a shuffle genre session
        })

        get().setCurrentTrack(queueItems[0])
        get().play()
      },


    }),
    {
      name: 'player-storage',
      partialize: (state) => ({
        // User preferences
        volume: state.volume,
        shuffle: state.shuffle,
        repeat: state.repeat,
        lastPlayedTrack: state.lastPlayedTrack,
        // Now playing state
        currentTrack: state.currentTrack,
        currentIndex: state.currentIndex,
        queue: state.queue,
        // Added by you songs
        originalQueue: state.originalQueue,
        shuffledOrder: state.shuffledOrder,
        // Playback context
        previousSongs: state.previousSongs,
        playedSongIds: state.playedSongIds,
        collectionStartIndex: state.collectionStartIndex,
        manuallyCleared: state.manuallyCleared,
        // Shuffle-all state
        isShuffleAllActive: state.isShuffleAllActive,
        shuffleAllLoadedCount: state.shuffleAllLoadedCount,
        // Shuffle-genre state
        isShuffleGenreActive: state.isShuffleGenreActive,
        shuffleGenreLoadedCount: state.shuffleGenreLoadedCount,
        // Queue management
        maxQueueSize: state.maxQueueSize,
      }),

      addMoreShuffleSongs: async () => {
        const { isShuffleAllSession, isShuffleGenreSession, currentShuffleGenreId, queue, playedSongIds } = get()

        if (!isShuffleAllSession && !isShuffleGenreSession) {
          console.warn('[Shuffle] addMoreShuffleSongs called but not in shuffle session')
          return
        }

        try {
          let availableSongs: BaseItemDto[] = []

          if (isShuffleAllSession) {
            // Get all cached songs
            const allSongs = useMusicStore.getState().songs
            if (allSongs && allSongs.length > 0) {
              availableSongs = allSongs
            } else {
              // Fallback to API if no cached songs
              const { jellyfinClient } = await import('../api/jellyfin')
              const result = await jellyfinClient.getSongs({
                limit: 200,
                startIndex: 0,
                sortBy: ['SortName'],
                sortOrder: 'Ascending'
              })
              availableSongs = result.Items || []
            }
          } else if (isShuffleGenreSession && currentShuffleGenreId) {
            // Get cached songs for the specific genre
            const genreSongs = useMusicStore.getState().genreSongs[currentShuffleGenreId]
            if (genreSongs && genreSongs.length > 0) {
              availableSongs = genreSongs
            } else {
              console.warn(`[Shuffle] No cached songs found for genre ${currentShuffleGenreId}, falling back to all songs`)
              // Fallback to all songs if genre cache is empty
              const allSongs = useMusicStore.getState().songs
              if (allSongs && allSongs.length > 0) {
                availableSongs = allSongs
              }
            }
          }

          if (availableSongs.length === 0) {
            console.warn('[Shuffle] No songs available to add')
            return
          }

          // Filter out songs already in queue or already played
          const queueSongIds = new Set(queue.map(s => s.Id))
          const unplayedSongs = availableSongs.filter(song =>
            !queueSongIds.has(song.Id) && !playedSongIds.includes(song.Id)
          )

          if (unplayedSongs.length === 0) {
            console.log('[Shuffle] All available songs have been played or are in queue')
            return
          }

          // Shuffle and take up to 50 more songs
          const shuffledNewSongs = shuffleArray(unplayedSongs).slice(0, 50)
          const newQueueItems = shuffledNewSongs.map(song => ({ ...song, _isRecommended: false }))

          // Add to queue
          get().addToQueue(newQueueItems, false) // false = not recommendations

        } catch (error) {
          console.error('[Shuffle] Error adding more songs:', error)
        }
      },

      onRehydrateStorage: () => (state) => {
        // Reset runtime state when app restarts
        if (state) {
          state.isPlaying = false
          state.currentTime = 0
          state.duration = 0
          state.isFetchingRecommendations = false
          // Keep audioElement as null - it will be set when needed
          state.audioElement = null
          // Reset shuffle-all state on app restart
          state.isShuffleAllActive = false
          state.shuffleAllLoadedCount = 0
          // Reset shuffle-genre state on app restart
          state.isShuffleGenreActive = false
          state.shuffleGenreLoadedCount = 0
        }
      }
    }
  )
)

