import type { StorageValue } from 'zustand/middleware'
import { logger } from './logger'

// ============================================================================
// IndexedDB Storage Adapter Factory
// ============================================================================

/**
 * Creates a Zustand-compatible IndexedDB storage adapter.
 * Each call produces an isolated adapter with its own singleton connection.
 *
 * @param dbName - The IndexedDB database name (must be unique per store)
 */
export function createIndexedDBStorage<T>(dbName: string) {
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
      const db = await getDB()
      return new Promise((resolve, reject) => {
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






