import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  fetchDiscogsIdentity,
  fetchDiscogsCollection,
  fetchDiscogsReleaseDetail,
  type DiscogsRelease,
  type DiscogsReleaseDetail,
} from '../api/discogs'
import { useSettingsStore } from './settingsStore'
import { logger } from '../utils/logger'

export type CollectionSortMode = 'artist' | 'album' | 'year' | 'format'
export type CollectionViewMode = 'grid' | 'coverflow'

interface CollectionState {
  releases: DiscogsRelease[]
  isLoading: boolean
  error: string | null
  username: string | null
  loadingProgress: { page: number; totalPages: number } | null
  releaseDetailCache: Record<number, DiscogsReleaseDetail>
  formats: string[]
  sortMode: CollectionSortMode
  viewMode: CollectionViewMode

  fetchCollection: () => Promise<void>
  fetchReleaseDetail: (releaseId: number) => Promise<DiscogsReleaseDetail | null>
  clearCollection: () => void
  setSortMode: (mode: CollectionSortMode) => void
  setViewMode: (mode: CollectionViewMode) => void
}

export const useCollectionStore = create<CollectionState>()(persist((set, get) => ({
  releases: [],
  isLoading: false,
  error: null,
  username: null,
  loadingProgress: null,
  releaseDetailCache: {},
  formats: [],
  sortMode: 'artist',
  viewMode: 'grid',

  fetchCollection: async () => {
    const { discogsToken } = useSettingsStore.getState()
    if (!discogsToken) {
      set({ error: 'No Discogs token configured' })
      return
    }

    set({ isLoading: true, error: null, loadingProgress: null })

    try {
      // Derive username from token if we don't have it yet
      let { username } = get()
      if (!username) {
        username = await fetchDiscogsIdentity(discogsToken)
        set({ username })
      }

      const releases = await fetchDiscogsCollection(discogsToken, username, (page, totalPages) => {
        set({ loadingProgress: { page, totalPages } })
      })

      // Derive unique format names
      const formatSet = new Set<string>()
      for (const release of releases) {
        for (const format of release.basic_information.formats) {
          formatSet.add(format.name)
        }
      }

      set({
        releases,
        formats: Array.from(formatSet).sort(),
        isLoading: false,
        loadingProgress: null,
      })
      logger.log(`[Collection] Loaded ${releases.length} releases`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch collection'
      set({ error: message, isLoading: false, loadingProgress: null })
      logger.error(`[Collection] Error:`, message)
    }
  },

  fetchReleaseDetail: async (releaseId) => {
    const { releaseDetailCache } = get()
    if (releaseDetailCache[releaseId]) {
      return releaseDetailCache[releaseId]
    }

    const { discogsToken } = useSettingsStore.getState()
    if (!discogsToken) return null

    try {
      const detail = await fetchDiscogsReleaseDetail(discogsToken, releaseId)
      set({
        releaseDetailCache: { ...get().releaseDetailCache, [releaseId]: detail },
      })
      return detail
    } catch (err) {
      logger.error(`[Collection] Failed to fetch release ${releaseId}:`, err)
      return null
    }
  },

  clearCollection: () => {
    set({
      releases: [],
      isLoading: false,
      error: null,
      username: null,
      loadingProgress: null,
      releaseDetailCache: {},
      formats: [],
    })
  },

  setSortMode: (mode) => set({ sortMode: mode }),
  setViewMode: (mode) => set({ viewMode: mode }),
}), {
  name: 'collection-store',
  partialize: (state) => ({
    sortMode: state.sortMode,
    viewMode: state.viewMode,
  }),
}))
