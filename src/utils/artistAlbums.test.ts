import { describe, it, expect } from 'vitest'
import type { BaseItemDto } from '../api/types'
import { splitArtistAlbums } from './artistAlbums'

const ARTIST = 'artist-a'

function album(id: string, albumArtistIds: string[] = ['artist-b']): BaseItemDto {
  return {
    Id: id,
    Name: id,
    Type: 'MusicAlbum',
    AlbumArtists: albumArtistIds.map(aid => ({ Id: aid, Name: aid })),
  }
}

describe('splitArtistAlbums', () => {
  it('moves albums where the artist is only a track artist to appears on', () => {
    const own = album('own', [ARTIST])
    // Album by another artist that carries the artist in its aggregated album artists
    const contribution = album('other', ['artist-b', ARTIST])

    const result = splitArtistAlbums([own, contribution], new Set(['own']), ARTIST)

    expect(result.ownAlbums.map(a => a.Id)).toEqual(['own'])
    expect(result.appearsOnAlbums.map(a => a.Id)).toEqual(['other'])
  })

  it('trusts the album artist ids over a missing AlbumArtists field', () => {
    const untagged: BaseItemDto = { Id: 'other', Name: 'other', Type: 'MusicAlbum' }

    const result = splitArtistAlbums([untagged], new Set(), ARTIST)

    expect(result.ownAlbums).toEqual([])
    expect(result.appearsOnAlbums.map(a => a.Id)).toEqual(['other'])
  })

  it('falls back to AlbumArtists when the server ignored the album artist filter', () => {
    const own = album('own', [ARTIST])
    const contribution = album('other', ['artist-b'])
    // Whole library echoed back — larger than the artist's discography
    const unfiltered = new Set(['own', 'other', 'unrelated', 'unrelated-2'])

    const result = splitArtistAlbums([own, contribution], unfiltered, ARTIST)

    expect(result.ownAlbums.map(a => a.Id)).toEqual(['own'])
    expect(result.appearsOnAlbums.map(a => a.Id)).toEqual(['other'])
  })

  it('falls back to AlbumArtists when no album artist ids are available', () => {
    const own = album('own', [ARTIST])
    const contribution = album('other', ['artist-b'])
    const untagged: BaseItemDto = { Id: 'untagged', Name: 'untagged', Type: 'MusicAlbum' }

    const result = splitArtistAlbums([own, contribution, untagged], null, ARTIST)

    expect(result.ownAlbums.map(a => a.Id)).toEqual(['own', 'untagged'])
    expect(result.appearsOnAlbums.map(a => a.Id)).toEqual(['other'])
  })

  it('lists each album once', () => {
    const own = album('own', [ARTIST])

    const result = splitArtistAlbums([own, { ...own }], new Set(['own']), ARTIST)

    expect(result.ownAlbums).toHaveLength(1)
    expect(result.appearsOnAlbums).toHaveLength(0)
  })
})
