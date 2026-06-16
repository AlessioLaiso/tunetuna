import { describe, it, expect } from 'vitest'
import { buildItemsQueryString, ITEMS_QUERY_FIELDS } from './jellyfinTransforms'

function parse(qs: string): URLSearchParams {
  return new URLSearchParams(qs)
}

describe('buildItemsQueryString', () => {
  it('always appends UserId and Fields', () => {
    const params = parse(buildItemsQueryString({}, 'user-123'))
    expect(params.get('UserId')).toBe('user-123')
    expect(params.get('Fields')).toBe(ITEMS_QUERY_FIELDS)
  })

  it('appends each sortBy value separately, preserving order', () => {
    const params = parse(buildItemsQueryString({ sortBy: ['SortName', 'DateCreated'] }, 'u'))
    expect(params.getAll('SortBy')).toEqual(['SortName', 'DateCreated'])
  })

  it('handles sortOrder as a single string', () => {
    const params = parse(buildItemsQueryString({ sortOrder: 'Ascending' }, 'u'))
    expect(params.getAll('SortOrder')).toEqual(['Ascending'])
  })

  it('handles sortOrder as an array', () => {
    const params = parse(buildItemsQueryString({ sortOrder: ['Ascending', 'Descending'] }, 'u'))
    expect(params.getAll('SortOrder')).toEqual(['Ascending', 'Descending'])
  })

  it('stringifies numeric limit and startIndex', () => {
    const params = parse(buildItemsQueryString({ limit: 50, startIndex: 10 }, 'u'))
    expect(params.get('Limit')).toBe('50')
    expect(params.get('StartIndex')).toBe('10')
  })

  it('omits limit and startIndex when zero (falsy)', () => {
    const params = parse(buildItemsQueryString({ limit: 0, startIndex: 0 }, 'u'))
    expect(params.has('Limit')).toBe(false)
    expect(params.has('StartIndex')).toBe(false)
  })

  it('appends Recursive even when false', () => {
    const params = parse(buildItemsQueryString({ recursive: false }, 'u'))
    expect(params.get('Recursive')).toBe('false')
  })

  it('trims searchTerm and omits whitespace-only terms', () => {
    const trimmed = parse(buildItemsQueryString({ searchTerm: '  hello  ' }, 'u'))
    expect(trimmed.get('SearchTerm')).toBe('hello')

    const blank = parse(buildItemsQueryString({ searchTerm: '   ' }, 'u'))
    expect(blank.has('SearchTerm')).toBe(false)
  })

  it('appends array filters as repeated params', () => {
    const params = parse(buildItemsQueryString({
      includeItemTypes: ['Audio'],
      genreIds: ['g1', 'g2'],
      genres: ['Rock'],
      artistIds: ['a1'],
      albumIds: ['al1'],
      years: [1999, 2001],
      tags: ['live'],
    }, 'u'))
    expect(params.getAll('IncludeItemTypes')).toEqual(['Audio'])
    expect(params.getAll('GenreIds')).toEqual(['g1', 'g2'])
    expect(params.getAll('Genres')).toEqual(['Rock'])
    expect(params.getAll('ArtistIds')).toEqual(['a1'])
    expect(params.getAll('AlbumIds')).toEqual(['al1'])
    expect(params.getAll('Years')).toEqual(['1999', '2001'])
    expect(params.getAll('Tags')).toEqual(['live'])
  })

  it('serializes minDateLastSaved as an ISO string', () => {
    const date = new Date('2026-01-02T03:04:05.000Z')
    const params = parse(buildItemsQueryString({ minDateLastSaved: date }, 'u'))
    expect(params.get('MinDateLastSaved')).toBe('2026-01-02T03:04:05.000Z')
  })

  it('omits the cache-bust param by default and includes _t when requested', () => {
    expect(parse(buildItemsQueryString({}, 'u')).has('_t')).toBe(false)
    expect(parse(buildItemsQueryString({}, 'u', true)).has('_t')).toBe(true)
  })

  it('parentId is passed through verbatim', () => {
    const params = parse(buildItemsQueryString({ parentId: 'p1' }, 'u'))
    expect(params.get('ParentId')).toBe('p1')
  })
})
