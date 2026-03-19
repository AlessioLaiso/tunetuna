import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { usePlayerStore } from './playerStore'

const FADE_DURATION = 20 // seconds

type SleepTimerMode = 'off' | 'end-of-track' | 'timed'

interface SleepTimerState {
  mode: SleepTimerMode
  /** Absolute timestamp (ms) when playback should pause */
  endsAt: number | null
  /** Seconds remaining, updated every second */
  remainingSeconds: number | null

  start: (minutes: number | 'end-of-track') => void
  cancel: () => void
}

let tickInterval: NodeJS.Timeout | null = null
let fadeInterval: NodeJS.Timeout | null = null

function clearTickInterval() {
  if (tickInterval) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}

function clearFadeInterval() {
  if (fadeInterval) {
    clearInterval(fadeInterval)
    fadeInterval = null
  }
}

function clearAllTimers() {
  clearTickInterval()
  clearFadeInterval()
}

function pausePlayback() {
  const state = usePlayerStore.getState()
  if (state.isPlaying) {
    state.togglePlayPause()
  }
}

function fadeOutAndPause(fadeDuration: number) {
  const { audioElement } = usePlayerStore.getState()
  if (!audioElement) {
    pausePlayback()
    clearAllTimers()
    useSleepTimerStore.setState({ mode: 'off', endsAt: null, remainingSeconds: null })
    return
  }

  const startVolume = audioElement.volume
  const stepInterval = 500 // ms
  const steps = Math.max(1, Math.floor((fadeDuration * 1000) / stepInterval))
  const volumeStep = startVolume / steps
  let currentStep = 0

  fadeInterval = setInterval(() => {
    currentStep++
    const newVolume = Math.max(0, startVolume - volumeStep * currentStep)
    audioElement.volume = newVolume

    if (currentStep >= steps) {
      clearAllTimers()
      pausePlayback()
      // Restore volume for next play
      audioElement.volume = startVolume
      useSleepTimerStore.setState({ mode: 'off', endsAt: null, remainingSeconds: null })
    }
  }, stepInterval)
}

export const useSleepTimerStore = create<SleepTimerState>()(devtools((set, get) => ({
  mode: 'off',
  endsAt: null,
  remainingSeconds: null,

  start: (minutes) => {
    clearAllTimers()

    if (minutes === 'end-of-track') {
      set({ mode: 'end-of-track', endsAt: null, remainingSeconds: null })

      // Subscribe to track changes — when the current track ends, pause
      const currentTrackId = usePlayerStore.getState().songs[usePlayerStore.getState().currentIndex]?.Id
      tickInterval = setInterval(() => {
        const state = usePlayerStore.getState()
        const nowTrackId = state.songs[state.currentIndex]?.Id
        if (nowTrackId !== currentTrackId) {
          // Track changed — pause
          if (state.isPlaying) {
            state.togglePlayPause()
          }
          get().cancel()
        }
      }, 500)
      return
    }

    const durationMs = minutes * 60 * 1000
    const endsAt = Date.now() + durationMs

    set({
      mode: 'timed',
      endsAt,
      remainingSeconds: Math.ceil(durationMs / 1000),
    })

    tickInterval = setInterval(() => {
      const { endsAt, mode } = get()
      if (mode !== 'timed' || !endsAt) return

      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      set({ remainingSeconds: remaining })

      // Start fade — tick keeps running for UI countdown, fade handles pause
      if (remaining <= FADE_DURATION && !fadeInterval) {
        fadeOutAndPause(remaining)
      }
    }, 1000)
  },

  cancel: () => {
    clearAllTimers()
    // Restore volume in case fade was in progress
    const { audioElement } = usePlayerStore.getState()
    if (audioElement) {
      audioElement.volume = usePlayerStore.getState().volume
    }
    set({ mode: 'off', endsAt: null, remainingSeconds: null })
  },
}), { name: 'sleepTimerStore' }))
