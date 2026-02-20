import type { LightweightSong } from '../api/types'

/**
 * Normalize a name for fuzzy matching: lowercase, normalize quotes,
 * remove apostrophes, remove special chars, collapse whitespace.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032\u2033]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/'/g, '')
    .replace(/[_\*\-\.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extracts featured artist name strings from a song title.
 * Matches patterns like (feat. X), (ft. X), (featuring X), (with X).
 * Splits on "," and " and " but NOT "&" (caller handles that for
 * artists like "Simon & Garfunkel").
 */
export function extractFeaturedArtists(title: string): string[] {
  if (!title) return []

  const regex = /\(\s*(?:feat\.?|ft\.?|featuring|with)\s+(.+?)\s*\)/gi
  const allNames: string[] = []

  let match: RegExpExecArray | null
  while ((match = regex.exec(title)) !== null) {
    const content = match[1]
    const parts = content
      .split(/,|\s+and\s+/i)
      .map(s => s.trim())
      .filter(Boolean)
    allNames.push(...parts)
  }

  return allNames
}

export interface FeaturedArtistResult {
  /** artistId -> featured songs for that artist */
  map: Record<string, LightweightSong[]>
  /** normalized artist name -> Set of all known artist IDs with that name */
  artistIdsByName: Map<string, Set<string>>
}

/**
 * Builds a mapping of artistId -> LightweightSong[] for songs where
 * the artist appears as a featured artist in the song title.
 *
 * Derives the artist name->ID lookup from songs' ArtistItems, so it
 * only needs the songs array (no separate artists list required).
 *
 * Handles Jellyfin duplicate artist entries by mapping featured songs
 * to ALL artist IDs that share the same normalized name.
 *
 * For "&" delimited names, tries the full string first (e.g. "Simon & Garfunkel")
 * before falling back to splitting into individual names.
 */
export function buildFeaturedArtistMap(
  songs: LightweightSong[]
): FeaturedArtistResult {
  if (!songs.length) return { map: {}, artistIdsByName: new Map() }

  // Build artist lookup: normalized name -> Set of all IDs with that name
  // (handles Jellyfin duplicate artist entries)
  const artistIdsByName = new Map<string, Set<string>>()
  for (const song of songs) {
    if (song.ArtistItems) {
      for (const artist of song.ArtistItems) {
        if (artist.Name && artist.Id) {
          const normalized = normalizeName(artist.Name)
          if (!artistIdsByName.has(normalized)) {
            artistIdsByName.set(normalized, new Set())
          }
          artistIdsByName.get(normalized)!.add(artist.Id)
        }
      }
    }
  }

  const result: Record<string, LightweightSong[]> = {}

  for (const song of songs) {
    const rawNames = extractFeaturedArtists(song.Name)
    if (rawNames.length === 0) continue

    const matchedArtistIds = new Set<string>()

    for (const rawName of rawNames) {
      const normalizedFull = normalizeName(rawName)
      const fullMatchIds = artistIdsByName.get(normalizedFull)
      if (fullMatchIds) {
        for (const id of fullMatchIds) matchedArtistIds.add(id)
        continue
      }

      // Fall back to splitting on "&" if no full match
      if (rawName.includes('&')) {
        const subNames = rawName.split('&').map(s => s.trim()).filter(Boolean)
        for (const sub of subNames) {
          const subMatchIds = artistIdsByName.get(normalizeName(sub))
          if (subMatchIds) {
            for (const id of subMatchIds) matchedArtistIds.add(id)
          }
        }
      }
    }

    for (const artistId of matchedArtistIds) {
      if (!result[artistId]) {
        result[artistId] = []
      }
      result[artistId].push(song)
    }
  }

  return { map: result, artistIdsByName }
}
