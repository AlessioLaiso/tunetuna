import { usePlayerStore } from '../stores/playerStore'

/**
 * Selector hook that only re-renders when lastPlayedTrack changes
 * Uses Zustand's selector pattern for optimal performance
 */
export function useLastPlayedTrack() {
  return usePlayerStore((state) => state.lastPlayedTrack)
}
