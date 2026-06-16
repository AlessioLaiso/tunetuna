import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { useAuthStore } from './authStore'
import { useStatsStore } from './statsStore'
import { useMusicStore } from './musicStore'
import type { LightweightSong } from '../api/types'

const STATS_API_BASE = '/api/stats'

const TOP_ARTISTS_CAP = 200

export interface LibrarySnapshot {
  ts: number
  totalSongs: number
  totalAlbums: number
  totalArtists: number
  totalGenres: number
  /** genre name -> song count */
  genres: Record<string, number>
  /** decade label (e.g. "1990s") -> song count */
  decades: Record<string, number>
  /** Top artists by song count, capped at TOP_ARTISTS_CAP */
  topArtists: Array<{ id: string; count: number }>
  /** True if this snapshot was synthesized as a backfill baseline */
  isBaseline?: boolean
}

interface LibrarySnapshotState {
  snapshots: LibrarySnapshot[]
  loaded: boolean
  loading: boolean

  loadSnapshots: () => Promise<void>
  /** Computes a snapshot from the current library and uploads it.
   *  Skips if a snapshot already exists for the current calendar month
   *  (unless `force` is true). Pass `songs` to avoid reading stale store state. */
  captureSnapshot: (opts?: { force?: boolean; isBaseline?: boolean; ts?: number; songs?: LightweightSong[] }) => Promise<void>
  /** Ensures we have at least a baseline snapshot covering the oldest
   *  PlayEvent timestamp. Called once after initial library load.
   *  Pass `songs` to avoid reading stale store state. */
  ensureBaseline: (songs?: LightweightSong[]) => Promise<void>
  /** Returns the snapshot whose ts is closest to (and not after) `targetTs`.
   *  Falls back to the oldest snapshot if none precedes `targetTs`. */
  snapshotForTimestamp: (targetTs: number) => LibrarySnapshot | null
  /** Picks the snapshot to use for a given timeframe range. Uses the snapshot
   *  covering the end of the range to reflect the library as it stood then. */
  snapshotForRange: (fromTs: number, toTs: number) => LibrarySnapshot | null
  /** Captures snapshots for all historical months back to oldestEventTs (backfill) */
  backfillHistoricalSnapshots: (songs?: LightweightSong[], oldestEventTs?: number) => Promise<void>
  /** Capture a fresh snapshot + backfill historical months. Call after a library sync. */
  refreshAfterSync: (songs?: LightweightSong[]) => Promise<void>
  /** Clears all snapshots (local + server) */
  clearAll: () => Promise<void>
}

function computeSnapshotFromLibrary(songs: LightweightSong[], ts: number, isBaseline = false): LibrarySnapshot {
  console.log('[computeSnapshot] Input songs:', songs.length)
  const genreCounts: Record<string, number> = {}
  const decadeCounts: Record<string, number> = {}
  const artistCounts = new Map<string, number>()
  const albumIds = new Set<string>()
  const genreNames = new Set<string>()

  for (const song of songs) {
    if (song.AlbumId) albumIds.add(song.AlbumId)

    if (song.Genres) {
      for (const g of song.Genres) {
        if (!g) continue
        const key = g.toLowerCase()
        genreNames.add(key)
        genreCounts[key] = (genreCounts[key] || 0) + 1
      }
    }

    if (song.ProductionYear) {
      const decade = `${Math.floor(song.ProductionYear / 10) * 10}s`
      decadeCounts[decade] = (decadeCounts[decade] || 0) + 1
    }

    const seenArtistIdsForSong = new Set<string>()
    if (song.ArtistItems) {
      for (const a of song.ArtistItems) {
        if (a.Id && !seenArtistIdsForSong.has(a.Id)) {
          seenArtistIdsForSong.add(a.Id)
          artistCounts.set(a.Id, (artistCounts.get(a.Id) || 0) + 1)
        }
      }
    }
  }

  const topArtists = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_ARTISTS_CAP)
    .map(([id, count]) => ({ id, count }))

  return {
    ts,
    totalSongs: songs.length,
    totalAlbums: albumIds.size,
    totalArtists: artistCounts.size,
    totalGenres: genreNames.size,
    genres: genreCounts,
    decades: decadeCounts,
    topArtists,
    isBaseline,
  }
}

function startOfMonth(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

function endOfMonth(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
}

async function deleteSnapshotsInMonth(ts: number): Promise<void> {
  const { serverUrl, userId } = useAuthStore.getState()
  if (!serverUrl || !userId) return

  await useStatsStore.getState().updateStatsKey()
  const { cachedStatsKey, cachedStatsToken } = useStatsStore.getState()
  if (!cachedStatsKey || !cachedStatsToken) return

  const fromTs = startOfMonth(ts)
  const toTs = endOfMonth(ts)
  try {
    await fetch(
      `${STATS_API_BASE}/${cachedStatsKey}/library-snapshots/month?fromTs=${fromTs}&toTs=${toTs}`,
      { method: 'DELETE', headers: { 'X-Stats-Token': cachedStatsToken } },
    )
  } catch {
    // best-effort
  }
}

async function postSnapshots(snapshots: LibrarySnapshot[]): Promise<boolean> {
  const { serverUrl, userId } = useAuthStore.getState()
  if (!serverUrl || !userId) return false

  await useStatsStore.getState().updateStatsKey()
  const { cachedStatsKey, cachedStatsToken } = useStatsStore.getState()
  if (!cachedStatsKey || !cachedStatsToken) return false

  try {
    const response = await fetch(`${STATS_API_BASE}/${cachedStatsKey}/library-snapshots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Stats-Token': cachedStatsToken,
      },
      body: JSON.stringify({ snapshots }),
    })
    return response.ok
  } catch {
    return false
  }
}

export const useLibrarySnapshotStore = create<LibrarySnapshotState>()(
  devtools(
    (set, get) => ({
      snapshots: [],
      loaded: false,
      loading: false,

      loadSnapshots: async () => {
        const { serverUrl, userId } = useAuthStore.getState()
        if (!serverUrl || !userId) return

        if (get().loading) return
        set({ loading: true })

        await useStatsStore.getState().updateStatsKey()
        const { cachedStatsKey, cachedStatsToken } = useStatsStore.getState()
        if (!cachedStatsKey || !cachedStatsToken) {
          set({ loading: false })
          return
        }

        try {
          const response = await fetch(`${STATS_API_BASE}/${cachedStatsKey}/library-snapshots`, {
            headers: { 'X-Stats-Token': cachedStatsToken },
          })
          if (response.ok) {
            const data = await response.json()
            const snapshots: LibrarySnapshot[] = (data.snapshots || []).sort(
              (a: LibrarySnapshot, b: LibrarySnapshot) => a.ts - b.ts
            )
            set({ snapshots, loaded: true })
          }
        } catch {
          // Silently fail; will retry next time
        } finally {
          set({ loading: false })
        }
      },

      captureSnapshot: async (opts) => {
        let songs = opts?.songs
        if (!songs || songs.length === 0) {
          const { songs: storeSongs } = useMusicStore.getState()
          songs = storeSongs
        }
        if (songs.length === 0) return

        const force = opts?.force ?? false
        const isBaseline = opts?.isBaseline ?? false
        const ts = opts?.ts ?? Date.now()

        if (!get().loaded) {
          await get().loadSnapshots()
        }

        if (!force) {
          const existing = get().snapshots
          const monthStart = startOfMonth(ts)
          const monthEnd = monthStart + 31 * 24 * 60 * 60 * 1000
          const hasThisMonth = existing.some(s => !s.isBaseline && s.ts >= monthStart && s.ts < monthEnd)
          if (hasThisMonth) return
        }

        const snapshot = computeSnapshotFromLibrary(songs, ts, isBaseline)
        console.log('[librarySnapshot] Capturing snapshot:', {
          totalSongs: snapshot.totalSongs,
          totalAlbums: snapshot.totalAlbums,
          totalArtists: snapshot.totalArtists,
          inputSongsLength: songs.length,
          isBaseline,
          ts,
        })
        // On forced non-baseline captures, replace any existing snapshot in the
        // same calendar month so stale genre casings don't linger.
        if (force && !isBaseline) {
          await deleteSnapshotsInMonth(ts)
          const monthStart = startOfMonth(ts)
          const monthEnd = endOfMonth(ts)
          set(state => ({
            snapshots: state.snapshots.filter(
              s => s.isBaseline || s.ts < monthStart || s.ts >= monthEnd,
            ),
          }))
        }
        const ok = await postSnapshots([snapshot])
        console.log('[librarySnapshot] Post result:', ok)
        if (ok) {
          set(state => ({
            snapshots: [...state.snapshots, snapshot].sort((a, b) => a.ts - b.ts),
          }))
        }
      },

      ensureBaseline: async (songs) => {
        console.log('[librarySnapshot] ensureBaseline called, existing snapshots:', get().snapshots.length)
        if (!get().loaded) {
          await get().loadSnapshots()
        }

        const existing = get().snapshots
        console.log('[librarySnapshot] After load, snapshots:', existing.length)
        if (existing.length > 0) {
          console.log('[librarySnapshot] Baseline already exists, skipping')
          return
        }

        if (!songs || songs.length === 0) {
          const { songs: storeSongs } = useMusicStore.getState()
          songs = storeSongs
        }
        if (songs.length === 0) return

        // Baseline ts: oldest PlayEvent if any, else start of current month
        const { oldestEventTs } = useStatsStore.getState()
        const baselineTs = oldestEventTs ?? startOfMonth(Date.now())

        await get().captureSnapshot({ force: true, isBaseline: true, ts: baselineTs })
        // Also record a current snapshot so future timeframe queries don't all
        // resolve to the baseline.
        await get().captureSnapshot({ force: true, ts: Date.now() })
      },

      snapshotForTimestamp: (targetTs) => {
        const { snapshots } = get()
        if (snapshots.length === 0) return null
        let best: LibrarySnapshot | null = null
        for (const s of snapshots) {
          if (s.ts <= targetTs) {
            if (!best || s.ts > best.ts) best = s
          }
        }
        return best ?? snapshots[0]
      },

      snapshotForRange: (_fromTs, toTs) => {
        return get().snapshotForTimestamp(toTs)
      },

      backfillHistoricalSnapshots: async (songs, oldestEventTs) => {
        if (!songs || songs.length === 0) {
          const { songs: storeSongs } = useMusicStore.getState()
          songs = storeSongs
        }
        if (songs.length === 0) return

        if (!oldestEventTs) {
          const { oldestEventTs: storedOldest } = useStatsStore.getState()
          oldestEventTs = storedOldest
        }
        if (!oldestEventTs) return

        if (!get().loaded) {
          await get().loadSnapshots()
        }

        const existing = get().snapshots
        const existingMonths = new Set(existing.map(s => {
          const d = new Date(s.ts)
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        }))

        const snapshotsToCapture: LibrarySnapshot[] = []
        const startDate = new Date(oldestEventTs)
        const now = new Date()

        const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
        let monthsProcessed = 0
        while (current <= now) {
          const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`
          if (!existingMonths.has(monthKey)) {
            const monthStartTs = current.getTime()
            const snapshot = computeSnapshotFromLibrary(songs, monthStartTs, false)
            snapshotsToCapture.push(snapshot)
            // Yield to the event loop every few months so a long backfill
            // doesn't block UI rendering.
            monthsProcessed++
            if (monthsProcessed % 6 === 0) {
              await new Promise(resolve => setTimeout(resolve, 0))
            }
          }
          current.setMonth(current.getMonth() + 1)
        }

        if (snapshotsToCapture.length > 0) {
          const ok = await postSnapshots(snapshotsToCapture)
          console.log(`[backfill] Posted ${snapshotsToCapture.length} snapshots, ok=${ok}`)
          if (ok) {
            set(state => ({
              snapshots: [...state.snapshots, ...snapshotsToCapture].sort((a, b) => a.ts - b.ts),
            }))
          }
        }
      },

      refreshAfterSync: async (songs) => {
        if (!songs || songs.length === 0) {
          const { songs: storeSongs } = useMusicStore.getState()
          songs = storeSongs
        }
        if (songs.length === 0) return
        const { oldestEventTs } = useStatsStore.getState()
        try {
          await get().captureSnapshot({ songs, force: true })
          await get().backfillHistoricalSnapshots(songs, oldestEventTs ?? undefined)
        } catch (err) {
          console.error('[librarySnapshot] refreshAfterSync error:', err)
        }
      },

      clearAll: async () => {
        const { serverUrl, userId } = useAuthStore.getState()
        set({ snapshots: [], loaded: false })

        if (!serverUrl || !userId) return
        await useStatsStore.getState().updateStatsKey()
        const { cachedStatsKey, cachedStatsToken } = useStatsStore.getState()
        if (!cachedStatsKey || !cachedStatsToken) return

        try {
          await fetch(`${STATS_API_BASE}/${cachedStatsKey}/library-snapshots`, {
            method: 'DELETE',
            headers: { 'X-Stats-Token': cachedStatsToken },
          })
        } catch {
          // Silently fail
        }
      },
    }),
    { name: 'librarySnapshotStore' }
  )
)
