import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePlayerStore } from '../stores/playerStore'
import type { QueueSong } from '../stores/playerStore'
import { useSettingsStore } from '../stores/settingsStore'
import { remoteControls, remotePosition, useRemoteStore } from '../remote/remoteStore'
import type { RepeatMode } from '../remote/protocol'

export interface PlayerView {
  /** True while this device controls another one */
  isRemote: boolean
  /** Name of the controlled device, when remote */
  remoteDeviceName: string | null
  songs: QueueSong[]
  currentIndex: number
  currentTrack: QueueSong | null
  isPlaying: boolean
  duration: number
  shuffle: boolean
  repeat: RepeatMode
  showQueueRecommendations: boolean
  togglePlayPause: () => void
  next: () => void
  previous: () => void
  seek: (seconds: number) => void
  skipToTrack: (index: number) => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  removeFromQueue: (index: number) => void
  reorderQueue: (from: number, to: number) => void
  clearUpcoming: () => void
  setQueueRecommendations: (enabled: boolean) => void
}

/**
 * What the player UI shows and controls: this device's playback, or the
 * device it's controlling. Audio-engine code keeps using usePlayerStore, which
 * is always this device.
 * The playback position is left out (see usePlayerTime) so that only the components showing it
 * re-render as it advances.
 */
export function usePlayer(): PlayerView {
  const local = usePlayerStore(useShallow(s => ({
    songs: s.songs,
    currentIndex: s.currentIndex,
    isPlaying: s.isPlaying,
    duration: s.duration,
    shuffle: s.shuffle,
    repeat: s.repeat,
    togglePlayPause: s.togglePlayPause,
    next: s.next,
    previous: s.previous,
    seek: s.seek,
    skipToTrack: s.skipToTrack,
    toggleShuffle: s.toggleShuffle,
    toggleRepeat: s.toggleRepeat,
    removeFromQueue: s.removeFromQueue,
    reorderQueue: s.reorderQueue,
    clearUpcoming: s.clearUpcoming,
    setQueueRecommendations: s.setQueueRecommendations,
  })))
  const showRecommendations = useSettingsStore(s => s.showQueueRecommendations)
  const targetSessionId = useRemoteStore(s => s.targetSessionId)
  const remote = useRemoteStore(s => s.remote)
  const remoteDeviceName = useRemoteStore(s =>
    s.targetSessionId ? s.devices.find(d => d.sessionId === s.targetSessionId)?.name ?? null : null
  )

  if (targetSessionId) {
    const songs = remote?.songs ?? []
    const currentIndex = remote?.currentIndex ?? -1
    return {
      isRemote: true,
      remoteDeviceName,
      songs,
      currentIndex,
      currentTrack: currentIndex >= 0 ? songs[currentIndex] ?? null : null,
      isPlaying: remote?.isPlaying ?? false,
      duration: remote?.duration ?? 0,
      shuffle: remote?.shuffle ?? false,
      repeat: remote?.repeat ?? 'off',
      showQueueRecommendations: remote?.showRecommendations ?? false,
      ...remoteControls,
      setQueueRecommendations: remoteControls.setRecommendations,
    }
  }

  const currentTrack = local.currentIndex >= 0 ? local.songs[local.currentIndex] ?? null : null
  return {
    isRemote: false,
    remoteDeviceName: null,
    songs: local.songs,
    currentIndex: local.currentIndex,
    currentTrack,
    isPlaying: local.isPlaying,
    duration: local.duration,
    shuffle: local.shuffle,
    repeat: local.repeat,
    showQueueRecommendations: showRecommendations,
    togglePlayPause: local.togglePlayPause,
    next: local.next,
    previous: local.previous,
    seek: local.seek,
    skipToTrack: local.skipToTrack,
    toggleShuffle: local.toggleShuffle,
    toggleRepeat: local.toggleRepeat,
    removeFromQueue: local.removeFromQueue,
    reorderQueue: local.reorderQueue,
    clearUpcoming: local.clearUpcoming,
    setQueueRecommendations: local.setQueueRecommendations,
  }
}

/** Playback position of whichever device usePlayer shows */
export function usePlayerTime(): number {
  const isRemote = useRemoteStore(s => s.targetSessionId !== null)
  const localTime = usePlayerStore(s => s.currentTime)
  const remoteTime = useRemoteTime()
  return isRemote ? remoteTime : localTime
}

/** The controlled device's position, advanced locally between its updates. */
function useRemoteTime(): number {
  const remote = useRemoteStore(s => s.remote)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!remote?.isPlaying) return
    const interval = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(interval)
  }, [remote?.isPlaying])

  return remote ? remotePosition(remote, Math.max(now, remote.positionAt)) : 0
}

/** Shuffle state of whichever device is being controlled. */
export function getEffectiveShuffle(): boolean {
  const { targetSessionId, remote } = useRemoteStore.getState()
  return targetSessionId ? remote?.shuffle ?? false : usePlayerStore.getState().shuffle
}
