import { describe, it, expect } from 'vitest'
import { computeStats } from './statsComputer'
import type { PlayEvent } from '../stores/statsStore'

const HOUR_MS = 60 * 60 * 1000

/** Build a PlayEvent with sensible defaults; override fields per test. */
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

/** A timestamp for the given year/month (1-based)/day, UTC noon to avoid TZ edges. */
function at(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day, 12, 0, 0)
}

const WIDE_FROM = new Date(Date.UTC(2000, 0, 1))
const WIDE_TO = new Date(Date.UTC(2100, 0, 1))

describe('computeStats', () => {
  it('returns empty stats for no events', () => {
    const result = computeStats([], WIDE_FROM, WIDE_TO)
    expect(result.totalSongs).toBe(0)
    expect(result.topSongs).toEqual([])
    expect(result.timeline).toEqual([])
  })

  it('returns empty stats when all events fall outside the date range', () => {
    const events = [ev({ ts: at(2020, 1, 1) })]
    const from = new Date(Date.UTC(2021, 0, 1))
    const to = new Date(Date.UTC(2022, 0, 1))
    expect(computeStats(events, from, to).totalSongs).toBe(0)
  })

  it('computes basic totals and uniques', () => {
    const events = [
      ev({ ts: at(2024, 1, 1), songId: 's1', artistIds: ['a1'], albumId: 'al1' }),
      ev({ ts: at(2024, 1, 2), songId: 's2', artistIds: ['a2'], albumId: 'al2' }),
      ev({ ts: at(2024, 1, 3), songId: 's1', artistIds: ['a1'], albumId: 'al1' }),
    ]
    const result = computeStats(events, WIDE_FROM, WIDE_TO)
    expect(result.totalSongs).toBe(3)
    expect(result.uniqueSongs).toBe(2)
    expect(result.uniqueArtists).toBe(2)
    expect(result.uniqueAlbums).toBe(2)
    expect(result.totalHours).toBeCloseTo(3, 5)
  })

  it('awards the "obsessed" badge at 10+ plays in one day', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      ev({ ts: at(2024, 3, 5) + i * 1000, songId: 's1' }),
    )
    const result = computeStats(events, WIDE_FROM, WIDE_TO)
    const top = result.topSongs.find(s => s.songId === 's1')!
    expect(top.badges).toContain('obsessed')
    expect(top.obsessedDetail).toEqual({ count: 10, date: '2024-03-05' })
  })

  it('does not award "obsessed" at 9 plays in one day', () => {
    const events = Array.from({ length: 9 }, (_, i) =>
      ev({ ts: at(2024, 3, 5) + i * 1000, songId: 's1' }),
    )
    const result = computeStats(events, WIDE_FROM, WIDE_TO)
    const top = result.topSongs.find(s => s.songId === 's1')!
    expect(top.badges).not.toContain('obsessed')
  })

  it('awards "on-repeat" for 3 consecutive months in the top 5', () => {
    // s1 is the only song played each month -> always in top 5.
    const events = [
      ev({ ts: at(2024, 1, 10), songId: 's1' }),
      ev({ ts: at(2024, 2, 10), songId: 's1' }),
      ev({ ts: at(2024, 3, 10), songId: 's1' }),
    ]
    const result = computeStats(events, WIDE_FROM, WIDE_TO)
    const top = result.topSongs.find(s => s.songId === 's1')!
    expect(top.badges).toContain('on-repeat')
    expect(top.onRepeatMonths).toBe(3)
  })

  it('counts a December -> January boundary as consecutive', () => {
    const events = [
      ev({ ts: at(2023, 11, 10), songId: 's1' }),
      ev({ ts: at(2023, 12, 10), songId: 's1' }),
      ev({ ts: at(2024, 1, 10), songId: 's1' }),
    ]
    const result = computeStats(events, WIDE_FROM, WIDE_TO)
    const top = result.topSongs.find(s => s.songId === 's1')!
    expect(top.onRepeatMonths).toBe(3)
    expect(top.badges).toContain('on-repeat')
  })

  it('does not award "on-repeat" for non-consecutive months', () => {
    const events = [
      ev({ ts: at(2024, 1, 10), songId: 's1' }),
      ev({ ts: at(2024, 3, 10), songId: 's1' }), // gap in Feb
      ev({ ts: at(2024, 5, 10), songId: 's1' }),
    ]
    const result = computeStats(events, WIDE_FROM, WIDE_TO)
    const top = result.topSongs.find(s => s.songId === 's1')!
    expect(top.badges).not.toContain('on-repeat')
  })

  it('marks ride-or-die artists present in every month (>=3 months)', () => {
    const events = [
      ev({ ts: at(2024, 1, 10), artistIds: ['a1'], artistNames: ['A1'] }),
      ev({ ts: at(2024, 2, 10), artistIds: ['a1'], artistNames: ['A1'] }),
      ev({ ts: at(2024, 3, 10), artistIds: ['a1'], artistNames: ['A1'] }),
      // a2 only appears in one month -> not ride-or-die
      ev({ ts: at(2024, 2, 11), artistIds: ['a2'], artistNames: ['A2'] }),
    ]
    const result = computeStats(events, WIDE_FROM, WIDE_TO)
    const a1 = result.topArtists.find(a => a.artistId === 'a1')!
    const a2 = result.topArtists.find(a => a.artistId === 'a2')!
    expect(a1.badges).toContain('ride-or-die')
    expect(a2.badges).not.toContain('ride-or-die')
  })

  it('does not mark ride-or-die with fewer than 3 months of data', () => {
    const events = [
      ev({ ts: at(2024, 1, 10), artistIds: ['a1'], artistNames: ['A1'] }),
      ev({ ts: at(2024, 2, 10), artistIds: ['a1'], artistNames: ['A1'] }),
    ]
    const result = computeStats(events, WIDE_FROM, WIDE_TO)
    const a1 = result.topArtists.find(a => a.artistId === 'a1')!
    expect(a1.badges).not.toContain('ride-or-die')
  })

  it('marks the peak month in the timeline', () => {
    const events = [
      ev({ ts: at(2024, 1, 10), fullDurationMs: HOUR_MS }),
      ev({ ts: at(2024, 2, 10), fullDurationMs: 5 * HOUR_MS }),
      ev({ ts: at(2024, 3, 10), fullDurationMs: 2 * HOUR_MS }),
    ]
    const result = computeStats(events, WIDE_FROM, WIDE_TO)
    const peaks = result.timeline.filter(t => t.isPeak)
    expect(peaks).toHaveLength(1)
    expect(peaks[0].month).toBe('2024-02')
  })

  it('groups genres case-insensitively', () => {
    const events = [
      ev({ ts: at(2024, 1, 1), genres: ['Rock'] }),
      ev({ ts: at(2024, 1, 2), genres: ['rock'] }),
      ev({ ts: at(2024, 1, 3), genres: ['ROCK'] }),
    ]
    const result = computeStats(events, WIDE_FROM, WIDE_TO)
    const rock = result.topGenres.filter(g => g.genre.toLowerCase() === 'rock')
    expect(rock).toHaveLength(1)
    expect(rock[0].genre).toBe('Rock') // first-seen casing wins
  })

  it('buckets years into decades', () => {
    const events = [
      ev({ ts: at(2024, 1, 1), year: 1991 }),
      ev({ ts: at(2024, 1, 2), year: 1999 }),
      ev({ ts: at(2024, 1, 3), year: 2003 }),
    ]
    const result = computeStats(events, WIDE_FROM, WIDE_TO)
    const labels = result.decades.map(d => d.decade)
    expect(labels).toContain('1990s')
    expect(labels).toContain('2000s')
    const nineties = result.decades.find(d => d.decade === '1990s')!
    expect(nineties.hours).toBeCloseTo(2, 5)
  })

  it('splits multi-artist play time evenly across artists', () => {
    const events = [
      ev({
        ts: at(2024, 1, 1),
        artistIds: ['a1', 'a2'],
        artistNames: ['A1', 'A2'],
        fullDurationMs: 2 * HOUR_MS,
      }),
    ]
    const result = computeStats(events, WIDE_FROM, WIDE_TO)
    const a1 = result.topArtists.find(a => a.artistId === 'a1')!
    expect(a1.hours).toBeCloseTo(1, 5)
  })

  it('reports busiestMonth only when there are at least 2 months', () => {
    const single = computeStats([ev({ ts: at(2024, 1, 1) })], WIDE_FROM, WIDE_TO)
    expect(single.busiestMonth).toBeNull()

    const multi = computeStats(
      [ev({ ts: at(2024, 1, 1) }), ev({ ts: at(2024, 2, 1) })],
      WIDE_FROM,
      WIDE_TO,
    )
    expect(multi.busiestMonth).not.toBeNull()
  })
})
