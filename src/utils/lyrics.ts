export interface LyricsWord {
  text: string
  startSeconds: number
}

export interface LyricsLine {
  text: string
  startSeconds?: number
  endSeconds?: number
  words?: LyricsWord[]
}

export interface LyricsResult {
  lines: LyricsLine[]
  isSynced: boolean
  isWordSynced?: boolean
}

export interface LrclibRecord {
  id: number
  trackName?: string
  artistName?: string
  albumName?: string
  duration?: number
  instrumental?: boolean
  hasWordSync?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
  lyricsfile?: string | null
}

// LRCLIB treats tracks within ±2 seconds as the same recording
export const LRCLIB_DURATION_TOLERANCE_SECONDS = 2

const msToSeconds = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value / 1000 : undefined

function plainTextToResult(text: string): LyricsResult | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(line => ({ text: line }))
  return lines.some(l => l.text.trim()) ? { lines, isSynced: false } : null
}

// Parses a Lyricsfile (YAML) document: line-synced, optionally with per-word timings.
// The YAML parser is loaded on demand to keep it out of the main bundle.
export async function parseLyricsfile(source: string): Promise<LyricsResult | null> {
  let doc: unknown
  try {
    const { parse } = await import('yaml')
    doc = parse(source)
  } catch {
    return null
  }
  if (!doc || typeof doc !== 'object') return null
  const { lines: rawLines, plain } = doc as { lines?: unknown; plain?: unknown }

  const lines: LyricsLine[] = []
  if (Array.isArray(rawLines)) {
    for (const raw of rawLines) {
      if (!raw || typeof raw !== 'object') continue
      const r = raw as { text?: unknown; start_ms?: unknown; end_ms?: unknown; words?: unknown }
      const words: LyricsWord[] = []
      if (Array.isArray(r.words)) {
        for (const w of r.words) {
          const start = msToSeconds(w?.start_ms)
          if (typeof w?.text !== 'string' || start === undefined) continue
          words.push({ text: w.text, startSeconds: start })
        }
      }
      const text = typeof r.text === 'string' ? r.text : words.map(w => w.text).join('').trim()
      lines.push({
        text,
        startSeconds: msToSeconds(r.start_ms) ?? words[0]?.startSeconds,
        endSeconds: msToSeconds(r.end_ms),
        words: words.length > 0 ? words : undefined,
      })
    }
  }

  const timed = lines.filter(l => l.startSeconds !== undefined)
  if (timed.length > 0) {
    // Overlapping vocals may be listed out of order; playback lookups need ascending starts
    timed.sort((a, b) => a.startSeconds! - b.startSeconds!)
    return { lines: timed, isSynced: true, isWordSynced: timed.some(l => l.words) }
  }
  return typeof plain === 'string' ? plainTextToResult(plain) : null
}

const LRC_TIMESTAMP = /\[(\d+):(\d+(?:[.:]\d+)?)\]/g

// Parses line-synced LRC. Lines with several timestamps are repeated at each time.
export function parseLrc(source: string): LyricsResult | null {
  const lines: LyricsLine[] = []
  for (const rawLine of source.replace(/\r\n?/g, '\n').split('\n')) {
    const stamps = [...rawLine.matchAll(LRC_TIMESTAMP)]
    if (stamps.length === 0) continue
    const text = rawLine.replace(LRC_TIMESTAMP, '').trim()
    for (const [, min, sec] of stamps) {
      lines.push({ text, startSeconds: Number(min) * 60 + Number(sec.replace(':', '.')) })
    }
  }
  if (lines.length === 0) return null
  lines.sort((a, b) => a.startSeconds! - b.startSeconds!)
  return { lines, isSynced: true }
}

// 3 = word synced, 2 = line synced, 1 = plain, 0 = nothing usable
function recordRank(record: LrclibRecord): number {
  if (record.instrumental) return 0
  if (record.hasWordSync && record.lyricsfile) return 3
  if (record.syncedLyrics?.trim()) return 2
  if (record.plainLyrics?.trim()) return 1
  return 0
}

const normalize = (s: string | undefined) => (s ?? '').trim().toLowerCase()

// Picks the richest LRCLIB record for a track: only records within the duration tolerance
// qualify, then word sync beats line sync beats plain text; ties prefer the same album
// and the closest duration.
export function pickBestLrclibRecord(
  records: LrclibRecord[],
  durationSeconds: number,
  albumName?: string,
): LrclibRecord | null {
  let best: LrclibRecord | null = null
  let bestKey: number[] = []
  for (const record of records) {
    if (typeof record.duration !== 'number') continue
    const diff = Math.abs(record.duration - durationSeconds)
    if (diff > LRCLIB_DURATION_TOLERANCE_SECONDS) continue
    const rank = recordRank(record)
    if (rank === 0) continue
    const sameAlbum = albumName && normalize(record.albumName) === normalize(albumName) ? 1 : 0
    const key = [rank, sameAlbum, -diff]
    const firstDiff = key.findIndex((v, i) => v !== bestKey[i])
    if (!best || (firstDiff >= 0 && key[firstDiff] > bestKey[firstDiff])) {
      best = record
      bestKey = key
    }
  }
  return best
}

export async function lrclibRecordToLyrics(record: LrclibRecord): Promise<LyricsResult | null> {
  const rank = recordRank(record)
  if (rank === 3) {
    const result = await parseLyricsfile(record.lyricsfile!)
    if (result?.isWordSynced) return result
  }
  if (rank >= 2 && record.syncedLyrics) {
    const result = parseLrc(record.syncedLyrics)
    if (result) return result
  }
  return record.plainLyrics ? plainTextToResult(record.plainLyrics) : null
}
