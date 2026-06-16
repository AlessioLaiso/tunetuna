import type { BaseItemDto } from '../api/types'
import { shuffleArray } from '../utils/array'

// Mirror of the player store's QueueSong so these pure helpers don't depend on
// the store module (avoids a circular import: store -> queueOps -> store).
export interface QueueSong extends BaseItemDto {
  source: 'user' | 'recommendation'
}

export const MAX_QUEUE_SIZE = 1000

// The slice of player state the queue computations read. Keeping it minimal
// makes these functions trivially constructible in tests.
export interface QueueState {
  songs: QueueSong[]
  currentIndex: number
  previousIndex: number
  standardOrder: string[]
  shuffleOrder: string[]
  shuffle: boolean
}

type ShuffleFn = <T>(array: T[]) => T[]

export interface AddToQueueResult {
  songs: QueueSong[]
  currentIndex: number
  standardOrder: string[]
  shuffleOrder: string[]
  manuallyCleared: false
}

/**
 * Compute the new queue after adding tracks. Pure: the only nondeterminism
 * (shuffle for play-next) is injected via `shuffle` so callers/tests control it.
 *
 * Extracted verbatim from playerStore.addToQueue's set() callback. The side
 * effect (cancelPreBuffer) stays in the store action.
 */
export function computeAddToQueue(
  state: QueueState,
  tracks: BaseItemDto[],
  playNext: boolean,
  source: 'user' | 'recommendation',
  shuffle: ShuffleFn = shuffleArray,
): AddToQueueResult {
  const currentSong = state.currentIndex >= 0 ? state.songs[state.currentIndex] : null

  const newSongs: QueueSong[] = tracks.map(track => ({ ...track, source }))

  let finalSongs: QueueSong[]
  const songsToInsert = newSongs

  if (playNext) {
    const songsToInsertShuffled = state.shuffle ? shuffle([...newSongs]) : newSongs

    const insertPosition = state.currentIndex + 1
    const songsBeforeInsert = state.songs.slice(0, insertPosition)
    const songsAfterInsert = state.songs.slice(insertPosition)

    finalSongs = [
      ...songsBeforeInsert,
      ...songsToInsertShuffled,
      ...songsAfterInsert,
    ]
  } else {
    if (source === 'recommendation') {
      finalSongs = [...state.songs, ...songsToInsert]
    } else {
      const firstUpcomingRecoIdx = state.songs.findIndex((song, idx) =>
        idx > state.currentIndex && song.source === 'recommendation',
      )

      if (firstUpcomingRecoIdx !== -1) {
        finalSongs = [
          ...state.songs.slice(0, firstUpcomingRecoIdx),
          ...songsToInsert,
          ...state.songs.slice(firstUpcomingRecoIdx),
        ]
      } else {
        finalSongs = [...state.songs, ...songsToInsert]
      }
    }
  }

  // Update current index if current song moved
  let newCurrentIndex = state.currentIndex
  if (state.currentIndex >= 0 && currentSong) {
    const foundIndex = finalSongs.findIndex(s => s.Id === currentSong.Id)
    if (foundIndex !== -1) {
      newCurrentIndex = foundIndex
    }
  }

  // Enforce max queue size
  let trimmedSongs = finalSongs
  if (finalSongs.length > MAX_QUEUE_SIZE) {
    const songsBeforeCurrent = finalSongs.slice(0, newCurrentIndex)
    const songsAfterCurrent = finalSongs.slice(newCurrentIndex + 1)

    const keepPrevious = songsBeforeCurrent.slice(-5)
    const keepAfter = songsAfterCurrent

    const remainingSlots = MAX_QUEUE_SIZE - keepPrevious.length - (currentSong ? 1 : 0) - keepAfter.length
    const keepBefore = songsBeforeCurrent.slice(-Math.max(0, remainingSlots))

    trimmedSongs = [
      ...keepBefore,
      ...(currentSong ? [currentSong] : []),
      ...keepAfter,
    ]

    newCurrentIndex = currentSong ? keepBefore.length : -1
  }

  // Always rebuild order arrays from actual user songs in the final queue
  const userSongsInOrder = trimmedSongs.filter(s => s.source === 'user')
  const newOrderArray = userSongsInOrder.map(s => s.Id)

  return {
    songs: trimmedSongs,
    currentIndex: newCurrentIndex,
    standardOrder: newOrderArray,
    shuffleOrder: newOrderArray,
    manuallyCleared: false,
  }
}

export interface RemoveFromQueueResult {
  songs: QueueSong[]
  currentIndex: number
  previousIndex: number
  standardOrder: string[]
  shuffleOrder: string[]
}

/**
 * Compute the new queue after removing the song at `index`. Returns `null` when
 * the index is out of range (caller keeps state unchanged). Pure.
 */
export function computeRemoveFromQueue(
  state: QueueState,
  index: number,
): RemoveFromQueueResult | null {
  if (index < 0 || index >= state.songs.length) return null

  const songToRemove = state.songs[index]
  const newSongs = state.songs.filter((_, i) => i !== index)

  const newStandardOrder = state.standardOrder.filter(id => id !== songToRemove.Id)
  const newShuffleOrder = state.shuffleOrder.filter(id => id !== songToRemove.Id)

  let newCurrentIndex = state.currentIndex
  let newPreviousIndex = state.previousIndex

  if (index < state.currentIndex) {
    newCurrentIndex = state.currentIndex - 1
  } else if (index === state.currentIndex) {
    newCurrentIndex = -1
  }

  if (index < state.previousIndex) {
    newPreviousIndex = state.previousIndex - 1
  } else if (index === state.previousIndex) {
    newPreviousIndex = -1
  }

  return {
    songs: newSongs,
    currentIndex: newCurrentIndex,
    previousIndex: newPreviousIndex,
    standardOrder: newStandardOrder,
    shuffleOrder: newShuffleOrder,
  }
}

export interface ReorderQueueResult {
  songs: QueueSong[]
  currentIndex: number
  previousIndex: number
  standardOrder?: string[]
  shuffleOrder?: string[]
}

/**
 * Compute the new queue after moving a song from `fromIndex` to `toIndex`.
 * Returns `null` when the move is invalid or crosses the user/recommendation
 * boundary (caller keeps state unchanged). Pure.
 */
export function computeReorderQueue(
  state: QueueState,
  fromIndex: number,
  toIndex: number,
): ReorderQueueResult | null {
  if (
    fromIndex < 0 || toIndex < 0 ||
    fromIndex >= state.songs.length || toIndex >= state.songs.length ||
    fromIndex === toIndex
  ) {
    return null
  }

  const fromSong = state.songs[fromIndex]
  const toSong = state.songs[toIndex]

  // Don't allow dragging between user songs and recommendations
  if (fromSong.source !== toSong.source) {
    return null
  }

  const newSongs = [...state.songs]
  const [removed] = newSongs.splice(fromIndex, 1)
  newSongs.splice(toIndex, 0, removed)

  if (fromSong.source === 'user') {
    const orderArrayKey = state.shuffle ? 'shuffleOrder' : 'standardOrder'
    const currentOrder = state[orderArrayKey]

    const orderIndex = currentOrder.indexOf(fromSong.Id)
    if (orderIndex >= 0) {
      const newOrder = [...currentOrder]
      newOrder.splice(orderIndex, 1)

      const userSongsBeforeTo = newSongs.slice(0, toIndex + 1).filter(s => s.source === 'user')
      const insertIndex = userSongsBeforeTo.length - 1

      newOrder.splice(insertIndex, 0, fromSong.Id)

      const newCurrentIndex = toIndex === state.currentIndex ? toIndex :
        fromIndex === state.currentIndex ? toIndex :
          state.currentIndex
      return {
        songs: newSongs,
        [orderArrayKey]: newOrder,
        currentIndex: newCurrentIndex,
        previousIndex: toIndex === state.previousIndex ? toIndex :
          fromIndex === state.previousIndex ? toIndex :
            state.previousIndex,
      }
    }
  }

  // For recommendations, just update indices
  const newCurrentIndex = toIndex === state.currentIndex ? toIndex :
    fromIndex === state.currentIndex ? toIndex :
      state.currentIndex
  return {
    songs: newSongs,
    currentIndex: newCurrentIndex,
    previousIndex: toIndex === state.previousIndex ? toIndex :
      fromIndex === state.previousIndex ? toIndex :
        state.previousIndex,
  }
}
