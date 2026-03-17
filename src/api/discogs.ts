import { logger } from '../utils/logger'

// ============================================================================
// Types
// ============================================================================

export interface DiscogsArtist {
  name: string
  id: number
}

export interface DiscogsFormat {
  name: string
  qty: string
  descriptions?: string[]
  text?: string
}

export interface DiscogsBasicInfo {
  id: number
  title: string
  year: number
  artists: DiscogsArtist[]
  formats: DiscogsFormat[]
  thumb: string
  cover_image: string
}

export interface DiscogsRelease {
  id: number
  basic_information: DiscogsBasicInfo
}

export interface DiscogsCollectionResponse {
  pagination: { pages: number; page: number; items: number }
  releases: DiscogsRelease[]
}

export interface DiscogsTrack {
  position: string
  title: string
  duration: string
  type_: string // "track" or "heading" (disc/side separators)
}

export interface DiscogsImage {
  type: string // "primary" or "secondary"
  uri: string
  uri150: string
  width: number
  height: number
}

export interface DiscogsReleaseDetail {
  id: number
  title: string
  tracklist: DiscogsTrack[]
  images: DiscogsImage[]
  artists: DiscogsArtist[]
  year: number
  formats: DiscogsFormat[]
}

// ============================================================================
// Base URL — dev uses Vite proxy, prod uses stats server proxy
// ============================================================================

const isDev = import.meta.env.DEV

const DISCOGS_BASE_URL = isDev
  ? '/api/discogs'
  : '/api/stats/proxy/discogs'

// ============================================================================
// Rate Limiter (60 req/min = 1 per second)
// ============================================================================

let lastRequestTime = 0

async function rateLimitedFetch(url: string, options: RequestInit): Promise<Response> {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed))
  }
  lastRequestTime = Date.now()
  return fetch(url, options)
}

function discogsHeaders(token: string): HeadersInit {
  return {
    Authorization: `Discogs token=${token}`,
    'User-Agent': 'TuneTuna/1.0',
  }
}

// ============================================================================
// Strip Discogs artist disambiguation suffixes like " (2)"
// ============================================================================

export function cleanDiscogsArtistName(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, '').trim()
}

// ============================================================================
// API Functions
// ============================================================================

/** Derive Discogs username from personal access token */
export async function fetchDiscogsIdentity(token: string): Promise<string> {
  const response = await rateLimitedFetch(`${DISCOGS_BASE_URL}/oauth/identity`, {
    headers: discogsHeaders(token),
  })
  if (!response.ok) {
    throw new Error(`Discogs identity failed: ${response.status}`)
  }
  const data = await response.json()
  return data.username
}

/** Fetch all releases in the user's collection (paginates automatically) */
export async function fetchDiscogsCollection(
  token: string,
  username: string,
  onProgress?: (page: number, totalPages: number) => void
): Promise<DiscogsRelease[]> {
  const allReleases: DiscogsRelease[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const url = `${DISCOGS_BASE_URL}/users/${encodeURIComponent(username)}/collection/folders/0/releases?per_page=100&page=${page}`
    const response = await rateLimitedFetch(url, {
      headers: discogsHeaders(token),
    })
    if (!response.ok) {
      throw new Error(`Discogs collection failed: ${response.status}`)
    }
    const data: DiscogsCollectionResponse = await response.json()
    totalPages = data.pagination.pages
    allReleases.push(...data.releases)
    onProgress?.(page, totalPages)
    logger.log(`[Discogs] Fetched page ${page}/${totalPages} (${data.releases.length} releases)`)
    page++
  }

  return allReleases
}

/** Fetch full release detail including tracklist and images */
export async function fetchDiscogsReleaseDetail(
  token: string,
  releaseId: number
): Promise<DiscogsReleaseDetail> {
  const url = `${DISCOGS_BASE_URL}/releases/${releaseId}`
  const response = await rateLimitedFetch(url, {
    headers: discogsHeaders(token),
  })
  if (!response.ok) {
    throw new Error(`Discogs release detail failed: ${response.status}`)
  }
  return response.json()
}
