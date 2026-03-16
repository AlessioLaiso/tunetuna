import { logger } from './logger'

const DB_NAME = 'cover-art-cache'
const STORE_NAME = 'images'

let dbInstance: IDBDatabase | null = null
let dbPromise: Promise<IDBDatabase> | null = null

function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance)
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
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

// In-memory map of release ID -> object URL (created from cached blobs)
const objectUrls = new Map<string, string>()

/**
 * Get a cached cover art object URL for a release group, or null if not cached.
 */
export function getCachedCoverArt(releaseGroupId: string): string | null {
  return objectUrls.get(releaseGroupId) ?? null
}

/**
 * Load all cached cover art blobs from IndexedDB into in-memory object URLs.
 * Call once on startup after feed data is restored from persistence.
 */
export async function loadCachedCoverArt(releaseGroupIds: string[]): Promise<void> {
  if (releaseGroupIds.length === 0) return

  try {
    const db = await getDB()
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)

    await Promise.all(
      releaseGroupIds.map(
        (id) =>
          new Promise<void>((resolve) => {
            const request = store.get(id)
            request.onsuccess = () => {
              const blob = request.result as Blob | undefined
              if (blob) {
                objectUrls.set(id, URL.createObjectURL(blob))
              }
              resolve()
            }
            request.onerror = () => resolve()
          })
      )
    )
  } catch (error) {
    logger.error('Failed to load cached cover art:', error)
  }
}

/**
 * Fetch a cover art image, cache the blob in IndexedDB, and return an object URL.
 * If already cached in memory, returns immediately.
 */
const pendingFetches = new Map<string, Promise<string | null>>()

export async function fetchAndCacheCoverArt(
  releaseGroupId: string,
  url: string
): Promise<string | null> {
  // Already in memory
  if (objectUrls.has(releaseGroupId)) {
    return objectUrls.get(releaseGroupId)!
  }

  // Deduplicate in-flight fetches
  if (pendingFetches.has(releaseGroupId)) {
    return pendingFetches.get(releaseGroupId)!
  }

  const fetchPromise = (async () => {
    try {
      const response = await fetch(url)
      if (!response.ok) return null

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      objectUrls.set(releaseGroupId, objectUrl)

      // Persist to IndexedDB in background
      try {
        const db = await getDB()
        const transaction = db.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        store.put(blob, releaseGroupId)
      } catch (error) {
        logger.error('Failed to persist cover art to IndexedDB:', error)
      }

      return objectUrl
    } catch (error) {
      logger.error('Failed to fetch cover art:', releaseGroupId, error)
      return null
    } finally {
      pendingFetches.delete(releaseGroupId)
    }
  })()

  pendingFetches.set(releaseGroupId, fetchPromise)
  return fetchPromise
}

/**
 * Remove cached entries that are no longer in the feed.
 * Call after feed data updates to clean up stale images.
 */
export async function cleanupCoverArtCache(activeReleaseGroupIds: Set<string>): Promise<void> {
  // Revoke stale object URLs
  for (const [id, url] of objectUrls) {
    if (!activeReleaseGroupIds.has(id)) {
      URL.revokeObjectURL(url)
      objectUrls.delete(id)
    }
  }

  // Remove stale entries from IndexedDB
  try {
    const db = await getDB()
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    const request = store.getAllKeys()
    request.onsuccess = () => {
      const keys = request.result as string[]
      for (const key of keys) {
        if (!activeReleaseGroupIds.has(key)) {
          store.delete(key)
        }
      }
    }
  } catch (error) {
    logger.error('Failed to cleanup cover art cache:', error)
  }
}
