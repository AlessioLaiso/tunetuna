import { describe, it, expect } from 'vitest'
import {
  computeAddToQueue,
  computeRemoveFromQueue,
  computeReorderQueue,
  MAX_QUEUE_SIZE,
  type QueueSong,
  type QueueState,
} from './queueOps'

function song(id: string, source: 'user' | 'recommendation' = 'user'): QueueSong {
  return { Id: id, Name: id, source }
}

function state(songs: QueueSong[], overrides: Partial<QueueState> = {}): QueueState {
  const userIds = songs.filter(s => s.source === 'user').map(s => s.Id)
  return {
    songs,
    currentIndex: 0,
    previousIndex: -1,
    standardOrder: userIds,
    shuffleOrder: userIds,
    shuffle: false,
    ...overrides,
  }
}

// Deterministic shuffle stub so play-next assertions are stable.
const noShuffle = <T>(a: T[]): T[] => a

describe('computeAddToQueue', () => {
  it('appends user tracks to the end when there are no upcoming recommendations', () => {
    const s = state([song('1'), song('2')], { currentIndex: 0 })
    const r = computeAddToQueue(s, [song('3')], false, 'user', noShuffle)
    expect(r.songs.map(x => x.Id)).toEqual(['1', '2', '3'])
    expect(r.currentIndex).toBe(0)
    expect(r.manuallyCleared).toBe(false)
  })

  it('inserts user tracks before the first upcoming recommendation', () => {
    const s = state(
      [song('1'), song('2'), song('r1', 'recommendation')],
      { currentIndex: 0 },
    )
    const r = computeAddToQueue(s, [song('new')], false, 'user', noShuffle)
    expect(r.songs.map(x => x.Id)).toEqual(['1', '2', 'new', 'r1'])
  })

  it('always appends recommendations to the very end', () => {
    const s = state([song('1'), song('2')], { currentIndex: 0 })
    const r = computeAddToQueue(s, [song('r', 'recommendation')], false, 'recommendation', noShuffle)
    expect(r.songs.map(x => x.Id)).toEqual(['1', '2', 'r'])
  })

  it('inserts play-next tracks immediately after the current song', () => {
    const s = state([song('1'), song('2'), song('3')], { currentIndex: 1 })
    const r = computeAddToQueue(s, [song('x')], true, 'user', noShuffle)
    expect(r.songs.map(x => x.Id)).toEqual(['1', '2', 'x', '3'])
  })

  it('recomputes currentIndex when the current song shifts position', () => {
    // Current song is at index 2; inserting before it should keep it current.
    const s = state(
      [song('a'), song('b'), song('cur'), song('r', 'recommendation')],
      { currentIndex: 2 },
    )
    const r = computeAddToQueue(s, [song('new')], false, 'user', noShuffle)
    // new goes before 'r' (first upcoming reco), after 'cur'; cur stays at index 2
    expect(r.songs.map(x => x.Id)).toEqual(['a', 'b', 'cur', 'new', 'r'])
    expect(r.songs[r.currentIndex].Id).toBe('cur')
  })

  it('rebuilds order arrays from user songs only', () => {
    const s = state([song('1'), song('r', 'recommendation')], { currentIndex: 0 })
    const r = computeAddToQueue(s, [song('2')], false, 'user', noShuffle)
    expect(r.standardOrder).toEqual(['1', '2'])
    expect(r.shuffleOrder).toEqual(['1', '2'])
    expect(r.standardOrder).not.toContain('r')
  })

  it('trims to MAX_QUEUE_SIZE while preserving the current song', () => {
    const big = Array.from({ length: MAX_QUEUE_SIZE }, (_, i) => song(`s${i}`))
    const s = state(big, { currentIndex: 10 })
    const r = computeAddToQueue(s, [song('extra')], false, 'user', noShuffle)
    expect(r.songs.length).toBeLessThanOrEqual(MAX_QUEUE_SIZE)
    expect(r.songs[r.currentIndex].Id).toBe('s10')
  })

  it('does not mutate the input songs array', () => {
    const songs = [song('1'), song('2')]
    computeAddToQueue(state(songs, { currentIndex: 0 }), [song('3')], false, 'user', noShuffle)
    expect(songs.map(x => x.Id)).toEqual(['1', '2'])
  })
})

describe('computeRemoveFromQueue', () => {
  it('returns null for out-of-range indices', () => {
    const s = state([song('1')])
    expect(computeRemoveFromQueue(s, -1)).toBeNull()
    expect(computeRemoveFromQueue(s, 5)).toBeNull()
  })

  it('decrements currentIndex when removing before it', () => {
    const s = state([song('1'), song('2'), song('3')], { currentIndex: 2 })
    const r = computeRemoveFromQueue(s, 0)!
    expect(r.songs.map(x => x.Id)).toEqual(['2', '3'])
    expect(r.currentIndex).toBe(1)
  })

  it('sets currentIndex to -1 when removing the current song', () => {
    const s = state([song('1'), song('2')], { currentIndex: 1 })
    const r = computeRemoveFromQueue(s, 1)!
    expect(r.currentIndex).toBe(-1)
  })

  it('leaves currentIndex unchanged when removing after it', () => {
    const s = state([song('1'), song('2'), song('3')], { currentIndex: 0 })
    const r = computeRemoveFromQueue(s, 2)!
    expect(r.currentIndex).toBe(0)
  })

  it('removes the song id from both order arrays', () => {
    const s = state([song('1'), song('2')], { currentIndex: 0 })
    const r = computeRemoveFromQueue(s, 1)!
    expect(r.standardOrder).toEqual(['1'])
    expect(r.shuffleOrder).toEqual(['1'])
  })

  it('adjusts previousIndex the same way as currentIndex', () => {
    const s = state([song('1'), song('2'), song('3')], { currentIndex: 2, previousIndex: 1 })
    const r = computeRemoveFromQueue(s, 0)!
    expect(r.previousIndex).toBe(0)
  })
})

describe('computeReorderQueue', () => {
  it('returns null for invalid or no-op moves', () => {
    const s = state([song('1'), song('2')])
    expect(computeReorderQueue(s, 0, 0)).toBeNull()
    expect(computeReorderQueue(s, -1, 1)).toBeNull()
    expect(computeReorderQueue(s, 0, 5)).toBeNull()
  })

  it('refuses to move across the user/recommendation boundary', () => {
    const s = state([song('1'), song('r', 'recommendation')], { currentIndex: 0 })
    expect(computeReorderQueue(s, 0, 1)).toBeNull()
  })

  it('moves a user song and updates the standard order array', () => {
    const s = state([song('1'), song('2'), song('3')], { currentIndex: 0 })
    const r = computeReorderQueue(s, 0, 2)!
    expect(r.songs.map(x => x.Id)).toEqual(['2', '3', '1'])
    expect(r.standardOrder).toEqual(['2', '3', '1'])
  })

  it('updates the shuffle order array when in shuffle mode', () => {
    const s = state([song('1'), song('2'), song('3')], { currentIndex: 0, shuffle: true })
    const r = computeReorderQueue(s, 2, 0)!
    expect(r.songs.map(x => x.Id)).toEqual(['3', '1', '2'])
    expect(r.shuffleOrder).toEqual(['3', '1', '2'])
  })

  it('follows the current song when it is the one being moved', () => {
    const s = state([song('1'), song('2'), song('3')], { currentIndex: 0 })
    const r = computeReorderQueue(s, 0, 2)!
    expect(r.currentIndex).toBe(2)
  })

  it('does not mutate the input songs array', () => {
    const songs = [song('1'), song('2'), song('3')]
    computeReorderQueue(state(songs, { currentIndex: 0 }), 0, 2)
    expect(songs.map(x => x.Id)).toEqual(['1', '2', '3'])
  })
})
