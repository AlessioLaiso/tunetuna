import type { LightweightSong } from '../api/types'
import { useSettingsStore } from '../stores/settingsStore'

/**
 * Filters out songs belonging to excluded genres (configured in settings).
 * Used in discovery contexts: shuffle all, smart mixes, mood cards.
 */
export function filterExcludedGenres(songs: LightweightSong[]): LightweightSong[] {
  const { excludedGenres } = useSettingsStore.getState()
  if (excludedGenres.length === 0) return songs

  const excludedLower = new Set(excludedGenres.map(g => g.toLowerCase()))
  return songs.filter(song =>
    !song.Genres?.some(g => excludedLower.has(g.toLowerCase()))
  )
}
