import type { BaseItemDto, LightweightSong } from '../api/types'
import { useMusicStore } from '../stores/musicStore'
import { useSettingsStore } from '../stores/settingsStore'
import { jellyfinClient } from '../api/jellyfin'
import { logger } from './logger'

interface RecommendationOptions {
  currentTrack: BaseItemDto
  queue: BaseItemDto[]
  recentQueue: BaseItemDto[]
  lastPlayedTrack?: BaseItemDto | null
}

// Track which genres are currently being synced to prevent duplicate requests
const syncingGenres = new Set<string>()

/**
 * Syncs genre songs in the background for better recommendations
 */
async function syncGenreForRecommendations(genreName: string): Promise<void> {
  const genreKey = genreName.toLowerCase()

  // Don't sync if already syncing this genre
  if (syncingGenres.has(genreKey)) {
    logger.log(`[Recommendations] Genre "${genreName}" is already being synced, skipping...`)
    return
  }

  syncingGenres.add(genreKey)

  try {
    logger.log(`[Recommendations] Auto-syncing genre "${genreName}" for better recommendations...`)

    const { genres, setGenreSongs } = useMusicStore.getState()

    // Get genres list if not cached
    let genresList = genres
    if (genresList.length === 0) {
      genresList = await jellyfinClient.getGenres()
    }

    // Find the genre ID
    const foundGenre = genresList.find(g =>
      g.Name && genreName && g.Name.toLowerCase() === genreName.toLowerCase()
    )

    if (!foundGenre || !foundGenre.Id) {
      logger.warn(`[Recommendations] Genre "${genreName}" not found in server`)
      return
    }

    // Fetch songs for this genre
    logger.log(`[Recommendations] Fetching songs for genre "${genreName}"...`)
    const genreSongs = await jellyfinClient.getGenreSongs(foundGenre.Id, genreName)

    if (genreSongs.length > 0) {
      // Cache the songs
      setGenreSongs(foundGenre.Id, genreSongs)
      logger.log(`[Recommendations] ✓ Successfully cached ${genreSongs.length} songs for genre "${genreName}"`)
    } else {
      logger.warn(`[Recommendations] No songs found for genre "${genreName}" on server`)
    }
  } catch (error) {
    logger.error(`[Recommendations] Failed to sync genre "${genreName}":`, error)
  } finally {
    // Remove from syncing set after a delay to prevent immediate re-sync
    setTimeout(() => {
      syncingGenres.delete(genreKey)
    }, 10000) // Keep in set for 10 seconds after completion
  }
}

export async function getRecommendedSongs({
  currentTrack,
  queue,
}: RecommendationOptions): Promise<{
  recommendations: BaseItemDto[]
  hasGenreMatches: boolean
  triggeredGenreSync?: boolean
}> {
  if (!currentTrack) {
    logger.log('[Recommendations] No current track')
    return { recommendations: [], hasGenreMatches: false }
  }

  // Use genre-first cache strategy for recommendations
  const { songs: mainSongs, genreSongs, genres: cachedGenres } = useMusicStore.getState()

  // Declare genres before using it in cache selection
  const genres = currentTrack.Genres || []

  // 1. Try genre-specific songs first (most efficient & relevant)
  let availableSongs: LightweightSong[] = []

  if (genres.length > 0 && cachedGenres.length > 0) {
    // Find all genre IDs that match current track's genres
    const matchingGenreIds = cachedGenres
      .filter(genre =>
        genre.Name && genres.some(trackGenre =>
          trackGenre.toLowerCase() === genre.Name!.toLowerCase()
        )
      )
      .map(genre => genre.Id!)
      .filter(id => genreSongs[id] && genreSongs[id].length > 0)

    if (matchingGenreIds.length > 0) {
      // Safe to flatten since each song only appears in one genre
      availableSongs = matchingGenreIds.flatMap(genreId => genreSongs[genreId])
      logger.log(`[Recommendations] Using ${availableSongs.length} pre-filtered songs from ${matchingGenreIds.length} matching genres`)
    }
  }

  // 2. Fall back to main songs array
  if (availableSongs.length === 0 && mainSongs.length > 0) {
    availableSongs = mainSongs
    logger.log(`[Recommendations] Using ${availableSongs.length} songs from main cache`)
  }

  // 3. Final fallback: all genre songs flattened
  if (availableSongs.length === 0) {
    const allGenreSongs = Object.values(genreSongs).flat()
    if (allGenreSongs.length > 0) {
      availableSongs = allGenreSongs
      logger.log(`[Recommendations] Using ${availableSongs.length} songs from all genre caches`)
    }
  }

  // 4. No cache at all - set failed quality
  if (availableSongs.length === 0) {
    logger.log('[Recommendations] No cached songs available')
    const { setRecommendationsQuality } = useSettingsStore.getState()
    setRecommendationsQuality('failed')
    logger.warn("Couldn't generate recommendations. Try syncing your library")
    return { recommendations: [], hasGenreMatches: false }
  }

  logger.log('[Recommendations] Using', availableSongs.length, 'available songs')
  logger.log('[Recommendations] Current track genres:', genres, '(count:', genres.length + ')')
  logger.log('[Recommendations] Current track year:', currentTrack.ProductionYear)
  logger.log('[Recommendations] Queue size:', queue.length)
  logger.log('[Recommendations] Sample available songs:', availableSongs.slice(0, 3).map(s => `${s.Name} (${s.ProductionYear}) [${s.Genres?.join(', ')}]`))

  // Generate recommendations from available songs
  let recommendations: BaseItemDto[] = []

  // Track recommendation quality
  let genreMatchSuccess = false

  // Year ranges for progressive expansion
  const currentYear = currentTrack.ProductionYear
  const yearRanges = currentYear ? [
    { range: 3, years: Array.from({ length: 7 }, (_, i) => currentYear - 3 + i) }, // ±3 years
    { range: 6, years: Array.from({ length: 13 }, (_, i) => currentYear - 6 + i) }, // ±6 years
    { range: 10, years: Array.from({ length: 21 }, (_, i) => currentYear - 10 + i) }, // ±10 years
  ] : []

  // Helper: check if song is valid candidate (not current, not in queue, not already recommended)
  const isValidCandidate = (song: LightweightSong): boolean => {
    const notCurrentTrack = song.Id !== currentTrack.Id
    const notInQueue = !queue.some(queued => queued.Id === song.Id)
    const notAlreadyRecommended = !recommendations.some(rec => rec.Id === song.Id)
    return notCurrentTrack && notInQueue && notAlreadyRecommended
  }

  // Helper: check if song matches genre
  const matchesGenre = (song: LightweightSong): boolean => {
    if (genres.length === 0) return true // No genre filter if track has no genres
    return song.Genres?.some(songGenre =>
      genres.some(trackGenre =>
        songGenre.toLowerCase() === trackGenre.toLowerCase()
      )
    ) ?? false
  }

  // Helper: check if song is in year range
  const isInYearRange = (song: LightweightSong, years: number[]): boolean => {
    if (!currentYear) return true // No year filter if track has no year
    return song.ProductionYear !== undefined && years.includes(song.ProductionYear)
  }

  // Count total genre matches to detect if genre sync is needed
  let totalGenreMatchCount = 0
  if (genres.length > 0) {
    totalGenreMatchCount = availableSongs.filter(song => matchesGenre(song)).length
    logger.log('[Recommendations] Total songs matching genre:', totalGenreMatchCount)

    // If we found ZERO genre matches at all, trigger auto-sync
    if (totalGenreMatchCount === 0) {
      logger.log('[Recommendations] No songs found matching genres:', genres)
      logger.log('[Recommendations] Triggering auto-sync for these genres...')
      for (const genre of genres) {
        syncGenreForRecommendations(genre).catch(err =>
          logger.error(`[Recommendations] Genre sync failed for ${genre}:`, err)
        )
      }
      return {
        recommendations: [],
        hasGenreMatches: false,
        triggeredGenreSync: true
      }
    }
  }

  // Progressive matching: genre + year, expanding year range only when needed
  // Each year range is tried in order; we only expand if we don't have 12 recommendations yet
  for (const { range, years } of yearRanges) {
    if (recommendations.length >= 12) {
      logger.log(`[Recommendations] Have ${recommendations.length} recommendations, stopping at ±${range} year range`)
      break
    }

    const neededCount = 12 - recommendations.length

    // Find songs matching genre AND this year range
    const rangeMatches = availableSongs.filter(song => {
      if (!isValidCandidate(song)) return false
      if (!matchesGenre(song)) return false
      if (!isInYearRange(song, years)) return false
      return true
    })

    logger.log(`[Recommendations] Year range ±${range}: found ${rangeMatches.length} candidates, need ${neededCount}`)

    if (rangeMatches.length > 0) {
      // Shuffle and take only what we need
      const shuffled = shuffleArray(rangeMatches)
      const toAdd = shuffled.slice(0, neededCount)
      recommendations.push(...toAdd)
      logger.log(`[Recommendations] Added ${toAdd.length} songs from ±${range} year range`)
    }
  }

  // If we still don't have 12 and there's no year on the track, try genre-only matching
  if (recommendations.length < 12 && !currentYear && genres.length > 0) {
    const neededCount = 12 - recommendations.length
    const genreOnlyMatches = availableSongs.filter(song => {
      if (!isValidCandidate(song)) return false
      if (!matchesGenre(song)) return false
      return true
    })
    const shuffled = shuffleArray(genreOnlyMatches)
    const toAdd = shuffled.slice(0, neededCount)
    recommendations.push(...toAdd)
    logger.log(`[Recommendations] Added ${toAdd.length} genre-only songs (no year on seed track)`)
  }

  // If we still don't have 12, try year-only matching (no genre on track)
  if (recommendations.length < 12 && currentYear && genres.length === 0) {
    for (const { range, years } of yearRanges) {
      if (recommendations.length >= 12) break
      const neededCount = 12 - recommendations.length
      const yearOnlyMatches = availableSongs.filter(song => {
        if (!isValidCandidate(song)) return false
        if (!isInYearRange(song, years)) return false
        return true
      })
      const shuffled = shuffleArray(yearOnlyMatches)
      const toAdd = shuffled.slice(0, neededCount)
      recommendations.push(...toAdd)
      logger.log(`[Recommendations] Added ${toAdd.length} year-only songs from ±${range} range (no genre on seed track)`)
    }
  }

  // Track genre match success
  genreMatchSuccess = genres.length > 0 && recommendations.some(rec => matchesGenre(rec))

  logger.log('[Recommendations] Matching results:', {
    totalRecommendations: recommendations.length,
    genreMatchSuccess,
    hasGenres: genres.length > 0,
    hasYear: !!currentYear
  })

  // Shuffle and then reorder to avoid consecutive artists
  const shuffled = shuffleArray(recommendations)
  const reordered: BaseItemDto[] = []
  const pool = [...shuffled]

  while (pool.length > 0 && reordered.length < 12) {
    let index = -1

    if (reordered.length > 0) {
      const lastSong = reordered[reordered.length - 1]
      const lastArtistIds = lastSong.ArtistItems?.map(a => a.Id) || []

      // Find first song in pool that shares NO artists with last song
      index = pool.findIndex(candidate => {
        const candidateArtistIds = candidate.ArtistItems?.map(a => a.Id) || []
        return !candidateArtistIds.some(id => lastArtistIds.includes(id))
      })
    }

    // If no safe option found (or first iteration), just take the first one
    if (index === -1) index = 0

    const selected = pool.splice(index, 1)[0]
    reordered.push(selected)
  }

  const finalRecommendations = reordered


  // Set recommendations quality
  const { setRecommendationsQuality } = useSettingsStore.getState()

  logger.log('[Recommendations] Quality decision:', {
    finalRecommendationsCount: finalRecommendations.length,
    genreMatchSuccess,
    hasGenres: genres.length > 0,
    availableSongsCount: availableSongs.length
  })

  if (finalRecommendations.length === 0) {
    logger.log('[Recommendations] Got 0 final recommendations')
    setRecommendationsQuality('failed')
  } else if (!genreMatchSuccess && genres.length > 0) {
    logger.log('[Recommendations] No genre matches found, setting degraded quality')
    setRecommendationsQuality('degraded')
  } else {
    setRecommendationsQuality('good')
  }

  logger.log(`[Recommendations] Generated ${finalRecommendations.length} recommendations`)
  if (finalRecommendations.length > 0) {
    logger.log('[Recommendations] Sample:', finalRecommendations.slice(0, 3).map(r => r.Name))
  }

  return {
    recommendations: finalRecommendations,
    hasGenreMatches: genreMatchSuccess,
    triggeredGenreSync: false
  }
}

// Fisher-Yates shuffle function for proper randomization
function shuffleArray<T>(array: T[]): T[] {
  if (array.length <= 1) return [...array]

  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled
}

