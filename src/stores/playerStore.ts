import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BaseItemDto, LightweightSong } from '../api/types'
import type { BaseItemDto } from '../api/types'
import { jellyfinClient } from '../api/jellyfin'
import { useMusicStore } from './musicStore'

interface QueueItem extends BaseItemDto {
  _isRecommended?: boolean
}

// Track which items have been reported to prevent duplicate API calls
const reportedItems = new Set<string>()
const reportingTimeouts = new Map<string, NodeJS.Timeout>()

// Helper function to report playback after a delay
function reportPlaybackWithDelay(trackId: string, getCurrentTrack: () => BaseItemDto | null, delayMs: number = 5000) {
  const queue = usePlayerStore.getState().queue
  const trackIsRecommended = queue.find(t => t.Id === trackId) ? (queue.find(t => t.Id === trackId) as any)?._isRecommended : false
  
  // Clear any existing timeout for this track
  const existingTimeout = reportingTimeouts.get(trackId)
  if (existingTimeout) {
    clearTimeout(existingTimeout)
  }

  // Skip if already reported
  if (reportedItems.has(trackId)) {
    return
  }

  const timeoutId = setTimeout(async () => {
    
    // Check if we're still playing the same track
    const currentTrack = getCurrentTrack()
    
    if (currentTrack?.Id === trackId) {
      try {
        const queue = usePlayerStore.getState().queue
        const trackIsRecommended = queue.find(t => t.Id === trackId) ? (queue.find(t => t.Id === trackId) as any)?._isRecommended : false
        await jellyfinClient.markItemAsPlayed(trackId)
        reportedItems.add(trackId)
        // Trigger event to refresh RecentlyPlayed after server updates
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('trackPlayed', { detail: { trackId } }))
        }, 4000) // 4 second delay after markItemAsPlayed completes to allow server to update
      } catch (error) {
        // Error already logged in markItemAsPlayed
      }
    } else {
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

// Helper function to shuffle array using Fisher-Yates algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

interface PlayerState {
  currentTrack: BaseItemDto | null
  lastPlayedTrack: BaseItemDto | null
  queue: QueueItem[]
  originalQueue: QueueItem[] // Unshuffled order of "Added by You" songs
  shuffledOrder: QueueItem[] // Shuffled order of "Added by You" songs (only songs after current)
  recommendations: QueueItem[] // Recommendations stored separately, always appended to end
  previousSongs: QueueItem[]
  playedSongIds: string[] // Track all played song IDs (for shuffle mode UI filtering)
  collectionStartIndex: number // Index where collection playback effectively started (for slicing when shuffle is disabled)
  currentIndex: number
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  shuffle: boolean
  repeat: 'off' | 'all' | 'one'
  audioElement: HTMLAudioElement | null
  manuallyCleared: boolean
  isFetchingRecommendations: boolean
  setAudioElement: (element: HTMLAudioElement | null) => void
  setIsFetchingRecommendations: (isFetching: boolean) => void
  setCurrentTrack: (track: BaseItemDto | null) => void
  setQueue: (tracks: BaseItemDto[]) => void
  addToQueue: (tracks: BaseItemDto[], isRecommended?: boolean) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  play: () => void
  pause: () => void
  togglePlayPause: () => void
  next: () => void
  previous: () => void
  seek: (time: number) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number) => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  playTrack: (track: BaseItemDto | LightweightSong, queue?: (BaseItemDto | LightweightSong)[]) => void
  playAlbum: (tracks: (BaseItemDto | LightweightSong)[]) => void
  playNext: (tracks: BaseItemDto[]) => void
  shuffleArtist: (songs: BaseItemDto[]) => void
  reorderQueue: (fromIndex: number, toIndex: number) => void
  skipToTrack: (trackIndex: number) => void
  refreshCurrentTrack: () => Promise<void>
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      lastPlayedTrack: null,
      queue: [],
      originalQueue: [], // Unshuffled order of "Added by You" songs
      shuffledOrder: [], // Shuffled order of "Added by You" songs
      recommendations: [], // Recommendations stored separately
      previousSongs: [],
      playedSongIds: [],
      collectionStartIndex: -1, // -1 means no collection start (individual song playback)
      currentIndex: -1,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 1,
      shuffle: false,
      repeat: 'off',
      audioElement: null,
      manuallyCleared: false,
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

      setCurrentTrack: (track) => {
        const previousTrack = get().currentTrack
        const queue = get().queue
        const previousTrackIsRecommended = previousTrack ? queue.find(t => t.Id === previousTrack.Id) ? (queue.find(t => t.Id === previousTrack.Id) as any)?._isRecommended : false : false
        const newTrackIsRecommended = track ? queue.find(t => t.Id === track.Id) ? (queue.find(t => t.Id === track.Id) as any)?._isRecommended : false : false
        
        // Clear reported status when switching to a different track
        if (previousTrack && track && previousTrack.Id !== track.Id) {
          
          // CRITICAL FIX: Report the previous track immediately if it hasn't been reported yet
          // This ensures tracks that are skipped quickly still get reported
          if (!reportedItems.has(previousTrack.Id)) {
            // Clear the timeout and report immediately
            const previousTimeout = reportingTimeouts.get(previousTrack.Id)
            if (previousTimeout) {
              clearTimeout(previousTimeout)
              reportingTimeouts.delete(previousTrack.Id)
            }
            // Mark as reported immediately to prevent duplicate reports
            reportedItems.add(previousTrack.Id)
            // Report immediately in the background (don't await)
            // Use previousTrackIsRecommended calculated at the start of the function to avoid stale queue lookups
            jellyfinClient.markItemAsPlayed(previousTrack.Id).then(() => {
              // Trigger a custom event to notify RecentlyPlayed to refresh after a short delay
              // This ensures the server has time to update its database
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('trackPlayed', { detail: { trackId: previousTrack.Id } }))
              }, 4000) // 4 second delay after markItemAsPlayed completes to allow server to update
            }).catch((error) => {
              // If reporting fails, remove from reportedItems so it can be retried later
              reportedItems.delete(previousTrack.Id)
            })
          } else {
            // Already reported, just clear the timeout if it exists
            const previousTimeout = reportingTimeouts.get(previousTrack.Id)
            if (previousTimeout) {
              clearTimeout(previousTimeout)
              reportingTimeouts.delete(previousTrack.Id)
            }
          }
          // Don't delete from reportedItems here - it should stay marked as reported
          // The deletion was causing issues where tracks being reported would be immediately unmarked
        }
        if (track) {
          set({ currentTrack: track, lastPlayedTrack: track })
          // Add to local recently played list (client-side tracking)
          // Only add if this is a new track (not the same track being set again)
          if (!previousTrack || previousTrack.Id !== track.Id) {
            useMusicStore.getState().addToRecentlyPlayed(track)
          }
        } else {
          set({ currentTrack: track })
        }
        const audio = get().audioElement
        if (audio && track) {
          const baseUrl = jellyfinClient.serverBaseUrl
          const audioUrl = baseUrl
            ? `${baseUrl}/Audio/${track.Id}/stream?static=true`
            : ''
          if (audio.src !== audioUrl) {
            audio.src = audioUrl
            audio.load()
          }
        }
      },

      setQueue: (tracks) => {
        const queueItems = tracks.map(t => ({ ...t, _isRecommended: false }))
        set({ 
          queue: queueItems, 
          originalQueue: [...queueItems], 
          shuffledOrder: [...queueItems], // Initially same as original
          manuallyCleared: true, 
          playedSongIds: [] 
        })
      },

      addToQueue: (tracks, isRecommended = false) => {
        set((state) => {
          const newTracks = tracks.map(track => ({ ...track, _isRecommended: isRecommended }))

          // Get user-added songs order based on shuffle state
          const userAddedOrder = state.shuffle ? (state.shuffledOrder || []) : (state.originalQueue || [])
          
          let newQueue: QueueItem[]
          let newOriginalQueue: QueueItem[]
          let newShuffledOrder: QueueItem[]
          let newRecommendations: QueueItem[]
          
          if (isRecommended) {
            // Recommendations: Simply append to recommendations array and rebuild queue
            newRecommendations = [...state.recommendations, ...newTracks]
            newQueue = [...userAddedOrder, ...newRecommendations]
            newOriginalQueue = [...state.originalQueue]  // Don't add recommendations to originalQueue
            newShuffledOrder = [...state.shuffledOrder]  // Don't add recommendations to shuffledOrder
          } else {
            // User-added songs: insert before recommendations
            // Check for duplicates in newTracks
            const existingIds = new Set([...state.originalQueue.map(t => t.Id)])
            const uniqueNewTracks = newTracks.filter(t => !existingIds.has(t.Id))
            
            // Add to originalQueue (unshuffled order)
            newOriginalQueue = [...state.originalQueue, ...uniqueNewTracks]
            
            if (state.shuffle) {
              // Shuffle is ON: shuffle new songs into existing user-added songs
              // Only shuffle songs AFTER the current song
              let shuffledUserAdded: QueueItem[]
              if (state.currentIndex >= 0 && state.currentTrack) {
                const currentTrackInOriginal = newOriginalQueue.findIndex(t => t.Id === state.currentTrack?.Id)
                if (currentTrackInOriginal >= 0) {
                  // Keep everything up to and including current track
                  const beforeCurrent = newOriginalQueue.slice(0, currentTrackInOriginal + 1)
                  const afterCurrent = newOriginalQueue.slice(currentTrackInOriginal + 1)
                  const shuffledAfter = shuffleArray(afterCurrent)
                  shuffledUserAdded = [...beforeCurrent, ...shuffledAfter]
                } else {
                  // Current track not found, shuffle everything
                  shuffledUserAdded = shuffleArray(newOriginalQueue)
                }
              } else {
                // No current index, shuffle everything
                shuffledUserAdded = shuffleArray(newOriginalQueue)
              }
              
              newShuffledOrder = shuffledUserAdded
              // Build queue using shuffled order + recommendations
              newQueue = [...shuffledUserAdded, ...state.recommendations]
            } else {
              // Shuffle is OFF: append to end of user-added section (before recommendations)
              newShuffledOrder = [...newOriginalQueue] // Keep shuffledOrder in sync when shuffle is off
              newQueue = [...newOriginalQueue, ...state.recommendations]
            }
            
            newRecommendations = [...state.recommendations]  // Keep recommendations unchanged
          }

          // Update currentIndex if needed (if we inserted before current position)
          let newCurrentIndex = state.currentIndex
          if (!isRecommended && state.currentIndex >= 0) {
            // If we inserted user-added songs and shuffle is ON, we need to find the current track in the new queue
            if (state.shuffle && state.currentTrack) {
              const newIndex = newQueue.findIndex(t => t.Id === state.currentTrack?.Id)
              if (newIndex >= 0) {
                newCurrentIndex = newIndex
              }
            }
            // If shuffle is OFF, the index might have shifted if we inserted before current position
            // But since we append to user-added section, currentIndex should remain valid
          }
          
          return {
            queue: newQueue,
            originalQueue: newOriginalQueue,
            shuffledOrder: newShuffledOrder,
            recommendations: newRecommendations,
            currentIndex: newCurrentIndex,
            // Reset manuallyCleared flag when user adds songs (not recommendations)
            manuallyCleared: isRecommended ? state.manuallyCleared : false,
          }
        })
      },

      removeFromQueue: (index) => {
        set((state) => {
          const newQueue = [...state.queue]
          const removedTrack = newQueue[index]
          newQueue.splice(index, 1)
          
          // Check if the removed track is a recommendation
          const isRecommended = removedTrack && (removedTrack as any)._isRecommended
          
          // Also remove from originalQueue and shuffledOrder if it exists there
          let newOriginalQueue = [...state.originalQueue]
          let newShuffledOrder = [...state.shuffledOrder]
          let newRecommendations = [...state.recommendations]
          
          if (removedTrack) {
            const originalIndex = newOriginalQueue.findIndex(t => t.Id === removedTrack.Id)
            if (originalIndex >= 0) {
              newOriginalQueue.splice(originalIndex, 1)
            }
            const shuffledIndex = newShuffledOrder.findIndex(t => t.Id === removedTrack.Id)
            if (shuffledIndex >= 0) {
              newShuffledOrder.splice(shuffledIndex, 1)
            }
            // If it's a recommendation, also remove from recommendations array
            if (isRecommended) {
              const recommendationIndex = newRecommendations.findIndex(t => t.Id === removedTrack.Id)
              if (recommendationIndex >= 0) {
                newRecommendations.splice(recommendationIndex, 1)
              }
            }
          }
          
          // Rebuild queue with updated recommendations
          const userAddedOrder = state.shuffle ? newShuffledOrder : newOriginalQueue
          const rebuiltQueue = [...userAddedOrder, ...newRecommendations]
          
          let newIndex = state.currentIndex
          if (index < state.currentIndex) {
            newIndex = state.currentIndex - 1
          } else if (index === state.currentIndex && rebuiltQueue.length > 0) {
            newIndex = Math.min(state.currentIndex, rebuiltQueue.length - 1)
          }
          
          // Find the current track's new position in the rebuilt queue
          if (state.currentTrack) {
            const newCurrentIndex = rebuiltQueue.findIndex(t => t.Id === state.currentTrack?.Id)
            if (newCurrentIndex >= 0) {
              newIndex = newCurrentIndex
            }
          }
          
          return {
            queue: rebuiltQueue,
            originalQueue: newOriginalQueue,
            shuffledOrder: newShuffledOrder,
            recommendations: newRecommendations,
            currentIndex: newIndex,
            manuallyCleared: true,
          }
        })
      },

      clearQueue: () => {
        
        // Clear only the queue arrays (user-added songs and recommendations)
        // Keep currentTrack, lastPlayedTrack, isPlaying, and audio state intact
        // Set manuallyCleared to prevent recommendations until user plays/adds a new song
        set({
          queue: [],
          originalQueue: [],
          shuffledOrder: [],
          recommendations: [], // Clear recommendations array
          previousSongs: [],
          playedSongIds: [],
          collectionStartIndex: -1, // Reset collection start index
          currentIndex: -1,
          manuallyCleared: true, // Prevent recommendations until user plays/adds a new song
          // Keep currentTrack, lastPlayedTrack, isPlaying unchanged
        })
        
      },
      play: () => {
        const audio = get().audioElement
        const currentTrack = get().currentTrack
        if (audio && currentTrack) {
          // Ensure audio source is set
          if (!audio.src) {
            const baseUrl = jellyfinClient.serverBaseUrl
            const audioUrl = baseUrl
              ? `${baseUrl}/Audio/${currentTrack.Id}/stream?static=true`
              : ''
            audio.src = audioUrl
            audio.load()
          }
          audio.play().then(() => {
            set({ isPlaying: true })
            // Report playback after delay
            if (currentTrack) {
              reportPlaybackWithDelay(currentTrack.Id, () => get().currentTrack)
            }
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
        const { queue, currentIndex, repeat, shuffle, currentTrack } = get()
        if (queue.length === 0) return

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
              
              return {
                queue: newQueue,
                originalQueue: newOriginalQueue,
                previousSongs: newPreviousSongs,
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
        const { queue, originalQueue } = get()
        if (trackIndex < 0 || trackIndex >= queue.length) return
        
        // Remove all tracks before the selected index
        const newQueue = queue.slice(trackIndex)
        const selectedTrack = newQueue[0]
        
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
      }),
      onRehydrateStorage: () => (state) => {
        // Reset runtime state when app restarts
        if (state) {
          state.isPlaying = false
          state.currentTime = 0
          state.duration = 0
          state.isFetchingRecommendations = false
          // Keep audioElement as null - it will be set when needed
          state.audioElement = null
        }
      },
    }
  )
)

