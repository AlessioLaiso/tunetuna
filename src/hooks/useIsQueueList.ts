import { useMemo } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { queueMatchesList, isPlayingRecommendation } from '../stores/queueOps'
import type { QueueSong } from '../stores/queueOps'

type ListItem = string | { Id: string }

// Results are cached per (queue array, list array) pair so long lists whose
// rows each call this hook with the same list only pay for one comparison per
// queue change. Both keys are compared by reference, so callers must pass
// memoised lists.
const cache = new WeakMap<readonly QueueSong[], WeakMap<readonly ListItem[], boolean>>()

function isQueueList(songs: readonly QueueSong[], list: readonly ListItem[]): boolean {
  let byList = cache.get(songs)
  if (!byList) {
    byList = new WeakMap()
    cache.set(songs, byList)
  }
  const cached = byList.get(list)
  if (cached !== undefined) return cached
  const ids = list.map(item => (typeof item === 'string' ? item : item.Id))
  const result = queueMatchesList(songs, ids)
  byList.set(list, result)
  return result
}

/**
 * Whether the player queue is this list (an album's tracks, a playlist, an
 * artist's songs...). Only the queue's contents matter: the current track
 * merely belonging to the list is not enough. Once playback moves on to
 * recommendations queued after the list, the queue no longer counts as it.
 * Re-renders only when the queue itself changes or playback crosses into or
 * out of recommendations, not on every playback tick.
 */
export function useIsQueueList(list: readonly ListItem[] | undefined): boolean {
  const songs = usePlayerStore(state => state.songs)
  const onRecommendation = usePlayerStore(state => isPlayingRecommendation(state.songs, state.currentIndex))
  return useMemo(
    () => (list && !onRecommendation ? isQueueList(songs, list) : false),
    [songs, list, onRecommendation],
  )
}

/**
 * Whether the current track is one of this list's songs, wherever the queue
 * came from. Looser than useIsQueueList: an album's spinning disc reflects any
 * of its songs playing, even mid shuffle-all, while the Play/Pause button still
 * follows useIsQueueList. Re-renders only when the current track changes.
 */
export function useIsCurrentTrackInList(list: readonly ListItem[] | undefined): boolean {
  const currentId = usePlayerStore(state => state.songs[state.currentIndex]?.Id)
  return useMemo(
    () => !!currentId && !!list?.some(item => (typeof item === 'string' ? item : item.Id) === currentId),
    [currentId, list],
  )
}
