import type { PlayEvent } from '../stores/statsStore'

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
  toDate: Date
): ComputedStats {
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
  const totalMs = filteredEvents.reduce((sum, e) => sum + e.durationMs, 0)
  const totalHours = msToHours(totalMs)

  // Group by day for records
  const byDay = groupBy(filteredEvents, e => formatDate(e.ts))

  const biggestDay = Object.entries(byDay)
    .map(([date, evts]) => ({ date, count: evts.length }))
    .sort((a, b) => b.count - a.count)[0] || null

  const mostListeningDay = Object.entries(byDay)
    .map(([date, evts]) => ({
      date,
      hours: msToHours(evts.reduce((sum, e) => sum + e.durationMs, 0))
    }))
    .sort((a, b) => b.hours - a.hours)[0] || null

  // Group by month
  const byMonth = groupBy(filteredEvents, e => formatMonth(e.ts))
  const months = Object.keys(byMonth).sort()

  const busiestMonth = months.length >= 2
    ? Object.entries(byMonth)
        .map(([month, evts]) => ({
          month,
          hours: msToHours(evts.reduce((sum, e) => sum + e.durationMs, 0))
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
        current.ms += e.durationMs / artistCount
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
        albumId: e.albumId,
        plays: 0,
        ms: 0,
        dayPlays: new Map(),
        monthsInTop5: new Set(),
      })
    }

    const stat = songStats.get(e.songId)!
    stat.plays++
    stat.ms += e.durationMs
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
    .slice(0, 10)
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
      stat.ms += e.durationMs / artistCount
    })
  })

  const topArtists = [...artistStats.entries()]
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, 10)
    .map(([artistId, stat]) => ({
      artistId,
      artistName: stat.name,
      hours: msToHours(stat.ms),
      plays: stat.plays,
      badges: rideOrDieArtists.has(artistId) ? ['ride-or-die' as const] : [],
    }))

  // Top albums
  const albumStats = new Map<string, { name: string; artistName: string; plays: number; ms: number }>()

  filteredEvents.forEach(e => {
    if (!e.albumId) return

    if (!albumStats.has(e.albumId)) {
      albumStats.set(e.albumId, {
        name: e.albumName,
        artistName: e.artistNames[0] || 'Unknown',
        plays: 0,
        ms: 0,
      })
    }
    const stat = albumStats.get(e.albumId)!
    stat.plays++
    stat.ms += e.durationMs
  })

  const topAlbums = [...albumStats.entries()]
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, 10)
    .map(([albumId, stat]) => ({
      albumId,
      albumName: stat.name,
      artistName: stat.artistName,
      hours: msToHours(stat.ms),
      plays: stat.plays,
    }))

  // Top genres
  const genreStats = new Map<string, number>()
  filteredEvents.forEach(e => {
    e.genres.forEach(genre => {
      genreStats.set(genre, (genreStats.get(genre) || 0) + e.durationMs / e.genres.length)
    })
  })

  const topGenres = [...genreStats.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([genre, ms]) => ({ genre, hours: msToHours(ms) }))

  // Decades
  const decadeStats = new Map<string, number>()
  filteredEvents.forEach(e => {
    if (e.year) {
      const decade = `${Math.floor(e.year / 10) * 10}s`
      decadeStats.set(decade, (decadeStats.get(decade) || 0) + e.durationMs)
    }
  })

  const decades = [...decadeStats.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([decade, ms]) => ({ decade, hours: msToHours(ms) }))

  // Top genre × decade combos
  const genreDecadeStats = new Map<string, { genre: string; decade: string; ms: number }>()
  filteredEvents.forEach(e => {
    if (e.year && e.genres.length > 0) {
      const decade = `${Math.floor(e.year / 10) * 10}s`
      e.genres.forEach(genre => {
        const key = `${genre}|${decade}`
        const current = genreDecadeStats.get(key) || { genre, decade, ms: 0 }
        current.ms += e.durationMs / e.genres.length
        genreDecadeStats.set(key, current)
      })
    }
  })

  const topGenreDecades = [...genreDecadeStats.values()]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 5)
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
