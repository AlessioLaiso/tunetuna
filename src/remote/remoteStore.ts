import { create } from 'zustand'
import type { BaseItemDto, LightweightSong } from '../api/types'
import type { SessionInfo } from '../api/sessionTypes'
import { TICKS_PER_SECOND } from '../api/sessionTypes'
import { jellyfinClient } from '../api/jellyfin'
import { useMusicStore } from '../stores/musicStore'
import { useToastStore } from '../stores/toastStore'
import { setRemotePlaybackDelegate } from '../stores/playerStore'
import type { QueueSong } from '../stores/playerStore'
import { APP_CLIENT_NAME } from '../utils/constants'
import { getDeviceName } from '../utils/deviceName'
import { logger } from '../utils/logger'
import { encodeRemoteMessage, MAX_PLAY_IDS } from './protocol'
import type { RemoteCommand, RemoteStateMessage, RepeatMode } from './protocol'

export type DeviceKind = 'phone' | 'tablet' | 'computer'

export interface RemoteDevice {
  sessionId: string
  deviceId: string
  /** Display name, numbered when several devices share one ("iPhone 2") */
  name: string
  kind: DeviceKind
  nowPlaying: { title: string; artist: string } | null
  isPaused: boolean
  /** From the server's session info: shown right away while the device's own state is on its way */
  session: {
    item: BaseItemDto | null
    position: number
    shuffle: boolean
    repeat: RepeatMode
  }
}

/** What the controlled device is playing, as last pushed by it. */
export interface RemotePlayback {
  /** The pushed window of the queue; indices below are relative to it */
  songs: QueueSong[]
  /** Absolute queue index of songs[0] */
  offset: number
  total: number
  currentIndex: number
  isPlaying: boolean
  /** Position when the state arrived; add elapsed time while playing */
  position: number
  positionAt: number
  duration: number
  shuffle: boolean
  repeat: RepeatMode
  showRecommendations: boolean
}

interface RemoteState {
  selfSessionId: string | null
  selfName: string
  selfKind: DeviceKind
  /** Other Tunetuna devices of this user that can be controlled */
  devices: RemoteDevice[]
  /** The device being controlled; null = this device */
  targetSessionId: string | null
  remote: RemotePlayback | null
  selectDevice: (sessionId: string | null) => void
}

/** How long a controlled device may be missing from the session list before control falls back here. */
const TARGET_GRACE_MS = 15_000
/** The controlled device forgets controllers that don't renew within 90s. */
const RESUBSCRIBE_MS = 30_000

export function deviceKind(name: string): DeviceKind {
  if (/^(iPhone|Android phone)/.test(name)) return 'phone'
  if (/^(iPad|Android tablet)/.test(name)) return 'tablet'
  return 'computer'
}

let resubscribeInterval: ReturnType<typeof setInterval> | null = null
let targetMissingSince: number | null = null
let pendingState: RemoteStateMessage | null = null
const fetchedTracks = new Map<string, BaseItemDto>()
const fetchingIds = new Set<string>()

export const useRemoteStore = create<RemoteState>()((set, get) => ({
  selfSessionId: null,
  selfName: getDeviceName(),
  selfKind: deviceKind(getDeviceName()),
  devices: [],
  targetSessionId: null,
  remote: null,

  selectDevice: (sessionId) => {
    const previous = get().targetSessionId
    if (previous === sessionId) return

    if (previous) void sendToTarget(previous, { op: 'unsubscribe', replyTo: get().selfSessionId ?? '' })
    if (resubscribeInterval) clearInterval(resubscribeInterval)
    resubscribeInterval = null
    targetMissingSince = null
    pendingState = null

    set({ targetSessionId: sessionId, remote: sessionId ? seedFromSession(sessionId) : null })
    setRemotePlaybackDelegate(sessionId ? remoteDelegate : null)
    if (!sessionId) return

    const subscribe = () => {
      const selfSessionId = get().selfSessionId
      if (selfSessionId) void sendToTarget(sessionId, { op: 'subscribe', replyTo: selfSessionId })
    }
    subscribe()
    resubscribeInterval = setInterval(subscribe, RESUBSCRIBE_MS)
  },
}))

/**
 * What the session list says the device plays, so the player shows it at once.
 * The device's own state message (full queue, exact position) replaces it
 * within a moment; queue commands carry song Ids, so the one-song queue here
 * can't make them hit the wrong song.
 */
function seedFromSession(sessionId: string): RemotePlayback | null {
  const device = useRemoteStore.getState().devices.find(d => d.sessionId === sessionId)
  const item = device?.session.item
  if (!device || !item) return null
  return {
    songs: [{ ...item, source: 'user' }],
    offset: 0,
    total: 1,
    currentIndex: 0,
    isPlaying: !device.isPaused,
    position: device.session.position,
    positionAt: Date.now(),
    duration: (item.RunTimeTicks ?? 0) / TICKS_PER_SECOND,
    shuffle: device.session.shuffle,
    repeat: device.session.repeat,
    showRecommendations: false,
  }
}

// ============================================================================
// Incoming data
// ============================================================================

/** Handles the session list Jellyfin pushes after SessionsStart. */
export function handleSessions(sessions: SessionInfo[]) {
  const myDeviceId = jellyfinClient.deviceId
  const myUserId = jellyfinClient.currentUserId
  const ours = sessions.filter(s => s.Client === APP_CLIENT_NAME && s.UserId?.replace(/-/g, '') === myUserId.replace(/-/g, ''))

  const self = ours.find(s => s.DeviceId === myDeviceId)
  const others = ours.filter(s => s.DeviceId !== myDeviceId && s.SupportsRemoteControl)

  // Number devices that share a name, in a stable order every device agrees on
  const all = [...(self ? [self] : []), ...others]
  const displayNames = new Map<string, string>()
  const byName = new Map<string, SessionInfo[]>()
  for (const s of all) {
    const name = s.DeviceName || 'Web'
    byName.set(name, [...(byName.get(name) ?? []), s])
  }
  for (const [name, group] of byName) {
    group
      .sort((a, b) => (a.DeviceId ?? '').localeCompare(b.DeviceId ?? ''))
      .forEach((s, i) => displayNames.set(s.Id, i === 0 ? name : `${name} ${i + 1}`))
  }

  const devices: RemoteDevice[] = others.map(s => {
    const item = s.NowPlayingItem
    const baseName = s.DeviceName || 'Web'
    return {
      sessionId: s.Id,
      deviceId: s.DeviceId ?? '',
      name: displayNames.get(s.Id) ?? baseName,
      kind: deviceKind(baseName),
      nowPlaying: item?.Name
        ? { title: item.Name, artist: item.ArtistItems?.[0]?.Name || item.AlbumArtist || '' }
        : null,
      isPaused: s.PlayState?.IsPaused ?? true,
      session: {
        item: item ?? null,
        position: (s.PlayState?.PositionTicks ?? 0) / TICKS_PER_SECOND,
        shuffle: s.PlayState?.PlaybackOrder === 'Shuffle',
        repeat: s.PlayState?.RepeatMode === 'RepeatAll' ? 'all' : s.PlayState?.RepeatMode === 'RepeatOne' ? 'one' : 'off',
      },
    }
  })

  const state = useRemoteStore.getState()
  const selfSessionId = self?.Id ?? state.selfSessionId
  const becameKnown = !state.selfSessionId && selfSessionId
  useRemoteStore.setState({
    devices,
    selfSessionId,
    selfName: self ? displayNames.get(self.Id) ?? getDeviceName() : state.selfName,
  })

  // Subscribing needs our own session Id, which may only arrive now
  if (becameKnown && state.targetSessionId) {
    void sendToTarget(state.targetSessionId, { op: 'subscribe', replyTo: selfSessionId })
  }

  const target = state.targetSessionId
  if (!target) return
  if (devices.some(d => d.sessionId === target)) {
    targetMissingSince = null
  } else if (targetMissingSince === null) {
    targetMissingSince = Date.now()
  } else if (Date.now() - targetMissingSince > TARGET_GRACE_MS) {
    useRemoteStore.getState().selectDevice(null)
    useToastStore.getState().addToast('The other device went offline. Back to this device.', 'info', 4000)
  }
}

/**
 * Fetches the session list. The socket push only comes when some session is
 * active, so a device that disconnects while everything is idle would
 * otherwise stay listed.
 */
export async function refreshSessions() {
  try {
    handleSessions(await jellyfinClient.getControllableSessions())
  } catch (error) {
    logger.debug('[remote] Session refresh failed', error)
  }
}

/** Handles a state push from the controlled device. */
export function handleRemoteState(message: RemoteStateMessage) {
  if (message.from !== useRemoteStore.getState().targetSessionId) return
  pendingState = message
  applyState(message)

  const missing = message.items.filter(id => !lookupTrack(id) && !fetchingIds.has(id))
  if (missing.length === 0) return
  missing.forEach(id => fetchingIds.add(id))
  jellyfinClient.getItemsByIds(missing)
    .then(items => items.forEach(item => fetchedTracks.set(item.Id, item)))
    .catch(error => logger.warn('[remote] Failed to fetch queue songs', error))
    .finally(() => {
      missing.forEach(id => fetchingIds.delete(id))
      // Re-apply the latest state now that more songs are known
      if (pendingState) applyState(pendingState)
    })
}

function lookupTrack(id: string): BaseItemDto | LightweightSong | undefined {
  return fetchedTracks.get(id) ?? songIndex().get(id)
}

let songIndexCache: { source: LightweightSong[]; map: Map<string, LightweightSong> } | null = null
function songIndex(): Map<string, LightweightSong> {
  const songs = useMusicStore.getState().songs
  if (songIndexCache?.source !== songs) {
    songIndexCache = { source: songs, map: new Map(songs.map(s => [s.Id, s])) }
  }
  return songIndexCache.map
}

function applyState(message: RemoteStateMessage) {
  const songs: QueueSong[] = message.items.map((id, i) => {
    const track = lookupTrack(id)
    return {
      ...(track ?? { Id: id, Name: '' }),
      source: message.sources[i] === 'r' ? 'recommendation' : 'user',
    } as QueueSong
  })
  useRemoteStore.setState({
    remote: {
      songs,
      offset: message.offset,
      total: message.total,
      currentIndex: message.currentIndex >= 0 ? message.currentIndex - message.offset : -1,
      isPlaying: message.isPlaying,
      position: message.position,
      positionAt: Date.now(),
      duration: message.duration,
      shuffle: message.shuffle,
      repeat: message.repeat,
      showRecommendations: message.showRecommendations,
    },
  })
}

// ============================================================================
// Outgoing commands
// ============================================================================

async function sendToTarget(sessionId: string, command: RemoteCommand): Promise<void> {
  try {
    await jellyfinClient.sendGeneralCommand(sessionId, 'SendString', { String: encodeRemoteMessage(command) })
  } catch (error) {
    logger.warn('[remote] Command failed', command.op, error)
    if (command.op !== 'unsubscribe' && command.op !== 'subscribe') {
      useToastStore.getState().addToast(`Couldn't reach ${targetName()}`, 'error', 3000)
    }
  }
}

function targetName(): string {
  const { devices, targetSessionId } = useRemoteStore.getState()
  return devices.find(d => d.sessionId === targetSessionId)?.name ?? 'the other device'
}

function sendCommand(command: RemoteCommand) {
  const target = useRemoteStore.getState().targetSessionId
  if (target) void sendToTarget(target, command)
}

async function sendPlaystate(command: string, seekTicks?: number) {
  const target = useRemoteStore.getState().targetSessionId
  if (!target) return
  try {
    await jellyfinClient.sendPlaystateCommand(target, command, seekTicks)
  } catch (error) {
    logger.warn('[remote] Playstate failed', command, error)
    useToastStore.getState().addToast(`Couldn't reach ${targetName()}`, 'error', 3000)
  }
}

async function sendGeneral(name: string, args: Record<string, string>) {
  const target = useRemoteStore.getState().targetSessionId
  if (!target) return
  try {
    await jellyfinClient.sendGeneralCommand(target, name, args)
  } catch (error) {
    logger.warn('[remote] Command failed', name, error)
    useToastStore.getState().addToast(`Couldn't reach ${targetName()}`, 'error', 3000)
  }
}

/** Updates the shown remote state right away, before the device confirms. */
function optimistic(patch: Partial<RemotePlayback>) {
  const remote = useRemoteStore.getState().remote
  if (remote) useRemoteStore.setState({ remote: { ...remote, ...patch } })
}

export function remotePosition(remote: RemotePlayback, now = Date.now()): number {
  const elapsed = remote.isPlaying ? (now - remote.positionAt) / 1000 : 0
  const position = remote.position + elapsed
  return remote.duration > 0 ? Math.min(position, remote.duration) : position
}

/** Transport and queue controls for the controlled device. Indices are relative to the pushed window. */
export const remoteControls = {
  play() {
    const remote = useRemoteStore.getState().remote
    if (remote) optimistic({ isPlaying: true, position: remotePosition(remote), positionAt: Date.now() })
    void sendPlaystate('Unpause')
  },
  pause() {
    const remote = useRemoteStore.getState().remote
    if (remote) optimistic({ isPlaying: false, position: remotePosition(remote), positionAt: Date.now() })
    void sendPlaystate('Pause')
  },
  togglePlayPause() {
    const remote = useRemoteStore.getState().remote
    if (remote) optimistic({ isPlaying: !remote.isPlaying, position: remotePosition(remote), positionAt: Date.now() })
    void sendPlaystate('PlayPause')
  },
  next() {
    void sendPlaystate('NextTrack')
  },
  previous() {
    void sendPlaystate('PreviousTrack')
  },
  seek(seconds: number) {
    optimistic({ position: seconds, positionAt: Date.now() })
    void sendPlaystate('Seek', seconds * TICKS_PER_SECOND)
  },
  toggleShuffle() {
    const remote = useRemoteStore.getState().remote
    if (!remote) return
    optimistic({ shuffle: !remote.shuffle })
    void sendGeneral('SetShuffleQueue', { ShuffleMode: remote.shuffle ? 'Sorted' : 'Shuffle' })
  },
  toggleRepeat() {
    const remote = useRemoteStore.getState().remote
    if (!remote) return
    const repeat: RepeatMode = remote.repeat === 'off' ? 'all' : remote.repeat === 'all' ? 'one' : 'off'
    optimistic({ repeat })
    const mode = repeat === 'off' ? 'RepeatNone' : repeat === 'all' ? 'RepeatAll' : 'RepeatOne'
    void sendGeneral('SetRepeatMode', { RepeatMode: mode })
  },
  skipToTrack(index: number) {
    const remote = useRemoteStore.getState().remote
    const song = remote?.songs[index]
    if (!remote || !song) return
    optimistic({ currentIndex: index, position: 0, positionAt: Date.now(), isPlaying: true })
    sendCommand({ op: 'skipTo', index: remote.offset + index, id: song.Id })
  },
  removeFromQueue(index: number) {
    const remote = useRemoteStore.getState().remote
    const song = remote?.songs[index]
    if (!remote || !song) return
    optimistic({
      songs: remote.songs.filter((_, i) => i !== index),
      currentIndex: index < remote.currentIndex ? remote.currentIndex - 1 : remote.currentIndex,
      total: remote.total - 1,
    })
    sendCommand({ op: 'remove', index: remote.offset + index, id: song.Id })
  },
  reorderQueue(from: number, to: number) {
    const remote = useRemoteStore.getState().remote
    const song = remote?.songs[from]
    if (!remote || !song) return
    sendCommand({ op: 'reorder', from: remote.offset + from, to: remote.offset + to, id: song.Id })
  },
  clearUpcoming() {
    sendCommand({ op: 'clearUpcoming' })
  },
  setRecommendations(enabled: boolean) {
    optimistic({ showRecommendations: enabled })
    sendCommand({ op: 'setRecommendations', enabled })
  },
}

/** Caps a play list around the starting song so the message stays small. */
function capIds(ids: string[], index: number): { ids: string[]; index: number } {
  if (ids.length <= MAX_PLAY_IDS) return { ids, index }
  const start = Math.max(0, Math.min(index - Math.floor(MAX_PLAY_IDS / 4), ids.length - MAX_PLAY_IDS))
  return { ids: ids.slice(start, start + MAX_PLAY_IDS), index: index - start }
}

/** Library actions while controlling another device: sent there instead of playing here. */
const remoteDelegate = {
  playTrack(track: BaseItemDto | LightweightSong, queue?: (BaseItemDto | LightweightSong)[], options?: { shuffle?: boolean }) {
    const list = queue?.length ? queue : [track]
    const found = list.findIndex(t => t.Id === track.Id)
    const ids = found === -1 ? [track.Id, ...list.map(t => t.Id)] : list.map(t => t.Id)
    const capped = capIds(ids, found === -1 ? 0 : found)
    sendCommand({ op: 'playTrack', ids: capped.ids, index: capped.index, shuffle: options?.shuffle === true })
  },
  playAlbum(tracks: (BaseItemDto | LightweightSong)[], startIndex: number) {
    const capped = capIds(tracks.map(t => t.Id), startIndex)
    sendCommand({ op: 'playAlbum', ids: capped.ids, index: capped.index })
  },
  shuffleArtist(songs: BaseItemDto[]) {
    sendCommand({ op: 'shuffleArtist', ids: songs.slice(0, MAX_PLAY_IDS).map(s => s.Id) })
  },
  shuffleAllSongs(prependTracks?: (BaseItemDto | LightweightSong)[]) {
    sendCommand({ op: 'shuffleAll', prependIds: (prependTracks ?? []).map(t => t.Id) })
  },
  shuffleGenreSongs(genreId: string, genreName: string) {
    sendCommand({ op: 'shuffleGenre', genreId, genreName })
  },
  addToQueue(tracks: BaseItemDto[], playNext: boolean) {
    sendCommand({ op: 'addToQueue', ids: tracks.slice(0, MAX_PLAY_IDS).map(t => t.Id), playNext })
  },
}

/** Forget everything (logout). */
export function resetRemote() {
  useRemoteStore.getState().selectDevice(null)
  useRemoteStore.setState({ devices: [], selfSessionId: null, remote: null })
  fetchedTracks.clear()
}
