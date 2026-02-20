import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LightweightSong, BaseItemDto, SortOrder, GroupingCategory } from '../api/types'
import type { AppleMusicSong, NewRelease } from '../api/feed'
import { createIndexedDBStorage } from '../utils/storage'
import { parseGroupingTag } from '../utils/formatting'
import { shuffleArray } from '../utils/array'
import { buildFeaturedArtistMap, type FeaturedArtistResult } from '../utils/featuredArtists'

const indexedDBStorage = createIndexedDBStorage<MusicState>('tunetuna-storage')

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
  /** Recently played tracks for continuity */
  recentlyPlayed: BaseItemDto[]
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
    recentlyPlayed: boolean
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

  // Actions
  setArtists: (artists: BaseItemDto[]) => void
  setAlbums: (albums: BaseItemDto[]) => void
  setGenres: (genres: BaseItemDto[]) => void
  setGenreSongs: (genreId: string, songs: BaseItemDto[]) => void
  clearGenreSongs: () => void
  clearGenreSongsForGenre: (genreId: string) => void
  setYears: (years: number[]) => void
  setRecentlyAdded: (items: BaseItemDto[]) => void
  setRecentlyPlayed: (items: BaseItemDto[]) => void
  addToRecentlyPlayed: (track: BaseItemDto) => void
  setLoading: (key: keyof MusicState['loading'], value: boolean) => void
  setSortPreference: (type: 'artists' | 'albums' | 'songs' | 'playlists', order: SortOrder) => void
  setSongs: (songs: LightweightSong[]) => void
  setLastSyncCompleted: (timestamp: number) => void
  refreshShufflePool: () => void
  setFeedTopSongs: (songs: AppleMusicSong[]) => void
  setFeedNewReleases: (releases: NewRelease[]) => void
  setFeedLastUpdated: (timestamp: number) => void
  recordMoodAccess: (moodValue: string) => void
}

// ============================================================================
// Store Definition
// ============================================================================

// ============================================================================
// Grouping Categories Helper
// ============================================================================

/**
 * Capitalizes the first letter of a string.
 */
function capitalizeFirst(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

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
      if (!parsed) return

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
  persist(
    (set) => ({
      // Initial state
      artists: [],
      albums: [],
      songs: [],
      genres: [],
      genresLastUpdated: null,
      genresLastChecked: null,
      genreSongs: {},
      years: [],
      yearsLastUpdated: null,
      yearsLastChecked: null,
      lastSyncCompleted: null,
      recentlyAdded: [],
      recentlyPlayed: [],
      shufflePool: [],
      lastPoolUpdate: null,
      loading: {
        artists: false,
        albums: false,
        songs: false,
        genres: false,
        recentlyAdded: false,
        recentlyPlayed: false,
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
      setRecentlyPlayed: (items) => set({ recentlyPlayed: items }),

      /**
       * Adds a track to recently played list.
       * Deduplicates and keeps only the 10 most recent.
       */
      addToRecentlyPlayed: (track) => set((state) => {
        const filtered = state.recentlyPlayed.filter(item => item.Id !== track.Id)
        const updated = [track, ...filtered].slice(0, 10)
        return { recentlyPlayed: updated }
      }),

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
        let availableSongs = state.songs
        const totalGenreSongs = Object.values(state.genreSongs).flat().length
        if (state.songs.length === 0 && totalGenreSongs > 0) {
          availableSongs = Object.values(state.genreSongs).flat()
        }

        if (availableSongs.length === 0) {
          return { shufflePool: [] }
        }

        // Exclude recently played songs (last 10) to avoid repetition
        const recentlyPlayedIds = new Set(state.recentlyPlayed.slice(0, 10).map(song => song.Id))
        availableSongs = availableSongs.filter(song => !recentlyPlayedIds.has(song.Id))

        // If we don't have enough songs after exclusion, include some recent ones
        let poolSongs = availableSongs
        if (poolSongs.length < poolSize) {
          const recentToInclude = state.recentlyPlayed.slice(0, poolSize - poolSongs.length)
          poolSongs = [...poolSongs, ...recentToInclude.map(rp =>
            state.songs.find(s => s.Id === rp.Id)
          ).filter(Boolean)]
        }

        const newPool = shuffleArray(poolSongs).slice(0, poolSize)

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
    }),
    {
      name: 'music-storage',
      storage: indexedDBStorage,
      /**
       * Selective persistence - only persist cache data, not transient UI state.
       * Excludes: artists, albums, loading states (fetched fresh each session)
       * Includes: songs, genres, timestamps (expensive to refetch)
       */
      partialize: (state) => ({
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
        recentlyPlayed: state.recentlyPlayed,
        recentlyAccessedMoods: state.recentlyAccessedMoods,
        feedTopSongs: state.feedTopSongs,
        feedNewReleases: state.feedNewReleases,
        feedLastUpdated: state.feedLastUpdated,
      }),
    }
  )
)


