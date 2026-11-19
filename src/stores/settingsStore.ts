import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { STORE_KEYS } from '../utils/constants'
import { ARTWORK_ACCENT, DEFAULT_THEME, THEME_ACCENT, getTheme } from '../utils/themes'

interface PageVisibility {
  artists: boolean
  albums: boolean
  songs: boolean
  genres: boolean
  playlists: boolean
  collection: boolean
  stats: boolean
}

// Defined with the themes, which need them too; re-exported for existing imports
export { ARTWORK_ACCENT, THEME_ACCENT }

interface SettingsState {
  serverUrl: string
  setServerUrl: (url: string) => void
  pageVisibility: PageVisibility
  setPageVisibility: (visibility: Partial<PageVisibility>) => void
  /** Color theme id (see utils/themes.ts) */
  theme: string
  /** Switches theme and takes on its default accent; another variant of the same family keeps the accent */
  setTheme: (theme: string) => void
  /** The custom theme's colors as the user typed them (see parseCustomColors in utils/themes.ts) */
  customThemeColors: string
  setCustomThemeColors: (colors: string) => void
  accentColor: string
  setAccentColor: (color: string) => void
  /** Preset used by the artwork accent when the art has no color; the one picked before it */
  artworkAccentFallback: string
  /** Whether to show blurred album art behind the app instead of black */
  blurredBackground: boolean
  setBlurredBackground: (enabled: boolean) => void
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
  /** Whether to show the Mood Cards section on home page */
  showMoodCards: boolean
  setShowMoodCards: (show: boolean) => void
  /** Whether to show the Recently Played section on home page */
  showRecentlyPlayed: boolean
  setShowRecentlyPlayed: (show: boolean) => void
  /** Muspy RSS feed URL for new releases */
  muspyRssUrl: string
  setMuspyRssUrl: (url: string) => void
  /** Optional local/LAN server URL for auto-switching */
  localServerUrl: string
  setLocalServerUrl: (url: string) => void
  /** Discogs personal access token */
  discogsToken: string
  setDiscogsToken: (token: string) => void
  /** Genres to exclude from shuffle all, smart mixes, and mood cards */
  excludedGenres: string[]
  setExcludedGenres: (genres: string[]) => void
  /** Library stats view mode: true = total time, false = songs */
  libraryStatsTimeMode: boolean
  setLibraryStatsTimeMode: (enabled: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  devtools(persist(
    (set) => ({
      serverUrl: '',
      setServerUrl: (url) => set({ serverUrl: url }),
      pageVisibility: {
        artists: true,
        albums: true,
        songs: true,
        genres: true,
        playlists: true,
        collection: false,
        stats: true,
      },
      setPageVisibility: (visibility) =>
        set((state) => ({
          pageVisibility: { ...state.pageVisibility, ...visibility },
        })),
      theme: DEFAULT_THEME,
      setTheme: (theme) =>
        set((state) => {
          // Another variant of the same family (e.g. Catppuccin flavor) keeps the accent: its named
          // accents resolve to the new variant's colors
          const next = getTheme(theme, state.customThemeColors)
          if (next.family && getTheme(state.theme, state.customThemeColors).family === next.family) return { theme }
          // A new theme starts from its own best-known accent (the default theme: blue), not the
          // previous selection
          const accent = next.accent ? THEME_ACCENT : 'blue'
          return { theme, accentColor: accent, artworkAccentFallback: accent }
        }),
      customThemeColors: '',
      setCustomThemeColors: (colors) => set({ customThemeColors: colors }),
      accentColor: 'blue',
      setAccentColor: (color) =>
        set((state) => ({
          accentColor: color,
          artworkAccentFallback:
            color === ARTWORK_ACCENT && state.accentColor !== ARTWORK_ACCENT
              ? state.accentColor
              : state.artworkAccentFallback,
        })),
      artworkAccentFallback: 'blue',
      blurredBackground: false,
      setBlurredBackground: (enabled) => set({ blurredBackground: enabled }),
      showQueueRecommendations: true,
      setShowQueueRecommendations: (enabled) => set({ showQueueRecommendations: enabled }),
      recommendationsQuality: 'good',
      setRecommendationsQuality: (quality) => set({ recommendationsQuality: quality }),
      statsTrackingEnabled: true,
      setStatsTrackingEnabled: (enabled) => set({ statsTrackingEnabled: enabled }),
      feedCountry: 'gb',
      setFeedCountry: (country) => set({ feedCountry: country }),
      showMoodCards: true,
      setShowMoodCards: (show) => set({ showMoodCards: show }),
      showTop10: true,
      setShowTop10: (show) => set({ showTop10: show }),
      showNewReleases: false,
      setShowNewReleases: (show) => set({ showNewReleases: show }),
      showRecentlyPlayed: true,
      setShowRecentlyPlayed: (show) => set({ showRecentlyPlayed: show }),
      muspyRssUrl: '',
      setMuspyRssUrl: (url) => set({ muspyRssUrl: url }),
      localServerUrl: '',
      setLocalServerUrl: (url) => set({ localServerUrl: url }),
      discogsToken: '',
      setDiscogsToken: (token) => set({ discogsToken: token }),
      excludedGenres: [],
      setExcludedGenres: (genres) => set({ excludedGenres: genres }),
      libraryStatsTimeMode: true,
      setLibraryStatsTimeMode: (enabled) => set({ libraryStatsTimeMode: enabled }),
    }),
    {
      name: STORE_KEYS.settings,
    }
  ), { name: 'settingsStore' })
)






