import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { useSettingsStore } from '../stores/settingsStore'
import { getRecommendedSongs } from '../utils/recommendations'
import { logger } from '../utils/logger'
import type { BaseItemDto } from '../api/types'

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * Reorders recommendations to avoid consecutive songs by the same artist.
 * Shuffles first, then selects tracks to maximize artist diversity.
 */
function reorderForArtistDiversity(recommendations: BaseItemDto[]): BaseItemDto[] {
  if (recommendations.length <= 1) return recommendations

  const shuffled = shuffleArray(recommendations)
  const reordered: BaseItemDto[] = []
  const pool = [...shuffled]

  while (pool.length > 0) {
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

  return reordered
}

export function useRecommendations() {
  const {
    songs,
    currentIndex,
    addToQueue,
    refreshCurrentTrack,
    isFetchingRecommendations,
    setIsFetchingRecommendations,
  } = usePlayerStore()

  const { showQueueRecommendations } = useSettingsStore()

  const recentQueueRef = useRef<typeof songs>([])
  const isRecommendingRef = useRef(false)
  const lastFailedAttemptRef = useRef<number>(0) // Track when we last failed to get recommendations
  const lastSuccessAttemptRef = useRef<number>(0) // Track when we last succeeded to prevent rapid re-triggering
  const retryCountRef = useRef<number>(0) // Track retry attempts for genre sync
  const maxRetries = 3 // Maximum retry attempts before giving up

  useEffect(() => {
    // Update recent queue (last 20 tracks)
    recentQueueRef.current = songs.slice(-20)
  }, [songs])

  useEffect(() => {
    // Reset timestamps when current track changes for immediate fetch
    lastFailedAttemptRef.current = 0
    lastSuccessAttemptRef.current = 0
    retryCountRef.current = 0
  }, [currentIndex])

  useEffect(() => {
    // Reset timestamps when user manually toggles recommendations on/off for immediate fetch
    lastFailedAttemptRef.current = 0
    lastSuccessAttemptRef.current = 0
    retryCountRef.current = 0
  }, [showQueueRecommendations])

  useEffect(() => {
    // Count upcoming recommendations (after current position)
    const upcomingRecommendations = songs
      .slice(currentIndex + 1)
      .filter(song => song.source === 'recommendation').length

    // If recommendations are enabled, maintain exactly 12 upcoming recommendations
    // Don't retry if we recently failed OR succeeded (cooldown to prevent rapid re-triggering)
    const timeSinceLastFailure = Date.now() - lastFailedAttemptRef.current
    const timeSinceLastSuccess = Date.now() - lastSuccessAttemptRef.current
    const shouldTrigger = Boolean(
      showQueueRecommendations &&
        !isRecommendingRef.current &&
        !isFetchingRecommendations && // Don't trigger if already fetching
        currentIndex >= 0 &&
        upcomingRecommendations < 12 &&
        timeSinceLastFailure > 10000 && // Wait at least 10 seconds after a failed attempt
        timeSinceLastSuccess > 5000 // Wait at least 5 seconds after a successful fetch
    )

    if (!shouldTrigger) {
      // Debug: Log why we're not triggering
      if (upcomingRecommendations >= 12) {
        // This is the normal case - we have enough recommendations
        return
      }
      if (timeSinceLastSuccess <= 5000) {
        logger.log(`[Recommendations] Waiting for cooldown (${5 - Math.floor(timeSinceLastSuccess / 1000)}s remaining)`)
      }
      return
    }

    const runRecommendations = async () => {
      logger.log('[Recommendations] Starting fetch, setting isRecommending = true')
      isRecommendingRef.current = true
      setIsFetchingRecommendations(true)

      // Safety timeout to reset flags if something goes wrong
      const timeoutId = setTimeout(() => {
        logger.log('[Recommendations] Safety timeout triggered, resetting flags')
        isRecommendingRef.current = false
        setIsFetchingRecommendations(false)
      }, 30000) // 30 seconds timeout

      try {
        await refreshCurrentTrack()
        const currentTrack = songs[currentIndex]

        if (!currentTrack) return

        // Get seeds from current track and nearby tracks
        const seedTracks = [currentTrack]

        // Add up to 2 more seeds from nearby songs
        const nearbyIndices = [currentIndex - 1, currentIndex + 1, currentIndex + 2]
        for (const idx of nearbyIndices) {
          if (idx >= 0 && idx < songs.length && seedTracks.length < 3) {
            const nearbyTrack = songs[idx]
            if (nearbyTrack && !seedTracks.some(s => s.Id === nearbyTrack.Id)) {
              seedTracks.push(nearbyTrack)
            }
          }
        }


        // Get recommendations for each seed
        const seedResults: Array<{recommendations: BaseItemDto[], hasGenreMatches: boolean}> = []

        for (const seed of seedTracks) {
          logger.log(`[Recommendations] Generating recommendations for seed: ${seed.Name}`)
          const result = await getRecommendedSongs({
            currentTrack: seed,
            queue: songs,
            recentQueue: recentQueueRef.current,
            lastPlayedTrack: null, // Not needed with new system
          })

          logger.log(`[Recommendations] Result for seed ${seed.Name}:`, {
            recommendationsCount: result.recommendations?.length || 0,
            hasGenreMatches: result.hasGenreMatches,
            triggeredGenreSync: result.triggeredGenreSync,
            resultType: typeof result,
            isArray: Array.isArray(result)
          })

          // If genre sync was triggered, skip this seed and schedule a retry
          if (result.triggeredGenreSync) {
            retryCountRef.current += 1

            if (retryCountRef.current > maxRetries) {
              logger.warn('[Recommendations] Max retries reached, giving up')
              lastFailedAttemptRef.current = Date.now()
              const { setRecommendationsQuality } = useSettingsStore.getState()
              setRecommendationsQuality('failed')
              return
            }

            // Exponential backoff: 15s, 30s, 60s
            const backoffDelay = 15000 * Math.pow(2, retryCountRef.current - 1)
            logger.log(`[Recommendations] Genre sync triggered (attempt ${retryCountRef.current}/${maxRetries}), retry in ${backoffDelay/1000}s`)

            setTimeout(() => {
              lastFailedAttemptRef.current = 0
            }, backoffDelay)
            return // Skip adding this seed to results
          }

          if (result.recommendations && Array.isArray(result.recommendations)) {
            seedResults.push(result)
          } else {
            logger.warn(`[Recommendations] Invalid result for seed ${seed.Name}:`, result)
          }
        }

        // Filter to only seeds that found genre matches
        const successfulSeeds = seedResults.filter(result => result.hasGenreMatches)

        logger.log(`[Recommendations] ${successfulSeeds.length} out of ${seedTracks.length} seeds found genre matches`)

        // If no seeds found genre matches, set degraded quality
        if (successfulSeeds.length === 0) {
          const { setRecommendationsQuality } = useSettingsStore.getState()
          setRecommendationsQuality('degraded')
          logger.log('[Recommendations] No genre matches found - falling back to year/artist only')
        }

        // Calculate how many we actually need to reach 12 total upcoming
        const currentUpcoming = songs.slice(currentIndex + 1).filter(song => song.source === 'recommendation').length
        const neededCount = Math.max(0, 12 - currentUpcoming)

        if (neededCount === 0) {
          logger.log('[Recommendations] Already have 12 upcoming recommendations, skipping')
          return
        }

        logger.log(`[Recommendations] Currently have ${currentUpcoming} upcoming, need ${neededCount} more to reach 12`)

        // Distribute recommendations evenly across successful seeds (or all seeds if none successful)
        const seedsToUse = successfulSeeds.length > 0 ? successfulSeeds : seedResults
        const targetPerSeed = Math.ceil(neededCount / seedsToUse.length)
        const safeRecommendations: BaseItemDto[] = []

        for (const seedResult of seedsToUse) {
          const filtered = seedResult.recommendations.filter(rec => {
            // Filter out songs already in queue or already selected
            const alreadyInQueue = songs.some(song => song.Id === rec.Id)
            const alreadySelected = safeRecommendations.some(existing => existing.Id === rec.Id)
            return !alreadyInQueue && !alreadySelected
          })

          // Take up to targetPerSeed from this seed
          const toAdd = filtered.slice(0, targetPerSeed)
          safeRecommendations.push(...toAdd)

          logger.log(`[Recommendations] Added ${toAdd.length} recommendations from seed (${filtered.length} available, genreMatch: ${seedResult.hasGenreMatches})`)
        }

        // Limit to what we actually need
        const finalRecommendations = safeRecommendations.slice(0, neededCount)

        // Reorder to avoid consecutive songs by the same artist while mixing genres
        const shuffledRecommendations = reorderForArtistDiversity(finalRecommendations)

        logger.log(`[Recommendations] Final ${finalRecommendations.length} recommendations (distributed across ${seedTracks.length} seeds)`)

        if (shuffledRecommendations.length > 0) {
          logger.log(`[Recommendations] Adding ${shuffledRecommendations.length} recommendations (had ${currentUpcoming}, will have ${currentUpcoming + shuffledRecommendations.length})`)
          logger.log('[Recommendations] Recommendations to add:', shuffledRecommendations.map(r => r.Name))
          // CRITICAL: Set success timestamp BEFORE adding to queue to prevent race condition
          // When addToQueue updates state, React schedules re-render immediately
          // We must set the timestamp first so the cooldown check sees the new value
          lastFailedAttemptRef.current = 0
          lastSuccessAttemptRef.current = Date.now()
          retryCountRef.current = 0
          addToQueue(shuffledRecommendations, false, 'recommendation') // Add as recommendations
          logger.log('[Recommendations] Successfully added recommendations to queue')
        } else {
          logger.log('[Recommendations] No safe recommendations to add - marking as failed attempt')
          // Mark this as a failed attempt to prevent infinite retries
          lastFailedAttemptRef.current = Date.now()
        }

      } catch (error) {
        logger.error('[Recommendations Hook] Failed to get recommendations:', error)
        // Ensure flags are reset even on error
        isRecommendingRef.current = false
        setIsFetchingRecommendations(false)
      } finally {
        clearTimeout(timeoutId)
        logger.log('[Recommendations] Finished fetch, setting isRecommending = false')
        isRecommendingRef.current = false
        setIsFetchingRecommendations(false)
      }
    }

    runRecommendations()
  }, [
    songs,
    currentIndex,
    addToQueue,
    refreshCurrentTrack,
    showQueueRecommendations,
    isFetchingRecommendations,
    setIsFetchingRecommendations,
  ])
}

