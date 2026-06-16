import { describe, it, expect } from 'vitest'
import { computeLibraryStats } from './libraryStatsComputer'
import type { PlayEvent } from '../stores/statsStore'
import type { LibrarySnapshot } from '../stores/librarySnapshotStore'
import type { BaseItemDto, LightweightSong } from '../api/types'

const HOUR_TICKS = 36_000_000_000 // 1 hour in Jellyfin ticks (10M ticks/sec)
const HOUR_MS = 60 * 60 * 1000

function at(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day, 12, 0, 0)
}

function ev(overrides: Partial<PlayEvent> & { ts: number }): PlayEvent {
  return {
    songId: 's1',
    songName: 'Song 1',
    artistIds: ['a1'],
    artistNames: ['Artist 1'],
    albumId: 'al1',
    albumName: 'Album 1',
    genres: ['Rock'],
    year: 1995,
    fullDurationMs: HOUR_MS,
    ...overrides,
  }
}

function snap(overrides: Partial<LibrarySnapshot> = {}): LibrarySnapshot {
  return {
    ts: at(2024, 1, 1),
    totalSongs: 100,
    totalAlbums: 10,
    totalArtists: 5,
    totalGenres: 3,
    genres: { Rock: 60, Pop: 40 },
    decades: { '1990s': 50, '2000s': 50 },
    topArtists: [{ id: 'a1', count: 30 }],
    ...overrides,
  }
}

const WIDE_FROM = new Date(Date.UTC(2000, 0, 1))
const WIDE_TO = new Date(Date.UTC(2100, 0, 1))

describe('computeLibraryStats', () => {
  it('returns zeroed stats when snapshot is null', () => {
    const result = computeLibraryStats([], WIDE_FROM, WIDE_TO, null, [], [])
    expect(result.totalSongs).toBe(0)
    expect(result.topArtists).toEqual([])
    expect(result.genres).toEqual([])
  })

  it('carries totals through from the snapshot', () => {
    const result = computeLibraryStats([], WIDE_FROM, WIDE_TO, snap(), [], [])
    expect(result.totalSongs).toBe(100)
    expect(result.totalAlbums).toBe(10)
    expect(result.totalArtists).toBe(5)
  })

  it('counts unique played songs/albums/artists within the range', () => {
    const events = [
      ev({ ts: at(2024, 2, 1), songId: 's1', albumId: 'al1', artistIds: ['a1'] }),
      ev({ ts: at(2024, 2, 2), songId: 's2', albumId: 'al2', artistIds: ['a2'] }),
      ev({ ts: at(2024, 2, 3), songId: 's1', albumId: 'al1', artistIds: ['a1'] }),
    ]
    const result = computeLibraryStats(events, WIDE_FROM, WIDE_TO, snap(), [], [])
    expect(result.playedSongs).toBe(2)
    expect(result.playedAlbums).toBe(2)
    expect(result.playedArtists).toBe(2)
  })

  it('excludes events outside the date range', () => {
    const events = [
      ev({ ts: at(2024, 2, 1), songId: 's1' }),
      ev({ ts: at(2030, 1, 1), songId: 's2' }),
    ]
    const from = new Date(Date.UTC(2024, 0, 1))
    const to = new Date(Date.UTC(2024, 11, 31))
    const result = computeLibraryStats(events, from, to, snap(), [], [])
    expect(result.playedSongs).toBe(1)
  })

  it('converts owned RunTimeTicks to hours', () => {
    const songs: LightweightSong[] = [
      { Id: 's1', Name: 'A', RunTimeTicks: HOUR_TICKS },
      { Id: 's2', Name: 'B', RunTimeTicks: 2 * HOUR_TICKS },
    ]
    const result = computeLibraryStats([], WIDE_FROM, WIDE_TO, snap(), [], songs)
    expect(result.totalHoursOwned).toBeCloseTo(3, 5)
  })

  it('merges snapshot genres case-insensitively, preferring library casing', () => {
    const songs: LightweightSong[] = [
      { Id: 's1', Name: 'A', RunTimeTicks: HOUR_TICKS, Genres: ['rock'] },
    ]
    const snapshot = snap({ genres: { Rock: 40, rock: 20 } })
    const result = computeLibraryStats([], WIDE_FROM, WIDE_TO, snapshot, [], songs)
    const rockRows = result.genres.filter(g => g.genre.toLowerCase() === 'rock')
    expect(rockRows).toHaveLength(1)
    expect(rockRows[0].owned).toBe(60) // 40 + 20 merged
    expect(rockRows[0].genre).toBe('rock') // current-library casing wins
  })

  it('resolves top-artist names from the artists list', () => {
    const artists: BaseItemDto[] = [{ Id: 'a1', Name: 'Real Artist Name' }]
    const result = computeLibraryStats([], WIDE_FROM, WIDE_TO, snap(), artists, [])
    expect(result.topArtists[0].artistName).toBe('Real Artist Name')
    expect(result.topArtists[0].owned).toBe(30)
  })

  it('falls back to "Unknown" when an artist name cannot be resolved', () => {
    const result = computeLibraryStats([], WIDE_FROM, WIDE_TO, snap(), [], [])
    expect(result.topArtists[0].artistName).toBe('Unknown')
  })
})
