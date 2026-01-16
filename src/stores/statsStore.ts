import { create } from 'zustand'
import { persist, type StorageValue } from 'zustand/middleware'
import type { BaseItemDto } from '../api/types'
import { useAuthStore } from './authStore'
import { useSettingsStore } from './settingsStore'

/**
 * Stats API endpoint - bundled with the app, served from same origin.
 * Handles server-side persistence of play events in SQLite.
 */
const STATS_API_BASE = '/api/stats'

/**
 * Represents a single play event recorded when a user listens to a track.
 * Events are stored locally until synced to the server.
 */
export interface PlayEvent {
  /** Unix timestamp when the play was recorded */
  ts: number
  /** Jellyfin item ID of the song */
  songId: string
  /** Display name of the song */
  songName: string
  /** Jellyfin item IDs of all artists */
  artistIds: string[]
  /** Display names of all artists */
  artistNames: string[]
  /** Jellyfin item ID of the album */
  albumId: string
  /** Display name of the album */
  albumName: string
  /** Genre names associated with the track */
  genres: string[]
  /** Production year, if available */
  year: number | null
  /** Actual listen duration in milliseconds */
  durationMs: number
  /** Full track duration in milliseconds */
  fullDurationMs: number
}

/**
 * Tracks the currently playing song for duration calculation.
 * Used to determine actual listen time when recording a play.
 */
interface CurrentPlay {
  track: BaseItemDto
  startedAt: number
}

/**
 * Stats store state and actions.
 *
 * This store manages:
 * - Pending events: Play events waiting to be synced to server
 * - Cached events: Events fetched from server for display
 * - Current play: Active track for duration tracking
 *
 * Persistence: Uses IndexedDB for reliability and consistency with musicStore.
 * Only pendingEvents and lastSyncedAt are persisted; cached data is transient.
 */
interface StatsState {
  /** Events recorded but not yet synced to server */
  pendingEvents: PlayEvent[]
  /** Timestamp of last successful server sync */
  lastSyncedAt: number | null
  /** Events fetched from server (transient, not persisted) */
  cachedEvents: PlayEvent[]
  /** Time range of cached events for cache hit detection */
  cacheRange: { from: number; to: number } | null
  /** Currently playing track for duration calculation */
  currentPlay: CurrentPlay | null
  /** SHA-256 hash of serverUrl::userId for API calls */
  cachedStatsKey: string | null
  /** Random auth token for stats API authentication (persisted per user) */
  cachedStatsToken: string | null
  /** Version counter that increments when event metadata changes, used to trigger UI updates */
  metadataVersion: number

  // Actions
  startPlay: (track: BaseItemDto) => void
  recordPlay: (track: BaseItemDto, actualDurationMs: number) => void
  syncToServer: () => Promise<void>
  fetchEvents: (from: number, to: number) => Promise<PlayEvent[]>
  clearCache: () => void
  updateStatsKey: () => Promise<void>
  updateEventMetadata: (itemType: 'song' | 'album' | 'artist', itemId: string, metadata: Partial<Pick<PlayEvent, 'songName' | 'artistNames' | 'albumName' | 'genres' | 'year'>>) => void
  /** Exports all stats (server + pending) as a downloadable JSON file */
  exportStats: () => Promise<void>
  /** Imports stats from a JSON file, deduplicating with existing data */
  importStats: (file: File) => Promise<{ imported: number; skipped: number }>
  /** Clears local pending events only */
  clearLocalStats: () => void
  /** Clears all stats (local + server) */
  clearAllStats: () => Promise<boolean>
  /** Returns true if there are any stats (pending or synced) */
  hasStats: () => Promise<boolean>
}

// ============================================================================
// IndexedDB Storage Adapter
// ============================================================================

/**
 * Singleton IndexedDB connection to prevent race conditions.
 * Shared pattern with musicStore for consistency.
 */
let dbInstance: IDBDatabase | null = null
let dbPromise: Promise<IDBDatabase> | null = null

/**
 * Gets or creates the IndexedDB connection.
 * Uses singleton pattern to ensure only one connection exists.
 */
function getDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance)
  }

  if (dbPromise) {
    return dbPromise
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('tunetuna-stats-storage', 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('zustand')) {
        db.createObjectStore('zustand')
      }
    }

    request.onsuccess = () => {
      dbInstance = request.result
      dbInstance.onclose = () => {
        dbInstance = null
        dbPromise = null
      }
      resolve(dbInstance)
    }

    request.onerror = () => {
      dbPromise = null
      reject(request.error)
    }
  })

  return dbPromise
}

/**
 * Custom IndexedDB storage adapter for Zustand persist middleware.
 * Provides better reliability than localStorage for critical data like pending events.
 */
const indexedDBStorage = {
  getItem: async (name: string): Promise<StorageValue<StatsState> | null> => {
    try {
      const db = await getDB()
      return new Promise((resolve) => {
        const transaction = db.transaction(['zustand'], 'readonly')
        const store = transaction.objectStore('zustand')
        const getRequest = store.get(name)
        getRequest.onsuccess = () => {
          const result = getRequest.result
          if (result) {
            resolve(JSON.parse(result))
          } else {
            resolve(null)
          }
        }
        getRequest.onerror = () => {
          resolve(null)
        }
      })
    } catch {
      return null
    }
  },
  setItem: async (name: string, value: StorageValue<StatsState>): Promise<void> => {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['zustand'], 'readwrite')
      const store = transaction.objectStore('zustand')
      const setRequest = store.put(JSON.stringify(value), name)
      setRequest.onsuccess = () => {
        resolve()
      }
      setRequest.onerror = () => {
        reject(setRequest.error)
      }
    })
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      const db = await getDB()
      return new Promise((resolve) => {
        const transaction = db.transaction(['zustand'], 'readwrite')
        const store = transaction.objectStore('zustand')
        const deleteRequest = store.delete(name)
        deleteRequest.onsuccess = () => {
          resolve()
        }
        deleteRequest.onerror = () => {
          resolve()
        }
      })
    } catch {
      // Silently fail on remove errors
    }
  },
}


// ============================================================================
// Helper Functions (internal to store module)
// ============================================================================

/**
 * Generates a unique key for the stats API from server URL, user ID, and token.
 * Uses SHA-256 hash to create a consistent, URL-safe identifier.
 *
 * SECURITY: The token is included in the hash to make the key unpredictable.
 * Without knowing the token, an attacker cannot guess the key to race-register.
 * This prevents the "first token wins" vulnerability where predictable keys
 * (e.g., just serverUrl::userId) could be targeted by attackers.
 */
async function generateStatsKey(serverUrl: string, userId: string, token: string): Promise<string> {
  const data = `${serverUrl}::${userId}::${token}`
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generates a random 32-byte hex token for API authentication.
 * Used to secure stats API requests beyond just the predictable key.
 */
function generateStatsToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Creates a PlayEvent from track data and actual listen duration.
 * Extracts all relevant metadata for stats tracking.
 */
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

// ============================================================================
// Store Definition
// ============================================================================

export const useStatsStore = create<StatsState>()(
  persist(
    (set, get) => ({
      pendingEvents: [],
      lastSyncedAt: null,
      cachedEvents: [],
      cacheRange: null,
      currentPlay: null,
      cachedStatsKey: null,
      cachedStatsToken: null,
      metadataVersion: 0,

      /**
       * Marks a track as currently playing for duration calculation.
       */
      startPlay: (track) => {
        set({
          currentPlay: {
            track,
            startedAt: Date.now(),
          },
        })
      },

      /**
       * Records a play event if the user listened long enough.
       * Threshold: 1 minute, or 80% of short songs (<1 min).
       * Auto-syncs to server when 5+ events are pending.
       * Respects statsTrackingEnabled setting.
       */
      recordPlay: (track, actualDurationMs) => {
        // Check if tracking is enabled
        if (!useSettingsStore.getState().statsTrackingEnabled) return

        const { pendingEvents } = get()

        // Get the song's full duration
        const fullDurationMs = track.RunTimeTicks ? track.RunTimeTicks / 10000 : 0
        const isShortSong = fullDurationMs > 0 && fullDurationMs < 60000

        // Record if: listened for at least 1 minute, OR short song played mostly through (80%+)
        const listenedEnough = actualDurationMs >= 60000 || (isShortSong && actualDurationMs >= fullDurationMs * 0.8)
        if (!listenedEnough) return

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

      /**
       * Syncs pending events to the server.
       * Uses snapshot of events to prevent race conditions.
       * Failed syncs preserve events for retry.
       */
      syncToServer: async () => {
        const { pendingEvents } = get()
        if (pendingEvents.length === 0) return

        const { serverUrl, userId } = useAuthStore.getState()
        if (!serverUrl || !userId) return

        // Ensure we have a key and token
        await get().updateStatsKey()
        const { cachedStatsKey, cachedStatsToken } = get()
        if (!cachedStatsKey || !cachedStatsToken) return

        // Capture the events we're syncing to avoid race condition
        const eventsToSync = [...pendingEvents]

        try {
          const response = await fetch(`${STATS_API_BASE}/${cachedStatsKey}/events`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Stats-Token': cachedStatsToken,
            },
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
          }
          // Silently fail - events will retry on next sync
        } catch {
          // Keep pending events for retry
        }
      },

      /**
       * Updates the cached stats key and token when auth changes.
       * Called on auth state changes and initial load.
       * Token is generated once per user and persisted.
       *
       * SECURITY: The key is derived from serverUrl, userId, AND the token.
       * This makes the key unpredictable without knowing the token, preventing
       * attackers from racing to register a token for a predictable key.
       */
      updateStatsKey: async () => {
        const { serverUrl, userId } = useAuthStore.getState()
        if (!serverUrl || !userId) {
          set({ cachedStatsKey: null, cachedStatsToken: null })
          return
        }

        const { cachedStatsToken } = get()
        // Generate token first if we don't have one (token is stable per user)
        const token = cachedStatsToken || generateStatsToken()
        // Key is derived from serverUrl, userId, AND token for unpredictability
        const key = await generateStatsKey(serverUrl, userId, token)

        set({ cachedStatsKey: key, cachedStatsToken: token })
      },

      /**
       * Fetches events from server for a given time range.
       * Uses cache if available, merges with pending events.
       */
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

        // Ensure we have a key and token
        await get().updateStatsKey()
        const { cachedStatsKey, cachedStatsToken } = get()
        if (!cachedStatsKey || !cachedStatsToken) return []

        try {
          const response = await fetch(
            `${STATS_API_BASE}/${cachedStatsKey}/events?from=${from}&to=${to}`,
            {
              headers: { 'X-Stats-Token': cachedStatsToken },
            }
          )

          if (!response.ok) {
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
        } catch {
          return []
        }
      },

      /**
       * Clears the in-memory cache of fetched events.
       * Does not affect pending events or server data.
       */
      clearCache: () => {
        set({
          cachedEvents: [],
          cacheRange: null,
        })
      },

      /**
       * Updates metadata for cached/pending events when item metadata changes.
       * Keeps stats in sync with library metadata updates.
       * Also syncs the update to the server so changes persist.
       */
      updateEventMetadata: (itemType, itemId, metadata) => {
        const { cachedEvents, pendingEvents } = get()

        const updateEvent = (event: PlayEvent): PlayEvent => {
          let shouldUpdate = false

          if (itemType === 'song' && event.songId === itemId) {
            shouldUpdate = true
          } else if (itemType === 'album' && event.albumId === itemId) {
            shouldUpdate = true
          } else if (itemType === 'artist' && event.artistIds.includes(itemId)) {
            shouldUpdate = true
          }

          if (!shouldUpdate) return event

          return {
            ...event,
            ...(metadata.songName !== undefined && { songName: metadata.songName }),
            ...(metadata.artistNames !== undefined && { artistNames: metadata.artistNames }),
            ...(metadata.albumName !== undefined && { albumName: metadata.albumName }),
            ...(metadata.genres !== undefined && { genres: metadata.genres }),
            ...(metadata.year !== undefined && { year: metadata.year }),
          }
        }

        set((state) => ({
          cachedEvents: cachedEvents.map(updateEvent),
          pendingEvents: pendingEvents.map(updateEvent),
          metadataVersion: state.metadataVersion + 1,
        }))

        // Sync metadata update to server (fire-and-forget, errors don't block)
        ;(async () => {
          const { serverUrl, userId } = useAuthStore.getState()
          if (!serverUrl || !userId) return

          // Ensure we have a key and token
          await get().updateStatsKey()
          const { cachedStatsKey, cachedStatsToken } = get()
          if (!cachedStatsKey || !cachedStatsToken) return

          try {
            await fetch(`${STATS_API_BASE}/${cachedStatsKey}/events/metadata`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'X-Stats-Token': cachedStatsToken,
              },
              body: JSON.stringify({ itemType, itemId, metadata }),
            })
            // Silently fail - metadata will be correct on next full sync
          } catch {
            // Silently fail
          }
        })()
      },

      /**
       * Exports all stats as a downloadable JSON file.
       * Fetches all events from server and merges with pending events.
       */
      exportStats: async () => {
        const { pendingEvents } = get()
        const { serverUrl, userId } = useAuthStore.getState()

        let allEvents: PlayEvent[] = [...pendingEvents]

        // Fetch all events from server if authenticated
        if (serverUrl && userId) {
          // Ensure we have a key and token
          await get().updateStatsKey()
          const { cachedStatsKey, cachedStatsToken } = get()
          if (cachedStatsKey && cachedStatsToken) {
            try {
              // Fetch all events (use very wide time range)
              const response = await fetch(
                `${STATS_API_BASE}/${cachedStatsKey}/events?from=0&to=${Date.now()}`,
                {
                  headers: { 'X-Stats-Token': cachedStatsToken },
                }
              )
              if (response.ok) {
                const data = await response.json()
                const serverEvents: PlayEvent[] = data.events || []
                // Merge and deduplicate by ts + songId
                const existingKeys = new Set(allEvents.map(e => `${e.ts}-${e.songId}`))
                for (const event of serverEvents) {
                  const eventKey = `${event.ts}-${event.songId}`
                  if (!existingKeys.has(eventKey)) {
                    allEvents.push(event)
                  }
                }
              }
            } catch {
              // Continue with local events only
            }
          }
        }

        // Sort by timestamp
        allEvents.sort((a, b) => a.ts - b.ts)

        // Create and download JSON file
        const blob = new Blob([JSON.stringify(allEvents, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `tunetuna-stats-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      },

      /**
       * Clears local pending events only.
       * Does not affect server data.
       */
      clearLocalStats: () => {
        set({
          pendingEvents: [],
          cachedEvents: [],
          cacheRange: null,
          lastSyncedAt: null,
        })
      },

      /**
       * Clears all stats (local + server).
       * Returns true if successful, false otherwise.
       */
      clearAllStats: async () => {
        const { serverUrl, userId } = useAuthStore.getState()

        // Clear local first
        set({
          pendingEvents: [],
          cachedEvents: [],
          cacheRange: null,
          lastSyncedAt: null,
        })

        // Try to clear server data if authenticated
        if (serverUrl && userId) {
          // Ensure we have a key and token
          await get().updateStatsKey()
          const { cachedStatsKey, cachedStatsToken } = get()
          if (cachedStatsKey && cachedStatsToken) {
            try {
              const response = await fetch(`${STATS_API_BASE}/${cachedStatsKey}/events`, {
                method: 'DELETE',
                headers: { 'X-Stats-Token': cachedStatsToken },
              })
              return response.ok
            } catch {
              return false
            }
          }
        }

        return true
      },

      /**
       * Imports stats from a JSON file.
       * Validates events and deduplicates with existing server data.
       */
      importStats: async (file: File) => {
        const { serverUrl, userId } = useAuthStore.getState()
        if (!serverUrl || !userId) {
          throw new Error('Not authenticated')
        }

        // Read and parse file
        const text = await file.text()
        let events: PlayEvent[]
        try {
          events = JSON.parse(text)
        } catch {
          throw new Error('Invalid JSON file')
        }

        if (!Array.isArray(events)) {
          throw new Error('File must contain an array of events')
        }

        // Validate events have required fields
        const validEvents = events.filter(e =>
          typeof e.ts === 'number' &&
          typeof e.songId === 'string' &&
          typeof e.songName === 'string' &&
          Array.isArray(e.artistIds) &&
          Array.isArray(e.artistNames) &&
          typeof e.albumId === 'string' &&
          typeof e.albumName === 'string' &&
          Array.isArray(e.genres) &&
          typeof e.durationMs === 'number' &&
          typeof e.fullDurationMs === 'number'
        )

        if (validEvents.length === 0) {
          throw new Error('No valid events found in file')
        }

        // Ensure we have a key and token
        await get().updateStatsKey()
        const { cachedStatsKey, cachedStatsToken } = get()
        if (!cachedStatsKey || !cachedStatsToken) {
          throw new Error('Failed to initialize stats authentication')
        }

        // Fetch existing events to check for duplicates
        let existingKeys = new Set<string>()
        try {
          const response = await fetch(
            `${STATS_API_BASE}/${cachedStatsKey}/events?from=0&to=${Date.now()}`,
            {
              headers: { 'X-Stats-Token': cachedStatsToken },
            }
          )
          if (response.ok) {
            const data = await response.json()
            const existingEvents: PlayEvent[] = data.events || []
            existingKeys = new Set(existingEvents.map(e => `${e.ts}-${e.songId}`))
          }
        } catch {
          // Continue without deduplication if fetch fails
        }

        // Also check pending events
        const { pendingEvents } = get()
        for (const e of pendingEvents) {
          existingKeys.add(`${e.ts}-${e.songId}`)
        }

        // Filter out duplicates
        const newEvents = validEvents.filter(e => !existingKeys.has(`${e.ts}-${e.songId}`))

        if (newEvents.length === 0) {
          return { imported: 0, skipped: validEvents.length }
        }

        // Send to server
        const response = await fetch(`${STATS_API_BASE}/${cachedStatsKey}/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Stats-Token': cachedStatsToken,
          },
          body: JSON.stringify(newEvents),
        })

        if (!response.ok) {
          throw new Error('Failed to upload events')
        }

        // Invalidate cache
        set({ cacheRange: null })

        return { imported: newEvents.length, skipped: validEvents.length - newEvents.length }
      },

      /**
       * Checks if there are any stats (pending or on server).
       */
      hasStats: async () => {
        const { pendingEvents } = get()
        if (pendingEvents.length > 0) return true

        const { serverUrl, userId } = useAuthStore.getState()
        if (!serverUrl || !userId) return false

        // Ensure we have a key and token
        await get().updateStatsKey()
        const { cachedStatsKey, cachedStatsToken } = get()
        if (!cachedStatsKey || !cachedStatsToken) return false

        try {
          // Just check if any events exist
          const response = await fetch(
            `${STATS_API_BASE}/${cachedStatsKey}/events?from=0&to=${Date.now()}`,
            {
              headers: { 'X-Stats-Token': cachedStatsToken },
            }
          )
          if (response.ok) {
            const data = await response.json()
            return (data.events?.length || 0) > 0
          }
        } catch {
          // Assume no stats if we can't check
        }

        return false
      },
    }),
    {
      name: 'stats-storage',
      storage: indexedDBStorage,
      partialize: (state) => ({
        pendingEvents: state.pendingEvents,
        lastSyncedAt: state.lastSyncedAt,
        cachedStatsToken: state.cachedStatsToken,
      }),
    }
  )
)

// Guard against duplicate listener registration (hot reload safety)
let listenersInitialized = false
let authUnsubscribe: (() => void) | null = null

function initStatsListeners() {
  if (listenersInitialized || typeof document === 'undefined') return
  listenersInitialized = true

  // Sync on page visibility change (when user leaves/returns to app)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      useStatsStore.getState().syncToServer()
    }
  })

  // Use sendBeacon before page unload for reliable delivery
  window.addEventListener('beforeunload', () => {
    const { pendingEvents, cachedStatsKey, cachedStatsToken } = useStatsStore.getState()
    if (pendingEvents.length > 0 && cachedStatsKey && cachedStatsToken) {
      const payload = { _token: cachedStatsToken, events: pendingEvents }
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
      navigator.sendBeacon(`${STATS_API_BASE}/${cachedStatsKey}/events`, blob)
    }
  })

  // Defer auth store subscription to avoid circular dependency
  setTimeout(() => {
    // Clean up any existing subscription first (hot reload safety)
    if (authUnsubscribe) {
      authUnsubscribe()
    }

    // Update stats key when auth changes
    authUnsubscribe = useAuthStore.subscribe((state, prevState) => {
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

// Initialize listeners
initStatsListeners()
