/**
 * Shares the one Jellyfin WebSocket (opened by useLibraryChanged) with the
 * rest of the app: remote control listens for commands and session updates
 * on it, and sends subscriptions through it.
 */

export interface SocketMessage {
  MessageType?: string
  Data?: unknown
}

type MessageListener = (message: SocketMessage) => void
type OpenListener = () => void

const messageListeners = new Set<MessageListener>()
const openListeners = new Set<OpenListener>()
let sender: ((message: object) => boolean) | null = null
let open = false

export function onSocketMessage(listener: MessageListener): () => void {
  messageListeners.add(listener)
  return () => messageListeners.delete(listener)
}

/** Runs on every (re)connect, and right away if the socket is already open. */
export function onSocketOpen(listener: OpenListener): () => void {
  openListeners.add(listener)
  if (open) listener()
  return () => openListeners.delete(listener)
}

/** Returns false when no socket is open. */
export function sendSocketMessage(message: object): boolean {
  return sender ? sender(message) : false
}

// --- Called by the socket owner ---

export function setSocketSender(send: ((message: object) => boolean) | null) {
  sender = send
}

export function emitSocketOpen() {
  open = true
  openListeners.forEach(l => l())
}

export function emitSocketClosed() {
  open = false
}

export function emitSocketMessage(message: SocketMessage) {
  messageListeners.forEach(l => l(message))
}
