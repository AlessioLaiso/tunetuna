import { usePlayerStore } from '../stores/playerStore'
import type { QueueSong } from '../stores/playerStore'
import { remoteControls, useRemoteStore } from '../remote/remoteStore'

/**
 * Small selectors for pages that mark what's playing (an album's Play/Pause
 * button, a spinning disc): they follow the controlled device while another
 * one is being controlled. The player UI itself uses usePlayer.
 */

const EMPTY: QueueSong[] = []

export function useShownIsPlaying(): boolean {
  const isRemote = useRemoteStore(s => s.targetSessionId !== null)
  const remotePlaying = useRemoteStore(s => s.remote?.isPlaying ?? false)
  const localPlaying = usePlayerStore(s => s.isPlaying)
  return isRemote ? remotePlaying : localPlaying
}

export function useShownQueue(): { songs: QueueSong[]; currentIndex: number } {
  const isRemote = useRemoteStore(s => s.targetSessionId !== null)
  const remoteSongs = useRemoteStore(s => s.remote?.songs ?? EMPTY)
  const remoteIndex = useRemoteStore(s => s.remote?.currentIndex ?? -1)
  const localSongs = usePlayerStore(s => s.songs)
  const localIndex = usePlayerStore(s => s.currentIndex)
  return isRemote ? { songs: remoteSongs, currentIndex: remoteIndex } : { songs: localSongs, currentIndex: localIndex }
}

/** Resume / pause whichever device is being controlled. */
export const shownPlayback = {
  play() {
    if (useRemoteStore.getState().targetSessionId) remoteControls.play()
    else usePlayerStore.getState().play()
  },
  pause() {
    if (useRemoteStore.getState().targetSessionId) remoteControls.pause()
    else usePlayerStore.getState().pause()
  },
  pauseWithFade() {
    if (useRemoteStore.getState().targetSessionId) remoteControls.pause()
    else usePlayerStore.getState().pauseWithFade()
  },
}

/** Non-hook snapshot of the shown queue, for checks inside timers and callbacks. */
export function getShownPlayback(): { songs: QueueSong[]; currentIndex: number; isPlaying: boolean } {
  const { targetSessionId, remote } = useRemoteStore.getState()
  if (targetSessionId) {
    return { songs: remote?.songs ?? EMPTY, currentIndex: remote?.currentIndex ?? -1, isPlaying: remote?.isPlaying ?? false }
  }
  const { songs, currentIndex, isPlaying } = usePlayerStore.getState()
  return { songs, currentIndex, isPlaying }
}
