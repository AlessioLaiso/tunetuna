import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BaseItemDto } from '../api/types'
import { useAuthStore } from './authStore'

// Stats API is bundled with the app - served from same origin
const STATS_API_BASE = '/api/stats'

export interface PlayEvent {
  ts: number
  songId: string
  songName: string
  artistIds: string[]
  artistNames: string[]
  albumId: string
  albumName: string
  genres: string[]
  year: number | null
  durationMs: number
  fullDurationMs: number
}

interface CurrentPlay {
  track: BaseItemDto
  startedAt: number
}

interface StatsState {
  // Pending events (not yet synced to server)
  pendingEvents: PlayEvent[]

  // Last sync timestamp
  lastSyncedAt: number | null

  // Cached events for current session (fetched from server)
  cachedEvents: PlayEvent[]
  cacheRange: { from: number; to: number } | null

  // Currently playing track (for duration calculation)
  currentPlay: CurrentPlay | null

  // Cached stats key for sync (updated when auth changes)
  cachedStatsKey: string | null

  // Actions
  startPlay: (track: BaseItemDto) => void
  recordPlay: (track: BaseItemDto, actualDurationMs: number) => void
  syncToServer: () => Promise<void>
  fetchEvents: (from: number, to: number) => Promise<PlayEvent[]>
  clearCache: () => void
  updateStatsKey: () => Promise<void>
}

// Helper to generate stats key from server URL and user ID
async function generateStatsKey(serverUrl: string, userId: string): Promise<string> {
  const data = `${serverUrl}::${userId}`
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Create a PlayEvent from track data
function createPlayEvent(track: BaseItemDto, actualDurationMs: number): PlayEvent {
  return {
    ts: Date.now(),
    songId: track.Id,
    songName: track.Name || 'Unknown',
    artistIds: track.ArtistItems?.map(a => a.Id) || [],
    artistNames: track.ArtistItems?.map(a => a.Name || 'Unknown') || [track.AlbumArtist || 'Unknown'],
    albumId: track.AlbumId || '',
    albumName: track.Album || 'Unknown',
    genres: track.Genres || [],
    year: track.ProductionYear || null,
    durationMs: actualDurationMs,
    fullDurationMs: track.RunTimeTicks ? track.RunTimeTicks / 10000 : 0,
  }
}


export const useStatsStore = create<StatsState>()(
  persist(
    (set, get) => ({
      pendingEvents: [],
      lastSyncedAt: null,
      cachedEvents: [],
      cacheRange: null,
      currentPlay: null,
      cachedStatsKey: null,

      startPlay: (track) => {
        set({
          currentPlay: {
            track,
            startedAt: Date.now(),
          },
        })
      },

      recordPlay: (track, actualDurationMs) => {
        const { pendingEvents } = get()

        // Only record if they listened for at least 30 seconds
        if (actualDurationMs < 30000) return

        const event = createPlayEvent(track, actualDurationMs)

        set({
          pendingEvents: [...pendingEvents, event],
          currentPlay: null,
        })

        // Auto-sync if we have 5+ pending events
        if (pendingEvents.length >= 4) {
          get().syncToServer()
        }
      },

      syncToServer: async () => {
        const { pendingEvents } = get()
        if (pendingEvents.length === 0) return

        const { serverUrl, userId } = useAuthStore.getState()
        if (!serverUrl || !userId) return

        // Capture the events we're syncing to avoid race condition
        const eventsToSync = [...pendingEvents]
        const key = await generateStatsKey(serverUrl, userId)

        // Update cached key for sendBeacon use
        set({ cachedStatsKey: key })

        try {
          const response = await fetch(`${STATS_API_BASE}/${key}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventsToSync),
          })

          if (response.ok) {
            // Only remove the events we successfully synced
            set((state) => ({
              pendingEvents: state.pendingEvents.filter(
                e => !eventsToSync.some(synced => synced.ts === e.ts && synced.songId === e.songId)
              ),
              lastSyncedAt: Date.now(),
              cacheRange: null, // Invalidate cache since we have new data
            }))
          } else {
            console.warn('Failed to sync stats:', response.status)
          }
        } catch (error) {
          console.warn('Failed to sync stats:', error)
          // Keep pending events for retry
        }
      },

      updateStatsKey: async () => {
        const { serverUrl, userId } = useAuthStore.getState()
        if (!serverUrl || !userId) {
          set({ cachedStatsKey: null })
          return
        }
        const key = await generateStatsKey(serverUrl, userId)
        set({ cachedStatsKey: key })
      },

      fetchEvents: async (from, to) => {
        const { cacheRange, cachedEvents, pendingEvents } = get()

        const { serverUrl, userId } = useAuthStore.getState()
        if (!serverUrl || !userId) return []

        // Check if we have cached data that covers this range
        if (cacheRange && cacheRange.from <= from && cacheRange.to >= to) {
          // Filter cached events to the requested range and merge with pending
          const filtered = cachedEvents.filter(e => e.ts >= from && e.ts <= to)
          const pendingInRange = pendingEvents.filter(e => e.ts >= from && e.ts <= to)
          return [...filtered, ...pendingInRange].sort((a, b) => a.ts - b.ts)
        }

        const key = await generateStatsKey(serverUrl, userId)

        try {
          const response = await fetch(
            `${STATS_API_BASE}/${key}/events?from=${from}&to=${to}`
          )

          if (!response.ok) {
            console.warn('Failed to fetch stats:', response.status)
            return []
          }

          const data = await response.json()
          const events: PlayEvent[] = data.events || []

          set({
            cachedEvents: events,
            cacheRange: { from, to },
          })

          // Merge with pending events in range
          const pendingInRange = pendingEvents.filter(e => e.ts >= from && e.ts <= to)
          return [...events, ...pendingInRange].sort((a, b) => a.ts - b.ts)
        } catch (error) {
          console.warn('Failed to fetch stats:', error)
          return []
        }
      },

      clearCache: () => {
        set({
          cachedEvents: [],
          cacheRange: null,
        })
      },
    }),
    {
      name: 'stats-storage',
      partialize: (state) => ({
        pendingEvents: state.pendingEvents,
        lastSyncedAt: state.lastSyncedAt,
      }),
    }
  )
)

// Sync on page visibility change (when user leaves/returns to app)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Sync when user leaves the page
      useStatsStore.getState().syncToServer()
    }
  })

  // Use sendBeacon before page unload for reliable delivery
  window.addEventListener('beforeunload', () => {
    const { pendingEvents, cachedStatsKey } = useStatsStore.getState()
    if (pendingEvents.length > 0 && cachedStatsKey) {
      // sendBeacon is synchronous and reliable for page close
      const blob = new Blob([JSON.stringify(pendingEvents)], { type: 'application/json' })
      navigator.sendBeacon(`${STATS_API_BASE}/${cachedStatsKey}/events`, blob)
    }
  })

  // Defer auth store subscription to avoid circular dependency
  setTimeout(() => {
    // Update stats key when auth changes (subscribe to auth store)
    useAuthStore.subscribe((state, prevState) => {
      if (state.serverUrl !== prevState.serverUrl || state.userId !== prevState.userId) {
        useStatsStore.getState().updateStatsKey()
      }
    })

    // Initialize stats key on load if authenticated
    const { serverUrl, userId } = useAuthStore.getState()
    if (serverUrl && userId) {
      useStatsStore.getState().updateStatsKey()
    }
  }, 0)
}
