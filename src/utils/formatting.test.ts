import { describe, it, expect } from 'vitest'
import {
  getSongReleaseType,
  formatReleaseTypeLabel,
  parseReleaseTag,
  extractGroupingFromTags,
} from './formatting'

describe('parseReleaseTag', () => {
  it('extracts the value from a release tag', () => {
    expect(parseReleaseTag('release_live-album')).toBe('live-album')
    expect(parseReleaseTag('release_ep')).toBe('ep')
  })

  it('returns null for non-release grouping tags', () => {
    expect(parseReleaseTag('mood_party')).toBeNull()
    expect(parseReleaseTag('instrumental')).toBeNull()
  })
})

describe('getSongReleaseType', () => {
  it('reads release tags from Grouping', () => {
    expect(getSongReleaseType(['mood_party', 'release_single'])).toBe('single')
  })

  it('reads release tags from Tags (grouping: prefix)', () => {
    expect(getSongReleaseType(['grouping:release_ep'])).toBe('ep')
  })

  it('returns null when no release tag or no tags', () => {
    expect(getSongReleaseType(['mood_party'])).toBeNull()
    expect(getSongReleaseType(undefined)).toBeNull()
  })
})

describe('formatReleaseTypeLabel', () => {
  it('formats custom release types as plural titles', () => {
    expect(formatReleaseTypeLabel('live-album')).toBe('Live Albums')
    expect(formatReleaseTypeLabel('compilation')).toBe('Compilations')
  })

  it('does not double-pluralize values ending in s', () => {
    expect(formatReleaseTypeLabel('remixes')).toBe('Remixes')
  })
})

describe('extractGroupingFromTags', () => {
  it('keeps release tags alongside other grouping tags', () => {
    const grouping = extractGroupingFromTags(['grouping:release_ep', 'grouping:mood_party'])
    expect(grouping).toEqual(['release_ep', 'mood_party'])
  })
})
