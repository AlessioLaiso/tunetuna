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
  /** Country code for Apple Music charts (e.g., 'gb', 'us') */
  feedCountry: string
  setFeedCountry: (country: string) => void
  /** Whether to show the Top 10 section on home page */
  showTop10: boolean
  setShowTop10: (show: boolean) => void
  /** Whether to show the New Releases section on home page */
  showNewReleases: boolean
  setShowNewReleases: (show: boolean) => void
  /** Whether to show the Recently Played section on home page */
  showRecentlyPlayed: boolean
  setShowRecentlyPlayed: (show: boolean) => void
  /** Muspy RSS feed URL for new releases */
  muspyRssUrl: string
  setMuspyRssUrl: (url: string) => void
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
      feedCountry: 'gb',
      setFeedCountry: (country) => set({ feedCountry: country }),
      showTop10: true,
      setShowTop10: (show) => set({ showTop10: show }),
      showNewReleases: false,
      setShowNewReleases: (show) => set({ showNewReleases: show }),
      showRecentlyPlayed: true,
      setShowRecentlyPlayed: (show) => set({ showRecentlyPlayed: show }),
      muspyRssUrl: '',
      setMuspyRssUrl: (url) => set({ muspyRssUrl: url }),
    }),
    {
      name: 'settings-storage',
    }
  )
)






