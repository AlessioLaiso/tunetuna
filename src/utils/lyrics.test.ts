import { describe, it, expect } from 'vitest'
import { parseLyricsfile, parseLrc, pickBestLrclibRecord, lrclibRecordToLyrics } from './lyrics'
import type { LrclibRecord } from './lyrics'

const LYRICSFILE = `version: '1.0'
metadata:
  title: For Your Love
  artist: Stevie Wonder
  duration_ms: 300000
lines:
- text: Can't add up
  start_ms: 79650
  end_ms: 86180
  words:
  - text: 'Can''t '
    start_ms: 79650
  - text: 'add '
    start_ms: 80050
  - text: up
    start_ms: 80550
- text: All the gold
  start_ms: 59510
  end_ms: 65630
plain: |-
  All the gold
  Can't add up
`

describe('parseLyricsfile', () => {
  it('parses lines and word timings, sorted by start', async () => {
    const result = (await parseLyricsfile(LYRICSFILE))!
    expect(result.isSynced).toBe(true)
    expect(result.isWordSynced).toBe(true)
    expect(result.lines.map(l => l.text)).toEqual(['All the gold', "Can't add up"])
    expect(result.lines[0].words).toBeUndefined()
    expect(result.lines[1]).toMatchObject({ startSeconds: 79.65, endSeconds: 86.18 })
    expect(result.lines[1].words).toEqual([
      { text: "Can't ", startSeconds: 79.65 },
      { text: 'add ', startSeconds: 80.05 },
      { text: 'up', startSeconds: 80.55 },
    ])
  })

  it('falls back to plain text when there are no timed lines', async () => {
    const result = (await parseLyricsfile("version: '1.0'\nlines: []\nplain: |-\n  One\n  Two\n"))!
    expect(result.isSynced).toBe(false)
    expect(result.lines.map(l => l.text)).toEqual(['One', 'Two'])
  })

  it('returns null for invalid YAML or non-objects', async () => {
    expect(await parseLyricsfile('lines: [')).toBeNull()
    expect(await parseLyricsfile('just a string')).toBeNull()
  })
})

describe('parseLrc', () => {
  it('parses timestamps, including repeated ones', () => {
    const result = parseLrc('[ar:Someone]\n[00:12.50]Hello\n[00:01.00][01:00.00]Chorus\n')!
    expect(result.lines).toEqual([
      { text: 'Chorus', startSeconds: 1 },
      { text: 'Hello', startSeconds: 12.5 },
      { text: 'Chorus', startSeconds: 60 },
    ])
  })

  it('returns null when nothing is timed', () => {
    expect(parseLrc('no timestamps here')).toBeNull()
  })
})

describe('pickBestLrclibRecord', () => {
  const base = { trackName: 'Song', artistName: 'Artist' }
  const plain: LrclibRecord = { ...base, id: 1, duration: 200, plainLyrics: 'a' }
  const synced: LrclibRecord = { ...base, id: 2, duration: 201, plainLyrics: 'a', syncedLyrics: '[00:01.00]a' }
  const word: LrclibRecord = { ...base, id: 3, duration: 199, hasWordSync: true, lyricsfile: LYRICSFILE, syncedLyrics: '[00:01.00]a' }
  const farWord: LrclibRecord = { ...word, id: 4, duration: 230 }

  it('prefers word sync, then line sync, then plain', () => {
    expect(pickBestLrclibRecord([plain, synced, word], 200)?.id).toBe(3)
    expect(pickBestLrclibRecord([plain, synced], 200)?.id).toBe(2)
    expect(pickBestLrclibRecord([plain], 200)?.id).toBe(1)
  })

  it('ignores records outside ±2 seconds and instrumentals', () => {
    expect(pickBestLrclibRecord([farWord, plain], 200)?.id).toBe(1)
    expect(pickBestLrclibRecord([plain], 202.5)).toBeNull()
    expect(pickBestLrclibRecord([{ ...synced, instrumental: true }], 200)).toBeNull()
  })

  it('breaks ties by album, then closest duration', () => {
    const a: LrclibRecord = { ...synced, id: 10, duration: 200, albumName: 'Other' }
    const b: LrclibRecord = { ...synced, id: 11, duration: 202, albumName: 'Album' }
    const c: LrclibRecord = { ...synced, id: 12, duration: 199, albumName: 'Other' }
    expect(pickBestLrclibRecord([a, b, c], 200, 'album')?.id).toBe(11)
    expect(pickBestLrclibRecord([c, a], 200)?.id).toBe(10)
  })
})

describe('lrclibRecordToLyrics', () => {
  it('uses the richest available format', async () => {
    expect((await lrclibRecordToLyrics({ id: 1, hasWordSync: true, lyricsfile: LYRICSFILE }))?.isWordSynced).toBe(true)
    expect((await lrclibRecordToLyrics({ id: 2, syncedLyrics: '[00:01.00]a', plainLyrics: 'a' }))?.isSynced).toBe(true)
    expect((await lrclibRecordToLyrics({ id: 3, plainLyrics: 'a\nb' }))?.lines).toHaveLength(2)
  })
})
