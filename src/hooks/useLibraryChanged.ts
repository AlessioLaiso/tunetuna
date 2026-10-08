import { useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useSyncStore } from '../stores/syncStore'
import { useMusicStore, whenMusicStoreHydrated } from '../stores/musicStore'
import { jellyfinClient } from '../api/jellyfin'
import { storage } from '../utils/storage'
import { logger } from '../utils/logger'
import { probeAndUpdateServerUrl } from '../utils/serverUrl'

/** Quiet period after a LibraryChanged event before syncing (bulk edits fire many). */
const CHANGE_DEBOUNCE_MS = 5_000
/** Retry delay when a change arrives while another sync is running. */
const BUSY_RETRY_MS = 5_000
/** Jellyfin's default socket timeout, used until the server tells us its own. */
const DEFAULT_KEEPALIVE_TIMEOUT_S = 60
/** Minimum gap between catch-up checks, so focus + reconnect don't double up. */
const CATCH_UP_THROTTLE_MS = 30_000
const RECONNECT_MIN_MS = 5_000
const RECONNECT_MAX_MS = 60_000

/**
 * Keeps the local song cache in step with the server.
 *
 * - Listens on Jellyfin's WebSocket for LibraryChanged events and runs an
 *   incremental sync after a short quiet period. Removed songs are dropped
 *   from the cache straight away.
 * - Answers the server's keep-alive, which Jellyfin requires: a socket that
 *   sends no KeepAlive for 60s is dropped, losing any events in the gap.
 * - Events are missed whenever no socket is open (app closed or backgrounded,
 *   network drop), so on every (re)connect and whenever the app comes back to
 *   the foreground it asks the server whether anything changed since the last
 *   sync, and syncs only if so.
 */
export function useLibraryChanged() {
  const { accessToken, isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return

    let ws: WebSocket | null = null
    let socketBaseUrl: string | null = null
    let disposed = false
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let keepAliveInterval: ReturnType<typeof setInterval> | null = null
    let reconnectDelay = RECONNECT_MIN_MS

    const send = (message: object) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
    }

    const startKeepAlive = (timeoutSeconds: number) => {
      if (keepAliveInterval) clearInterval(keepAliveInterval)
      send({ MessageType: 'KeepAlive' })
      // Same cadence as jellyfin-web: twice per timeout window
      keepAliveInterval = setInterval(() => send({ MessageType: 'KeepAlive' }), (timeoutSeconds * 1000) / 2)
    }

    const stopKeepAlive = () => {
      if (keepAliveInterval) clearInterval(keepAliveInterval)
      keepAliveInterval = null
    }

    const connect = () => {
      if (disposed) return
      // Don't open a second connection
      if (ws && ws.readyState <= WebSocket.OPEN) return

      // Read the address on every connect: the LAN/remote resolver can switch
      // it after login without touching the auth store.
      const baseUrl = jellyfinClient.serverBaseUrl
      if (!baseUrl) {
        scheduleReconnect()
        return
      }

      const deviceId = storage.get<string>('deviceId') || 'unknown'
      const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws'
      const host = baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
      // Newer Jellyfin servers reject the legacy api_key parameter and need
      // ApiKey; servers that predate ApiKey ignore it. Send both.
      const socket = new WebSocket(`${wsProtocol}://${host}/socket?ApiKey=${accessToken}&api_key=${accessToken}&deviceId=${deviceId}`)
      ws = socket
      socketBaseUrl = baseUrl

      socket.onopen = () => {
        logger.log('[useLibraryChanged] WebSocket connected')
        reconnectDelay = RECONNECT_MIN_MS
        // The server sends ForceKeepAlive on connect; start anyway in case it's late
        startKeepAlive(DEFAULT_KEEPALIVE_TIMEOUT_S)
        // Anything that changed while we weren't listening never reaches us as an event
        void catchUp()
      }

      socket.onmessage = (event) => {
        let message: { MessageType?: string; Data?: unknown }
        try {
          message = JSON.parse(event.data)
        } catch {
          return
        }

        if (message.MessageType === 'ForceKeepAlive') {
          const timeout = typeof message.Data === 'number' && message.Data > 0 ? message.Data : DEFAULT_KEEPALIVE_TIMEOUT_S
          startKeepAlive(timeout)
          return
        }
        if (message.MessageType !== 'LibraryChanged') return

        const data = message.Data as {
          ItemsAdded?: string[]
          ItemsUpdated?: string[]
          ItemsRemoved?: string[]
        } | undefined
        const removed = data?.ItemsRemoved ?? []
        const hasChanges = (data?.ItemsAdded?.length ?? 0) > 0 || (data?.ItemsUpdated?.length ?? 0) > 0 || removed.length > 0
        if (!hasChanges) return

        // The incremental sync can't see deletions, so apply them from the event.
        // Ids that aren't songs (albums, folders) are ignored by the store.
        if (removed.length > 0) {
          void whenMusicStoreHydrated().then(() => useMusicStore.getState().removeSongs(removed))
        }

        logger.log('[useLibraryChanged] Library changed, scheduling incremental sync')
        scheduleIncrementalSync(CHANGE_DEBOUNCE_MS)
      }

      socket.onclose = () => {
        if (ws !== socket) return
        stopKeepAlive()
        ws = null
        if (disposed) return
        logger.log('[useLibraryChanged] WebSocket closed, reconnecting...')
        scheduleReconnect()
      }

      socket.onerror = () => {
        // onclose fires after onerror, so reconnect is handled there
        logger.warn('[useLibraryChanged] WebSocket error')
      }
    }

    const scheduleReconnect = () => {
      if (disposed) return
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null
        connect()
      }, reconnectDelay)
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return

      // The server moved (LAN <-> remote): drop the old socket, onclose reconnects
      if (ws && socketBaseUrl !== jellyfinClient.serverBaseUrl) {
        ws.close()
      }

      if (!ws || ws.readyState !== WebSocket.OPEN) {
        // Backgrounded apps lose their socket; reconnect now rather than after backoff.
        // onopen runs the catch-up check.
        if (reconnectTimeout) clearTimeout(reconnectTimeout)
        reconnectTimeout = null
        reconnectDelay = RECONNECT_MIN_MS
        connect()
      } else {
        // The socket may look open after a long suspension even though the
        // server dropped it, so events could have been lost either way.
        void catchUp()
      }
    }

    connect()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      stopKeepAlive()
      if (ws) {
        ws.onclose = null // Prevent reconnect on intentional close
        ws.close()
        ws = null
      }
      cancelScheduledSync()
    }
  }, [isAuthenticated, accessToken])
}

// ============================================================================
// Sync scheduling (module level, shared by every trigger)
// ============================================================================

let syncTimeout: ReturnType<typeof setTimeout> | null = null
let lastCatchUpAt = 0

function scheduleIncrementalSync(delayMs: number) {
  if (syncTimeout) clearTimeout(syncTimeout)
  syncTimeout = setTimeout(() => {
    syncTimeout = null
    void runIncrementalSync()
  }, delayMs)
}

function cancelScheduledSync() {
  if (syncTimeout) clearTimeout(syncTimeout)
  syncTimeout = null
}

/**
 * Asks the server whether songs were added, edited or deleted since the last
 * sync, and starts an incremental sync only if so. Two Limit=1 requests, so
 * it's cheap enough to run on every reconnect and foreground.
 */
async function catchUp() {
  const now = Date.now()
  if (now - lastCatchUpAt < CATCH_UP_THROTTLE_MS) return
  lastCatchUpAt = now

  // On launch the socket can open before the cache has loaded, when
  // lastSyncCompleted still reads null and the check would be skipped
  await whenMusicStoreHydrated()
  const { lastSyncCompleted, songs } = useMusicStore.getState()
  if (lastSyncCompleted === null) return // The first full sync handles this

  try {
    const [changedCount, serverCount] = await Promise.all([
      jellyfinClient.getSongCount({ minDateLastSaved: new Date(lastSyncCompleted) }),
      jellyfinClient.getSongCount(),
    ])
    // Fewer songs on the server than cached means deletions; more is not
    // checked, since a sync couldn't fix it (the songs aren't newer than the
    // last sync) and would rerun on every foreground.
    if (changedCount > 0 || serverCount < songs.length) {
      logger.log(`[useLibraryChanged] Catch-up: ${changedCount} changed, server ${serverCount} vs cached ${songs.length}`)
      scheduleIncrementalSync(0)
    }
  } catch (error) {
    // Offline or server unreachable: the next reconnect or foreground retries
    lastCatchUpAt = 0
    logger.warn('[useLibraryChanged] Catch-up check failed', error)
  }
}

async function runIncrementalSync() {
  // The sync merges into the cached songs, so it must see the loaded cache
  await whenMusicStoreHydrated()
  const syncStore = useSyncStore.getState()
  if (syncStore.state === 'syncing') {
    // Another sync (settings, first-run) is running and may have started
    // before this change. Retry instead of dropping the change.
    scheduleIncrementalSync(BUSY_RETRY_MS)
    return
  }

  const { lastSyncCompleted } = useMusicStore.getState()
  if (lastSyncCompleted === null) return // Never synced yet — let the full auto-sync handle it

  // Record the start time, not the end: a song saved while this sync runs
  // must still be newer than lastSyncCompleted for the next sync to fetch it.
  const startedAt = Date.now()

  try {
    // Claim the sync slot before the probe (up to 2s), so no other sync can
    // start in between and merge into the cache at the same time
    syncStore.startSync('auto', 'New content detected, syncing...')
    await probeAndUpdateServerUrl()
    await jellyfinClient.syncLibrary({ scope: 'incremental' })
    const genres = await jellyfinClient.getGenres()
    const sorted = (genres || []).sort((a, b) =>
      (a.Name || '').localeCompare(b.Name || '')
    )
    useMusicStore.getState().setGenres(sorted)
    useMusicStore.getState().setLastSyncCompleted(startedAt)

    // Refresh recently added so the home page updates too
    const recent = await jellyfinClient.getRecentlyAdded(18)
    useMusicStore.getState().setRecentlyAdded(recent.Items || [])

    useSyncStore.getState().completeSync(true, 'Library synced')
  } catch (error) {
    // Don't show error if sync was cancelled
    if (useSyncStore.getState().state === 'syncing') {
      useSyncStore.getState().completeSync(false, error instanceof Error ? error.message : 'Sync failed')
    }
  }
}
