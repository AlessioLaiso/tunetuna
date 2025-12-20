import { jellyfinClient } from '../api/jellyfin'

// Shared cache for artist fallback album art across all components
// This prevents duplicate API calls when the same artist appears in multiple places
const artistAlbumArtCache = new Map<string, string | null>()
const pendingRequests = new Map<string, Promise<string | null>>()

/**
 * Get fallback album art for an artist (when they don't have a primary image)
 * Uses shared cache to prevent duplicate API calls across components
 */
export async function getArtistFallbackArt(artistId: string): Promise<string | null> {
  // Check cache first
  if (artistAlbumArtCache.has(artistId)) {
    return artistAlbumArtCache.get(artistId) ?? null
  }

  // Check if there's already a pending request for this artist
  if (pendingRequests.has(artistId)) {
    return pendingRequests.get(artistId)!
  }

  // Create new request
  const request = (async () => {
    try {
      const { albums, songs } = await jellyfinClient.getArtistItems(artistId)

      // Prefer an album if available, otherwise fall back to a song's album art
      const firstAlbum = albums[0]
      const firstSongWithAlbum = songs.find((song) => song.AlbumId) || songs[0]
      const artItem = firstAlbum || firstSongWithAlbum
      const artId = artItem ? (artItem.AlbumId || artItem.Id) : null
      const url = artId ? jellyfinClient.getAlbumArtUrl(artId, 96) : null

      artistAlbumArtCache.set(artistId, url)
      return url
    } catch (error) {
      console.error('Failed to load fallback album art for artist:', artistId, error)
      artistAlbumArtCache.set(artistId, null)
      return null
    } finally {
      pendingRequests.delete(artistId)
    }
  })()

  pendingRequests.set(artistId, request)
  return request
}

/**
 * Check if we have a cached fallback art URL for an artist
 */
export function getCachedArtistFallbackArt(artistId: string): string | null | undefined {
  return artistAlbumArtCache.get(artistId)
}

/**
 * Clear the artist image cache (useful for logout)
 */
export function clearArtistImageCache() {
  artistAlbumArtCache.clear()
  pendingRequests.clear()
}
