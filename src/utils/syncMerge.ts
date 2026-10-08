import type { LightweightSong } from '../api/types'

/**
 * Merge changed/new songs into an existing cached list for incremental sync.
 *
 * - Songs present in both lists are replaced by the changed version (update in place,
 *   preserving the original ordering of `existing`).
 * - Songs only in `changed` are appended in their incoming order.
 *
 * Matching is by `Id`. If `changed` contains duplicate Ids, the last one wins.
 */
export function mergeLightweightSongs(
  existing: LightweightSong[],
  changed: LightweightSong[],
): LightweightSong[] {
  const changedById = new Map(changed.map(s => [s.Id, s]))
  const merged = existing.map(s => changedById.get(s.Id) ?? s)

  const existingIds = new Set(existing.map(s => s.Id))
  const newSongs = changed.filter(s => !existingIds.has(s.Id))
  merged.push(...newSongs)

  return merged
}

/**
 * Drop songs whose Id is in `removedIds`. Returns the original array when
 * nothing matched, so callers can skip a store write (and the IndexedDB
 * persist that follows it) when a removal event didn't concern any song.
 */
export function removeSongsById<T extends { Id: string }>(
  songs: T[],
  removedIds: ReadonlySet<string>,
): T[] {
  if (removedIds.size === 0) return songs
  const kept = songs.filter(s => !removedIds.has(s.Id))
  return kept.length === songs.length ? songs : kept
}
