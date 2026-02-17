import { APP_CLIENT_NAME, APP_VERSION } from '../utils/constants'

// ============================================================================
// Types
// ============================================================================

/** Apple Music RSS song item */
export interface AppleMusicSong {
  id: string
  name: string
  artistName: string
  artworkUrl100: string
  url: string
  releaseDate: string
  genres?: { genreId: string; name: string }[]
}

/** Apple Music RSS response */
interface AppleMusicRSSResponse {
  feed: {
    title: string
    results: AppleMusicSong[]
  }
}

/** MusicBrainz release group (album/single/ep) */
export interface MusicBrainzReleaseGroup {
  id: string
  title: string
  'primary-type'?: string
  'secondary-types'?: string[]
  'first-release-date'?: string
}

/** Cached artist mapping */
export interface CachedArtistMapping {
  mbid: string
  name: string
  cachedAt: number
}

/** New release with artwork */
export interface NewRelease {
  id: string
  title: string
  artistName: string
  releaseDate: string
  type: string
  artworkUrl?: string
  mbUrl?: string
}

/** Odesli platform link */
interface OdesliPlatformLink {
  url: string
  nativeAppUriMobile?: string
  nativeAppUriDesktop?: string
  entityUniqueId?: string
}

/** Odesli API response */
export interface OdesliResponse {
  entityUniqueId: string
  userCountry: string
  pageUrl: string
  linksByPlatform: Record<string, OdesliPlatformLink>
  entitiesByUniqueId?: Record<string, {
    id: string
    type: string
    title?: string
    artistName?: string
    thumbnailUrl?: string
    thumbnailWidth?: number
    thumbnailHeight?: number
  }>
}

// ============================================================================
// Constants
// ============================================================================

// Use Vite proxies during development to avoid CORS issues
const isDev = import.meta.env.DEV

const APPLE_MUSIC_BASE_URL = isDev
  ? '/api/apple-music'
  : 'https://rss.marketingtools.apple.com'

const MUSICBRAINZ_BASE_URL = isDev
  ? '/api/musicbrainz/ws/2'
  : 'https://musicbrainz.org/ws/2'

const MUSICBRAINZ_USER_AGENT = `${APP_CLIENT_NAME}/${APP_VERSION} (https://github.com/AlessioLaiso/tunetuna)`

const COVER_ART_ARCHIVE_BASE_URL = isDev
  ? '/api/coverart'
  : 'https://coverartarchive.org'

const ODESLI_BASE_URL = isDev
  ? '/api/odesli/v1-alpha.1'
  : 'https://api.song.link/v1-alpha.1'

// Rate limiting for MusicBrainz (1 request per second)
let lastMusicBrainzRequest = 0
const MUSICBRAINZ_RATE_LIMIT_MS = 1100

// ============================================================================
// Apple Music RSS API
// ============================================================================

/**
 * Fetches top songs from Apple Music RSS feed
 * @param country - ISO country code (e.g., 'gb', 'us')
 * @param limit - Number of songs to fetch (default 10)
 */
export async function fetchAppleMusicTopSongs(
  country: string = 'gb',
  limit: number = 10
): Promise<AppleMusicSong[]> {
  // In dev, use Vite proxy; in production, use stats-api proxy
  const url = isDev
    ? `${APPLE_MUSIC_BASE_URL}/api/v2/${country}/music/most-played/${limit}/songs.json`
    : `/api/stats/proxy/apple-music/${country}/${limit}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Apple Music RSS failed: ${response.status}`)
  }

  const data: AppleMusicRSSResponse = await response.json()
  return data.feed.results
}

/**
 * Gets a larger artwork URL from Apple Music
 * Apple Music artwork URLs can be modified to get different sizes
 */
export function getAppleMusicArtworkUrl(url: string, size: number = 300): string {
  // Replace 100x100 with desired size
  return url.replace(/\d+x\d+/, `${size}x${size}`)
}

// ============================================================================
// MusicBrainz API
// ============================================================================

/**
 * Enforces rate limiting for MusicBrainz API
 */
async function rateLimitMusicBrainz(): Promise<void> {
  const now = Date.now()
  const timeSinceLastRequest = now - lastMusicBrainzRequest

  if (timeSinceLastRequest < MUSICBRAINZ_RATE_LIMIT_MS) {
    await new Promise(resolve =>
      setTimeout(resolve, MUSICBRAINZ_RATE_LIMIT_MS - timeSinceLastRequest)
    )
  }

  lastMusicBrainzRequest = Date.now()
}

/**
 * Searches for a release group on MusicBrainz
 * @returns The best matching release group with MBID and type, or null if not found
 */
export async function searchMusicBrainzReleaseGroup(
  artistName: string,
  title: string
): Promise<{ id: string; type: string } | null> {
  await rateLimitMusicBrainz()

  const query = `releasegroup:"${title}" AND artist:"${artistName}"`
  const params = new URLSearchParams({
    query,
    fmt: 'json',
    limit: '1'
  })

  const response = await fetch(`${MUSICBRAINZ_BASE_URL}/release-group/?${params}`, {
    headers: {
      'User-Agent': MUSICBRAINZ_USER_AGENT,
      'Accept': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`MusicBrainz search failed: ${response.status}`)
  }

  const data = await response.json()
  const groups = data['release-groups'] || []
  if (groups.length === 0) return null
  return { id: groups[0].id, type: groups[0]['primary-type'] || 'Album' }
}

// ============================================================================
// Cover Art Archive API
// ============================================================================

/**
 * Gets cover art URL for a release group
 * Returns null if no cover art is available
 */
export function getCoverArtUrl(
  releaseGroupMbid: string,
  size: 250 | 500 | 1200 = 500
): string {
  return `${COVER_ART_ARCHIVE_BASE_URL}/release-group/${releaseGroupMbid}/front-${size}`
}

// ============================================================================
// Odesli (Song.link) API
// ============================================================================

/**
 * Gets universal streaming links for a song/album URL
 * @param url - Any music URL (Apple Music, Spotify, etc.)
 * @param country - Optional ISO country code for regional results
 */
export async function fetchOdesliLinks(
  url: string,
  country?: string
): Promise<OdesliResponse | null> {
  const params = new URLSearchParams({ url })
  if (country) {
    params.append('userCountry', country)
  }

  try {
    const response = await fetch(`${ODESLI_BASE_URL}/links?${params}`)

    if (!response.ok) {
      if (response.status === 404) {
        return null // Song not found on Odesli
      }
      throw new Error(`Odesli API failed: ${response.status}`)
    }

    return await response.json()
  } catch {
    return null
  }
}

// ============================================================================
// Muspy RSS Feed
// ============================================================================

/**
 * Fetches new releases from a Muspy RSS feed URL
 * @param rssUrl - The Muspy RSS feed URL
 * @param limit - Maximum number of releases to return (default 10)
 */
export async function fetchMuspyReleases(
  rssUrl: string,
  limit: number = 10
): Promise<NewRelease[]> {
  if (!rssUrl) {
    return []
  }

  // Use proxy in development to avoid CORS, and CORS proxy in production
  const proxyUrl = isDev
    ? `/api/muspy-rss?url=${encodeURIComponent(rssUrl)}`
    : `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`
  console.log('[Muspy] Fetching from:', proxyUrl)

  const response = await fetch(proxyUrl)
  if (!response.ok) {
    throw new Error(`Muspy RSS failed: ${response.status}`)
  }

  const text = await response.text()
  console.log('[Muspy] Response length:', text.length, 'First 500 chars:', text.substring(0, 500))

  const parser = new DOMParser()
  const xml = parser.parseFromString(text, 'text/xml')

  // Check for parse errors
  const parseError = xml.querySelector('parsererror')
  if (parseError) {
    console.error('[Muspy] XML parse error:', parseError.textContent)
  }

  // Muspy uses Atom format, not RSS - look for <entry> instead of <item>
  const items = xml.querySelectorAll('entry')
  console.log('[Muspy] Found', items.length, 'entries')
  const releases: NewRelease[] = []

  items.forEach((item, index) => {
    if (index >= limit) return

    const title = item.querySelector('title')?.textContent || ''
    // Atom uses <link href="..."> but some feeds might use text content
    const linkEl = item.querySelector('link[rel="alternate"]') || item.querySelector('link')
    const link = linkEl?.getAttribute('href') || linkEl?.textContent || ''

    // Atom uses <summary> or <content> instead of <description>
    const summary = item.querySelector('summary')?.textContent || item.querySelector('content')?.textContent || ''

    // Atom uses <updated> or <published> instead of <pubDate>
    const updated = item.querySelector('updated')?.textContent || item.querySelector('published')?.textContent || ''

    // Get the entry ID which in Muspy is the MusicBrainz release group URL
    const entryId = item.querySelector('id')?.textContent || ''

    // Extract release group ID - look for UUID pattern in the ENTIRE entry content
    // This handles any variation of where Muspy might put the link/ID
    const uuidPattern = /[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/i
    const entryContent = item.outerHTML
    const mbidMatch = entryContent.match(uuidPattern)
    const mbid = mbidMatch ? mbidMatch[0] : `muspy-${index}`

    // Extract release type from content (e.g., "Title (Single)" or "Title (Album)")
    // textContent strips HTML, so look for (Single), (Album), (EP) pattern
    const typeMatch = summary.match(/\((Single|Album|EP)\)/i)
    const releaseType = typeMatch ? typeMatch[1] : 'Album'

    // Parse artist name from title (format: "Artist - Album")
    const titleParts = title.split(' - ')
    const artistName = titleParts.length > 1 ? titleParts[0].trim() : summary
    const albumTitle = titleParts.length > 1 ? titleParts.slice(1).join(' - ').trim() : title

    // Parse date
    let releaseDate = ''
    if (updated) {
      try {
        releaseDate = new Date(updated).toISOString().split('T')[0]
      } catch {
        releaseDate = updated
      }
    }

    // Construct MusicBrainz URL from the extracted UUID
    const mbUrl = mbid.startsWith('muspy-') ? link : `https://musicbrainz.org/release-group/${mbid}`

    releases.push({
      id: mbid,
      title: albumTitle,
      artistName: artistName,
      releaseDate: releaseDate,
      type: releaseType,
      artworkUrl: mbid.startsWith('muspy-') ? undefined : getCoverArtUrl(mbid, 500),
      mbUrl
    })
  })

  return releases
}

/**
 * Gets the thumbnail URL from Odesli response
 */
export function getOdesliThumbnail(odesli: OdesliResponse): string | null {
  if (!odesli.entitiesByUniqueId) return null

  const entities = Object.values(odesli.entitiesByUniqueId)
  for (const entity of entities) {
    if (entity.thumbnailUrl) {
      return entity.thumbnailUrl
    }
  }

  return null
}

/**
 * Available streaming platforms in Odesli
 */
export const STREAMING_PLATFORMS = [
  { id: 'spotify', name: 'Spotify', icon: 'spotify' },
  { id: 'appleMusic', name: 'Apple Music', icon: 'apple' },
  { id: 'youtube', name: 'YouTube', icon: 'youtube' },
  { id: 'youtubeMusic', name: 'YouTube Music', icon: 'youtube' },
  { id: 'tidal', name: 'Tidal', icon: 'tidal' },
  { id: 'deezer', name: 'Deezer', icon: 'deezer' },
  { id: 'amazonMusic', name: 'Amazon Music', icon: 'amazon' },
  { id: 'soundcloud', name: 'SoundCloud', icon: 'soundcloud' },
] as const

export type StreamingPlatformId = typeof STREAMING_PLATFORMS[number]['id']

/**
 * Creates an OdesliResponse-like object with search URLs for each platform
 * Used as fallback when Odesli can't find a release
 */
export function createSearchLinksResponse(artistName: string, albumTitle: string): OdesliResponse {
  const query = encodeURIComponent(`${artistName} ${albumTitle}`)

  return {
    entityUniqueId: 'search',
    userCountry: 'US',
    pageUrl: `https://www.google.com/search?q=${query}`,
    linksByPlatform: {
      spotify: {
        url: `https://open.spotify.com/search/${query}`
      },
      appleMusic: {
        url: `https://music.apple.com/search?term=${query}`
      },
      youtube: {
        url: `https://www.youtube.com/results?search_query=${query}`
      },
      youtubeMusic: {
        url: `https://music.youtube.com/search?q=${query}`
      },
      tidal: {
        url: `https://listen.tidal.com/search?q=${query}`
      },
      deezer: {
        url: `https://www.deezer.com/search/${query}`
      },
      amazonMusic: {
        url: `https://music.amazon.com/search/${query}`
      }
    }
  }
}
