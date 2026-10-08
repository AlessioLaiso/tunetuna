import { create } from 'zustand'
import type { BaseItemDto } from '../api/types'
import { jellyfinClient } from '../api/jellyfin'
import { useMusicStore } from './musicStore'
import { logger } from '../utils/logger'

/**
 * Artists, albums and playlists for local search. Songs come from the music
 * store's synced cache; these come from one fetch per session, since the
 * music store only holds the page of artists/albums currently on screen.
 *
 * Kept in memory only. Refreshed after a library sync, after a playlist is
 * created/renamed/deleted, and when older than CATALOG_MAX_AGE_MS. A refresh
 * keeps the previous lists visible until the new ones arrive.
 */
interface SearchCatalogState {
  artists: BaseItemDto[]
  albums: BaseItemDto[]
  playlists: BaseItemDto[]
  /** When the lists were last loaded; null until the first load succeeds */
  loadedAt: number | null
  loading: boolean
  /** The last load failed (offline, server down) */
  failed: boolean
}

/** Picks up playlists edited on other devices, which no sync tracks */
const CATALOG_MAX_AGE_MS = 5 * 60_000

export const useSearchCatalogStore = create<SearchCatalogState>()(() => ({
  artists: [],
  albums: [],
  playlists: [],
  loadedAt: null,
  loading: false,
  failed: false,
}))

let inflight: Promise<void> | null = null

/**
 * Loads the catalog unless a fresh copy is already loaded or loading.
 * `force` reloads even a fresh copy (after a sync or playlist edit).
 */
export function loadSearchCatalog({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (inflight) return inflight
  const { loadedAt } = useSearchCatalogStore.getState()
  if (!force && loadedAt !== null && Date.now() - loadedAt < CATALOG_MAX_AGE_MS) {
    return Promise.resolve()
  }

  useSearchCatalogStore.setState({ loading: true })
  inflight = jellyfinClient.fetchSearchCatalog()
    .then(({ artists, albums, playlists }) => {
      useSearchCatalogStore.setState({ artists, albums, playlists, loadedAt: Date.now(), loading: false, failed: false })
    })
    .catch((error) => {
      logger.warn('[searchCatalog] Failed to load', error)
      useSearchCatalogStore.setState({ loading: false, failed: true })
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** Reload only if something was loaded before; otherwise the next search loads it. */
function refreshIfLoaded() {
  if (useSearchCatalogStore.getState().loadedAt !== null) {
    void loadSearchCatalog({ force: true })
  }
}

// A sync can add or remove artists and albums
useMusicStore.subscribe((state, prev) => {
  if (state.lastSyncCompleted !== prev.lastSyncCompleted) refreshIfLoaded()
})

if (typeof window !== 'undefined') {
  window.addEventListener('playlistUpdated', refreshIfLoaded)
}
