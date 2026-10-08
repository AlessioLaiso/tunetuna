import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { LightweightSong, BaseItemDto, SortOrder, GroupingCategory, SearchCatalog } from '../api/types'
import type { AppleMusicSong, NewRelease } from '../api/feed'
import { createIndexedDBStorage } from '../utils/storage'
import { capitalizeFirst, parseGroupingTag, RELEASE_GROUPING_CATEGORY } from '../utils/formatting'
import { STORE_KEYS, INDEXEDDB_NAMES } from '../utils/constants'
import { shuffleArray } from '../utils/array'
import { filterExcludedGenres } from '../utils/genreFilter'
import { buildFeaturedArtistMap, type FeaturedArtistResult } from '../utils/featuredArtists'
import { removeSongsById } from '../utils/syncMerge'

const indexedDBStorage = createIndexedDBStorage<MusicState>(INDEXEDDB_NAMES.music)

// ============================================================================
// Store Types
// ============================================================================

/**
 * Music store state and actions.
 *
 * This store manages:
 * - Library data: Artists, albums, songs, genres, years
 * - Cache timestamps: For smart refresh logic
 * - UI state: Loading indicators, sort preferences
 * - Playback helpers: Recently played, shuffle pool
 *
 * Persistence: Uses IndexedDB for large capacity (~50MB+).
 * Selective persistence via partialize - loading states are transient.
 */
interface MusicState {
  /** All artists in the library */
  artists: BaseItemDto[]
  /** All albums in the library */
  albums: BaseItemDto[]
  /** All songs with lightweight metadata for fast search */
  songs: LightweightSong[]
  /**
   * Every artist, album and playlist, for search (artists/albums above hold
   * only the page on screen). Saved by each library sync; null until the
   * first fetch.
   */
  searchCatalog: SearchCatalog | null
  /** All genres for filtering and recommendations */
  genres: BaseItemDto[]
  /** Timestamp when genres cache was last refreshed from server */
  genresLastUpdated: number | null
  /** Timestamp when we last checked if genres need refresh */
  genresLastChecked: number | null
  /** Map of genre ID to songs in that genre (for recommendations) */
  genreSongs: Record<string, LightweightSong[]>
  /** Available production years for filtering */
  years: number[]
  /** Timestamp when years cache was last refreshed */
  yearsLastUpdated: number | null
  /** Timestamp when we last checked if years need refresh */
  yearsLastChecked: number | null
  /** Timestamp of last full library sync */
  lastSyncCompleted: number | null
  /** Recently added items for home screen */
  recentlyAdded: BaseItemDto[]
  /** Pre-shuffled songs for instant shuffle playback */
  shufflePool: LightweightSong[]
  /** Timestamp when shuffle pool was last generated */
  lastPoolUpdate: number | null
  /** Loading states for various data fetches (transient, not persisted) */
  loading: {
    artists: boolean
    albums: boolean
    songs: boolean
    genres: boolean
    recentlyAdded: boolean
    feed: boolean
  }
  /** Top songs from Apple Music RSS */
  feedTopSongs: AppleMusicSong[]
  /** New releases from Muspy RSS */
  feedNewReleases: NewRelease[]
  /** Timestamp when feed was last updated */
  feedLastUpdated: number | null
  /** User's sort preferences per content type */
  sortPreferences: {
    artists: SortOrder
    albums: SortOrder
    songs: SortOrder
    playlists: SortOrder
  }
  /** Recently accessed moods with timestamps for ordering (synced across devices) */
  recentlyAccessedMoods: Record<string, number>
  /** Cached mix card IDs from last session for skeleton-free loading */
  cachedMixCardIds: { id: string; name: string; route: string }[]

  // Actions
  setArtists: (artists: BaseItemDto[]) => void
  setAlbums: (albums: BaseItemDto[]) => void
  setGenres: (genres: BaseItemDto[]) => void
  setGenreSongs: (genreId: string, songs: BaseItemDto[]) => void
  clearGenreSongs: () => void
  clearGenreSongsForGenre: (genreId: string) => void
  setYears: (years: number[]) => void
  setRecentlyAdded: (items: BaseItemDto[]) => void
  setLoading: (key: keyof MusicState['loading'], value: boolean) => void
  setSortPreference: (type: 'artists' | 'albums' | 'songs' | 'playlists', order: SortOrder) => void
  setSongs: (songs: LightweightSong[]) => void
  setSearchCatalog: (catalog: SearchCatalog) => void
  /** Drops songs deleted on the server from every song cache */
  removeSongs: (ids: Iterable<string>) => void
  setLastSyncCompleted: (timestamp: number) => void
  refreshShufflePool: () => void
  setFeedTopSongs: (songs: AppleMusicSong[]) => void
  setFeedNewReleases: (releases: NewRelease[]) => void
  setFeedLastUpdated: (timestamp: number) => void
  recordMoodAccess: (moodValue: string) => void
  setCachedMixCardIds: (cards: { id: string; name: string; route: string }[]) => void
}

// ============================================================================
// Store Definition
// ============================================================================

// ============================================================================
// Grouping Categories Helper
// ============================================================================


/**
 * Derives grouping categories from songs.
 * This is a computed value - call it with the current songs array.
 * Categories are extracted from the Grouping field on each song.
 */
export function getGroupingCategories(songs: LightweightSong[]): GroupingCategory[] {
  // Map: category key -> Set of values
  const categoryMap = new Map<string, Set<string>>()

  songs.forEach(song => {
    if (!song.Grouping) return
    song.Grouping.forEach(tag => {
      const parsed = parseGroupingTag(tag)
      if (!parsed || parsed.category === RELEASE_GROUPING_CATEGORY) return

      if (!categoryMap.has(parsed.category)) {
        categoryMap.set(parsed.category, new Set())
      }
      if (parsed.value) {
        categoryMap.get(parsed.category)!.add(parsed.value)
      }
    })
  })

  // Build categories array
  const categories: GroupingCategory[] = []
  for (const [key, values] of categoryMap) {
    categories.push({
      name: capitalizeFirst(key),
      key,
      values: Array.from(values).map(v => capitalizeFirst(v)).sort(),
      isSingleValue: values.size === 0
    })
  }

  // Sort categories alphabetically by name
  return categories.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Derives featured artist data from song titles (e.g. "Song (feat. X)").
 * Returns both the artistId -> songs mapping and a name -> IDs lookup
 * for resolving Jellyfin duplicate artist entries.
 */
export function getFeaturedArtistData(
  songs: LightweightSong[]
): FeaturedArtistResult {
  return buildFeaturedArtistMap(songs)
}

// ============================================================================
// Store Definition
// ============================================================================

export const useMusicStore = create<MusicState>()(
  devtools(persist(
    (set, get) => ({
      // Initial state
      artists: [],
      albums: [],
      songs: [],
      searchCatalog: null,
      genres: [],
      genresLastUpdated: null,
      genresLastChecked: null,
      genreSongs: {},
      years: [],
      yearsLastUpdated: null,
      yearsLastChecked: null,
      lastSyncCompleted: null,
      recentlyAdded: [],
      shufflePool: [],
      lastPoolUpdate: null,
      loading: {
        artists: false,
        albums: false,
        songs: false,
        genres: false,
        recentlyAdded: false,
        feed: false,
      },
      feedTopSongs: [],
      feedNewReleases: [],
      feedLastUpdated: null,
      sortPreferences: {
        artists: 'RecentlyAdded',
        albums: 'RecentlyAdded',
        songs: 'RecentlyAdded',
        playlists: 'RecentlyAdded',
      },
      recentlyAccessedMoods: {},
      cachedMixCardIds: [],

      // Simple setters
      setArtists: (artists) => set({ artists }),
      setAlbums: (albums) => set({ albums }),
      setGenres: (genres) => set({ genres }),

      /** Caches songs for a specific genre (used by recommendations) */
      setGenreSongs: (genreId, songs) => set((state) => ({
        genreSongs: { ...state.genreSongs, [genreId]: songs },
      })),

      /** Clears all genre-song mappings */
      clearGenreSongs: () => set({ genreSongs: {} }),

      /** Clears songs for a specific genre */
      clearGenreSongsForGenre: (genreId) => set((state) => {
        const newGenreSongs = { ...state.genreSongs }
        delete newGenreSongs[genreId]
        return { genreSongs: newGenreSongs }
      }),

      setYears: (years) => set({ years }),
      setRecentlyAdded: (items) => set({ recentlyAdded: items }),

      setLoading: (key, value) =>
        set((state) => ({
          loading: { ...state.loading, [key]: value },
        })),

      setSortPreference: (type, order) =>
        set((state) => ({
          sortPreferences: {
            ...state.sortPreferences,
            [type]: order,
          },
        })),

      setSongs: (songs) => set({ songs }),
      setSearchCatalog: (searchCatalog) => set({ searchCatalog }),

      /**
       * Drops deleted songs from the main cache, the genre caches and the
       * shuffle pool. Ids that aren't songs (albums, folders) are ignored.
       * Calls set only when something changed: persist writes the whole store
       * to IndexedDB on every set, even a no-op one.
       */
      removeSongs: (ids) => {
        const removed = new Set(ids)
        if (removed.size === 0) return
        const state = get()

        const update: Partial<MusicState> = {}
        const songs = removeSongsById(state.songs, removed)
        if (songs !== state.songs) update.songs = songs
        const shufflePool = removeSongsById(state.shufflePool, removed)
        if (shufflePool !== state.shufflePool) update.shufflePool = shufflePool

        let genresChanged = false
        const genreSongs: Record<string, LightweightSong[]> = {}
        for (const [genreId, list] of Object.entries(state.genreSongs)) {
          genreSongs[genreId] = removeSongsById(list, removed)
          if (genreSongs[genreId] !== list) genresChanged = true
        }
        if (genresChanged) update.genreSongs = genreSongs

        if (Object.keys(update).length > 0) set(update)
      },

      setLastSyncCompleted: (timestamp) => set({ lastSyncCompleted: timestamp }),

      /**
       * Generates a pre-shuffled pool of songs for instant shuffle playback.
       * - Uses main songs if available, falls back to genre songs
       * - Excludes recently played to avoid repetition
       * - Uses Fisher-Yates shuffle for uniform randomness
       */
      refreshShufflePool: () => set((state) => {
        const poolSize = 30

        // Use main songs if available, otherwise use genre songs
        let availableSongs = filterExcludedGenres(state.songs)
        const totalGenreSongs = Object.values(state.genreSongs).flat().length
        if (availableSongs.length === 0 && totalGenreSongs > 0) {
          availableSongs = filterExcludedGenres(Object.values(state.genreSongs).flat())
        }

        if (availableSongs.length === 0) {
          return { shufflePool: [] }
        }

        const newPool = shuffleArray(availableSongs).slice(0, poolSize)

        return {
          shufflePool: newPool,
          lastPoolUpdate: Date.now()
        }
      }),

      setFeedTopSongs: (songs) => set({ feedTopSongs: songs }),
      setFeedNewReleases: (releases) => set({ feedNewReleases: releases }),
      setFeedLastUpdated: (timestamp) => set({ feedLastUpdated: timestamp }),

      /** Records when a mood was accessed for ordering (most recent first) */
      recordMoodAccess: (moodValue) => set((state) => ({
        recentlyAccessedMoods: {
          ...state.recentlyAccessedMoods,
          [moodValue.toLowerCase()]: Date.now(),
        },
      })),

      setCachedMixCardIds: (cards) => set({ cachedMixCardIds: cards }),
    }),
    {
      name: STORE_KEYS.music,
      storage: indexedDBStorage,
      /**
       * Selective persistence - only persist cache data, not transient UI state.
       * Excludes: artists, albums, loading states (fetched fresh each session)
       * Includes: songs, search catalog, genres, timestamps (expensive to refetch)
       */
      partialize: (state) => ({
        searchCatalog: state.searchCatalog,
        genres: state.genres,
        genresLastUpdated: state.genresLastUpdated,
        genresLastChecked: state.genresLastChecked,
        genreSongs: state.genreSongs,
        songs: state.songs,
        shufflePool: state.shufflePool,
        lastPoolUpdate: state.lastPoolUpdate,
        years: state.years,
        yearsLastUpdated: state.yearsLastUpdated,
        yearsLastChecked: state.yearsLastChecked,
        lastSyncCompleted: state.lastSyncCompleted,
        recentlyAccessedMoods: state.recentlyAccessedMoods,
        feedTopSongs: state.feedTopSongs,
        feedNewReleases: state.feedNewReleases,
        feedLastUpdated: state.feedLastUpdated,
        sortPreferences: state.sortPreferences,
        cachedMixCardIds: state.cachedMixCardIds,
      }),
    }
  ), { name: 'musicStore' })
)



/**
 * Resolves once the persisted cache has been loaded from IndexedDB. Writing to
 * the store before then is unsafe: persist saves the whole store on every set,
 * so an early write would overwrite the saved song cache with the empty
 * initial state.
 */
export function whenMusicStoreHydrated(): Promise<void> {
  if (useMusicStore.persist.hasHydrated()) return Promise.resolve()
  return new Promise((resolve) => {
    const unsubscribe = useMusicStore.persist.onFinishHydration(() => {
      unsubscribe()
      resolve()
    })
  })
}
