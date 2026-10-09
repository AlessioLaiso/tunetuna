import { useMemo } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { queueMatchesList } from '../stores/queueOps'
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
 * merely belonging to the list is not enough. Re-renders only when the queue
 * itself changes, not on every playback tick.
 */
export function useIsQueueList(list: readonly ListItem[] | undefined): boolean {
  const songs = usePlayerStore(state => state.songs)
  return useMemo(() => (list ? isQueueList(songs, list) : false), [songs, list])
}
