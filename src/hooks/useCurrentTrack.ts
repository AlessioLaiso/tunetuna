import { usePlayerStore } from '../stores/playerStore'
import type { QueueSong } from '../stores/playerStore'
import { useRemoteStore } from '../remote/remoteStore'

/**
 * The track shown as playing: this device's, or the controlled device's while
 * another one is being controlled. Pages use this for "now playing" marks.
 * Re-renders only when that track changes.
 */
export function useCurrentTrack(): QueueSong | null {
  const isRemote = useRemoteStore(s => s.targetSessionId !== null)
  const remoteTrack = useRemoteStore(s => {
    const remote = s.remote
    return remote && remote.currentIndex >= 0 ? remote.songs[remote.currentIndex] ?? null : null
  })
  const localTrack = useLocalCurrentTrack()
  return isRemote ? remoteTrack : localTrack
}

/** This device's current track, whatever device is being controlled (audio, lyrics, lock screen). */
export function useLocalCurrentTrack(): QueueSong | null {
  return usePlayerStore((state) => {
    const { songs, currentIndex } = state
    return currentIndex >= 0 && songs[currentIndex] ? songs[currentIndex] : null
  })
}
