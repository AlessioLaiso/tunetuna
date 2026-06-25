import { describe, it, expect } from 'vitest'
import {
  computeArtistTopSongs,
  countPlayedSongsForArtist,
  getRollingSixMonthRange,
  formatRangeSubtitle,
  type SongLookup,
} from './statsComputer'
import type { PlayEvent } from '../stores/statsStore'

const HOUR_MS = 60 * 60 * 1000

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

const EMPTY_LOOKUP: SongLookup = new Map()

describe('computeArtistTopSongs', () => {
  it('returns empty when no artist IDs and no name are given', () => {
    const events = [ev({ ts: 1, songId: 's1' })]
    expect(computeArtistTopSongs(events, [], null, EMPTY_LOOKUP, 5)).toEqual([])
  })

  it('returns empty when there are no events', () => {
    expect(computeArtistTopSongs([], ['a1'], 'Artist 1', EMPTY_LOOKUP, 5)).toEqual([])
  })

  it('ranks songs by play count, descending', () => {
    const events = [
      ev({ ts: 1, songId: 's1', songName: 'Less played' }),
      ev({ ts: 2, songId: 's2', songName: 'Most played' }),
      ev({ ts: 3, songId: 's2' }),
      ev({ ts: 4, songId: 's2' }),
      ev({ ts: 5, songId: 's1' }),
    ]
    const result = computeArtistTopSongs(events, ['a1'], 'Artist 1', EMPTY_LOOKUP, 5)
    expect(result.map(s => s.songId)).toEqual(['s2', 's1'])
    expect(result[0].plays).toBe(3)
    expect(result[1].plays).toBe(2)
  })

  it('matches a credited artist anywhere in artistIds (featured collaborator)', () => {
    const events = [
      ev({ ts: 1, songId: 's1', artistIds: ['a1', 'a2'], artistNames: ['Artist 1', 'Artist 2'] }),
      ev({ ts: 2, songId: 's2', artistIds: ['a2', 'a1'], artistNames: ['Artist 2', 'Artist 1'] }),
      ev({ ts: 3, songId: 's2', artistIds: ['a2', 'a1'] }),
    ]
    const result = computeArtistTopSongs(events, ['a1'], 'Artist 1', EMPTY_LOOKUP, 5)
    expect(result.map(s => s.songId).sort()).toEqual(['s1', 's2'])
    // For credited matches, primaryArtistName is null (we don't repeat the artist).
    expect(result.every(s => s.primaryArtistName === null)).toBe(true)
  })

  it('matches any of the alias IDs (duplicate artist entries)', () => {
    const events = [
      ev({ ts: 1, songId: 's1', artistIds: ['a1'] }),
      ev({ ts: 2, songId: 's2', artistIds: ['a1-dup'] }),
    ]
    const result = computeArtistTopSongs(events, ['a1', 'a1-dup'], 'Artist 1', EMPTY_LOOKUP, 5)
    expect(result.map(s => s.songId).sort()).toEqual(['s1', 's2'])
  })

  it('ignores events with no matching artist', () => {
    const events = [
      ev({ ts: 1, songId: 's1', artistIds: ['a1'] }),
      ev({ ts: 2, songId: 's2', artistIds: ['a2'] }),
    ]
    const result = computeArtistTopSongs(events, ['a1'], 'Artist 1', EMPTY_LOOKUP, 5)
    expect(result.map(s => s.songId)).toEqual(['s1'])
  })

  it('respects the limit', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      ev({ ts: i + 1, songId: `s${i}`, artistIds: ['a1'] }),
    )
    expect(computeArtistTopSongs(events, ['a1'], 'Artist 1', EMPTY_LOOKUP, 5).length).toBe(5)
  })

  describe('title-featured ("Appears On") matching', () => {
    it('matches songs where the artist is named in a (feat. X) clause, even without the artist ID on the event', () => {
      const events = [
        // Event carries NO artistId for our artist — only the title names them
        ev({
          ts: 1,
          songId: 's1',
          songName: 'Some Track (feat. Artist 1)',
          artistIds: ['a-other'],
          artistNames: ['Other Artist'],
          albumId: 'al1',
          albumName: 'Other Album',
          year: 2020,
        }),
        ev({
          ts: 2,
          songId: 's1',
          songName: 'Some Track (feat. Artist 1)',
          artistIds: ['a-other'],
        }),
        ev({
          ts: 3,
          songId: 's2',
          songName: 'Another (ft. Artist 1)',
          artistIds: ['a-other2'],
          artistNames: ['Someone Else'],
        }),
      ]
      const result = computeArtistTopSongs(events, [], 'Artist 1', EMPTY_LOOKUP, 5)
      expect(result.map(s => s.songId).sort()).toEqual(['s1', 's2'])
    })

    it('matches (with X) and (featuring X) clauses', () => {
      const events = [
        ev({ ts: 1, songId: 's1', songName: 'Song (with Artist 1)', artistIds: ['x'] }),
        ev({ ts: 2, songId: 's2', songName: 'Song (featuring Artist 1)', artistIds: ['y'] }),
      ]
      const result = computeArtistTopSongs(events, [], 'Artist 1', EMPTY_LOOKUP, 5)
      expect(result.map(s => s.songId).sort()).toEqual(['s1', 's2'])
    })

    it('matches "&"-delimited featured names', () => {
      const events = [
        ev({ ts: 1, songId: 's1', songName: 'Song (feat. Simon & Garfunkel)', artistIds: ['x'] }),
      ]
      // Matches either as the full "Simon & Garfunkel" or individually as "Garfunkel"
      expect(computeArtistTopSongs(events, [], 'Garfunkel', EMPTY_LOOKUP, 5).map(s => s.songId)).toEqual(['s1'])
      expect(computeArtistTopSongs(events, [], 'Simon & Garfunkel', EMPTY_LOOKUP, 5).map(s => s.songId)).toEqual(['s1'])
    })

    it('does not match an unrelated featured artist', () => {
      const events = [
        ev({ ts: 1, songId: 's1', songName: 'Song (feat. Someone Else)', artistIds: ['x'] }),
      ]
      expect(computeArtistTopSongs(events, [], 'Artist 1', EMPTY_LOOKUP, 5)).toEqual([])
    })
  })

  describe('secondary-line metadata', () => {
    it('shows the primary artist only for title-featured ("appears on") songs', () => {
      const lookup: SongLookup = new Map([
        // Featured song: library credits "Other Artist" as primary
        ['s1', {
          Name: 'Some Track (feat. Artist 1)',
          AlbumArtist: 'Other Artist',
          ArtistItems: [{ Id: 'a-other', Name: 'Other Artist' }],
          Album: 'Collab Album',
          AlbumId: 'al1',
          ProductionYear: 2021,
        }],
        // Own song: this artist is the credited/primary artist
        ['s2', {
          Name: 'My Own Song',
          AlbumArtist: 'Artist 1',
          ArtistItems: [{ Id: 'a1', Name: 'Artist 1' }],
          Album: 'My Album',
          AlbumId: 'al2',
          ProductionYear: 2022,
        }],
      ])
      const events = [
        ev({
          ts: 1, songId: 's1',
          songName: 'Some Track (feat. Artist 1)',
          artistIds: ['a-other'], artistNames: ['Other Artist'],
          albumId: 'al1', albumName: 'Collab Album', year: 2021,
        }),
        ev({ ts: 2, songId: 's2', artistIds: ['a1'], artistNames: ['Artist 1'], albumId: 'al2', albumName: 'My Album', year: 2022 }),
      ]
      const result = computeArtistTopSongs(events, ['a1'], 'Artist 1', lookup, 5)
      const featured = result.find(s => s.songId === 's1')!
      const own = result.find(s => s.songId === 's2')!
      // Featured appearance: secondary line shows the primary artist (Other Artist)
      expect(featured.primaryArtistName).toBe('Other Artist')
      expect(featured.primaryArtistId).toBe('a-other')
      expect(featured.albumName).toBe('Collab Album')
      expect(featured.year).toBe(2021)
      // Own song: no artist shown, only album + year (matches main Songs section)
      expect(own.primaryArtistName).toBeNull()
      expect(own.albumName).toBe('My Album')
      expect(own.year).toBe(2022)
    })

    it('falls back to event metadata when the song is not in the library lookup', () => {
      const events = [
        ev({
          ts: 1, songId: 's1', artistIds: ['a1'], artistNames: ['Artist 1'],
          albumId: 'al1', albumName: 'Album 1', year: 2019,
        }),
      ]
      const result = computeArtistTopSongs(events, ['a1'], 'Artist 1', EMPTY_LOOKUP, 5)
      const s = result[0]
      expect(s.albumName).toBe('Album 1')
      expect(s.albumId).toBe('al1')
      expect(s.year).toBe(2019)
    })
  })
})

describe('countPlayedSongsForArtist', () => {
  it('counts distinct songs, including featured appearances', () => {
    const events = [
      ev({ ts: 1, songId: 's1', artistIds: ['a1', 'a2'] }),
      ev({ ts: 2, songId: 's1', artistIds: ['a1', 'a2'] }), // same song, replay
      ev({ ts: 3, songId: 's2', artistIds: ['a2', 'a1'] }), // featured
      ev({ ts: 4, songId: 's3', artistIds: ['a3'] }),       // unrelated
    ]
    expect(countPlayedSongsForArtist(events, ['a1'], 'Artist 1')).toBe(2)
  })

  it('counts title-featured ("appears on") songs even without the artist ID', () => {
    const events = [
      ev({ ts: 1, songId: 's1', songName: 'Song (feat. Artist 1)', artistIds: ['x'] }),
      ev({ ts: 2, songId: 's1', songName: 'Song (feat. Artist 1)' }),
      ev({ ts: 3, songId: 's2', songName: 'Other (with Artist 1)', artistIds: ['y'] }),
      ev({ ts: 4, songId: 's3', songName: 'Unrelated (feat. Someone)', artistIds: ['z'] }),
    ]
    expect(countPlayedSongsForArtist(events, [], 'Artist 1')).toBe(2)
  })

  it('returns 0 when no events match', () => {
    expect(countPlayedSongsForArtist([], ['a1'], 'Artist 1')).toBe(0)
    expect(countPlayedSongsForArtist([ev({ ts: 1, artistIds: ['a2'] })], ['a1'], 'Artist 1')).toBe(0)
  })
})

describe('getRollingSixMonthRange', () => {
  it('produces a 6-month-wide range ending at the current month', () => {
    const now = new Date('2026-05-15T10:00:00Z')
    const range = getRollingSixMonthRange(now)
    expect(range.toMonth).toBe('2026-05')
    expect(range.fromMonth).toBe('2025-12')
  })

  it('toDate is the last moment of the current month', () => {
    const now = new Date('2026-01-10T10:00:00Z')
    const range = getRollingSixMonthRange(now)
    expect(range.toDate.getFullYear()).toBe(2026)
    expect(range.toDate.getDate()).toBe(31)
    expect(range.toDate.getHours()).toBe(23)
    expect(range.toDate.getMinutes()).toBe(59)
    expect(range.toDate.getSeconds()).toBe(59)
  })

  it('handles year boundaries', () => {
    const now = new Date('2026-02-15T10:00:00Z')
    const range = getRollingSixMonthRange(now)
    expect(range.toMonth).toBe('2026-02')
    expect(range.fromMonth).toBe('2025-09')
  })
})

describe('formatRangeSubtitle', () => {
  it('formats a range as "Mon YYYY - Mon YYYY"', () => {
    expect(formatRangeSubtitle('2025-12', '2026-05')).toBe('Dec 2025 - May 2026')
  })

  it('collapses a single-month range', () => {
    expect(formatRangeSubtitle('2026-05', '2026-05')).toBe('May 2026')
  })

  it('returns empty string for missing bounds', () => {
    expect(formatRangeSubtitle('', '')).toBe('')
  })
})