import { create } from 'zustand'
import { jellyfinClient } from '../api/jellyfin'
import { useMusicStore, whenMusicStoreHydrated } from './musicStore'
import { logger } from '../utils/logger'

/**
 * Keeps the search catalog (every artist, album and playlist) loaded. The
 * catalog lives in the music store and is saved with the songs by each
 * library sync, so search normally needs no request. This covers what a sync
 * doesn't:
 * - no saved catalog (synced before the catalog was part of the sync, or its
 *   fetch failed): fetched in full once
 * - playlists, which no sync tracks (edited on other devices): refreshed once
 *   per session, after a playlist is created/renamed/deleted, and when older
 *   than PLAYLISTS_MAX_AGE_MS
 */
interface SearchCatalogState {
  /** The last full load failed (offline, server down), so search shouldn't wait for it */
  failed: boolean
}

const PLAYLISTS_MAX_AGE_MS = 5 * 60_000

export const useSearchCatalogStore = create<SearchCatalogState>()(() => ({
  failed: false,
}))

let inflight: Promise<void> | null = null
/** When the last playlist fetch started; 0 until one this session */
let playlistsFetchedAt = 0
/** When a playlist was last edited in this app */
let playlistsChangedAt = 0

function playlistsStale(): boolean {
  return playlistsFetchedAt <= playlistsChangedAt || Date.now() - playlistsFetchedAt >= PLAYLISTS_MAX_AGE_MS
}

async function load(): Promise<void> {
  // Writing before the saved catalog has loaded would overwrite it
  await whenMusicStoreHydrated()
  const { searchCatalog, setSearchCatalog } = useMusicStore.getState()
  if (searchCatalog === null) {
    playlistsFetchedAt = Date.now()
    setSearchCatalog(await jellyfinClient.fetchSearchCatalog())
    useSearchCatalogStore.setState({ failed: false })
  } else if (playlistsStale()) {
    playlistsFetchedAt = Date.now()
    const playlists = await jellyfinClient.fetchSearchPlaylists()
    // Re-read: a sync may have saved a new catalog meanwhile. Artists and
    // albums keep their arrays, so their search index isn't rebuilt.
    const current = useMusicStore.getState().searchCatalog
    if (current) setSearchCatalog({ ...current, playlists })
  }
}

/** Loads whatever part of the catalog is missing or stale; a no-op otherwise. */
export function loadSearchCatalog(): Promise<void> {
  if (inflight) return inflight
  inflight = load()
    .catch((error) => {
      logger.warn('[searchCatalog] Failed to load', error)
      if (useMusicStore.getState().searchCatalog === null) {
        useSearchCatalogStore.setState({ failed: true })
      } else {
        // Retry the playlists on the next search instead of after the max age
        playlistsFetchedAt = 0
      }
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

if (typeof window !== 'undefined') {
  window.addEventListener('playlistUpdated', () => {
    playlistsChangedAt = Date.now()
    // Wait out a fetch already running: it may have started before the edit
    void (inflight ?? Promise.resolve()).then(loadSearchCatalog)
  })
}
