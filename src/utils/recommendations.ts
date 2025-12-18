import type { BaseItemDto, LightweightSong } from '../api/types'
import { useMusicStore } from '../stores/musicStore'
import { useSettingsStore } from '../stores/settingsStore'
import { jellyfinClient } from '../api/jellyfin'

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
    console.log(`[Recommendations] Genre "${genreName}" is already being synced, skipping...`)
    return
  }

  syncingGenres.add(genreKey)

  try {
    console.log(`[Recommendations] Auto-syncing genre "${genreName}" for better recommendations...`)

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
      console.warn(`[Recommendations] Genre "${genreName}" not found in server`)
      return
    }

    // Fetch songs for this genre
    console.log(`[Recommendations] Fetching songs for genre "${genreName}"...`)
    const genreSongs = await jellyfinClient.getGenreSongs(foundGenre.Id, genreName)

    if (genreSongs.length > 0) {
      // Cache the songs
      setGenreSongs(foundGenre.Id, genreSongs)
      console.log(`[Recommendations] ✓ Successfully cached ${genreSongs.length} songs for genre "${genreName}"`)
    } else {
      console.warn(`[Recommendations] No songs found for genre "${genreName}" on server`)
    }
  } catch (error) {
    console.error(`[Recommendations] Failed to sync genre "${genreName}":`, error)
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
  const isDev = (import.meta as any)?.env?.DEV ?? false

  if (!currentTrack) {
    if (isDev) console.log('[Recommendations] No current track')
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
      if (isDev) console.log(`[Recommendations] Using ${availableSongs.length} pre-filtered songs from ${matchingGenreIds.length} matching genres`)
    }
  }

  // 2. Fall back to main songs array
  if (availableSongs.length === 0 && mainSongs.length > 0) {
    availableSongs = mainSongs
    if (isDev) console.log(`[Recommendations] Using ${availableSongs.length} songs from main cache`)
  }

  // 3. Final fallback: all genre songs flattened
  if (availableSongs.length === 0) {
    const allGenreSongs = Object.values(genreSongs).flat()
    if (allGenreSongs.length > 0) {
      availableSongs = allGenreSongs
      if (isDev) console.log(`[Recommendations] Using ${availableSongs.length} songs from all genre caches`)
    }
  }

  // 4. No cache at all - set failed quality
  if (availableSongs.length === 0) {
    if (isDev) console.log('[Recommendations] No cached songs available')
    const { setRecommendationsQuality } = useSettingsStore.getState()
    setRecommendationsQuality('failed')
    console.warn("Couldn't generate recommendations. Try syncing your library")
    return { recommendations: [], hasGenreMatches: false }
  }

  if (isDev) {
    console.log('[Recommendations] Using', availableSongs.length, 'available songs')
    console.log('[Recommendations] Current track genres:', genres, '(count:', genres.length + ')')
    console.log('[Recommendations] Current track year:', currentTrack.ProductionYear)
    console.log('[Recommendations] Queue size:', queue.length)
    console.log('[Recommendations] Sample available songs:', availableSongs.slice(0, 3).map(s => `${s.Name} (${s.ProductionYear}) [${s.Genres?.join(', ')}]`))
  }

  // Generate recommendations from available songs
  let recommendations: BaseItemDto[] = []

  // Track recommendation quality
  let genreMatchSuccess = false

  // Avoid consecutive songs by same artist in recommendations
  const getRecommendedArtistIds = () => recommendations.flatMap(rec => rec.ArtistItems?.map(a => a.Id) || [])

  // 1. Genre matches (highest priority) - exact synthetic genre matching
  if (genres.length > 0) {
    let genreMatchCount = 0
    let filteredByCurrentTrack = 0
    let filteredByQueue = 0
    let filteredByArtist = 0

    const genreMatches = availableSongs.filter(song => {
      // Exact synthetic genre matching only
      const hasGenreMatch = song.Genres?.some(songGenre =>
        genres.some(trackGenre =>
          songGenre.toLowerCase() === trackGenre.toLowerCase()
        )
      )

      if (!hasGenreMatch) return false
      genreMatchCount++

      const notCurrentTrack = song.Id !== currentTrack.Id
      if (!notCurrentTrack) {
        filteredByCurrentTrack++
        return false
      }

      const notInQueue = !queue.some(queued => queued.Id === song.Id)
      if (!notInQueue) {
        filteredByQueue++
        return false
      }

      const notConsecutiveArtist = !song.ArtistItems?.some(songArtist =>
        getRecommendedArtistIds().includes(songArtist.Id)
      )
      if (!notConsecutiveArtist) {
        filteredByArtist++
        return false
      }

      return true
    })

    console.log('[Recommendations] Genre matching results:', {
      totalGenreMatches: genreMatchCount,
      filteredByCurrentTrack,
      filteredByQueue,
      filteredByArtist,
      passedAllFilters: genreMatches.length
    })

    // If we found ZERO genre matches at all, trigger auto-sync for current track's genres
    if (genreMatchCount === 0 && genres.length > 0) {
      console.log('[Recommendations] No songs found matching genres:', genres)
      console.log('[Recommendations] Triggering auto-sync for these genres...')
      // Trigger sync for all genres (in background, don't wait)
      for (const genre of genres) {
        syncGenreForRecommendations(genre).catch(err =>
          console.error(`[Recommendations] Genre sync failed for ${genre}:`, err)
        )
      }
      // Return early with triggeredGenreSync flag
      return {
        recommendations: [],
        hasGenreMatches: false,
        triggeredGenreSync: true
      }
    }

    // Shuffle genre matches to avoid alphabetical bias (always picking "A" songs)
    const shuffledGenreMatches = shuffleArray(genreMatches)
    recommendations.push(...shuffledGenreMatches.slice(0, 8))
    if (isDev) console.log(`[Recommendations] Added ${Math.min(shuffledGenreMatches.length, 8)} genre matches to recommendations`)

    // Track genre match success
    if (genres.length > 0 && genreMatches.length > 0) {
      genreMatchSuccess = true
    } else if (genres.length > 0 && genreMatches.length === 0) {
      console.warn('[Recommendations] No genre matches passed filters - falling back to year/artist matching')
      genreMatchSuccess = false
    }

  } else {
    if (isDev) console.log('[Recommendations] No genres on current track')
  }

  // 2. Year matches (if available) - progressive expansion ±3 → ±6 → ±10 → any year
  const currentYear = currentTrack.ProductionYear


  if (currentYear && recommendations.length < 10) {
    const yearRanges = [
      { range: 3, years: Array.from({ length: 7 }, (_, i) => currentYear - 3 + i) }, // ±3 years
      { range: 6, years: Array.from({ length: 13 }, (_, i) => currentYear - 6 + i) }, // ±6 years
      { range: 10, years: Array.from({ length: 21 }, (_, i) => currentYear - 10 + i) }, // ±10 years
    ]

    let yearMatches: LightweightSong[] = []

    // Try each year range progressively, collecting all matches from each range
    for (const { years } of yearRanges) {
      if (yearMatches.length >= 12) {
        break // We have enough for 12 recommendations
      }

      const rangeMatches = availableSongs.filter(song => {
        const inYearRange = song.ProductionYear && years.includes(song.ProductionYear)
        const notInQueue = !queue.some(queued => queued.Id === song.Id)
        const notAlreadyRecommended = !recommendations.some(rec => rec.Id === song.Id)
        const notCurrentTrack = song.Id !== currentTrack.Id
        const notConsecutiveArtist = !song.ArtistItems?.some(songArtist =>
          getRecommendedArtistIds().includes(songArtist.Id)
        )

        return inYearRange && notCurrentTrack && notInQueue && notAlreadyRecommended && notConsecutiveArtist
      })

      yearMatches.push(...rangeMatches)
    }

    // Deduplicate year matches (since ranges overlap)
    const uniqueYearMatches = Array.from(
      new Map(yearMatches.map(song => [song.Id, song])).values()
    )

    // Shuffle year matches to avoid alphabetical bias
    const shuffledYearMatches = shuffleArray(uniqueYearMatches)
    const selectedYearMatches = shuffledYearMatches.slice(0, 12)
    recommendations.push(...selectedYearMatches)

    if (isDev) console.log(`[Recommendations] Total year matches used: ${selectedYearMatches.length}`)

  }

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

  console.log('[Recommendations] Quality decision:', {
    finalRecommendationsCount: finalRecommendations.length,
    genreMatchSuccess,
    hasGenres: genres.length > 0,
    availableSongsCount: availableSongs.length
  })

  if (finalRecommendations.length === 0) {
    console.log('[Recommendations] Got 0 final recommendations')
    setRecommendationsQuality('failed')
  } else if (!genreMatchSuccess && genres.length > 0) {
    console.log('[Recommendations] No genre matches found, setting degraded quality')
    setRecommendationsQuality('degraded')
  } else {
    setRecommendationsQuality('good')
  }

  if (isDev) {
    console.log(`[Recommendations] Generated ${finalRecommendations.length} recommendations`)
    if (finalRecommendations.length > 0) {
      console.log('[Recommendations] Sample:', finalRecommendations.slice(0, 3).map(r => r.Name))
    }
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

