/**
 * Messages Tunetuna devices exchange to control each other.
 *
 * Transport (pause, next, seek...) and shuffle/repeat use Jellyfin's standard
 * Playstate and GeneralCommand messages, so Jellyfin's own web client can
 * control Tunetuna too. Everything Jellyfin has no command for (queue edits,
 * Tunetuna's shuffle modes, the queue itself, which the server only stores when
 * playback stops) travels as JSON inside a SendString GeneralCommand, which
 * the server relays to the target's socket unchanged.
 */

export type RepeatMode = 'off' | 'all' | 'one'

/** Pushed by the controlled device to its controllers whenever its playback changes. */
export interface RemoteStateMessage {
  op: 'state'
  /** Session Id of the device sending it */
  from: string
  /** Absolute queue index of items[0]; the queue is sent as a window around the current song. */
  offset: number
  total: number
  items: string[]
  /** One character per item: 'u' user-added, 'r' recommendation */
  sources: string
  /** Absolute index, -1 when nothing is loaded */
  currentIndex: number
  isPlaying: boolean
  position: number
  duration: number
  shuffle: boolean
  repeat: RepeatMode
  /** The target's "Recommendations" queue setting */
  showRecommendations: boolean
}

/**
 * Sent by a device in reply to `handoff`, after pausing: its whole queue
 * (capped around the current song) so the asking device continues from there.
 */
export interface HandoffStateMessage {
  op: 'handoffState'
  from: string
  items: string[]
  /** One character per item: 'u' user-added, 'r' recommendation */
  sources: string
  /** Index into items, -1 when nothing is loaded */
  currentIndex: number
  position: number
  shuffle: boolean
  repeat: RepeatMode
  /** User songs in standard (unshuffled) order, sent while shuffled and the queue wasn't capped */
  standardOrder?: string[]
}

export type RemoteCommand =
  | { op: 'subscribe'; replyTo: string }
  | { op: 'unsubscribe'; replyTo: string }
  /** Pause and send the queue to `replyTo`, which continues playback itself */
  | { op: 'handoff'; replyTo: string }
  | { op: 'playTrack'; ids: string[]; index: number; shuffle: boolean }
  | { op: 'playAlbum'; ids: string[]; index: number }
  | { op: 'shuffleArtist'; ids: string[] }
  | { op: 'shuffleAll'; prependIds: string[] }
  | { op: 'shuffleGenre'; genreId: string; genreName: string }
  | { op: 'addToQueue'; ids: string[]; playNext: boolean }
  /** Index-based ops carry the song Id so a queue that changed meanwhile isn't edited at the wrong spot. */
  | { op: 'skipTo'; index: number; id: string }
  | { op: 'remove'; index: number; id: string }
  | { op: 'reorder'; from: number; to: number; id: string }
  | { op: 'clearUpcoming' }
  | { op: 'setRecommendations'; enabled: boolean }

export type RemoteMessage = RemoteCommand | RemoteStateMessage | HandoffStateMessage

const MARKER = 'tunetuna-remote'

export function encodeRemoteMessage(message: RemoteMessage): string {
  return JSON.stringify({ [MARKER]: 1, ...message })
}

export function decodeRemoteMessage(text: unknown): RemoteMessage | null {
  if (typeof text !== 'string') return null
  try {
    const parsed = JSON.parse(text)
    if (!parsed || parsed[MARKER] !== 1 || typeof parsed.op !== 'string') return null
    return parsed as RemoteMessage
  } catch {
    return null
  }
}

/** How many songs before and after the current one the state message carries. */
export const QUEUE_WINDOW_BEFORE = 50
export const QUEUE_WINDOW_AFTER = 200

/** Upper bound for Ids in one play command, to keep messages small. */
export const MAX_PLAY_IDS = 2000
