import type { PlayEvent } from '../stores/statsStore'
import type { LibrarySnapshot } from '../stores/librarySnapshotStore'
import type { BaseItemDto, LightweightSong } from '../api/types'

export interface ComputedLibraryStats {
  // Summary: played / total (in tracks)
  totalSongs: number
  playedSongs: number
  totalAlbums: number
  playedAlbums: number
  totalArtists: number
  playedArtists: number
  totalGenres: number
  playedGenres: number

  // Time-based summary (in hours)
  totalHoursOwned: number
  playedHours: number

  // Top artists by catalog depth (snapshot owned count + played-in-timeframe)
  topArtists: Array<{
    artistId: string
    artistName: string
    owned: number
    played: number
    hoursOwned: number
    playedHours: number
  }>

  // Genres: name -> { owned, played }
  genres: Array<{
    genre: string
    owned: number
    played: number
    hoursOwned: number
    playedHours: number
  }>

  // Decades
  decades: Array<{
    decade: string
    owned: number
    played: number
    hoursOwned: number
    playedHours: number
  }>

  // Top Genres × Decades
  topGenreDecades: Array<{
    genre: string
    decade: string
    played: number
    playedHours: number
    hoursOwned: number
  }>
}

function ticksToHours(ticks: number): number {
  return ticks / 10_000_000 / 3600
}

export function computeLibraryStats(
  events: PlayEvent[],
  fromDate: Date,
  toDate: Date,
  snapshot: LibrarySnapshot | null,
  artists: BaseItemDto[],
  songs: LightweightSong[],
): ComputedLibraryStats {
  if (!snapshot) {
    return {
      totalSongs: 0,
      playedSongs: 0,
      totalAlbums: 0,
      playedAlbums: 0,
      totalArtists: 0,
      playedArtists: 0,
      totalGenres: 0,
      playedGenres: 0,
      totalHoursOwned: 0,
      playedHours: 0,
      topArtists: [],
      genres: [],
      decades: [],
      topGenreDecades: [],
    }
  }

  const fromTs = fromDate.getTime()
  const toTs = toDate.getTime()
  const inRange = events.filter(e => e.ts >= fromTs && e.ts <= toTs)

  // Build song duration map
  const songDurationMap = new Map<string, number>()
  for (const song of songs) {
    if (song.Id && song.RunTimeTicks) {
      songDurationMap.set(song.Id, ticksToHours(song.RunTimeTicks))
    }
  }

  // Unique IDs played in timeframe
  const playedSongIds = new Set<string>()
  const playedAlbumIds = new Set<string>()
  const playedArtistIds = new Set<string>()
  const playedGenreNames = new Set<string>()
  const playedSongCountByArtist = new Map<string, Set<string>>()
  const playedSongCountByGenre = new Map<string, Set<string>>()
  const playedSongCountByDecade = new Map<string, Set<string>>()
  const playedHoursByArtist = new Map<string, number>()
  const playedHoursByGenre = new Map<string, number>()
  const playedHoursByDecade = new Map<string, number>()

  let totalPlayedHours = 0
  for (const e of inRange) {
    if (e.songId) playedSongIds.add(e.songId)
    if (e.albumId) playedAlbumIds.add(e.albumId)

    const songDuration = songDurationMap.get(e.songId) || 0
    totalPlayedHours += songDuration

    for (const id of e.artistIds) {
      if (!id) continue
      playedArtistIds.add(id)
      if (!playedSongCountByArtist.has(id)) playedSongCountByArtist.set(id, new Set())
      playedSongCountByArtist.get(id)!.add(e.songId)
      playedHoursByArtist.set(id, (playedHoursByArtist.get(id) || 0) + songDuration)
    }
    for (const g of e.genres) {
      if (!g) continue
      playedGenreNames.add(g)
      if (!playedSongCountByGenre.has(g)) playedSongCountByGenre.set(g, new Set())
      playedSongCountByGenre.get(g)!.add(e.songId)
      playedHoursByGenre.set(g, (playedHoursByGenre.get(g) || 0) + songDuration)
    }
    if (e.year) {
      const decade = `${Math.floor(e.year / 10) * 10}s`
      if (!playedSongCountByDecade.has(decade)) playedSongCountByDecade.set(decade, new Set())
      playedSongCountByDecade.get(decade)!.add(e.songId)
      playedHoursByDecade.set(decade, (playedHoursByDecade.get(decade) || 0) + songDuration)
    }
  }

  const artistNameById = new Map<string, string>()
  for (const a of artists) {
    if (a.Id && a.Name) artistNameById.set(a.Id, a.Name)
  }
  // Fallback: derive names from song.ArtistItems (musicStore.artists may be empty)
  for (const s of songs) {
    if (!s.ArtistItems) continue
    for (const a of s.ArtistItems) {
      if (a.Id && a.Name && !artistNameById.has(a.Id)) {
        artistNameById.set(a.Id, a.Name)
      }
    }
  }
  // Also fallback to PlayEvents for any IDs still missing
  for (const e of events) {
    e.artistIds.forEach((id, i) => {
      if (id && !artistNameById.has(id) && e.artistNames[i]) {
        artistNameById.set(id, e.artistNames[i])
      }
    })
  }

  // Single pass over songs: total hours, per-artist, per-genre, per-decade,
  // and per (genre, decade) for topGenreDecades below.
  const artistIdSet = new Set(snapshot.topArtists.map(a => a.id))
  const hoursOwnedByArtist = new Map<string, number>()
  const hoursOwnedByGenre = new Map<string, number>()
  const hoursOwnedByDecade = new Map<string, number>()
  const hoursOwnedByGenreDecade = new Map<string, number>()
  let totalHoursOwned = 0

  for (const song of songs) {
    if (!song.RunTimeTicks) continue
    const hrs = ticksToHours(song.RunTimeTicks)
    totalHoursOwned += hrs

    if (song.ArtistItems) {
      const seen = new Set<string>()
      for (const a of song.ArtistItems) {
        if (a.Id && artistIdSet.has(a.Id) && !seen.has(a.Id)) {
          seen.add(a.Id)
          hoursOwnedByArtist.set(a.Id, (hoursOwnedByArtist.get(a.Id) || 0) + hrs)
        }
      }
    }

    let decade: string | null = null
    if (song.ProductionYear) {
      decade = `${Math.floor(song.ProductionYear / 10) * 10}s`
      hoursOwnedByDecade.set(decade, (hoursOwnedByDecade.get(decade) || 0) + hrs)
    }

    if (song.Genres) {
      for (const g of song.Genres) {
        if (!g) continue
        hoursOwnedByGenre.set(g, (hoursOwnedByGenre.get(g) || 0) + hrs)
        if (decade) {
          const key = `${g}|${decade}`
          hoursOwnedByGenreDecade.set(key, (hoursOwnedByGenreDecade.get(key) || 0) + hrs)
        }
      }
    }
  }

  // Top artists: from snapshot, look up name from musicStore; played count from events
  const topArtists = snapshot.topArtists
    .map(({ id, count }) => ({
      artistId: id,
      artistName: artistNameById.get(id) || 'Unknown',
      owned: count,
      played: playedSongCountByArtist.get(id)?.size ?? 0,
      hoursOwned: hoursOwnedByArtist.get(id) || 0,
      playedHours: playedHoursByArtist.get(id) || 0,
    }))

  const genres = Object.entries(snapshot.genres)
    .map(([genre, owned]) => ({
      genre,
      owned,
      played: playedSongCountByGenre.get(genre)?.size ?? 0,
      hoursOwned: hoursOwnedByGenre.get(genre) || 0,
      playedHours: playedHoursByGenre.get(genre) || 0,
    }))
    .sort((a, b) => b.owned - a.owned)

  const decades = Object.entries(snapshot.decades)
    .map(([decade, owned]) => ({
      decade,
      owned,
      played: playedSongCountByDecade.get(decade)?.size ?? 0,
      hoursOwned: hoursOwnedByDecade.get(decade) || 0,
      playedHours: playedHoursByDecade.get(decade) || 0,
    }))
    .sort((a, b) => a.decade.localeCompare(b.decade))

  // Compute top genre × decades
  const genreDecadeStats = new Map<string, { played: number; playedHours: number }>()
  for (const event of inRange) {
    const songDuration = songDurationMap.get(event.songId) || 0

    if (event.genres && event.year) {
      const decade = `${Math.floor(event.year / 10) * 10}s`
      for (const genre of event.genres) {
        if (!genre) continue
        const key = `${genre}|${decade}`
        const current = genreDecadeStats.get(key) || { played: 0, playedHours: 0 }
        genreDecadeStats.set(key, {
          played: current.played + 1,
          playedHours: current.playedHours + songDuration,
        })
      }
    }
  }

  const topGenreDecades = [...genreDecadeStats.entries()]
    .map(([key, stats]) => {
      const [genre, decade] = key.split('|')
      return { genre, decade, ...stats, hoursOwned: hoursOwnedByGenreDecade.get(key) || 0 }
    })
    .sort((a, b) => b.playedHours - a.playedHours)
    .slice(0, 50)

  return {
    totalSongs: snapshot.totalSongs,
    playedSongs: playedSongIds.size,
    totalAlbums: snapshot.totalAlbums,
    playedAlbums: playedAlbumIds.size,
    totalArtists: snapshot.totalArtists,
    playedArtists: playedArtistIds.size,
    totalGenres: snapshot.totalGenres,
    playedGenres: playedGenreNames.size,
    totalHoursOwned,
    playedHours: totalPlayedHours,
    topArtists,
    genres,
    decades,
    topGenreDecades,
  }
}
