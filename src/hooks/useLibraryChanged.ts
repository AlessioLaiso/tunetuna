import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useSyncStore } from '../stores/syncStore'
import { useMusicStore } from '../stores/musicStore'
import { jellyfinClient } from '../api/jellyfin'
import { storage } from '../utils/storage'
import { logger } from '../utils/logger'

/**
 * Connects to Jellyfin's WebSocket and listens for LibraryChanged events.
 * When items are added or updated, triggers an incremental sync so that
 * genres, recommendations, mood filters, and the song cache stay fresh.
 */
export function useLibraryChanged() {
  const { serverUrl, accessToken, isAuthenticated } = useAuthStore()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelayRef = useRef(5_000) // Start at 5s, back off on failure

  useEffect(() => {
    if (!isAuthenticated || !serverUrl || !accessToken) return

    const connect = () => {
      // Don't open a second connection
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return

      const deviceId = storage.get<string>('deviceId') || 'unknown'
      const wsProtocol = serverUrl.startsWith('https') ? 'wss' : 'ws'
      const host = serverUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
      const url = `${wsProtocol}://${host}/socket?api_key=${accessToken}&deviceId=${deviceId}`

      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        logger.log('[useLibraryChanged] WebSocket connected')
        reconnectDelayRef.current = 5_000 // Reset backoff on success
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.MessageType !== 'LibraryChanged') return

          const data = message.Data
          const hasChanges =
            data?.ItemsAdded?.length > 0 ||
            data?.ItemsUpdated?.length > 0 ||
            data?.ItemsRemoved?.length > 0

          if (!hasChanges) return

          logger.log('[useLibraryChanged] Library changed, scheduling incremental sync')

          // Debounce: Jellyfin may fire multiple events in quick succession
          // (e.g. bulk metadata edits). Wait 5s of silence before syncing.
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => {
            triggerIncrementalSync()
          }, 5_000)
        } catch {
          // Ignore non-JSON keep-alive pings etc.
        }
      }

      ws.onclose = () => {
        logger.log('[useLibraryChanged] WebSocket closed, reconnecting...')
        scheduleReconnect()
      }

      ws.onerror = () => {
        // onclose fires after onerror, so reconnect is handled there
        logger.warn('[useLibraryChanged] WebSocket error')
      }
    }

    const scheduleReconnect = () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = setTimeout(() => {
        connect()
        // Exponential backoff, capped at 60s
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 60_000)
      }, reconnectDelayRef.current)
    }

    connect()

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null // Prevent reconnect on intentional close
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [isAuthenticated, serverUrl, accessToken])
}

async function triggerIncrementalSync() {
  const { state } = useSyncStore.getState()
  if (state !== 'idle') return // Don't interrupt an ongoing sync

  const { lastSyncCompleted } = useMusicStore.getState()
  if (lastSyncCompleted === null) return // Never synced yet — let the full auto-sync handle it

  const { startSync, completeSync } = useSyncStore.getState()

  startSync('auto', 'New content detected, syncing...')
  try {
    await jellyfinClient.syncLibrary({ scope: 'incremental' })
    const genres = await jellyfinClient.getGenres()
    const sorted = (genres || []).sort((a, b) =>
      (a.Name || '').localeCompare(b.Name || '')
    )
    useMusicStore.getState().setGenres(sorted)
    useMusicStore.getState().setLastSyncCompleted(Date.now())

    // Refresh recently added so the home page updates too
    const recent = await jellyfinClient.getRecentlyAdded(18)
    useMusicStore.getState().setRecentlyAdded(recent.Items || [])

    completeSync(true, 'Library synced')
  } catch (error) {
    // Don't show error if sync was cancelled
    if (useSyncStore.getState().state === 'syncing') {
      completeSync(false, error instanceof Error ? error.message : 'Sync failed')
    }
  }
}
