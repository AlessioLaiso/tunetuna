import { describe, it, expect } from 'vitest'
import { searchLibrary, browseLibrary, queryWords, type LocalSearchSource } from './localSearch'
import type { BaseItemDto, LightweightSong } from '../api/types'

function song(id: string, name: string, extra: Partial<LightweightSong> = {}): LightweightSong {
  return { Id: id, Name: name, ...extra }
}

function item(id: string, name: string, extra: Partial<BaseItemDto> = {}): BaseItemDto {
  return { Id: id, Name: name, ...extra } as BaseItemDto
}

function source(overrides: Partial<LocalSearchSource> = {}): LocalSearchSource {
  return { songs: [], artists: [], albums: [], playlists: [], ...overrides }
}

const ids = (items: BaseItemDto[]) => items.map(i => i.Id)

describe('queryWords', () => {
  it('lowercases, strips accents and apostrophes, and splits on whitespace', () => {
    expect(queryWords("  Beyoncé  Don't ")).toEqual(['beyonce', 'dont'])
  })

  it('is empty for blank input', () => {
    expect(queryWords('   ')).toEqual([])
  })
})

describe('searchLibrary', () => {
  it('matches songs by title, artist, album artist and genre, but not album name', () => {
    const songs = [
      song('title', 'Rain Song'),
      song('artist', 'Other', { ArtistItems: [item('a1', 'Rain Man')] }),
      song('albumArtist', 'Other 2', { AlbumArtist: 'Purple Rain Band' }),
      song('genre', 'Other 3', { Genres: ['Rainwave'] }),
      song('album', 'Other 4', { Album: 'Rain Album' }),
    ]
    const result = searchLibrary('rain', source({ songs }))
    expect(ids(result.songs).sort()).toEqual(['albumArtist', 'artist', 'genre', 'title'])
  })

  it('requires every word, in any field and any order', () => {
    const songs = [
      song('both', 'Born This Way', { AlbumArtist: 'Lady Gaga' }),
      song('one', 'Born to Run', { AlbumArtist: 'Bruce Springsteen' }),
    ]
    expect(ids(searchLibrary('lady born', source({ songs })).songs)).toEqual(['both'])
  })

  it('matches regardless of accents and smart quotes on either side', () => {
    const songs = [song('1', 'Café del Mar'), song('2', 'Don’t Stop')]
    expect(ids(searchLibrary('cafe', source({ songs })).songs)).toEqual(['1'])
    expect(ids(searchLibrary("don't", source({ songs })).songs)).toEqual(['2'])
  })

  it('ranks exact, then prefix, then word start, then substring, then other fields', () => {
    const songs = [
      song('other-field', 'Zebra', { AlbumArtist: 'Love Inc' }),
      song('substring', 'Glove'),
      song('word-start', 'Crazy Love Song'),
      song('prefix', 'Lovers'),
      song('exact', 'Love'),
    ]
    expect(ids(searchLibrary('love', source({ songs })).songs)).toEqual([
      'exact', 'prefix', 'word-start', 'substring', 'other-field',
    ])
  })

  it('keeps alphabetical order within a rank', () => {
    const songs = [song('c', 'Love C'), song('a', 'Love A'), song('b', 'Love B')]
    expect(ids(searchLibrary('love', source({ songs })).songs)).toEqual(['a', 'b', 'c'])
  })

  it('matches albums by name or album artist, artists and playlists by name', () => {
    const result = searchLibrary('queen', source({
      albums: [
        item('byName', 'Queen II'),
        item('byArtist', 'A Night at the Opera', { AlbumArtist: 'Queen' }),
        item('none', 'Kings'),
      ],
      artists: [item('queen', 'Queen'), item('king', 'King')],
      playlists: [item('pl', 'Queen hits'), item('pl2', 'Mix')],
    }))
    expect(ids(result.albums).sort()).toEqual(['byArtist', 'byName'])
    expect(ids(result.artists)).toEqual(['queen'])
    expect(ids(result.playlists)).toEqual(['pl'])
  })

  it('returns songs as audio items with their cached fields', () => {
    const songs = [song('1', 'Hello', { AlbumId: 'al', Bpm: 120, Grouping: ['mood_happy'] })]
    const [result] = searchLibrary('hello', source({ songs })).songs
    expect(result).toMatchObject({ Id: '1', Type: 'Audio', AlbumId: 'al', Bpm: 120, Grouping: ['mood_happy'] })
  })

  it('reuses the same item objects across searches of the same library', () => {
    const songs = [song('1', 'Hello')]
    const first = searchLibrary('hel', source({ songs })).songs[0]
    const second = searchLibrary('hello', source({ songs })).songs[0]
    expect(second).toBe(first)
  })

  it('sees changes once the store replaces the array', () => {
    const before = [song('1', 'Hello')]
    expect(searchLibrary('new', source({ songs: before })).songs).toHaveLength(0)
    const after = [...before, song('2', 'New One')]
    expect(ids(searchLibrary('new', source({ songs: after })).songs)).toEqual(['2'])
  })

  it('falls back to browsing for a query with no words', () => {
    const songs = [song('b', 'B'), song('a', 'A')]
    expect(ids(searchLibrary("  '  ", source({ songs })).songs)).toEqual(['a', 'b'])
  })
})

describe('browseLibrary', () => {
  it('returns everything in alphabetical order', () => {
    const result = browseLibrary(source({
      songs: [song('2', 'beta'), song('1', 'Alpha'), song('10', 'track 10'), song('9', 'track 9')],
      albums: [item('y', 'Y'), item('x', 'x')],
    }))
    expect(ids(result.songs)).toEqual(['1', '2', '9', '10'])
    expect(ids(result.albums)).toEqual(['x', 'y'])
  })
})
