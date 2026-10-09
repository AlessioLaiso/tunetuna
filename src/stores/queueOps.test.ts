import { describe, it, expect } from 'vitest'
import {
  computeAddToQueue,
  computeRemoveFromQueue,
  computeReorderQueue,
  computeListPlaybackOrder,
  queueMatchesList,
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

describe('computeListPlaybackOrder', () => {
  const item = (id: string) => ({ Id: id })
  const list = ['1', '2', '3', '4'].map(item)
  // Reverse acts as an obvious non-identity shuffle.
  const reverse = <T>(a: T[]): T[] => [...a].reverse()

  it('keeps the list order and the clicked index when shuffle is off', () => {
    const r = computeListPlaybackOrder(list, 2, false, reverse)
    expect(r.tracks.map(t => t.Id)).toEqual(['1', '2', '3', '4'])
    expect(r.currentIndex).toBe(2)
    expect(r.standardOrder).toEqual(['1', '2', '3', '4'])
    expect(r.shuffleOrder).toEqual(['1', '2', '3', '4'])
  })

  it('moves every other song behind the clicked one when shuffle is on', () => {
    const r = computeListPlaybackOrder(list, 2, true, reverse)
    // '1' and '2' came before the clicked song and must still end up upcoming.
    expect(r.tracks.map(t => t.Id)).toEqual(['3', '2', '1', '4'])
    expect(r.currentIndex).toBe(0)
  })

  it('anchors the standard order on the clicked song so shuffle can be undone', () => {
    const r = computeListPlaybackOrder(list, 2, true, reverse)
    // toggleShuffle() restores upcoming songs with standardOrder.slice(currentIndex + 1).
    expect(r.standardOrder).toEqual(['3', '4', '1', '2'])
    expect(r.shuffleOrder).toEqual(r.tracks.map(t => t.Id))
  })

  it('leaves the clicked song first whatever the shuffle function returns', () => {
    const r = computeListPlaybackOrder(list, 0, true, reverse)
    expect(r.tracks[0].Id).toBe('1')
    expect(r.tracks.map(t => t.Id).sort()).toEqual(['1', '2', '3', '4'])
  })

  it('falls back to the first entry for an unknown clicked index', () => {
    expect(computeListPlaybackOrder(list, -1, true, reverse).tracks[0].Id).toBe('1')
    expect(computeListPlaybackOrder(list, 99, false, reverse).currentIndex).toBe(0)
  })

  it('handles an empty list', () => {
    const r = computeListPlaybackOrder([], 0, true, reverse)
    expect(r).toEqual({ tracks: [], currentIndex: -1, standardOrder: [], shuffleOrder: [] })
  })

  it('does not mutate the input list', () => {
    computeListPlaybackOrder(list, 1, true, reverse)
    expect(list.map(t => t.Id)).toEqual(['1', '2', '3', '4'])
  })
})

describe('queueMatchesList', () => {
  it('matches when the user songs in the queue are exactly the list', () => {
    const songs = [song('a'), song('b'), song('c')]
    expect(queueMatchesList(songs, ['a', 'b', 'c'])).toBe(true)
  })

  it('ignores order (shuffled queue) and recommendations', () => {
    const songs = [song('c'), song('a'), song('b'), song('x', 'recommendation')]
    expect(queueMatchesList(songs, ['a', 'b', 'c'])).toBe(true)
  })

  it('does not match when the queue is a superset (e.g. shuffle all)', () => {
    const songs = [song('a'), song('b'), song('c'), song('d')]
    expect(queueMatchesList(songs, ['a', 'b', 'c'])).toBe(false)
  })

  it('does not match when the queue is a subset', () => {
    expect(queueMatchesList([song('a')], ['a', 'b'])).toBe(false)
  })

  it('does not match an empty list or an empty queue', () => {
    expect(queueMatchesList([song('a')], [])).toBe(false)
    expect(queueMatchesList([], ['a'])).toBe(false)
    expect(queueMatchesList([song('x', 'recommendation')], ['x'])).toBe(false)
  })

  it('tolerates duplicate entries on either side', () => {
    expect(queueMatchesList([song('a'), song('a'), song('b')], ['a', 'b', 'b'])).toBe(true)
  })
})
