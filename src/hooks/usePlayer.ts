import { useEffect, useState } from 'react'
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
  currentTime: number
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
 */
export function usePlayer(): PlayerView {
  const local = usePlayerStore()
  const showRecommendations = useSettingsStore(s => s.showQueueRecommendations)
  const targetSessionId = useRemoteStore(s => s.targetSessionId)
  const remote = useRemoteStore(s => s.remote)
  const remoteDeviceName = useRemoteStore(s =>
    s.targetSessionId ? s.devices.find(d => d.sessionId === s.targetSessionId)?.name ?? null : null
  )
  const remoteTime = useRemoteTime()

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
      currentTime: remoteTime,
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
    currentTime: local.currentTime,
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
