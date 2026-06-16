import { describe, it, expect } from 'vitest'
import { mergeLightweightSongs } from './syncMerge'
import type { LightweightSong } from '../api/types'

function song(id: string, name = id): LightweightSong {
  return { Id: id, Name: name }
}

describe('mergeLightweightSongs', () => {
  it('updates existing songs in place, preserving order', () => {
    const existing = [song('1', 'old-1'), song('2', 'old-2'), song('3', 'old-3')]
    const changed = [song('2', 'new-2')]

    const result = mergeLightweightSongs(existing, changed)

    expect(result.map(s => s.Id)).toEqual(['1', '2', '3'])
    expect(result.find(s => s.Id === '2')!.Name).toBe('new-2')
    expect(result.find(s => s.Id === '1')!.Name).toBe('old-1')
  })

  it('appends new songs after existing ones', () => {
    const existing = [song('1'), song('2')]
    const changed = [song('3'), song('4')]

    const result = mergeLightweightSongs(existing, changed)

    expect(result.map(s => s.Id)).toEqual(['1', '2', '3', '4'])
  })

  it('handles a mix of updates and additions', () => {
    const existing = [song('1', 'old-1'), song('2', 'old-2')]
    const changed = [song('2', 'new-2'), song('3', 'new-3')]

    const result = mergeLightweightSongs(existing, changed)

    expect(result.map(s => s.Id)).toEqual(['1', '2', '3'])
    expect(result.find(s => s.Id === '2')!.Name).toBe('new-2')
    expect(result.find(s => s.Id === '3')!.Name).toBe('new-3')
  })

  it('does not mutate the input arrays', () => {
    const existing = [song('1', 'old-1')]
    const changed = [song('1', 'new-1')]

    mergeLightweightSongs(existing, changed)

    expect(existing[0].Name).toBe('old-1')
  })

  it('returns existing unchanged when there are no changes', () => {
    const existing = [song('1'), song('2')]
    const result = mergeLightweightSongs(existing, [])
    expect(result.map(s => s.Id)).toEqual(['1', '2'])
  })

  it('returns all changed songs when cache was empty', () => {
    const result = mergeLightweightSongs([], [song('1'), song('2')])
    expect(result.map(s => s.Id)).toEqual(['1', '2'])
  })

  it('does not duplicate a song that is both updated and re-listed', () => {
    const existing = [song('1', 'old-1')]
    const changed = [song('1', 'new-1')]

    const result = mergeLightweightSongs(existing, changed)

    expect(result).toHaveLength(1)
    expect(result[0].Name).toBe('new-1')
  })
})
