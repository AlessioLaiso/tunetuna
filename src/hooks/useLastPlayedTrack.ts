import { usePlayerStore } from '../stores/playerStore'

export function useLastPlayedTrack() {
  const { lastPlayedTrack } = usePlayerStore()
  return lastPlayedTrack
}
