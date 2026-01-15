import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { jellyfinClient } from '../api/jellyfin'
import { storage } from '../utils/storage'
import { clearPlaybackTrackingState } from './playerStore'

interface AuthState {
  serverUrl: string
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
      username: '',
      accessToken: '',
      userId: '',
      isAuthenticated: false,

      login: async (serverUrl: string, username: string, password: string) => {
        try {
          const response = await jellyfinClient.authenticate(serverUrl, username, password)
          set({
            serverUrl,
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
        set({
          serverUrl: '',
          username: '',
          accessToken: '',
          userId: '',
          isAuthenticated: false,
        })
        sessionStorage.removeItem('auth-storage')
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
      // Use sessionStorage instead of localStorage for auth tokens
      // This limits token exposure: cleared when browser closes
      // (XSS can still steal tokens during session, but they won't persist)
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name)
          return str ? JSON.parse(str) : null
        },
        setItem: (name, value) => {
          sessionStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: (name) => {
          sessionStorage.removeItem(name)
        },
      },
      onRehydrateStorage: () => (state) => {
        if (state?.isAuthenticated && state.serverUrl && state.accessToken && state.userId) {
          jellyfinClient.setCredentials(state.serverUrl, state.accessToken, state.userId)
        }
      },
    }
  )
)

