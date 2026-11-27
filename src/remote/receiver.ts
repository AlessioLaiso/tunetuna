import { jellyfinClient } from '../api/jellyfin'
import type { BaseItemDto, LightweightSong } from '../api/types'
import type { PlaybackReport, SessionInfo } from '../api/sessionTypes'
import { TICKS_PER_SECOND } from '../api/sessionTypes'
import { onSocketMessage, onSocketOpen, sendSocketMessage } from '../api/socketBus'
import { usePlayerStore, runLocally } from '../stores/playerStore'
import type { QueueSong } from '../stores/playerStore'
import { useMusicStore } from '../stores/musicStore'
import { useSettingsStore } from '../stores/settingsStore'
import { logger } from '../utils/logger'
import {
  decodeRemoteMessage,
  encodeRemoteMessage,
  MAX_PLAY_IDS,
  QUEUE_WINDOW_AFTER,
  QUEUE_WINDOW_BEFORE,
} from './protocol'
import type { HandoffStateMessage, RemoteCommand, RemoteStateMessage, RepeatMode } from './protocol'
import { handleHandoffState, handleRemoteState, handleSessions, refreshSessions, resetRemote, useRemoteStore } from './remoteStore'

/**
 * Makes this device visible to and controllable by the user's other Tunetuna
 * devices, and lets it control them:
 * - declares remote-control support and subscribes to the session list
 * - reports what's playing (progress reports only: a "playback start" report
 *   would bump the server's play count on every song, on top of the count
 *   Tunetuna already records after a minute of listening)
 * - runs incoming commands and pushes its playback state to controllers
 */
export function startRemotePlayback(): () => void {
  const cleanups: (() => void)[] = []

  cleanups.push(onSocketOpen(() => {
    // Capabilities live on the server session, which can be recreated; send on every connect
    jellyfinClient.postCapabilities(SUPPORTED_COMMANDS).catch(error => {
      logger.warn('[remote] Failed to post capabilities', error)
    })
    // Initial push now, then every 5s and on session start/stop
    sendSocketMessage({ MessageType: 'SessionsStart', Data: '0,5000' })
    // Controllers and the server may have missed changes while disconnected
    scheduleReport(0)
    scheduleStatePush(0)
  }))

  cleanups.push(onSocketMessage((message) => {
    try {
      switch (message.MessageType) {
        case 'Sessions':
          if (Array.isArray(message.Data)) handleSessions(message.Data as SessionInfo[])
          break
        case 'Playstate':
          handlePlaystate(message.Data as { Command?: string; SeekPositionTicks?: number })
          break
        case 'Play':
          void handlePlay(message.Data as { ItemIds?: string[]; StartIndex?: number; PlayCommand?: string })
          break
        case 'GeneralCommand':
          handleGeneralCommand(message.Data as { Name?: string; Arguments?: Record<string, string> })
          break
      }
    } catch (error) {
      logger.warn('[remote] Failed to handle message', message.MessageType, error)
    }
  }))

  cleanups.push(startPlaybackWatcher())

  // Backs up the socket push, which only comes when some session is active
  const sessionPoll = setInterval(() => void refreshSessions(), SESSION_POLL_MS)
  const handleVisible = () => {
    if (document.visibilityState === 'visible') void refreshSessions()
  }
  document.addEventListener('visibilitychange', handleVisible)
  cleanups.push(() => {
    clearInterval(sessionPoll)
    document.removeEventListener('visibilitychange', handleVisible)
  })

  return () => {
    cleanups.forEach(c => c())
    sendSocketMessage({ MessageType: 'SessionsStop' })
    // No stop report here: this runs on logout, when the token may already be
    // gone (a 401 would look like an expired session); the server ends the
    // session's playback itself
    reportedItemId = null
    subscribers.clear()
    resetRemote()
  }
}

const SESSION_POLL_MS = 30_000
const SUPPORTED_COMMANDS = ['SendString', 'SetShuffleQueue', 'SetRepeatMode', 'SetVolume', 'PlayState', 'Play']

// ============================================================================
// Incoming commands
// ============================================================================

function handlePlaystate(data: { Command?: string; SeekPositionTicks?: number } | undefined) {
  const player = usePlayerStore.getState()
  runLocally(() => {
    switch (data?.Command) {
      case 'PlayPause':
        if (player.isPlaying) player.pauseWithFade()
        else startOrResume()
        break
      case 'Pause':
      case 'Stop':
        if (player.isPlaying) player.pauseWithFade()
        break
      case 'Unpause':
        if (!player.isPlaying) startOrResume()
        break
      case 'NextTrack':
        player.next()
        break
      case 'PreviousTrack':
        player.previous()
        break
      case 'Seek':
        if (typeof data.SeekPositionTicks === 'number') player.seek(data.SeekPositionTicks / TICKS_PER_SECOND)
        break
    }
  })
}

/** Play from wherever the queue is, like the play button does. */
function startOrResume() {
  const player = usePlayerStore.getState()
  if (player.currentIndex >= 0) player.play()
  else if (player.songs.length > 0) player.skipToTrack(0)
  else if (player.lastPlayedTrack) player.playTrack(player.lastPlayedTrack)
}

/** Jellyfin's standard Play message (also sent by Jellyfin's web client). */
async function handlePlay(data: { ItemIds?: string[]; StartIndex?: number; PlayCommand?: string } | undefined) {
  const tracks = await resolveTracks(data?.ItemIds ?? [])
  if (tracks.length === 0) return
  runLocally(() => {
    const player = usePlayerStore.getState()
    if (data?.PlayCommand === 'PlayNext') player.addToQueue(tracks as BaseItemDto[], true)
    else if (data?.PlayCommand === 'PlayLast') player.addToQueue(tracks as BaseItemDto[], false)
    else player.playAlbum(tracks, Math.min(Math.max(data?.StartIndex ?? 0, 0), tracks.length - 1))
  })
}

function handleGeneralCommand(data: { Name?: string; Arguments?: Record<string, string> } | undefined) {
  const args = data?.Arguments ?? {}
  const player = usePlayerStore.getState()
  switch (data?.Name) {
    case 'SendString': {
      const message = decodeRemoteMessage(args.String)
      if (!message) return
      if (message.op === 'state') handleRemoteState(message)
      else if (message.op === 'handoffState') void handleHandoffState(message)
      else void handleRemoteCommand(message)
      return
    }
    case 'SetShuffleQueue': {
      const wantShuffle = args.ShuffleMode === 'Shuffle'
      if (wantShuffle !== player.shuffle) runLocally(() => player.toggleShuffle())
      return
    }
    case 'SetRepeatMode': {
      const want: RepeatMode = args.RepeatMode === 'RepeatAll' ? 'all' : args.RepeatMode === 'RepeatOne' ? 'one' : 'off'
      // toggleRepeat cycles off → all → one
      for (let i = 0; i < 3 && usePlayerStore.getState().repeat !== want; i++) {
        usePlayerStore.getState().toggleRepeat()
      }
      return
    }
    case 'SetVolume': {
      const volume = Number(args.Volume)
      if (Number.isFinite(volume)) player.setVolume(Math.min(Math.max(volume / 100, 0), 1))
      return
    }
  }
}

async function handleRemoteCommand(command: RemoteCommand) {
  const player = () => usePlayerStore.getState()
  switch (command.op) {
    case 'subscribe':
      if (command.replyTo) {
        subscribers.set(command.replyTo, Date.now() + SUBSCRIBER_TTL_MS)
        scheduleStatePush(0)
      }
      return
    case 'unsubscribe':
      subscribers.delete(command.replyTo)
      return
    case 'handoff':
      if (command.replyTo) await handOff(command.replyTo)
      return
    case 'playTrack': {
      const tracks = await resolveTracks(command.ids)
      const track = tracks.find(t => t.Id === command.ids[command.index]) ?? tracks[0]
      if (track) runLocally(() => player().playTrack(track, tracks, { shuffle: command.shuffle }))
      return
    }
    case 'playAlbum': {
      const tracks = await resolveTracks(command.ids)
      const startId = command.ids[command.index]
      const start = Math.max(0, tracks.findIndex(t => t.Id === startId))
      if (tracks.length) runLocally(() => player().playAlbum(tracks, start))
      return
    }
    case 'shuffleArtist': {
      const tracks = await resolveTracks(command.ids)
      if (tracks.length) runLocally(() => player().shuffleArtist(tracks as BaseItemDto[]))
      return
    }
    case 'shuffleAll': {
      const prepend = await resolveTracks(command.prependIds)
      runLocally(() => player().shuffleAllSongs(prepend.length ? prepend : undefined))
      return
    }
    case 'shuffleGenre':
      runLocally(() => player().shuffleGenreSongs(command.genreId, command.genreName))
      return
    case 'addToQueue': {
      const tracks = await resolveTracks(command.ids)
      if (tracks.length) runLocally(() => player().addToQueue(tracks as BaseItemDto[], command.playNext))
      return
    }
    case 'skipTo': {
      const index = findIndex(command.index, command.id)
      if (index >= 0) runLocally(() => player().skipToTrack(index))
      return
    }
    case 'remove': {
      const index = findIndex(command.index, command.id)
      if (index >= 0) player().removeFromQueue(index)
      return
    }
    case 'reorder': {
      const from = findIndex(command.from, command.id)
      const songs = player().songs
      if (from >= 0 && command.to >= 0 && command.to < songs.length) player().reorderQueue(from, command.to)
      return
    }
    case 'clearUpcoming':
      player().clearUpcoming()
      return
    case 'setRecommendations':
      player().setQueueRecommendations(command.enabled)
      return
  }
}

/** Pauses here and sends the queue to the device that continues playback. */
async function handOff(replyTo: string) {
  logger.debug('[remote] Handoff requested by', replyTo)
  const from = await ensureSelfSessionId()
  if (!from) {
    logger.warn('[remote] Handoff: own session Id unknown, cannot reply')
    return
  }
  const player = usePlayerStore.getState()
  // Read the position before the pause fade moves it
  const message = buildHandoffState(from)
  if (player.isPlaying) runLocally(() => player.pauseWithFade())
  try {
    await jellyfinClient.sendGeneralCommand(replyTo, 'SendString', { String: encodeRemoteMessage(message) })
  } catch (error) {
    logger.warn('[remote] Handoff reply failed', error)
  }
}

function buildHandoffState(from: string): HandoffStateMessage {
  const player = usePlayerStore.getState()
  let songs = player.songs
  let currentIndex = player.currentIndex
  const capped = songs.length > MAX_PLAY_IDS
  if (capped) {
    const start = Math.max(0, Math.min(currentIndex - Math.floor(MAX_PLAY_IDS / 4), songs.length - MAX_PLAY_IDS))
    songs = songs.slice(start, start + MAX_PLAY_IDS)
    currentIndex = currentIndex >= 0 ? currentIndex - start : -1
  }
  return {
    op: 'handoffState',
    from,
    items: songs.map(s => s.Id),
    sources: songs.map(s => (s.source === 'recommendation' ? 'r' : 'u')).join(''),
    currentIndex,
    position: player.currentTime,
    shuffle: player.shuffle,
    repeat: player.repeat,
    ...(player.shuffle && !capped ? { standardOrder: player.standardOrder } : {}),
  }
}

/** The queue index of `id`, preferring `index`, then the closest match if the queue moved. */
function findIndex(index: number, id: string): number {
  const songs = usePlayerStore.getState().songs
  if (songs[index]?.Id === id) return index
  let best = -1
  songs.forEach((s, i) => {
    if (s.Id === id && (best === -1 || Math.abs(i - index) < Math.abs(best - index))) best = i
  })
  return best
}

/** Songs for these Ids, in order: from the library cache, fetching the rest. */
async function resolveTracks(ids: string[]): Promise<(BaseItemDto | LightweightSong)[]> {
  const byId = new Map<string, BaseItemDto | LightweightSong>(useMusicStore.getState().songs.map(s => [s.Id, s]))
  const missing = [...new Set(ids.filter(id => !byId.has(id)))]
  if (missing.length) {
    try {
      const fetched = await jellyfinClient.getItemsByIds(missing)
      fetched.forEach(item => byId.set(item.Id, item))
    } catch (error) {
      logger.warn('[remote] Failed to fetch songs for remote command', error)
    }
  }
  return ids.map(id => byId.get(id)).filter((t): t is BaseItemDto | LightweightSong => t !== undefined)
}

// ============================================================================
// Outgoing: progress reports to the server, state pushes to controllers
// ============================================================================

/** Controllers that asked for state pushes, with when their subscription lapses. */
const subscribers = new Map<string, number>()
const SUBSCRIBER_TTL_MS = 90_000
const STATE_HEARTBEAT_MS = 15_000
const REPORT_INTERVAL_MS = 30_000

let reportedItemId: string | null = null
let reportTimeout: ReturnType<typeof setTimeout> | null = null
let pushTimeout: ReturnType<typeof setTimeout> | null = null

function currentSong(): QueueSong | null {
  const { songs, currentIndex } = usePlayerStore.getState()
  return currentIndex >= 0 ? songs[currentIndex] ?? null : null
}

function toJellyfinRepeat(repeat: RepeatMode): PlaybackReport['RepeatMode'] {
  return repeat === 'all' ? 'RepeatAll' : repeat === 'one' ? 'RepeatOne' : 'RepeatNone'
}

function scheduleReport(delayMs: number) {
  if (reportTimeout) clearTimeout(reportTimeout)
  reportTimeout = setTimeout(() => {
    reportTimeout = null
    void report()
  }, delayMs)
}

async function report() {
  if (!jellyfinClient.currentUserId) return
  const song = currentSong()
  const player = usePlayerStore.getState()
  try {
    if (!song) {
      if (reportedItemId) {
        const stopped = reportedItemId
        reportedItemId = null
        await jellyfinClient.reportPlaybackStopped({ ItemId: stopped, PositionTicks: Math.round(player.currentTime * TICKS_PER_SECOND) })
      }
      return
    }
    reportedItemId = song.Id
    await jellyfinClient.reportPlaybackProgress({
      ItemId: song.Id,
      PositionTicks: Math.round(player.currentTime * TICKS_PER_SECOND),
      IsPaused: !player.isPlaying,
      IsMuted: false,
      VolumeLevel: Math.round(player.volume * 100),
      CanSeek: true,
      PlayMethod: 'DirectPlay',
      RepeatMode: toJellyfinRepeat(player.repeat),
      PlaybackOrder: player.shuffle ? 'Shuffle' : 'Default',
      // Not stored by the server on progress reports, but shown by some clients
      NowPlayingQueue: [],
    })
  } catch (error) {
    logger.debug('[remote] Progress report failed', error)
  }
}

function scheduleStatePush(delayMs: number) {
  if (subscribers.size === 0) return
  if (pushTimeout) clearTimeout(pushTimeout)
  pushTimeout = setTimeout(() => {
    pushTimeout = null
    void pushState()
  }, delayMs)
}

function buildState(from: string): RemoteStateMessage {
  const player = usePlayerStore.getState()
  const center = Math.max(player.currentIndex, 0)
  const offset = Math.max(0, center - QUEUE_WINDOW_BEFORE)
  const window = player.songs.slice(offset, center + QUEUE_WINDOW_AFTER + 1)
  return {
    op: 'state',
    from,
    offset,
    total: player.songs.length,
    items: window.map(s => s.Id),
    sources: window.map(s => (s.source === 'recommendation' ? 'r' : 'u')).join(''),
    currentIndex: player.currentIndex,
    isPlaying: player.isPlaying,
    position: player.currentTime,
    duration: player.duration,
    shuffle: player.shuffle,
    repeat: player.repeat,
    showRecommendations: useSettingsStore.getState().showQueueRecommendations,
  }
}

async function pushState() {
  const now = Date.now()
  for (const [id, expires] of subscribers) {
    if (expires < now) subscribers.delete(id)
  }
  if (subscribers.size === 0) return

  const from = await ensureSelfSessionId()
  if (!from) return
  const text = encodeRemoteMessage(buildState(from))
  await Promise.all([...subscribers.keys()].map(async (sessionId) => {
    try {
      await jellyfinClient.sendGeneralCommand(sessionId, 'SendString', { String: text })
    } catch (error) {
      // The controller's session is gone
      logger.debug('[remote] State push failed, dropping controller', sessionId, error)
      subscribers.delete(sessionId)
    }
  }))
}

async function ensureSelfSessionId(): Promise<string | null> {
  const known = useRemoteStore.getState().selfSessionId
  if (known) return known
  try {
    const sessions = await jellyfinClient.getControllableSessions()
    handleSessions(sessions)
  } catch (error) {
    logger.debug('[remote] Session lookup failed', error)
  }
  return useRemoteStore.getState().selfSessionId
}

/** Reports and pushes whenever playback changes, plus periodic check-ins. */
function startPlaybackWatcher(): () => void {
  let last = snapshot()

  const unsubscribe = usePlayerStore.subscribe(() => {
    const next = snapshot()
    const trackChanged = next.trackId !== last.trackId
    const stateChanged = trackChanged ||
      next.isPlaying !== last.isPlaying ||
      next.shuffle !== last.shuffle ||
      next.repeat !== last.repeat ||
      next.songs !== last.songs ||
      next.duration !== last.duration
    last = next
    if (!stateChanged) return
    scheduleReport(trackChanged ? 300 : 500)
    scheduleStatePush(150)
  })

  const unsubscribeSettings = useSettingsStore.subscribe((state, prev) => {
    if (state.showQueueRecommendations !== prev.showQueueRecommendations) scheduleStatePush(150)
  })

  const handleSeek = () => {
    scheduleReport(500)
    scheduleStatePush(150)
  }
  window.addEventListener('playerSeek', handleSeek)

  // Keeps the server from ending an idle-looking session (5 min without a report)
  // and the shown position from drifting on the server
  const reportInterval = setInterval(() => {
    if (currentSong()) void report()
  }, REPORT_INTERVAL_MS)

  // Corrects controllers' interpolated position
  const heartbeat = setInterval(() => {
    if (usePlayerStore.getState().isPlaying) scheduleStatePush(0)
  }, STATE_HEARTBEAT_MS)

  return () => {
    unsubscribe()
    unsubscribeSettings()
    window.removeEventListener('playerSeek', handleSeek)
    clearInterval(reportInterval)
    clearInterval(heartbeat)
    if (reportTimeout) clearTimeout(reportTimeout)
    if (pushTimeout) clearTimeout(pushTimeout)
  }
}

function snapshot() {
  const s = usePlayerStore.getState()
  return {
    trackId: s.currentIndex >= 0 ? s.songs[s.currentIndex]?.Id ?? null : null,
    isPlaying: s.isPlaying,
    shuffle: s.shuffle,
    repeat: s.repeat,
    songs: s.songs,
    duration: s.duration,
  }
}
