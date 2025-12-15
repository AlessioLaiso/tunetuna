import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PageVisibility {
  artists: boolean
  albums: boolean
  songs: boolean
  genres: boolean
  playlists: boolean
}

interface SettingsState {
  serverUrl: string
  setServerUrl: (url: string) => void
  pageVisibility: PageVisibility
  setPageVisibility: (visibility: Partial<PageVisibility>) => void
  accentColor: string
  setAccentColor: (color: string) => void
  enableQueueRecommendations: boolean
  setEnableQueueRecommendations: (enabled: boolean) => void
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
        playlists: true,
      },
      setPageVisibility: (visibility) =>
        set((state) => ({
          pageVisibility: { ...state.pageVisibility, ...visibility },
        })),
      accentColor: 'blue',
      setAccentColor: (color) => set({ accentColor: color }),
      enableQueueRecommendations: true,
      setEnableQueueRecommendations: (enabled) => set({ enableQueueRecommendations: enabled }),
    }),
    {
      name: 'settings-storage',
    }
  )
)






