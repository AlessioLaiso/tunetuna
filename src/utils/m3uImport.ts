import type { BaseItemDto } from '../api/types'
import { logger } from './logger'

export interface M3UEntry {
  filePath: string
  fileName: string
  artistName?: string
  songTitle?: string
  durationSecs?: number
}

export interface M3UMatchResult {
  entry: M3UEntry
  matchedSong: BaseItemDto | null
  status: 'matched' | 'not_found' | 'skipped_duplicate'
}

export interface M3UImportResult {
  matched: M3UMatchResult[]
  notFound: M3UMatchResult[]
  skippedDuplicates: M3UMatchResult[]
  totalEntries: number
}

/**
 * Parse an M3U file into structured entries.
 * Handles both simple M3U (just paths) and extended M3U (#EXTINF metadata).
 */
export function parseM3UFile(content: string): M3UEntry[] {
  // Strip BOM if present
  const cleaned = content.replace(/^\uFEFF/, '')
  const lines = cleaned.split(/\r\n|\r|\n/)
  const entries: M3UEntry[] = []

  logger.log(`M3U parser: ${lines.length} lines in file`)

  let pendingArtist: string | undefined
  let pendingTitle: string | undefined
  let pendingDuration: number | undefined

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line === '#EXTM3U') continue

    if (line.startsWith('#EXTINF:')) {
      // Format: #EXTINF:<duration>,<Title> - <Artist>
      const afterTag = line.substring('#EXTINF:'.length)
      const commaIdx = afterTag.indexOf(',')
      if (commaIdx !== -1) {
        pendingDuration = parseInt(afterTag.substring(0, commaIdx), 10) || undefined
        const meta = afterTag.substring(commaIdx + 1).trim()
        // Split "Title - Artist" on the last " - " to handle titles with dashes
        const dashIdx = meta.lastIndexOf(' - ')
        if (dashIdx !== -1) {
          pendingTitle = meta.substring(0, dashIdx).trim()
          pendingArtist = meta.substring(dashIdx + 3).trim()
        } else {
          pendingTitle = meta
          pendingArtist = undefined
        }
      }
      continue
    }

    // Skip other comment lines
    if (line.startsWith('#')) continue

    // This is a file path line
    const filePath = line
    const segments = filePath.replace(/\\/g, '/').split('/')
    const fileName = segments[segments.length - 1]

    if (fileName) {
      entries.push({
        filePath,
        fileName,
        artistName: pendingArtist,
        songTitle: pendingTitle,
        durationSecs: pendingDuration,
      })
    }

    // Reset pending metadata
    pendingArtist = undefined
    pendingTitle = undefined
    pendingDuration = undefined
  }

  logger.log(`M3U parser: ${entries.length} entries parsed`)
  if (entries.length > 0) {
    logger.log(`M3U parser: first entry filename="${entries[0].fileName}", path="${entries[0].filePath}"`)
  }
  return entries
}

function normalizeStr(s: string): string {
  return s.normalize('NFC').toLowerCase()
}

function buildFilenameIndex(songs: BaseItemDto[]): Map<string, BaseItemDto[]> {
  const index = new Map<string, BaseItemDto[]>()
  for (const song of songs) {
    if (!song.Path) continue
    const segments = song.Path.replace(/\\/g, '/').split('/')
    const fileName = normalizeStr(segments[segments.length - 1] ?? '')
    if (!fileName) continue
    const existing = index.get(fileName)
    if (existing) {
      existing.push(song)
    } else {
      index.set(fileName, [song])
    }
  }
  return index
}

function matchEntry(entry: M3UEntry, songsByFilename: Map<string, BaseItemDto[]>): BaseItemDto | null {
  const candidates = songsByFilename.get(normalizeStr(entry.fileName))
  if (!candidates || candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  // Disambiguate by album folder (second-to-last path segment)
  const entryParts = entry.filePath.replace(/\\/g, '/').split('/')
  const entryAlbumFolder = entryParts.length >= 2 ? normalizeStr(entryParts[entryParts.length - 2]) : ''
  const entryArtistFolder = entryParts.length >= 3 ? normalizeStr(entryParts[entryParts.length - 3]) : ''

  let filtered = candidates.filter(song => {
    const songParts = (song.Path || '').replace(/\\/g, '/').split('/')
    const songAlbumFolder = songParts.length >= 2 ? normalizeStr(songParts[songParts.length - 2]) : ''
    return songAlbumFolder === entryAlbumFolder
  })
  if (filtered.length === 1) return filtered[0]

  // Disambiguate by artist folder (third-to-last path segment)
  if (filtered.length > 1) {
    const artistFiltered = filtered.filter(song => {
      const songParts = (song.Path || '').replace(/\\/g, '/').split('/')
      const songArtistFolder = songParts.length >= 3 ? normalizeStr(songParts[songParts.length - 3]) : ''
      return songArtistFolder === entryArtistFolder
    })
    if (artistFiltered.length >= 1) return artistFiltered[0]
  }

  // EXTINF metadata fallback
  if (entry.songTitle || entry.artistName) {
    const titleLower = normalizeStr(entry.songTitle || '')
    const artistLower = normalizeStr(entry.artistName || '')
    const pool = filtered.length > 0 ? filtered : candidates
    const metaFiltered = pool.filter(song => {
      const nameMatch = !titleLower || normalizeStr(song.Name || '').includes(titleLower)
      const artistMatch = !artistLower || [
        normalizeStr(song.AlbumArtist || ''),
        ...(song.ArtistItems || []).map(a => normalizeStr(a.Name || '')),
      ].some(a => a.includes(artistLower))
      return nameMatch && artistMatch
    })
    if (metaFiltered.length >= 1) return metaFiltered[0]
  }

  // Return first candidate as best guess
  return candidates[0]
}

/**
 * Match parsed M3U entries against the Jellyfin library.
 * Songs already in the playlist (by ID) are marked as skipped duplicates.
 */
export function matchM3UEntries(
  entries: M3UEntry[],
  librarySongs: BaseItemDto[],
  existingPlaylistIds: Set<string>,
): M3UImportResult {
  const songsByFilename = buildFilenameIndex(librarySongs)
  logger.log(`M3U matcher: ${librarySongs.length} library songs, ${songsByFilename.size} unique filenames, ${existingPlaylistIds.size} existing playlist items`)

  const matched: M3UMatchResult[] = []
  const notFound: M3UMatchResult[] = []
  const skippedDuplicates: M3UMatchResult[] = []

  for (const entry of entries) {
    const song = matchEntry(entry, songsByFilename)
    if (!song) {
      notFound.push({ entry, matchedSong: null, status: 'not_found' })
    } else if (existingPlaylistIds.has(song.Id)) {
      skippedDuplicates.push({ entry, matchedSong: song, status: 'skipped_duplicate' })
    } else {
      matched.push({ entry, matchedSong: song, status: 'matched' })
    }
  }

  return { matched, notFound, skippedDuplicates, totalEntries: entries.length }
}
