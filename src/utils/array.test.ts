import { describe, it, expect } from 'vitest'
import { shuffleArray, seededShuffle, chunkArray } from './array'

describe('shuffleArray', () => {
  it('returns a new array (does not mutate input)', () => {
    const input = [1, 2, 3, 4, 5]
    const result = shuffleArray(input)
    expect(result).not.toBe(input)
    expect(input).toEqual([1, 2, 3, 4, 5])
  })

  it('preserves all elements (is a permutation)', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const result = shuffleArray(input)
    expect([...result].sort((a, b) => a - b)).toEqual(input)
  })

  it('handles empty and single-element arrays', () => {
    expect(shuffleArray([])).toEqual([])
    expect(shuffleArray([42])).toEqual([42])
  })
})

describe('seededShuffle', () => {
  it('is deterministic for the same seed', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(seededShuffle(input, 12345)).toEqual(seededShuffle(input, 12345))
  })

  it('produces different orderings for different seeds', () => {
    // Regression guard: the previous implementation always returned the
    // same fixed rotation regardless of seed (j computed to 0 every time).
    const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const a = seededShuffle(input, 1).join(',')
    const b = seededShuffle(input, 2).join(',')
    const c = seededShuffle(input, 999).join(',')
    const distinct = new Set([a, b, c])
    expect(distinct.size).toBeGreaterThan(1)
  })

  it('does not produce the identity / trivial rotation for every seed', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    const rotation = ['b', 'c', 'd', 'e', 'a'].join(',')
    const seeds = [1, 2, 7, 42, 100, 999]
    const results = seeds.map(s => seededShuffle(input, s).join(','))
    // Not all seeds should collapse to the same broken rotation.
    expect(results.every(r => r === rotation)).toBe(false)
  })

  it('returns a new array and preserves all elements', () => {
    const input = [1, 2, 3, 4, 5]
    const result = seededShuffle(input, 7)
    expect(result).not.toBe(input)
    expect([...result].sort((a, b) => a - b)).toEqual(input)
  })

  it('handles empty and single-element arrays', () => {
    expect(seededShuffle([], 5)).toEqual([])
    expect(seededShuffle([42], 5)).toEqual([42])
  })
})

describe('chunkArray', () => {
  it('splits into chunks of the given size', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns one chunk when size exceeds length', () => {
    expect(chunkArray([1, 2, 3], 10)).toEqual([[1, 2, 3]])
  })

  it('returns empty array for empty input', () => {
    expect(chunkArray([], 3)).toEqual([])
  })
})
