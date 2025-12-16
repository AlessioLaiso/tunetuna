import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LightweightSong } from '../api/types'

// Custom IndexedDB storage adapter for larger data capacity
const indexedDBStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const request = indexedDB.open('tunetuna-storage', 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('zustand')
      }
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction(['zustand'], 'readonly')
        const store = transaction.objectStore('zustand')
        const getRequest = store.get(name)
        getRequest.onsuccess = () => {
          resolve(getRequest.result || null)
        }
        getRequest.onerror = () => {
          resolve(null)
        }
      }
      request.onerror = () => {
        resolve(null)
      }
    })
  },
  setItem: async (name: string, value: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('tunetuna-storage', 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('zustand')
      }
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction(['zustand'], 'readwrite')
        const store = transaction.objectStore('zustand')
        const setRequest = store.put(value, name)
        setRequest.onsuccess = () => {
          resolve()
        }
        setRequest.onerror = () => {
          reject(setRequest.error)
        }
      }
      request.onerror = () => {
        reject(request.error)
      }
    })
  },
  removeItem: async (name: string): Promise<void> => {
    return new Promise((resolve) => {
      const request = indexedDB.open('tunetuna-storage', 1)
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction(['zustand'], 'readwrite')
        const store = transaction.objectStore('zustand')
        const deleteRequest = store.delete(name)
        deleteRequest.onsuccess = () => {
          resolve()
        }
        deleteRequest.onerror = () => {
          resolve() // Don't throw on remove errors
        }
      }
      request.onerror = () => {
        resolve()
      }
    })
  },
}
import type { BaseItemDto, SortOrder } from '../api/types'

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




