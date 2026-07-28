import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { BaseItemDto, LightweightSong } from '../api/types'
import { createIndexedDBStorage } from '../utils/storage'
import { STORE_KEYS, INDEXEDDB_NAMES } from '../utils/constants'

/**
 * Maximum number of entries retained in the recently played list.
 * The Home view shows 10; a small buffer beyond that keeps the list stable
 * without storing history indefinitely.
 */
const MAX_ENTRIES = 15

/**
 * A song that the user started playing, recorded the moment playback began
 * (independent of the stats duration threshold).
 *
 * Field shape mirrors the subset of BaseItemDto/LightweightSong needed by the
 * Home "Recently Played" UI (artwork, subtitle, navigation, queue playback).
 */
export interface RecentlyPlayedEntry {
  Id: string
  Name: string
  AlbumArtist?: string
  ArtistItems?: BaseItemDto[]
  Album?: string
  AlbumId?: string
  RunTimeTicks?: number
  Genres?: string[]
  Grouping?: string[]
  ProductionYear?: number
  /** Unix timestamp (ms) when the song started playing */
  playedAt: number
}

interface RecentlyPlayedState {
  entries: RecentlyPlayedEntry[]
  /** Records a track that just started playing (prepend + dedup, trim to cap) */
  recordPlay: (track: BaseItemDto | LightweightSong) => void
  /** Clears all entries */
  clear: () => void
}

const indexedDBStorage = createIndexedDBStorage<RecentlyPlayedState>(INDEXEDDB_NAMES.recentlyPlayed)

export const useRecentlyPlayedStore = create<RecentlyPlayedState>()(
  devtools(persist(
    (set) => ({
      entries: [],

      recordPlay: (track) => {
        if (!track?.Id) return

        const entry: RecentlyPlayedEntry = {
          Id: track.Id,
          Name: track.Name || 'Unknown',
          AlbumArtist: track.AlbumArtist,
          ArtistItems: track.ArtistItems,
          Album: track.Album,
          AlbumId: track.AlbumId,
          RunTimeTicks: track.RunTimeTicks,
          Genres: track.Genres,
          Grouping: track.Grouping,
          ProductionYear: track.ProductionYear,
          playedAt: Date.now(),
        }

        set((state) => {
          // Dedup: if the same song is already in the list, remove the old
          // entry so a replay bubbles it to the top (most-recent-first, no duplicates).
          const filtered = state.entries.filter(e => e.Id !== entry.Id)
          const next = [entry, ...filtered]
          return { entries: next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next }
        })
      },

      clear: () => set({ entries: [] }),
    }),
    {
      name: STORE_KEYS.recentlyPlayed,
      storage: indexedDBStorage,
    }
  ), { name: 'recentlyPlayedStore' })
)
