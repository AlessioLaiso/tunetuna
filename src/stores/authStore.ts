import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { jellyfinClient } from '../api/jellyfin'
import { clearPlaybackTrackingState } from './playerStore'
import { clearArtistImageCache } from '../utils/artistImageCache'
import { resolveServerUrl } from '../utils/serverUrl'
import { useSettingsStore } from './settingsStore'
import { getLockedLocalServerUrl } from '../utils/config'

interface AuthState {
  serverUrl: string
  serverId: string
  username: string
  accessToken: string
  userId: string
  isAuthenticated: boolean
  login: (serverUrl: string, username: string, password: string) => Promise<void>
  logout: () => void
  setCredentials: (serverUrl: string, accessToken: string, userId: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      serverUrl: '',
      serverId: '',
      username: '',
      accessToken: '',
      userId: '',
      isAuthenticated: false,

      login: async (serverUrl: string, username: string, password: string) => {
        try {
          const response = await jellyfinClient.authenticate(serverUrl, username, password)
          set({
            serverUrl,
            serverId: response.ServerId ?? '',
            username,
            accessToken: response.AccessToken,
            userId: response.User.Id,
            isAuthenticated: true,
          })
          jellyfinClient.setCredentials(serverUrl, response.AccessToken, response.User.Id)
        } catch (error) {
          throw error
        }
      },

      logout: () => {
        // Clear playback tracking state to prevent memory leaks
        clearPlaybackTrackingState()

        // Clear in-memory caches
        clearArtistImageCache()

        // Clear all persisted stores to prevent data leaking between users
        // localStorage stores: player-storage, settings-storage
        localStorage.removeItem('player-storage')
        localStorage.removeItem('settings-storage')

        // IndexedDB stores: tunetuna-storage (music), tunetuna-stats-storage (stats)
        indexedDB.deleteDatabase('tunetuna-storage')
        indexedDB.deleteDatabase('tunetuna-stats-storage')

        // Reset auth state and remove auth storage last
        set({
          serverUrl: '',
          serverId: '',
          username: '',
          accessToken: '',
          userId: '',
          isAuthenticated: false,
        })
        localStorage.removeItem('auth-storage')
      },

      setCredentials: (serverUrl: string, accessToken: string, userId: string) => {
        set({
          serverUrl,
          accessToken,
          userId,
          isAuthenticated: true,
        })
        jellyfinClient.setCredentials(serverUrl, accessToken, userId)
      },
    }),
    {
      name: 'auth-storage',
      onRehydrateStorage: () => (state) => {
        if (state?.isAuthenticated && state.serverUrl && state.accessToken && state.userId) {
          // Set credentials immediately with the remote URL so the app is usable right away
          jellyfinClient.setCredentials(state.serverUrl, state.accessToken, state.userId)

          // Then probe local URL in the background and switch if reachable
          const localUrl = getLockedLocalServerUrl() || useSettingsStore.getState().localServerUrl
          if (localUrl) {
            resolveServerUrl(state.serverUrl, localUrl).then((resolved) => {
              if (resolved !== state.serverUrl) {
                jellyfinClient.setCredentials(resolved, state.accessToken, state.userId)
              }
            })
          }
        }
      },
    }
  )
)

