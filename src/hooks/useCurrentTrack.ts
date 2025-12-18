import { usePlayerStore } from '../stores/playerStore'

export function useCurrentTrack() {
  const { songs, currentIndex } = usePlayerStore()
  return currentIndex >= 0 && songs[currentIndex] ? songs[currentIndex] : null
}
