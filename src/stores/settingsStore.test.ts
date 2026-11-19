import { beforeEach, describe, expect, it, vi } from 'vitest'

// The store persists to localStorage, which the node test environment doesn't have
vi.hoisted(() => {
  const data = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size },
  }
})

import { useSettingsStore, ARTWORK_ACCENT, THEME_ACCENT } from './settingsStore'

describe('setTheme', () => {
  beforeEach(() => {
    useSettingsStore.setState({ theme: 'default', accentColor: 'red', artworkAccentFallback: 'red' })
  })

  it('switches to the new theme\'s accent instead of keeping the previous selection', () => {
    useSettingsStore.setState({ accentColor: ARTWORK_ACCENT })
    useSettingsStore.getState().setTheme('nord')
    expect(useSettingsStore.getState().accentColor).toBe(THEME_ACCENT)
  })

  it('defaults Catppuccin to the album art accent, falling back to its own accent', () => {
    useSettingsStore.getState().setTheme('catppuccin-mocha')
    expect(useSettingsStore.getState().accentColor).toBe(ARTWORK_ACCENT)
    expect(useSettingsStore.getState().artworkAccentFallback).toBe(THEME_ACCENT)
  })

  it('keeps the accent when switching Catppuccin flavor', () => {
    useSettingsStore.getState().setTheme('catppuccin-mocha')
    useSettingsStore.getState().setAccentColor('theme:lavender')
    useSettingsStore.getState().setTheme('catppuccin-frappe')
    expect(useSettingsStore.getState().accentColor).toBe('theme:lavender')
  })
})
