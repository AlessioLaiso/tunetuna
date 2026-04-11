import type { LightweightSong } from '../api/types'
import type { PlayEvent } from '../stores/statsStore'
import { buildFeaturedArtistMap } from './featuredArtists'

const MIN_SONGS = 30

export interface SmartPlaylist {
  id: string
  name: string
  description: string
  /** Longer subtitle shown on the detail page */
  subtitle: string
  /** Filter + sort songs, return the final list */
  getSongs: (songs: LightweightSong[], events: PlayEvent[]) => LightweightSong[]
  /** Whether this playlist requires stats to be available */
  requiresStats: boolean
}

/**
 * On Repeat — 50 most played songs in the last 30 days.
 */
function getOnRepeat(songs: LightweightSong[], events: PlayEvent[]): LightweightSong[] {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const recentEvents = events.filter(e => e.ts >= thirtyDaysAgo)

  const playCounts = new Map<string, number>()
  for (const e of recentEvents) {
    playCounts.set(e.songId, (playCounts.get(e.songId) || 0) + 1)
  }

  const songMap = new Map(songs.map(s => [s.Id, s]))
  return Array.from(playCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([id]) => songMap.get(id))
    .filter((s): s is LightweightSong => !!s)
}

/**
 * Forgotten Favorites — 50 songs with highest all-time play count
 * but 0 plays in the last 3 months.
 */
function getForgottenFavorites(songs: LightweightSong[], events: PlayEvent[]): LightweightSong[] {
  const threeMonthsAgo = Date.now() - 90 * 24 * 60 * 60 * 1000

  // All-time play counts
  const allTimeCounts = new Map<string, number>()
  // Recent play song IDs
  const recentSongIds = new Set<string>()

  for (const e of events) {
    allTimeCounts.set(e.songId, (allTimeCounts.get(e.songId) || 0) + 1)
    if (e.ts >= threeMonthsAgo) {
      recentSongIds.add(e.songId)
    }
  }

  const songMap = new Map(songs.map(s => [s.Id, s]))
  return Array.from(allTimeCounts.entries())
    .filter(([id]) => !recentSongIds.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([id]) => songMap.get(id))
    .filter((s): s is LightweightSong => !!s)
}

/**
 * Fresh Finds — 50 most recently added songs to library.
 * Uses song DateCreated (when it was scanned into the library), falling back to PremiereDate.
 */
function getFreshFinds(songs: LightweightSong[]): LightweightSong[] {
  const getDate = (s: LightweightSong) => s.DateCreated || s.PremiereDate

  return [...songs]
    .filter(s => getDate(s))
    .sort((a, b) => new Date(getDate(b)!).getTime() - new Date(getDate(a)!).getTime())
    .slice(0, 50)
}

/**
 * Longest Unplayed — 50 songs in library the longest with zero plays.
 * Falls back to lowest play count if all songs have been played.
 */
function getLongestUnplayed(songs: LightweightSong[], events: PlayEvent[]): LightweightSong[] {
  const playCounts = new Map<string, number>()
  for (const e of events) {
    playCounts.set(e.songId, (playCounts.get(e.songId) || 0) + 1)
  }

  // Songs with dates, sorted by oldest first (by when added to library)
  const getDate = (s: LightweightSong) => s.DateCreated || s.PremiereDate
  const songsWithDate = [...songs]
    .filter(s => getDate(s))
    .sort((a, b) => new Date(getDate(a)!).getTime() - new Date(getDate(b)!).getTime())

  // Try unplayed songs first
  const unplayed = songsWithDate.filter(s => !playCounts.has(s.Id))
  if (unplayed.length >= MIN_SONGS) {
    return unplayed.slice(0, 50)
  }

  // Fall back to least played
  return [...songsWithDate]
    .sort((a, b) => {
      const countA = playCounts.get(a.Id) || 0
      const countB = playCounts.get(b.Id) || 0
      if (countA !== countB) return countA - countB
      // Tiebreak: oldest first
      return new Date(getDate(a)!).getTime() - new Date(getDate(b)!).getTime()
    })
    .slice(0, 50)
}

/**
 * Collab Central — all songs with collaborations:
 * songs with featured artists (parsed from title) OR multiple ArtistItems in metadata.
 */
function getCollabCentral(songs: LightweightSong[]): LightweightSong[] {
  const { map } = buildFeaturedArtistMap(songs)
  const collabSongIds = new Set<string>()
  for (const songList of Object.values(map)) {
    for (const song of songList) {
      collabSongIds.add(song.Id)
    }
  }
  for (const song of songs) {
    if (song.ArtistItems && song.ArtistItems.length > 1) {
      collabSongIds.add(song.Id)
    }
  }
  return songs.filter(s => collabSongIds.has(s.Id))
}

/**
 * One-Hit Wonders — songs from artists with only 1 song in the library.
 */
function getOneHitWonders(songs: LightweightSong[]): LightweightSong[] {
  // Count songs per primary artist ID
  const artistSongCount = new Map<string, number>()
  for (const song of songs) {
    const artistId = song.ArtistItems?.[0]?.Id
    if (artistId) {
      artistSongCount.set(artistId, (artistSongCount.get(artistId) || 0) + 1)
    }
  }

  return songs.filter(s => {
    const artistId = s.ArtistItems?.[0]?.Id
    return artistId && artistSongCount.get(artistId) === 1
  })
}

// ============================================================================
// Smart Playlist Definitions
// ============================================================================

export const SMART_PLAYLISTS: SmartPlaylist[] = [
  {
    id: 'on-repeat',
    name: 'On Repeat',
    description: 'Your most played songs this month',
    subtitle: 'Your most played songs in the last 30 days',
    getSongs: getOnRepeat,
    requiresStats: true,
  },
  {
    id: 'forgotten-favorites',
    name: 'Forgotten Favorites',
    description: 'Old favorites you haven\'t played lately',
    subtitle: 'Songs you used to love but haven\'t listened in months',
    getSongs: getForgottenFavorites,
    requiresStats: true,
  },
  {
    id: 'fresh-finds',
    name: 'Fresh Finds',
    description: 'Recently added to your library',
    subtitle: 'The latest additions to your library',
    getSongs: getFreshFinds,
    requiresStats: false,
  },
  {
    id: 'collab-central',
    name: 'Collab Central',
    description: 'Songs with featured artists',
    subtitle: 'Collaborations in your library',
    getSongs: getCollabCentral,
    requiresStats: false,
  },
  {
    id: 'one-hit-wonders',
    name: 'One-Hit Wonders',
    description: 'Artists with only 1 song in your library',
    subtitle: 'Artists with only one song in your library',
    getSongs: getOneHitWonders,
    requiresStats: false,
  },
  {
    id: 'longest-unplayed',
    name: 'Longest Unplayed',
    description: 'In your library the longest, never played',
    subtitle: 'Songs that have been waiting the longest for their moment',
    getSongs: getLongestUnplayed,
    requiresStats: true,
  },
]

// ============================================================================
// Year Throwback
// ============================================================================

/**
 * Get available year throwback years.
 * Shows the current year starting from December, plus all previous years with data.
 */
export function getAvailableThrowbackYears(events: PlayEvent[]): number[] {
  if (events.length === 0) return []

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() // 0-indexed

  // Group events by calendar year
  const yearCounts = new Map<number, number>()
  for (const e of events) {
    const year = new Date(e.ts).getFullYear()
    yearCounts.set(year, (yearCounts.get(year) || 0) + 1)
  }

  const years: number[] = []
  for (const [year] of yearCounts) {
    // Show current year only from December onwards
    if (year === currentYear && currentMonth < 11) continue
    years.push(year)
  }

  return years.sort((a, b) => b - a)
}

/**
 * Get top 50 most played songs for a given year.
 */
export function getYearThrowbackSongs(
  year: number,
  songs: LightweightSong[],
  events: PlayEvent[]
): LightweightSong[] {
  const yearStart = new Date(year, 0, 1).getTime()
  const yearEnd = new Date(year + 1, 0, 1).getTime()

  const yearEvents = events.filter(e => e.ts >= yearStart && e.ts < yearEnd)
  const playCounts = new Map<string, number>()
  for (const e of yearEvents) {
    playCounts.set(e.songId, (playCounts.get(e.songId) || 0) + 1)
  }

  const songMap = new Map(songs.map(s => [s.Id, s]))
  return Array.from(playCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([id]) => songMap.get(id))
    .filter((s): s is LightweightSong => !!s)
}

// ============================================================================
// Decade Mixes
// ============================================================================

/**
 * Get available decades from songs' production years.
 */
export function getAvailableDecades(songs: LightweightSong[]): number[] {
  const decades = new Set<number>()
  for (const song of songs) {
    if (song.ProductionYear) {
      decades.add(Math.floor(song.ProductionYear / 10) * 10)
    }
  }
  return Array.from(decades).sort((a, b) => b - a)
}

/**
 * Get all songs from a given decade.
 */
export function getDecadeSongs(decade: number, songs: LightweightSong[]): LightweightSong[] {
  return songs.filter(s =>
    s.ProductionYear && s.ProductionYear >= decade && s.ProductionYear < decade + 10
  )
}

// ============================================================================
// Language Mixes
// ============================================================================

/**
 * Get available languages from songs' grouping tags.
 */
export function getAvailableLanguages(songs: LightweightSong[]): string[] {
  const languages = new Set<string>()
  for (const song of songs) {
    if (!song.Grouping) continue
    for (const tag of song.Grouping) {
      const lower = tag.toLowerCase()
      if (lower.startsWith('language_')) {
        languages.add(lower.substring('language_'.length))
      }
    }
  }
  return Array.from(languages).sort((a, b) => a.localeCompare(b))
}

/**
 * Get all songs for a given language.
 * A song can appear in multiple language mixes.
 */
export function getLanguageSongs(language: string, songs: LightweightSong[]): LightweightSong[] {
  const tag = `language_${language.toLowerCase()}`
  return songs.filter(s =>
    s.Grouping?.some(g => g.toLowerCase() === tag)
  )
}

// ============================================================================
// BPM Mixes
// ============================================================================

/**
 * Get available BPM buckets (grouped by 5) from songs' BPM tags.
 * Returns buckets sorted descending by BPM.
 */
export function getAvailableBpmBuckets(songs: LightweightSong[]): number[] {
  const buckets = new Set<number>()
  for (const song of songs) {
    if (song.Bpm) {
      buckets.add(Math.floor(song.Bpm / 5) * 5)
    }
  }
  return Array.from(buckets).sort((a, b) => b - a)
}

/**
 * Get all songs in a given BPM bucket (5-BPM range).
 */
export function getBpmBucketSongs(bucket: number, songs: LightweightSong[]): LightweightSong[] {
  return songs.filter(s =>
    s.Bpm && s.Bpm >= bucket && s.Bpm < bucket + 5
  )
}

/**
 * Format a BPM bucket as a label, e.g. "120–124 BPM"
 */
export function bpmBucketLabel(bucket: number): string {
  return `${bucket}–${bucket + 4} BPM`
}

// ============================================================================
// Availability checks
// ============================================================================

/**
 * Check which smart playlists are available given current data.
 * Returns only playlists that have enough songs (>= MIN_SONGS).
 */
export function getAvailableSmartPlaylists(
  songs: LightweightSong[],
  events: PlayEvent[],
  statsEnabled: boolean
): SmartPlaylist[] {
  return SMART_PLAYLISTS.filter(sp => {
    if (sp.requiresStats && !statsEnabled) return false
    const result = sp.getSongs(songs, events)
    // Collab Central and One-Hit Wonders have no minimum
    if (sp.id === 'collab-central' || sp.id === 'one-hit-wonders') return result.length > 0
    return result.length >= MIN_SONGS
  })
}
