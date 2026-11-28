import { describe, it, expect, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { persist, type PersistStorage } from 'zustand/middleware'
import { skipUnchangedWrites } from './storage'

interface State {
  songs: string[]
  currentTime: number
  volume: number
}

function setup() {
  const inner: PersistStorage<Pick<State, 'songs' | 'volume'>> = {
    getItem: () => null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }
  const store = createStore<State>()(persist(() => ({ songs: ['a'], currentTime: 0, volume: 1 }), {
    name: 'test',
    storage: skipUnchangedWrites(inner),
    partialize: (s) => ({ songs: s.songs, volume: s.volume }),
  }))
  vi.mocked(inner.setItem).mockClear()
  return { store, inner }
}

describe('skipUnchangedWrites', () => {
  it('skips writes when only non-persisted fields change', () => {
    const { store, inner } = setup()
    store.setState({ volume: 0.5 })
    for (let i = 1; i <= 10; i++) store.setState({ currentTime: i })
    expect(inner.setItem).toHaveBeenCalledTimes(1)
  })

  it('writes when a persisted field changes', () => {
    const { store, inner } = setup()
    store.setState({ songs: ['a', 'b'] })
    store.setState({ currentTime: 1 })
    store.setState({ volume: 0.2 })
    expect(inner.setItem).toHaveBeenCalledTimes(2)
    expect(vi.mocked(inner.setItem).mock.calls[1][1].state).toEqual({ songs: ['a', 'b'], volume: 0.2 })
  })

  it('writes again after the item is removed', () => {
    const { store, inner } = setup()
    store.setState({ volume: 0.5 })
    store.persist.clearStorage()
    store.setState({ currentTime: 1 })
    expect(inner.setItem).toHaveBeenCalledTimes(2)
  })

  it('passes through a missing storage', () => {
    expect(skipUnchangedWrites(undefined)).toBeUndefined()
  })
})
