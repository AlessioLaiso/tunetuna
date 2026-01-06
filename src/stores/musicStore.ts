import { create } from 'zustand'
import { persist, type StorageValue } from 'zustand/middleware'
import type { LightweightSong, BaseItemDto, SortOrder } from '../api/types'

// Singleton IndexedDB connection to prevent race conditions
let dbInstance: IDBDatabase | null = null
let dbPromise: Promise<IDBDatabase> | null = null

function getDB(): Promise<IDBDatabase> {
  // Return existing connection if available
  if (dbInstance) {
    return Promise.resolve(dbInstance)
  }

  // Return pending connection if one is being established
  if (dbPromise) {
    return dbPromise
  }

  // Create new connection
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('tunetuna-storage', 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('zustand')) {
        db.createObjectStore('zustand')
      }
    }

    request.onsuccess = () => {
      dbInstance = request.result

      // Handle connection close (e.g., browser closing DB)
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

// Custom IndexedDB storage adapter for larger data capacity
const indexedDBStorage = {
  getItem: async (name: string): Promise<StorageValue<MusicState> | null> => {
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
  setItem: async (name: string, value: StorageValue<MusicState>): Promise<void> => {
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
          resolve() // Don't throw on remove errors
        }
      })
    } catch {
      // Silently fail on remove errors
    }
  },
}

interface MusicState {
  artists: BaseItemDto[]
  albums: BaseItemDto[]
  songs: LightweightSong[]
  genres: BaseItemDto[]
  genresLastUpdated: number | null
  genresLastChecked: number | null
  genreSongs: Record<string, LightweightSong[]>
  years: number[]
  yearsLastUpdated: number | null
  yearsLastChecked: number | null
  lastSyncCompleted: number | null
  recentlyAdded: BaseItemDto[]
  recentlyPlayed: BaseItemDto[]
  shufflePool: LightweightSong[] // Pre-shuffled songs for instant playback
  lastPoolUpdate: number | null
  loading: {
    artists: boolean
    albums: boolean
    songs: boolean
    genres: boolean
    recentlyAdded: boolean
    recentlyPlayed: boolean
  }
  sortPreferences: {
    artists: SortOrder
    albums: SortOrder
    songs: SortOrder
    playlists: SortOrder
  }
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
}

export const useMusicStore = create<MusicState>()(
  persist(
    (set) => ({
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
      },
      sortPreferences: {
        artists: 'RecentlyAdded',
        albums: 'RecentlyAdded',
        songs: 'RecentlyAdded',
        playlists: 'RecentlyAdded',
      },

      setArtists: (artists) => set({ artists }),
      setAlbums: (albums) => set({ albums }),
      setGenres: (genres) => set({ genres }),
      setGenreSongs: (genreId, songs) => set((state) => ({
        genreSongs: { ...state.genreSongs, [genreId]: songs },
      })),
      clearGenreSongs: () => set({ genreSongs: {} }),
      clearGenreSongsForGenre: (genreId) => set((state) => {
        const newGenreSongs = { ...state.genreSongs }
        delete newGenreSongs[genreId]
        return { genreSongs: newGenreSongs }
      }),
      setYears: (years) => set({ years }),
      setRecentlyAdded: (items) => set({ recentlyAdded: items }),
      setRecentlyPlayed: (items) => set({ recentlyPlayed: items }),
      addToRecentlyPlayed: (track) => set((state) => {
        // Remove the track if it already exists (to avoid duplicates)
        const filtered = state.recentlyPlayed.filter(item => item.Id !== track.Id)
        // Add the new track at the beginning and keep only the last 10
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

      refreshShufflePool: () => set((state) => {

        // Simple shuffle pool generation without external functions
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

        // Simple shuffle
        const shuffled = [...poolSongs]
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }

        const newPool = shuffled.slice(0, poolSize)


        return {
          shufflePool: newPool,
          lastPoolUpdate: Date.now()
        }
      }),
    }),
    {
      name: 'music-storage',
      storage: indexedDBStorage, // Use IndexedDB for larger capacity
      partialize: (state) => ({
        // Persist genres and related timestamps for caching across page refreshes
        genres: state.genres,
        genresLastUpdated: state.genresLastUpdated,
        genresLastChecked: state.genresLastChecked,
        genreSongs: state.genreSongs,
        songs: state.songs,
        // Persist shuffle pool for instant playback
        shufflePool: state.shufflePool,
        lastPoolUpdate: state.lastPoolUpdate,
        // Persist years for filter caching
        years: state.years,
        yearsLastUpdated: state.yearsLastUpdated,
        yearsLastChecked: state.yearsLastChecked,
        lastSyncCompleted: state.lastSyncCompleted,
        // Persist recently played for client-side tracking
        recentlyPlayed: state.recentlyPlayed,
      }),
    }
  )
)


