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
