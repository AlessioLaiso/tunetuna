import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PageVisibility {
  artists: boolean
  albums: boolean
  songs: boolean
  genres: boolean
  playlists: boolean
  stats: boolean
}

interface SettingsState {
  serverUrl: string
  setServerUrl: (url: string) => void
  pageVisibility: PageVisibility
  setPageVisibility: (visibility: Partial<PageVisibility>) => void
  accentColor: string
  setAccentColor: (color: string) => void
  showQueueRecommendations: boolean
  setShowQueueRecommendations: (enabled: boolean) => void
  recommendationsQuality: 'good' | 'degraded' | 'failed'
  setRecommendationsQuality: (quality: 'good' | 'degraded' | 'failed') => void
  /** Whether to track play statistics */
  statsTrackingEnabled: boolean
  setStatsTrackingEnabled: (enabled: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      serverUrl: '',
      setServerUrl: (url) => set({ serverUrl: url }),
      pageVisibility: {
        artists: true,
        albums: true,
        songs: true,
        genres: true,
        playlists: false,
        stats: true,
      },
      setPageVisibility: (visibility) =>
        set((state) => ({
          pageVisibility: { ...state.pageVisibility, ...visibility },
        })),
      accentColor: 'blue',
      setAccentColor: (color) => set({ accentColor: color }),
      showQueueRecommendations: true,
      setShowQueueRecommendations: (enabled) => set({ showQueueRecommendations: enabled }),
      recommendationsQuality: 'good',
      setRecommendationsQuality: (quality) => set({ recommendationsQuality: quality }),
      statsTrackingEnabled: true,
      setStatsTrackingEnabled: (enabled) => set({ statsTrackingEnabled: enabled }),
    }),
    {
      name: 'settings-storage',
    }
  )
)






