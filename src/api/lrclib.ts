import type { BaseItemDto } from './types'
import { APP_CLIENT_NAME, APP_VERSION } from '../utils/constants'
import { logger } from '../utils/logger'
import { lrclibRecordToLyrics, pickBestLrclibRecord } from '../utils/lyrics'
import type { LrclibRecord, LyricsResult } from '../utils/lyrics'

const LRCLIB_BASE_URL = 'https://lrclib.net/api'
// Browsers can't set User-Agent, so LRCLIB accepts this header for client identification
const CLIENT_ID = `${APP_CLIENT_NAME} ${APP_VERSION} (https://github.com/alessiolaiso/tunetuna)`
const CACHE_LIMIT = 200

const cache = new Map<string, LyricsResult | null>()
const inFlight = new Map<string, Promise<LyricsResult | null>>()
// Set from Retry-After when LRCLIB rate limits us; no requests are sent before then
let blockedUntil = 0

function cacheResult(key: string, result: LyricsResult | null): LyricsResult | null {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, result)
  return result
}

async function fetchLrclibLyrics(track: BaseItemDto, durationSeconds: number): Promise<LyricsResult | null> {
  const artist = track.ArtistItems?.[0]?.Name || track.AlbumArtist
  if (!artist) return cacheResult(track.Id, null)

  const params = new URLSearchParams({ track_name: track.Name, artist_name: artist })
  const response = await fetch(`${LRCLIB_BASE_URL}/search?${params}`, {
    headers: { 'Lrclib-Client': CLIENT_ID },
  })
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After')) || 60
    blockedUntil = Date.now() + retryAfter * 1000 * (1 + Math.random() * 0.3)
    return null
  }
  if (!response.ok) return null

  const records: LrclibRecord[] = await response.json()
  const best = Array.isArray(records) ? pickBestLrclibRecord(records, durationSeconds, track.Album) : null
  return cacheResult(track.Id, best ? await lrclibRecordToLyrics(best) : null)
}

// Looks up lyrics for a track on LRCLIB. Only records within ±2s of the track's duration
// are considered, preferring word-synced, then line-synced, then plain lyrics.
export async function getLrclibLyrics(track: BaseItemDto): Promise<LyricsResult | null> {
  const durationSeconds = track.RunTimeTicks ? track.RunTimeTicks / 10_000_000 : 0
  if (!track.Id || !track.Name || durationSeconds <= 0) return null
  if (cache.has(track.Id)) return cache.get(track.Id) ?? null
  if (Date.now() < blockedUntil) return null

  const pending = inFlight.get(track.Id)
  if (pending) return pending

  const promise = fetchLrclibLyrics(track, durationSeconds)
    .catch(error => {
      logger.warn('[lrclib] Failed to fetch lyrics:', error)
      return null
    })
    .finally(() => inFlight.delete(track.Id))
  inFlight.set(track.Id, promise)
  return promise
}
