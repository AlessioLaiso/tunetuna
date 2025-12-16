import { create } from 'zustand'

type SyncState = 'idle' | 'syncing' | 'success' | 'error'
type SyncSource = 'settings' | 'context-menu' | null

interface SyncStore {
  state: SyncState
  source: SyncSource
  message: string | null
  abortController: AbortController | null

  startSync: (source: SyncSource, message?: string) => void
  completeSync: (success: boolean, message?: string) => void
  cancelSync: () => void
  reset: () => void
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  state: 'idle',
  source: null,
  message: null,
  abortController: null,

  startSync: (source, message = 'Syncing...') => {
    const abortController = new AbortController()
    set({
      state: 'syncing',
      source,
      message,
      abortController
    })
  },

  completeSync: (success, message) => {
    const newState: SyncState = success ? 'success' : 'error'
    const defaultMessage = success ? 'Sync complete' : 'Sync failed'

    set({
      state: newState,
      message: message || defaultMessage,
      abortController: null
    })

    // Auto-hide after 3 seconds
    setTimeout(() => {
      get().reset()
    }, 3000)
  },

  cancelSync: () => {
    const { abortController } = get()
    if (abortController) {
      abortController.abort()
    }
    set({
      state: 'idle',
      source: null,
      message: null,
      abortController: null
    })
  },

  reset: () => {
    set({
      state: 'idle',
      source: null,
      message: null,
      abortController: null
    })
  }
}))
