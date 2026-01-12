import Fastify from 'fastify'
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

const DATA_DIR = process.env.DATA_DIR || '/data'
const DB_PATH = `${DATA_DIR}/stats.db`
const PORT = process.env.PORT || 3001

// Ensure data directory exists
try {
  mkdirSync(dirname(DB_PATH), { recursive: true })
} catch (e) {
  // Directory may already exist
}

// Initialize SQLite database
const db = new Database(DB_PATH)

// Create table if not exists
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
  SELECT ts, song_id, song_name, artist_ids, artist_names, album_id, album_name, genres, year, duration_ms, full_duration_ms
  FROM events
  WHERE user_key = ? AND ts >= ? AND ts <= ?
  ORDER BY ts ASC
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
      e.durationMs,
      e.fullDurationMs
    )
  }
})

// Create Fastify server
const fastify = Fastify({ logger: true })

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
  if (typeof event.durationMs !== 'number' || event.durationMs < 0) return false
  if (typeof event.fullDurationMs !== 'number' || event.fullDurationMs < 0) return false
  // year can be null or a number
  if (event.year !== null && typeof event.year !== 'number') return false
  return true
}

// POST /api/stats/:key/events - Store events
fastify.post('/api/stats/:key/events', async (request, reply) => {
  const { key } = request.params
  const events = request.body

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
  const { from, to } = request.query

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
      durationMs: row.duration_ms,
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

  try {
    const deleteEvents = db.prepare('DELETE FROM events WHERE user_key = ?')
    const result = deleteEvents.run(key)
    return { success: true, deleted: result.changes }
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Failed to delete events' })
  }
})

// Health check
fastify.get('/api/stats/health', async () => {
  return { status: 'ok' }
})

// Start server
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
