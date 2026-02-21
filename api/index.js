import Fastify from 'fastify'
import cors from '@fastify/cors'
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

const DATA_DIR = process.env.DATA_DIR || './data'
const DB_PATH = `${DATA_DIR}/stats.db`
const PORT = process.env.PORT || 3001

// Ensure data directory exists
try {
  mkdirSync(DATA_DIR, { recursive: true })
} catch (e) {
  // Directory may already exist
}

// Initialize SQLite database
const db = new Database(DB_PATH)

// Create tables if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_key TEXT NOT NULL,
    ts INTEGER NOT NULL,
    song_id TEXT NOT NULL,
    song_name TEXT NOT NULL,
    artist_ids TEXT NOT NULL,
    artist_names TEXT NOT NULL,
    album_id TEXT NOT NULL,
    album_name TEXT NOT NULL,
    genres TEXT NOT NULL,
    year INTEGER,
    duration_ms INTEGER NOT NULL,
    full_duration_ms INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE INDEX IF NOT EXISTS idx_events_user_ts ON events(user_key, ts);
`)

// Prepared statements
const insertEvent = db.prepare(`
  INSERT INTO events (user_key, ts, song_id, song_name, artist_ids, artist_names, album_id, album_name, genres, year, duration_ms, full_duration_ms)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const selectEvents = db.prepare(`
  SELECT ts, song_id, song_name, artist_ids, artist_names, album_id, album_name, genres, year, full_duration_ms
  FROM events
  WHERE user_key = ? AND ts >= ? AND ts <= ?
  ORDER BY ts ASC
`)

// Prepared statements for metadata updates - use COALESCE to only update non-null values
const updateSongMetadata = db.prepare(`
  UPDATE events
  SET
    song_name = COALESCE(?, song_name),
    artist_names = COALESCE(?, artist_names),
    album_name = COALESCE(?, album_name),
    genres = COALESCE(?, genres),
    year = COALESCE(?, year)
  WHERE user_key = ? AND song_id = ?
`)

const updateAlbumMetadata = db.prepare(`
  UPDATE events
  SET album_name = COALESCE(?, album_name)
  WHERE user_key = ? AND album_id = ?
`)

const insertMany = db.transaction((userKey, events) => {
  for (const e of events) {
    insertEvent.run(
      userKey,
      e.ts,
      e.songId,
      e.songName,
      JSON.stringify(e.artistIds),
      JSON.stringify(e.artistNames),
      e.albumId,
      e.albumName,
      JSON.stringify(e.genres),
      e.year,
      e.durationMs ?? e.fullDurationMs,
      e.fullDurationMs
    )
  }
})

// Create Fastify server
const fastify = Fastify({
  logger: true,
  disableRequestLogging: true,
})

// Log requests, but skip health checks
fastify.addHook('onResponse', (request, reply, done) => {
  if (request.url !== '/api/stats/health') {
    request.log.info({ req: request, res: reply, responseTime: reply.elapsedTime }, 'request completed')
  }
  done()
})

// Register CORS - allow same-origin and configured origins
await fastify.register(cors, {
  origin: (origin, cb) => {
    // Allow requests with no origin (same-origin, mobile apps, curl)
    if (!origin) {
      cb(null, true)
      return
    }
    // Allow localhost for development
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      cb(null, true)
      return
    }
    // Allow configured origins via environment variable
    const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || []
    if (allowedOrigins.includes(origin)) {
      cb(null, true)
      return
    }
    // Reject unknown origins
    cb(new Error('Not allowed by CORS'), false)
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Stats-Token'],
})

/**
 * Validates the auth token for a request.
 * Verifies a token is present (nginx ensures only internal requests reach this API).
 * The key (SHA-256 of serverUrl::userId) provides namespace isolation.
 */
function validateAuth(key, token) {
  if (!token) {
    return { valid: false, error: 'Missing X-Stats-Token header' }
  }
  return { valid: true }
}

/**
 * Escapes special characters in a string for use in SQL LIKE patterns.
 * Prevents SQL injection via LIKE wildcards.
 */
function escapeLikePattern(str) {
  return str
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/%/g, '\\%')    // Escape percent
    .replace(/_/g, '\\_')    // Escape underscore
    .replace(/"/g, '\\"')    // Escape quotes
}

// Validate a single event object
function validateEvent(event) {
  if (!event || typeof event !== 'object') return false
  if (typeof event.ts !== 'number' || event.ts <= 0) return false
  if (typeof event.songId !== 'string' || !event.songId) return false
  if (typeof event.songName !== 'string') return false
  if (!Array.isArray(event.artistIds)) return false
  if (!Array.isArray(event.artistNames)) return false
  if (typeof event.albumId !== 'string') return false
  if (typeof event.albumName !== 'string') return false
  if (!Array.isArray(event.genres)) return false
  if (typeof event.fullDurationMs !== 'number' || event.fullDurationMs < 0) return false
  // year can be null or a number
  if (event.year !== null && typeof event.year !== 'number') return false
  return true
}

// POST /api/stats/:key/events - Store events
fastify.post('/api/stats/:key/events', async (request, reply) => {
  const { key } = request.params
  // Accept token from header or body (body for sendBeacon which doesn't support headers)
  const body = request.body || {}
  const token = request.headers['x-stats-token'] || body._token
  const events = body._token ? body.events : body

  // Validate auth
  const auth = validateAuth(key, token)
  if (!auth.valid) {
    return reply.status(401).send({ error: auth.error })
  }

  if (!Array.isArray(events) || events.length === 0) {
    return reply.status(400).send({ error: 'Events array required' })
  }

  // Validate all events before storing
  const validEvents = events.filter(validateEvent)
  if (validEvents.length === 0) {
    return reply.status(400).send({ error: 'No valid events in request' })
  }

  try {
    insertMany(key, validEvents)
    return { success: true, count: validEvents.length, skipped: events.length - validEvents.length }
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Failed to store events' })
  }
})

// Safely parse JSON with fallback
function safeJsonParse(str, fallback = []) {
  try {
    return JSON.parse(str)
  } catch {
    return fallback
  }
}

// GET /api/stats/:key/events - Fetch events
fastify.get('/api/stats/:key/events', async (request, reply) => {
  const { key } = request.params
  const token = request.headers['x-stats-token']
  const { from, to } = request.query

  // Validate auth
  const auth = validateAuth(key, token)
  if (!auth.valid) {
    return reply.status(401).send({ error: auth.error })
  }

  if (!from || !to) {
    return reply.status(400).send({ error: 'from and to query params required' })
  }

  try {
    const rows = selectEvents.all(key, Number(from), Number(to))

    const events = rows.map(row => ({
      ts: row.ts,
      songId: row.song_id,
      songName: row.song_name,
      artistIds: safeJsonParse(row.artist_ids, []),
      artistNames: safeJsonParse(row.artist_names, []),
      albumId: row.album_id,
      albumName: row.album_name,
      genres: safeJsonParse(row.genres, []),
      year: row.year,
      fullDurationMs: row.full_duration_ms,
    }))

    return { events }
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Failed to fetch events' })
  }
})

// DELETE /api/stats/:key/events - Delete all events for a user
fastify.delete('/api/stats/:key/events', async (request, reply) => {
  const { key } = request.params
  const token = request.headers['x-stats-token']

  // Validate auth
  const auth = validateAuth(key, token)
  if (!auth.valid) {
    return reply.status(401).send({ error: auth.error })
  }

  try {
    const deleteEvents = db.prepare('DELETE FROM events WHERE user_key = ?')
    const result = deleteEvents.run(key)
    return { success: true, deleted: result.changes }
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Failed to delete events' })
  }
})

// PATCH /api/stats/:key/events/metadata - Update metadata for existing events
// Body: { itemType: 'song' | 'album' | 'artist', itemId: string, metadata: { songName?, artistNames?, albumName?, genres?, year? } }
fastify.patch('/api/stats/:key/events/metadata', async (request, reply) => {
  const { key } = request.params
  const token = request.headers['x-stats-token']
  const { itemType, itemId, metadata } = request.body || {}

  // Validate auth
  const auth = validateAuth(key, token)
  if (!auth.valid) {
    return reply.status(401).send({ error: auth.error })
  }

  if (!itemType || !itemId || !metadata) {
    return reply.status(400).send({ error: 'itemType, itemId, and metadata required' })
  }

  if (!['song', 'album', 'artist'].includes(itemType)) {
    return reply.status(400).send({ error: 'itemType must be song, album, or artist' })
  }

  try {
    let result

    if (itemType === 'song') {
      // Update all fields for a specific song
      result = updateSongMetadata.run(
        metadata.songName ?? null,
        metadata.artistNames ? JSON.stringify(metadata.artistNames) : null,
        metadata.albumName ?? null,
        metadata.genres ? JSON.stringify(metadata.genres) : null,
        metadata.year ?? null,
        key,
        itemId
      )
    } else if (itemType === 'album') {
      // Update album name for all events with this album
      result = updateAlbumMetadata.run(
        metadata.albumName ?? null,
        key,
        itemId
      )
    } else if (itemType === 'artist') {
      // For artist updates, we need to update events that contain this artist
      // This is more complex because artistIds is stored as JSON array
      // We'll use a custom update that checks if the artist ID is in the array

      // Escape special characters to prevent SQL injection via LIKE pattern
      const escapedItemId = escapeLikePattern(itemId)
      const selectByArtist = db.prepare(`
        SELECT id, artist_ids, artist_names FROM events
        WHERE user_key = ? AND artist_ids LIKE ? ESCAPE '\\'
      `)
      const updateById = db.prepare(`
        UPDATE events SET artist_names = ? WHERE id = ?
      `)

      const rows = selectByArtist.all(key, `%"${escapedItemId}"%`)
      let updated = 0

      for (const row of rows) {
        const artistIds = safeJsonParse(row.artist_ids, [])
        const artistNames = safeJsonParse(row.artist_names, [])
        const idx = artistIds.indexOf(itemId)

        if (idx !== -1 && metadata.artistNames && metadata.artistNames[0]) {
          // Update the artist name at this index
          artistNames[idx] = metadata.artistNames[0]
          updateById.run(JSON.stringify(artistNames), row.id)
          updated++
        }
      }

      result = { changes: updated }
    }

    return { success: true, updated: result?.changes || 0 }
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Failed to update metadata' })
  }
})

// Health check (no auth required)
fastify.get('/api/stats/health', async () => {
  return { status: 'ok' }
})

// Proxy for Apple Music RSS (no auth required, public data)
fastify.get('/api/stats/proxy/apple-music/:country/:limit', async (request, reply) => {
  const { country, limit } = request.params
  const url = `https://rss.marketingtools.apple.com/api/v2/${country}/music/most-played/${limit}/songs.json`

  try {
    const response = await fetch(url)
    if (!response.ok) {
      return reply.status(response.status).send({ error: 'Apple Music RSS failed' })
    }
    const data = await response.json()
    return data
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Failed to fetch Apple Music RSS' })
  }
})

// Proxy for Muspy RSS feed (no auth required, public data)
fastify.get('/api/stats/proxy/muspy-rss', async (request, reply) => {
  const { url } = request.query
  if (!url || !url.startsWith('https://muspy.com/')) {
    return reply.status(400).send({ error: 'Valid Muspy URL required' })
  }

  try {
    const response = await fetch(url)
    if (!response.ok) {
      return reply.status(response.status).send({ error: 'Muspy RSS failed' })
    }
    const text = await response.text()
    reply.header('Content-Type', 'application/atom+xml; charset=utf-8')
    return reply.send(text)
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Failed to fetch Muspy RSS' })
  }
})

// Start server
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
