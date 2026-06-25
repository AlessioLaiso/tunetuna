import type { PlayEvent } from '../stores/statsStore'
import { normalizeName, extractFeaturedArtists } from './featuredArtists'

export interface ComputedStats {
  // Summary
  totalSongs: number
  totalHours: number
  uniqueSongs: number
  uniqueArtists: number
  uniqueAlbums: number

  // Records
  biggestDay: { date: string; count: number } | null
  mostListeningDay: { date: string; hours: number } | null
  busiestMonth: { month: string; hours: number } | null

  // Timeline (top artist per month)
  timeline: Array<{
    month: string
    artistId: string
    artistName: string
    hours: number
    isRideOrDie?: boolean
    isPeak?: boolean
  }>

  // Top lists
  topSongs: Array<{
    songId: string
    songName: string
    artistName: string
    artistId: string
    albumId: string
    plays: number
    hours: number
    badges: Array<'obsessed' | 'on-repeat'>
    obsessedDetail?: { count: number; date: string }
    onRepeatMonths?: number
  }>

  topArtists: Array<{
    artistId: string
    artistName: string
    hours: number
    plays: number
    badges: Array<'ride-or-die'>
  }>

  topAlbums: Array<{
    albumId: string
    albumName: string
    artistName: string
    artistId: string
    hours: number
    plays: number
  }>

  topGenres: Array<{
    genre: string
    hours: number
  }>

  decades: Array<{
    decade: string
    hours: number
  }>

  // Top genre × decade combos
  topGenreDecades: Array<{
    genre: string
    decade: string
    hours: number
  }>
}

const msToHours = (ms: number) => ms / 1000 / 60 / 60

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

function formatMonthYear(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number)
  return `${SHORT_MONTH_NAMES[month - 1]} ${year}`
}

/**
 * Rolling 6-month range ending at the current month (inclusive).
 *
 * The window always ends at the last moment of the current month so that the
 * range is stable within a given month — "last 6 months including the current
 * one" means [currentMonth - 5, currentMonth].
 */
export function getRollingSixMonthRange(now: Date = new Date()): { fromMonth: string, toMonth: string, fromDate: Date, toDate: Date } {
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const fromMonthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const fromMonth = fmt(fromMonthStart)
  // toDate: last moment of current month
  const toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  return {
    fromMonth,
    toMonth: fmt(currentMonthStart),
    fromDate: fromMonthStart,
    toDate,
  }
}

export function formatRangeSubtitle(fromMonth: string, toMonth: string): string {
  if (!fromMonth || !toMonth) return ''
  if (fromMonth === toMonth) return formatMonthYear(fromMonth)
  return `${formatMonthYear(fromMonth)} - ${formatMonthYear(toMonth)}`
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const key = keyFn(item)
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {} as Record<string, T[]>)
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().split('T')[0]
}

function formatMonth(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function isConsecutiveMonth(a: string, b: string): boolean {
  const [aYear, aMonth] = a.split('-').map(Number)
  const [bYear, bMonth] = b.split('-').map(Number)

  if (aYear === bYear) return bMonth === aMonth + 1
  if (bYear === aYear + 1) return aMonth === 12 && bMonth === 1
  return false
}

function getConsecutiveMonths(monthSet: Set<string>): number {
  const sortedMonths = [...monthSet].sort()
  if (sortedMonths.length === 0) return 0

  let maxConsecutive = 1
  let current = 1

  for (let i = 1; i < sortedMonths.length; i++) {
    if (isConsecutiveMonth(sortedMonths[i - 1], sortedMonths[i])) {
      current++
      maxConsecutive = Math.max(maxConsecutive, current)
    } else {
      current = 1
    }
  }

  return maxConsecutive
}

function emptyStats(): ComputedStats {
  return {
    totalSongs: 0,
    totalHours: 0,
    uniqueSongs: 0,
    uniqueArtists: 0,
    uniqueAlbums: 0,
    biggestDay: null,
    mostListeningDay: null,
    busiestMonth: null,
    timeline: [],
    topSongs: [],
    topArtists: [],
    topAlbums: [],
    topGenres: [],
    decades: [],
    topGenreDecades: [],
  }
}

export function computeStats(
  events: PlayEvent[],
  fromDate: Date,
  toDate: Date,
  options?: { topLimit?: number }
): ComputedStats {
  const topSongLimit = options?.topLimit ?? 5
  const topArtistLimit = options?.topLimit ?? 5
  const topAlbumLimit = options?.topLimit ?? 5
  const topGenreLimit = options?.topLimit ?? 7
  const topGenreDecadeLimit = options?.topLimit ?? 7
  if (events.length === 0) {
    return emptyStats()
  }

  // Filter events to date range
  const fromTs = fromDate.getTime()
  const toTs = toDate.getTime()
  const filteredEvents = events.filter(e => e.ts >= fromTs && e.ts <= toTs)

  if (filteredEvents.length === 0) {
    return emptyStats()
  }

  // Total summary
  const totalSongs = filteredEvents.length
  const totalMs = filteredEvents.reduce((sum, e) => sum + e.fullDurationMs, 0)
  const totalHours = msToHours(totalMs)

  // Group by day for records
  const byDay = groupBy(filteredEvents, e => formatDate(e.ts))

  const biggestDay = Object.entries(byDay)
    .map(([date, evts]) => ({ date, count: evts.length }))
    .sort((a, b) => b.count - a.count)[0] || null

  const mostListeningDay = Object.entries(byDay)
    .map(([date, evts]) => ({
      date,
      hours: msToHours(evts.reduce((sum, e) => sum + e.fullDurationMs, 0))
    }))
    .sort((a, b) => b.hours - a.hours)[0] || null

  // Group by month
  const byMonth = groupBy(filteredEvents, e => formatMonth(e.ts))
  const months = Object.keys(byMonth).sort()

  const busiestMonth = months.length >= 2
    ? Object.entries(byMonth)
      .map(([month, evts]) => ({
        month,
        hours: msToHours(evts.reduce((sum, e) => sum + e.fullDurationMs, 0))
      }))
      .sort((a, b) => b.hours - a.hours)[0]
    : null

  // Timeline: top artist per month
  const timeline: ComputedStats['timeline'] = months.map(month => {
    const monthEvents = byMonth[month]
    const artistHours = new Map<string, { name: string; ms: number }>()

    monthEvents.forEach(e => {
      const artistCount = e.artistIds.length || 1 // Avoid division by zero
      e.artistIds.forEach((id, i) => {
        const current = artistHours.get(id) || { name: e.artistNames[i] || 'Unknown', ms: 0 }
        current.ms += e.fullDurationMs / artistCount
        artistHours.set(id, current)
      })
    })

    const entries = [...artistHours.entries()]
    if (entries.length === 0) {
      return {
        month,
        artistId: '',
        artistName: 'Unknown',
        hours: 0,
        isPeak: false,
        isRideOrDie: false,
      }
    }

    const top = entries.sort((a, b) => b[1].ms - a[1].ms)[0]

    return {
      month,
      artistId: top[0],
      artistName: top[1].name,
      hours: msToHours(top[1].ms),
      isPeak: false,
      isRideOrDie: false,
    }
  }).filter(t => t.artistId !== '')

  // Find peak month
  if (timeline.length > 0) {
    const peakIdx = timeline.reduce((maxIdx, t, i, arr) =>
      t.hours > arr[maxIdx].hours ? i : maxIdx, 0)
    timeline[peakIdx].isPeak = true
  }

  // Find ride-or-die artists (appear in every month)
  const artistMonthAppearances = new Map<string, Set<string>>()
  filteredEvents.forEach(e => {
    const month = formatMonth(e.ts)
    e.artistIds.forEach(id => {
      if (!artistMonthAppearances.has(id)) {
        artistMonthAppearances.set(id, new Set())
      }
      artistMonthAppearances.get(id)!.add(month)
    })
  })

  const rideOrDieArtists = new Set<string>()
  if (months.length >= 3) {
    artistMonthAppearances.forEach((monthSet, artistId) => {
      if (monthSet.size === months.length) {
        rideOrDieArtists.add(artistId)
      }
    })
  }

  timeline.forEach(t => {
    if (rideOrDieArtists.has(t.artistId)) {
      t.isRideOrDie = true
    }
  })

  // Top songs with badges
  const songStats = new Map<string, {
    name: string
    artistName: string
    artistId: string
    albumId: string
    plays: number
    ms: number
    dayPlays: Map<string, number>
    monthsInTop5: Set<string>
  }>()

  filteredEvents.forEach(e => {
    const day = formatDate(e.ts)

    if (!songStats.has(e.songId)) {
      songStats.set(e.songId, {
        name: e.songName,
        artistName: e.artistNames[0] || 'Unknown',
        artistId: e.artistIds[0] || '',
        albumId: e.albumId,
        plays: 0,
        ms: 0,
        dayPlays: new Map(),
        monthsInTop5: new Set(),
      })
    }

    const stat = songStats.get(e.songId)!
    stat.plays++
    stat.ms += e.fullDurationMs
    stat.dayPlays.set(day, (stat.dayPlays.get(day) || 0) + 1)
  })

  // Calculate monthly top 5 for on-repeat badge
  months.forEach(month => {
    const monthEvents = byMonth[month]
    const monthSongPlays = new Map<string, number>()

    monthEvents.forEach(e => {
      monthSongPlays.set(e.songId, (monthSongPlays.get(e.songId) || 0) + 1)
    })

    const top5 = [...monthSongPlays.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id)

    top5.forEach(songId => {
      songStats.get(songId)?.monthsInTop5.add(month)
    })
  })

  const topSongs = [...songStats.entries()]
    .sort((a, b) => b[1].plays - a[1].plays)
    .slice(0, topSongLimit)
    .map(([songId, stat]) => {
      const badges: Array<'obsessed' | 'on-repeat'> = []
      let obsessedDetail: { count: number; date: string } | undefined
      let onRepeatMonths: number | undefined

      // Check obsessed badge (10+ plays in one day)
      const dayPlayEntries = [...stat.dayPlays.entries()]
      if (dayPlayEntries.length > 0) {
        const maxDayPlays = dayPlayEntries.sort((a, b) => b[1] - a[1])[0]
        if (maxDayPlays && maxDayPlays[1] >= 10) {
          badges.push('obsessed')
          obsessedDetail = { count: maxDayPlays[1], date: maxDayPlays[0] }
        }
      }

      // Check on-repeat badge (3+ consecutive months in top 5)
      const consecutiveMonths = getConsecutiveMonths(stat.monthsInTop5)
      if (consecutiveMonths >= 3) {
        badges.push('on-repeat')
        onRepeatMonths = consecutiveMonths
      }

      return {
        songId,
        songName: stat.name,
        artistName: stat.artistName,
        artistId: stat.artistId,
        albumId: stat.albumId,
        plays: stat.plays,
        hours: msToHours(stat.ms),
        badges,
        obsessedDetail,
        onRepeatMonths,
      }
    })

  // Top artists
  const artistStats = new Map<string, { name: string; plays: number; ms: number }>()

  filteredEvents.forEach(e => {
    const artistCount = e.artistIds.length || 1 // Avoid division by zero
    e.artistIds.forEach((id, i) => {
      if (!artistStats.has(id)) {
        artistStats.set(id, { name: e.artistNames[i] || 'Unknown', plays: 0, ms: 0 })
      }
      const stat = artistStats.get(id)!
      stat.plays++
      stat.ms += e.fullDurationMs / artistCount
    })
  })

  const topArtists = [...artistStats.entries()]
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, topArtistLimit)
    .map(([artistId, stat]) => ({
      artistId,
      artistName: stat.name,
      hours: msToHours(stat.ms),
      plays: stat.plays,
      badges: rideOrDieArtists.has(artistId) ? ['ride-or-die' as const] : [],
    }))

  // Top albums
  const albumStats = new Map<string, { name: string; artistName: string; artistId: string; plays: number; ms: number }>()

  filteredEvents.forEach(e => {
    if (!e.albumId) return

    if (!albumStats.has(e.albumId)) {
      albumStats.set(e.albumId, {
        name: e.albumName,
        artistName: e.artistNames[0] || 'Unknown',
        artistId: e.artistIds[0] || '',
        plays: 0,
        ms: 0,
      })
    }
    const stat = albumStats.get(e.albumId)!
    stat.plays++
    stat.ms += e.fullDurationMs
  })

  const topAlbums = [...albumStats.entries()]
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, topAlbumLimit)
    .map(([albumId, stat]) => ({
      albumId,
      albumName: stat.name,
      artistName: stat.artistName,
      artistId: stat.artistId,
      hours: msToHours(stat.ms),
      plays: stat.plays,
    }))

  // Top genres (case-insensitive grouping; first-seen casing wins for display)
  const genreStats = new Map<string, { ms: number; displayName: string }>()
  filteredEvents.forEach(e => {
    e.genres.forEach(genre => {
      const key = genre.toLowerCase()
      const current = genreStats.get(key)
      if (current) {
        current.ms += e.fullDurationMs / e.genres.length
      } else {
        genreStats.set(key, { ms: e.fullDurationMs / e.genres.length, displayName: genre })
      }
    })
  })

  const topGenres = [...genreStats.values()]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, topGenreLimit)
    .map(({ displayName, ms }) => ({ genre: displayName, hours: msToHours(ms) }))

  // Decades
  const decadeStats = new Map<string, number>()
  filteredEvents.forEach(e => {
    if (e.year) {
      const decade = `${Math.floor(e.year / 10) * 10}s`
      decadeStats.set(decade, (decadeStats.get(decade) || 0) + e.fullDurationMs)
    }
  })

  const decades = [...decadeStats.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([decade, ms]) => ({ decade, hours: msToHours(ms) }))

  // Top genre × decade combos (case-insensitive grouping on genre)
  const genreDecadeStats = new Map<string, { genre: string; decade: string; ms: number }>()
  filteredEvents.forEach(e => {
    if (e.year && e.genres.length > 0) {
      const decade = `${Math.floor(e.year / 10) * 10}s`
      e.genres.forEach(genre => {
        const key = `${genre.toLowerCase()}|${decade}`
        const current = genreDecadeStats.get(key) || { genre, decade, ms: 0 }
        current.ms += e.fullDurationMs / e.genres.length
        genreDecadeStats.set(key, current)
      })
    }
  })

  const topGenreDecades = [...genreDecadeStats.values()]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, topGenreDecadeLimit)
    .map(({ genre, decade, ms }) => ({
      genre,
      decade,
      hours: msToHours(ms),
    }))

  return {
    totalSongs,
    totalHours,
    uniqueSongs: songStats.size,
    uniqueArtists: artistStats.size,
    uniqueAlbums: albumStats.size,
    biggestDay,
    mostListeningDay,
    busiestMonth,
    timeline,
    topSongs,
    topArtists,
    topAlbums,
    topGenres,
    decades,
    topGenreDecades,
  }
}

export interface ArtistTopSong {
  songId: string
  songName: string
  albumId: string
  albumName: string
  year: number | null
  plays: number
  /**
   * Primary artist to display in the secondary line when this artist is a featured
   * appearance (e.g. the song is "Someone Else (feat. This Artist)").
   * For songs where this artist is a credited artist, this is null and the row
   * shows only album + year, matching the main Songs section.
   */
  primaryArtistName: string | null
  primaryArtistId: string | null
}

interface ArtistTopSongStat {
  name: string
  albumId: string
  albumName: string
  year: number | null
  plays: number
  /** Best-known primary artist name for the song (from the library, if found) */
  primaryArtistName: string | null
  primaryArtistId: string | null
  /** Whether the matched artist is a credited artist on this song's play events */
  creditedMatch: boolean
}

/**
 * Lookup of library songs, keyed by song ID, used to resolve row display
 * metadata (primary artist, album name, year) for the artist's Top songs.
 */
export type SongLookup = Map<string, {
  Name: string
  AlbumArtist?: string
  ArtistItems?: Array<{ Id?: string, Name?: string }>
  Album?: string
  AlbumId?: string
  ProductionYear?: number
  PremiereDate?: string
}>

/**
 * Top songs by a specific artist over a given time range, ranked by play count.
 *
 * An event matches the artist when **either**:
 *  - the artist's ID (any alias) appears anywhere in the event's `artistIds`
 *    (credited artist — includes tracks where they're a credited collaborator); OR
 *  - the artist's name appears in the song title via a `(feat. X)` / `(ft. X)`
 *    / `(featuring X)` / `(with X)` clause, matched by normalized name.
 *
 * The title-match path is what brings in "Appears On" songs — tracks where the
 * artist is only named in the title and may not be present in `ArtistItems`,
 * so their play events wouldn't carry the artist's ID.
 *
 * Row display metadata (album, year, primary artist) is sourced from the
 * library via `songLookup` so the rows render the same secondary line as the
 * main Songs section on the artist page: primary artist (when featured) • album • year.
 *
 * Events are expected to already be filtered to the desired range; this only
 * slices by artist and ranks songs.
 */
export function computeArtistTopSongs(
  events: PlayEvent[],
  artistIds: string[],
  artistName: string | null | undefined,
  songLookup: SongLookup,
  limit = 5,
): ArtistTopSong[] {
  const idSet = new Set(artistIds.filter(Boolean))
  if ((idSet.size === 0 && !artistName) || events.length === 0) return []

  const normalizedArtistNames = new Set<string>()
  if (artistName) {
    normalizedArtistNames.add(normalizeName(artistName))
    // Also accept the names recorded against the alias IDs in the play events,
    // since Jellyfin's stored name casing may differ from the library.
  }

  const matchesEvent = (e: PlayEvent): 'credited' | 'title' | null => {
    if (idSet.size > 0 && e.artistIds.some(id => idSet.has(id))) {
      return 'credited'
    }
    // Title-featured match: artist named in a (feat./ft./featuring/with X) clause
    if (artistName && titleFeaturesArtist(e.songName, normalizedArtistNames)) {
      return 'title'
    }
    return null
  }

  const songStats = new Map<string, ArtistTopSongStat>()

  for (const e of events) {
    const match = matchesEvent(e)
    if (!match) continue

    if (!songStats.has(e.songId)) {
      const libSong = songLookup.get(e.songId)
      // Primary artist = first credited artist from the library, else the
      // event's first artist name, else album artist.
      const primaryArtistItem = libSong?.ArtistItems?.[0]
      const primaryArtistName =
        primaryArtistItem?.Name || e.artistNames[0] || libSong?.AlbumArtist || null
      const primaryArtistId = primaryArtistItem?.Id || e.artistIds[0] || null
      songStats.set(e.songId, {
        name: e.songName,
        albumId: libSong?.AlbumId || e.albumId,
        albumName: libSong?.Album || e.albumName,
        year: libSong?.ProductionYear ?? e.year ?? null,
        plays: 0,
        primaryArtistName,
        primaryArtistId,
        creditedMatch: match === 'credited',
      })
    }
    songStats.get(e.songId)!.plays++
    // If we've seen both a credited and a title match across plays, prefer credited.
    if (match === 'credited') {
      songStats.get(e.songId)!.creditedMatch = true
    }
  }

  return [...songStats.entries()]
    .sort((a, b) => b[1].plays - a[1].plays || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([songId, stat]) => {
      // Show the primary artist only when this artist is a featured appearance
      // (matched via title, never credited) — matches the main Songs section,
      // which shows the main artist for "appears on" tracks and omits it for own tracks.
      const isFeaturedAppearance = !stat.creditedMatch
      return {
        songId,
        songName: stat.name,
        albumId: stat.albumId,
        albumName: stat.albumName,
        year: stat.year,
        plays: stat.plays,
        primaryArtistName: isFeaturedAppearance ? stat.primaryArtistName : null,
        primaryArtistId: isFeaturedAppearance ? stat.primaryArtistId : null,
      }
    })
}

/**
 * Count of distinct songs by an artist that have been played in the given events.
 * Used to gate the Top songs section on the artist detail page (≥ N played songs).
 * Matches on the same credited-or-title rule as `computeArtistTopSongs`.
 */
export function countPlayedSongsForArtist(
  events: PlayEvent[],
  artistIds: string[],
  artistName: string | null | undefined = null,
): number {
  const idSet = new Set(artistIds.filter(Boolean))
  if (idSet.size === 0 && !artistName) return 0
  const normalizedArtistNames = new Set<string>()
  if (artistName) normalizedArtistNames.add(normalizeName(artistName))

  const songIds = new Set<string>()
  for (const e of events) {
    if (idSet.size > 0 && e.artistIds.some(id => idSet.has(id))) {
      songIds.add(e.songId)
      continue
    }
    if (artistName && titleFeaturesArtist(e.songName, normalizedArtistNames)) {
      songIds.add(e.songId)
    }
  }
  return songIds.size
}

/**
 * Returns true if `songTitle` names one of `normalizedArtistNames` in a
 * `(feat. X)` / `(ft. X)` / `(featuring X)` / `(with X)` clause.
 *
 * "..." handles "&"-delimited collaborator names (e.g. "feat. Simon & Garfunkel"
 * matches both "Simon & Garfunkel" and "Simon" individually) the same way the
 * library "Appears On" detection does.
 */
function titleFeaturesArtist(songTitle: string, normalizedArtistNames: Set<string>): boolean {
  const rawNames = extractFeaturedArtists(songTitle)
  if (rawNames.length === 0) return false

  for (const rawName of rawNames) {
    const normalizedFull = normalizeName(rawName)
    if (normalizedArtistNames.has(normalizedFull)) return true

    // Fall back to splitting on "&" if no full-name match (matches buildFeaturedArtistMap)
    if (rawName.includes('&')) {
      const subNames = rawName.split('&').map(s => s.trim()).filter(Boolean)
      for (const sub of subNames) {
        if (normalizedArtistNames.has(normalizeName(sub))) return true
      }
    }
  }
  return false
}
