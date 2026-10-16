// Lyrics-view vocal remover (desktop only). A worker separates the current track into
// ~5.7s segments, starting at the playback position. Once the segment under the playhead
// is ready, the <audio> element keeps playing muted as the master clock (position,
// seeking, media session) and the separated stems are scheduled back to back through
// Web Audio, with the vocal stem's gain controlled by the slider. Whenever the playhead
// reaches audio that isn't separated yet, playback falls back to the element, except at
// the very start of a track, where playback is held until the first segment is ready.
// The next tracks in the queue are separated ahead of time.

import { create } from 'zustand'
import { usePlayerStore } from '../../stores/playerStore'
import { jellyfinClient } from '../../api/jellyfin'
import { isIOS } from '../../utils/formatting'
import { logger } from '../../utils/logger'
import { MDX_SAMPLE_RATE, getSegmentLength } from './mdx'
import type { WorkerRequest, WorkerResponse } from './types'

type Status = 'idle' | 'downloading-model' | 'preparing' | 'active' | 'error'

interface VocalRemoverState {
  level: number
  status: Status
  progress: number
  setLevel: (level: number) => void
  reset: () => void
}

interface Segment {
  vocals: AudioBuffer
  instrumental: AudioBuffer
}

interface TrackStems {
  // Dropped once every segment is separated
  mix: AudioBuffer | null
  segmentCount: number
  segments: Map<number, Segment>
}

const SEGMENT_LENGTH = getSegmentLength()
const SYNC_INTERVAL_MS = 100
const MAX_DRIFT_SECONDS = 0.05
const START_DELAY_SECONDS = 0.03
const LOOKAHEAD_SECONDS = 2
const PREPARE_AHEAD_TRACKS = 2
// Playback is held (rather than starting with vocals) when it's this close to a track's start
const HOLD_WINDOW_SECONDS = 1

export const isVocalRemoverSupported = () =>
  typeof navigator !== 'undefined' && 'gpu' in navigator && !isIOS()

let worker: Worker | null = null
let audioContext: AudioContext | null = null
let masterGain: GainNode | null = null
let vocalGain: GainNode | null = null

const tracks = new Map<string, TrackStems>()
const failedTrackIds = new Set<string>()
let job: { id: number; trackId: string; abort: AbortController } | null = null
let nextJobId = 1

// Element being followed, and whether the stems are currently audible instead of it
let followedElement: HTMLAudioElement | null = null
let followedTrackId: string | null = null
let syncTimer: ReturnType<typeof setInterval> | null = null
let usingStems = false
let sources: AudioBufferSourceNode[] = []
// Maps context time to track position: position = timeline.position + (t - timeline.contextTime)
let timeline = { contextTime: 0, position: 0 }
let nextSegmentToSchedule = 0
let scheduledUntil = 0
// Element frozen at the start of a track (playbackRate 0) while its first segment is separated
let heldElement: HTMLAudioElement | null = null

function getCurrentTrackId(): string | null {
  const { songs, currentIndex } = usePlayerStore.getState()
  return songs[currentIndex]?.Id ?? null
}

// Current track followed by the next ones in play order
function getUpcomingTrackIds(): string[] {
  const { songs, currentIndex, repeat } = usePlayerStore.getState()
  const ids: string[] = []
  for (let k = 0; k <= PREPARE_AHEAD_TRACKS && currentIndex >= 0; k++) {
    let index = currentIndex + k
    if (index >= songs.length) {
      if (repeat !== 'all') break
      index %= songs.length
    }
    const id = songs[index]?.Id
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

const isComplete = (stems: TrackStems | undefined) =>
  stems !== undefined && stems.segments.size >= stems.segmentCount

const segmentIndexAt = (seconds: number) => Math.floor((seconds * MDX_SAMPLE_RATE) / SEGMENT_LENGTH)

function setStatus(status: Status, progress = 0) {
  const state = useVocalRemoverStore.getState()
  if (state.status !== status || state.progress !== progress) {
    useVocalRemoverStore.setState({ status, progress })
  }
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./separation.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => handleWorkerMessage(event.data)
  }
  return worker
}

function getAudioGraph() {
  if (!audioContext) {
    // Match the stems' rate so segments are not resampled individually at their seams
    audioContext = new AudioContext({ latencyHint: 'playback', sampleRate: MDX_SAMPLE_RATE })
    masterGain = audioContext.createGain()
    vocalGain = audioContext.createGain()
    vocalGain.connect(masterGain)
    masterGain.connect(audioContext.destination)
  }
  return { context: audioContext, master: masterGain!, vocal: vocalGain! }
}

// --- Playback ---

function stopStems() {
  for (const source of sources) {
    source.onended = null
    try {
      source.stop()
    } catch {
      // Already stopped
    }
    source.disconnect()
  }
  sources = []
  if (usingStems && followedElement && followedElement !== heldElement) followedElement.muted = false
  usingStems = false
}

function hold(element: HTMLAudioElement) {
  if (heldElement === element) return
  release()
  heldElement = element
  element.playbackRate = 0
  element.muted = true
}

function release() {
  if (!heldElement) return
  heldElement.playbackRate = 1
  if (!usingStems || heldElement !== followedElement) heldElement.muted = false
  heldElement = null
}

// Schedules ready segments up to the lookahead; returns false if playback is about to hit a gap
function scheduleAhead(stems: TrackStems): boolean {
  const { context, master, vocal } = getAudioGraph()
  const horizon = context.currentTime + LOOKAHEAD_SECONDS
  while (nextSegmentToSchedule < stems.segmentCount) {
    const segmentStart = (nextSegmentToSchedule * SEGMENT_LENGTH) / MDX_SAMPLE_RATE
    const when = timeline.contextTime + (segmentStart - timeline.position)
    if (when > horizon) break
    const segment = stems.segments.get(nextSegmentToSchedule)
    if (!segment) break

    // The first segment usually starts part way through
    const offset = Math.max(0, timeline.position - segmentStart)
    for (const [buffer, destination] of [[segment.instrumental, master], [segment.vocals, vocal]] as const) {
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(destination)
      source.onended = () => {
        source.disconnect()
        sources = sources.filter((s) => s !== source)
      }
      source.start(when + offset, offset)
      sources.push(source)
    }
    scheduledUntil = when + segment.vocals.duration
    nextSegmentToSchedule++
  }
  const finished = nextSegmentToSchedule >= stems.segmentCount
  return finished || scheduledUntil - context.currentTime > SYNC_INTERVAL_MS / 1000
}

function startStems(element: HTMLAudioElement, stems: TrackStems) {
  const { context } = getAudioGraph()
  timeline = {
    contextTime: context.currentTime + START_DELAY_SECONDS,
    position: element.currentTime + START_DELAY_SECONDS,
  }
  nextSegmentToSchedule = segmentIndexAt(timeline.position)
  scheduledUntil = timeline.contextTime
  usingStems = true
  element.muted = true
  if (!scheduleAhead(stems)) stopStems()
}

const ELEMENT_EVENTS = ['play', 'pause', 'seeking', 'seeked', 'ended'] as const

function follow(element: HTMLAudioElement, trackId: string) {
  followedElement = element
  followedTrackId = trackId
  for (const name of ELEMENT_EVENTS) element.addEventListener(name, onElementEvent)
}

function unfollow() {
  release()
  stopStems()
  if (followedElement) {
    for (const name of ELEMENT_EVENTS) followedElement.removeEventListener(name, onElementEvent)
  }
  followedElement = null
  followedTrackId = null
}

function onElementEvent(event: Event) {
  if (event.type === 'seeking') {
    stopStems()
    // Separate the new position next
    const element = followedElement
    if (element && job && job.trackId === followedTrackId) {
      getWorker().postMessage({
        type: 'prioritize',
        id: job.id,
        sample: Math.floor(element.currentTime * MDX_SAMPLE_RATE),
      } satisfies WorkerRequest)
    }
    return
  }
  sync()
}

// Brings playback in line with the level, the current track and the element's state
function sync() {
  const { level } = useVocalRemoverStore.getState()
  const element = usePlayerStore.getState().audioElement
  const trackId = getCurrentTrackId()

  if (level >= 1 || !element || !trackId) {
    // At full level the stems are just the original mix; hand back to the element
    unfollow()
    return
  }
  if (element !== followedElement || trackId !== followedTrackId) {
    unfollow()
    follow(element, trackId)
  }

  const { context, master, vocal } = getAudioGraph()
  // Cubic curve so the slider tracks perceived loudness (half way ≈ -18 dB)
  vocal.gain.setTargetAtTime(level ** 3, context.currentTime, 0.02)
  // Follow the element's volume (user volume and pause fades)
  master.gain.setTargetAtTime(element.volume, context.currentTime, 0.01)

  scheduleSeparation()

  const stems = tracks.get(trackId)
  const complete = isComplete(stems)
  const failed = failedTrackIds.has(trackId)
  const playing = !element.paused && !element.ended
  const segmentReady = stems?.segments.has(segmentIndexAt(element.currentTime)) ?? false

  // Rather than starting a track with vocals, wait for its first segment
  if (playing && !segmentReady && !failed && element.currentTime < HOLD_WINDOW_SECONDS) {
    hold(element)
  } else {
    release()
  }

  if (!stems || !playing) {
    stopStems()
  } else if (usingStems) {
    const position = timeline.position + (context.currentTime - timeline.contextTime)
    if (Math.abs(position - element.currentTime) > MAX_DRIFT_SECONDS || !scheduleAhead(stems)) {
      stopStems()
    }
  }
  if (stems && playing && !usingStems && segmentReady) {
    startStems(element, stems)
  }

  if (failed) {
    setStatus('error')
  } else if (usingStems || complete) {
    setStatus('active')
  } else if (useVocalRemoverStore.getState().status !== 'downloading-model') {
    setStatus('preparing')
  }
}

// --- Separation ---

function cancelJob() {
  if (!job) return
  job.abort.abort()
  getWorker().postMessage({ type: 'cancel', id: job.id } satisfies WorkerRequest)
  job = null
}

// Keeps the worker busy with the current track first, then the next ones in the queue
function scheduleSeparation() {
  const upcoming = getUpcomingTrackIds()
  for (const cachedId of tracks.keys()) {
    if (!upcoming.includes(cachedId)) tracks.delete(cachedId)
  }
  const target = upcoming.find((id) => !isComplete(tracks.get(id)) && !failedTrackIds.has(id))
  if (job?.trackId === target) return
  cancelJob()
  if (target) void startSeparation(target)
}

async function startSeparation(trackId: string) {
  cancelJob()
  const abort = new AbortController()
  const id = nextJobId++
  job = { id, trackId, abort }

  try {
    let stems = tracks.get(trackId)
    if (!stems) {
      const data = await jellyfinClient.fetchAudio(trackId, abort.signal)
      // Decode and resample to the model's sample rate
      const mix = await new OfflineAudioContext(2, 1, MDX_SAMPLE_RATE).decodeAudioData(data)
      if (job?.id !== id) return
      stems = { mix, segmentCount: Math.max(1, Math.ceil(mix.length / SEGMENT_LENGTH)), segments: new Map() }
      tracks.set(trackId, stems)
    }
    const { mix } = stems
    if (!mix) return
    // Start from the playhead for the current track (read now, after the download)
    const position = trackId === followedTrackId && followedElement ? followedElement.currentTime : 0
    const left = mix.getChannelData(0).slice()
    const right = mix.getChannelData(Math.min(1, mix.numberOfChannels - 1)).slice()
    getWorker().postMessage(
      {
        type: 'separate',
        id,
        left,
        right,
        startSample: Math.floor(position * MDX_SAMPLE_RATE),
        skip: [...stems.segments.keys()],
      } satisfies WorkerRequest,
      [left.buffer, right.buffer],
    )
  } catch (error) {
    if (job?.id !== id) return
    logger.error('[VocalRemover] Failed to prepare audio:', error)
    job = null
    failedTrackIds.add(trackId)
    sync()
  }
}

function addSegment(stems: TrackStems, index: number, vocalsLeft: Float32Array<ArrayBuffer>, vocalsRight: Float32Array<ArrayBuffer>) {
  const { context } = getAudioGraph()
  const { mix } = stems
  if (!mix) return
  const length = vocalsLeft.length
  const start = index * SEGMENT_LENGTH
  const vocals = context.createBuffer(2, length, MDX_SAMPLE_RATE)
  const instrumental = context.createBuffer(2, length, MDX_SAMPLE_RATE)
  const vocalChannels = [vocalsLeft, vocalsRight]
  for (let channel = 0; channel < 2; channel++) {
    const mixChannel = mix.getChannelData(Math.min(channel, mix.numberOfChannels - 1))
    const vocalChannel = vocalChannels[channel]
    const instrumentalChannel = new Float32Array(length)
    for (let i = 0; i < length; i++) instrumentalChannel[i] = mixChannel[start + i] - vocalChannel[i]
    vocals.copyToChannel(vocalChannel, channel)
    instrumental.copyToChannel(instrumentalChannel, channel)
  }
  stems.segments.set(index, { vocals, instrumental })
  if (isComplete(stems)) stems.mix = null
}

function handleWorkerMessage(message: WorkerResponse) {
  if (!job || message.id !== job.id) return
  const { trackId } = job

  switch (message.type) {
    case 'model-progress':
      setStatus('downloading-model', message.fraction)
      return
    case 'segment': {
      const stems = tracks.get(trackId)
      if (stems) addSegment(stems, message.index, message.vocalsLeft, message.vocalsRight)
      if (useVocalRemoverStore.getState().status === 'downloading-model') setStatus('preparing')
      if (trackId === followedTrackId) sync()
      return
    }
    case 'done':
      job = null
      sync()
      return
    case 'error':
      logger.error('[VocalRemover] Separation failed:', message.message)
      job = null
      failedTrackIds.add(trackId)
      sync()
  }
}

export const useVocalRemoverStore = create<VocalRemoverState>((set) => ({
  level: 1,
  status: 'idle',
  progress: 0,

  setLevel: (level) => {
    set({ level: Math.max(0, Math.min(1, level)) })
    // Called from a user gesture, so the audio context is allowed to start
    void getAudioGraph().context.resume()
    if (!syncTimer) syncTimer = setInterval(sync, SYNC_INTERVAL_MS)
    sync()
  },

  reset: () => {
    if (syncTimer) {
      clearInterval(syncTimer)
      syncTimer = null
    }
    cancelJob()
    unfollow()
    failedTrackIds.clear()
    set({ level: 1, status: 'idle', progress: 0 })
  },
}))

// React to track changes straight away (e.g. hold a new track before it plays with vocals)
usePlayerStore.subscribe((state, prev) => {
  if (!syncTimer) return
  if (state.audioElement !== prev.audioElement || state.currentIndex !== prev.currentIndex || state.songs !== prev.songs) {
    sync()
  }
})
