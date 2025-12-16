import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BaseItemDto, SortOrder } from '../api/types'

interface MusicState {
  artists: BaseItemDto[]
  albums: BaseItemDto[]
  songs: BaseItemDto[]
  genres: BaseItemDto[]
  genresLastUpdated: number | null
  genresLastChecked: number | null
  genreSongs: Record<string, BaseItemDto[]>
  years: number[]
  yearsLastUpdated: number | null
  yearsLastChecked: number | null
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
  setSongs: (songs: BaseItemDto[]) => void
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
      setSongs: (songs) => set({ songs }),
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
    }),
    {
      name: 'music-storage',
      partialize: (state) => ({
        // Persist genres and related timestamps for caching across page refreshes
        genres: state.genres,
        genresLastUpdated: state.genresLastUpdated,
        genresLastChecked: state.genresLastChecked,
        genreSongs: state.genreSongs,
        // Persist years for filter caching
        years: state.years,
        yearsLastUpdated: state.yearsLastUpdated,
        yearsLastChecked: state.yearsLastChecked,
        // Persist recently played for client-side tracking
        recentlyPlayed: state.recentlyPlayed,
      }),
    }
  )
)




