import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { jellyfinClient } from '../api/jellyfin'
import { storage } from '../utils/storage'

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
      // #region agent log
      // #endregion
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
        set({
          serverUrl: '',
          username: '',
          accessToken: '',
          userId: '',
          isAuthenticated: false,
        })
        storage.remove('auth-storage')
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
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/db317f2b-adc3-4aff-b0fa-c76ea1078e11',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'authStore.ts:66',message:'AuthStore rehydrated from localStorage',data:{rehydratedState:state,localStorageData:localStorage.getItem('auth-storage')},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
      },
      onRehydrateStorage: () => (state) => {
        if (state?.isAuthenticated && state.serverUrl && state.accessToken && state.userId) {
          jellyfinClient.setCredentials(state.serverUrl, state.accessToken, state.userId)
        }
      },
    }
  )
)

