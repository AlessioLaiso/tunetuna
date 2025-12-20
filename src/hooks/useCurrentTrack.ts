import { usePlayerStore } from '../stores/playerStore'

/**
 * Selector hook that only re-renders when the current track changes
 * Uses Zustand's selector pattern for optimal performance
 */
export function useCurrentTrack() {
  return usePlayerStore((state) => {
    const { songs, currentIndex } = state
    return currentIndex >= 0 && songs[currentIndex] ? songs[currentIndex] : null
  })
}
