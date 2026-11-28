import { createJSONStorage, type PersistStorage, type StorageValue } from 'zustand/middleware'
import { shallow } from 'zustand/shallow'
import { logger } from './logger'

// ============================================================================
// Write skipping
// ============================================================================

/**
 * Zustand's persist middleware writes after every set(), even when only transient fields changed
 * (e.g. the playback position, a few times a second), serializing the whole persisted state each
 * time. This skips the write when every persisted field is the same object as last written.
 * Relies on the stores updating immutably, which they all do.
 */
export function skipUnchangedWrites<T>(storage: PersistStorage<T>): PersistStorage<T>
export function skipUnchangedWrites<T>(storage: PersistStorage<T> | undefined): PersistStorage<T> | undefined
export function skipUnchangedWrites<T>(storage: PersistStorage<T> | undefined): PersistStorage<T> | undefined {
  if (!storage) return undefined
  const lastWritten = new Map<string, StorageValue<T>>()
  return {
    getItem: (name) => storage.getItem(name),
    setItem: (name, value) => {
      const last = lastWritten.get(name)
      if (last && last.version === value.version && shallow(last.state, value.state)) return
      lastWritten.set(name, value)
      return storage.setItem(name, value)
    },
    removeItem: (name) => {
      lastWritten.delete(name)
      return storage.removeItem(name)
    },
  }
}

/** localStorage for a persisted store (zustand's default), skipping unchanged writes */
export function createLocalStorage<T>() {
  return skipUnchangedWrites(createJSONStorage<T>(() => localStorage))
}

// ============================================================================
// IndexedDB Storage Adapter Factory
// ============================================================================

/**
 * Creates a Zustand-compatible IndexedDB storage adapter.
 * Each call produces an isolated adapter with its own singleton connection.
 *
 * @param dbName - The IndexedDB database name (must be unique per store)
 */
export function createIndexedDBStorage<T>(dbName: string): PersistStorage<T> {
  return skipUnchangedWrites(createIndexedDBAdapter<T>(dbName))
}

function createIndexedDBAdapter<T>(dbName: string): PersistStorage<T> {
  let dbInstance: IDBDatabase | null = null
  let dbPromise: Promise<IDBDatabase> | null = null

  function getDB(): Promise<IDBDatabase> {
    if (dbInstance) return Promise.resolve(dbInstance)
    if (dbPromise) return dbPromise

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('zustand')) {
          db.createObjectStore('zustand')
        }
      }

      request.onsuccess = () => {
        dbInstance = request.result
        dbInstance.onclose = () => {
          dbInstance = null
          dbPromise = null
        }
        resolve(dbInstance)
      }

      request.onerror = () => {
        dbPromise = null
        reject(request.error)
      }
    })

    return dbPromise
  }

  return {
    getItem: async (name: string): Promise<StorageValue<T> | null> => {
      try {
        const db = await getDB()
        return new Promise((resolve) => {
          const transaction = db.transaction(['zustand'], 'readonly')
          const store = transaction.objectStore('zustand')
          const getRequest = store.get(name)
          getRequest.onsuccess = () => {
            const result = getRequest.result
            if (result) {
              resolve(JSON.parse(result))
            } else {
              resolve(null)
            }
          }
          getRequest.onerror = () => {
            resolve(null)
          }
        })
      } catch {
        return null
      }
    },
    setItem: async (name: string, value: StorageValue<T>): Promise<void> => {
      try {
        const db = await getDB()
        return await new Promise((resolve, reject) => {
          const transaction = db.transaction(['zustand'], 'readwrite')
          const store = transaction.objectStore('zustand')
          const setRequest = store.put(JSON.stringify(value), name)
          setRequest.onsuccess = () => {
            resolve()
          }
          setRequest.onerror = () => {
            reject(setRequest.error)
          }
        })
      } catch (error) {
        logger.error(`IndexedDB write failed for ${dbName}/${name}:`, error)
        // Import dynamically to avoid circular dependency
        const { useToastStore } = await import('../stores/toastStore')
        useToastStore.getState().addToast('Storage full — some data may not be saved', 'error', 5000)
      }
    },
    removeItem: async (name: string): Promise<void> => {
      try {
        const db = await getDB()
        return new Promise((resolve) => {
          const transaction = db.transaction(['zustand'], 'readwrite')
          const store = transaction.objectStore('zustand')
          const deleteRequest = store.delete(name)
          deleteRequest.onsuccess = () => {
            resolve()
          }
          deleteRequest.onerror = () => {
            resolve()
          }
        })
      } catch {
        // Silently fail on remove errors
      }
    },
  }
}

// ============================================================================
// localStorage Helper
// ============================================================================

export const storage = {
  get<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : null
    } catch {
      return null
    }
  },

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      logger.error('Failed to save to localStorage:', error)
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      logger.error('Failed to remove from localStorage:', error)
    }
  },

  clear(): void {
    try {
      localStorage.clear()
    } catch (error) {
      logger.error('Failed to clear localStorage:', error)
    }
  },
}






