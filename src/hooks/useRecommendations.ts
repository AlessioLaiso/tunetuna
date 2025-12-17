import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { useSettingsStore } from '../stores/settingsStore'
import { getRecommendedSongs } from '../utils/recommendations'

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
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

  useEffect(() => {
    // Update recent queue (last 20 tracks)
    recentQueueRef.current = songs.slice(-20)
  }, [songs])

  useEffect(() => {
    // Reset failure timestamp when current track changes
    lastFailedAttemptRef.current = 0
  }, [currentIndex])

  useEffect(() => {
    // Reset failure timestamp when user manually toggles recommendations on/off
    lastFailedAttemptRef.current = 0
  }, [showQueueRecommendations])

  useEffect(() => {
    // Count upcoming recommendations (after current position)
    const upcomingRecommendations = songs
      .slice(currentIndex + 1)
      .filter(song => song.source === 'recommendation').length

    // If recommendations are enabled, maintain exactly 12 upcoming recommendations
    // Don't retry if we recently failed (within 10 seconds)
    const timeSinceLastFailure = Date.now() - lastFailedAttemptRef.current
    const shouldTrigger = Boolean(
      showQueueRecommendations &&
        !isRecommendingRef.current &&
        !isFetchingRecommendations && // Don't trigger if already fetching
        currentIndex >= 0 &&
        upcomingRecommendations < 12 &&
        timeSinceLastFailure > 10000 // Wait at least 10 seconds after a failed attempt
    )

    if (!shouldTrigger) return

    const runRecommendations = async () => {
      console.log('[Recommendations] Starting fetch, setting isRecommending = true')
      isRecommendingRef.current = true
      setIsFetchingRecommendations(true)

      // Safety timeout to reset flags if something goes wrong
      const timeoutId = setTimeout(() => {
        console.log('[Recommendations] Safety timeout triggered, resetting flags')
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

        // DEBUG: Show which seed tracks are being used
        console.log('[Recommendations] Using seed tracks:', seedTracks.map((seed, i) =>
          `${i + 1}. ${seed.Name} (${seed.ProductionYear}) [${seed.Genres?.join(', ') || 'no genres'}]`
        ))

        // Get recommendations for each seed
        const seedResults: Array<{recommendations: any[], hasGenreMatches: boolean}> = []

        for (const seed of seedTracks) {
          console.log(`[Recommendations] Generating recommendations for seed: ${seed.Name}`)
          const result = await getRecommendedSongs({
            currentTrack: seed,
            queue: songs,
            recentQueue: recentQueueRef.current,
            lastPlayedTrack: null, // Not needed with new system
          })

          console.log(`[Recommendations] Result for seed ${seed.Name}:`, {
            recommendationsCount: result.recommendations?.length || 0,
            hasGenreMatches: result.hasGenreMatches,
            triggeredGenreSync: result.triggeredGenreSync,
            resultType: typeof result,
            isArray: Array.isArray(result)
          })

          // If genre sync was triggered, skip this seed and schedule a retry
          if (result.triggeredGenreSync) {
            console.log('[Recommendations] Genre sync triggered for this seed, skipping it and will retry in 5 seconds...')
            setTimeout(() => {
              // Reset the failure timestamp to allow immediate retry
              lastFailedAttemptRef.current = 0
            }, 5000)
            return // Skip adding this seed to results
          }

          if (result.recommendations && Array.isArray(result.recommendations)) {
            seedResults.push(result)
          } else {
            console.warn(`[Recommendations] Invalid result for seed ${seed.Name}:`, result)
          }
        }

        // Filter to only seeds that found genre matches
        const successfulSeeds = seedResults.filter(result => result.hasGenreMatches)

        console.log(`[Recommendations] ${successfulSeeds.length} out of ${seedTracks.length} seeds found genre matches`)

        // If no seeds found genre matches, set degraded quality
        if (successfulSeeds.length === 0) {
          const { setRecommendationsQuality } = useSettingsStore.getState()
          setRecommendationsQuality('degraded')
          console.log('[Recommendations] No genre matches found - falling back to year/artist only')
        }

        // Distribute recommendations evenly across successful seeds (or all seeds if none successful)
        const seedsToUse = successfulSeeds.length > 0 ? successfulSeeds : seedResults
        const targetPerSeed = Math.ceil(12 / seedsToUse.length)
        const safeRecommendations: any[] = []

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

          console.log(`[Recommendations] Added ${toAdd.length} recommendations from seed (${filtered.length} available, genreMatch: ${seedResult.hasGenreMatches})`)
        }

        // Limit to final 12
        const finalRecommendations = safeRecommendations.slice(0, 12)

        // Shuffle the final recommendations to mix genres (independent of shuffle setting)
        const shuffledRecommendations = shuffleArray(finalRecommendations)

        console.log(`[Recommendations] Final ${finalRecommendations.length} recommendations (distributed across ${seedTracks.length} seeds)`)

        if (shuffledRecommendations.length > 0) {
          const upcomingAfterAdd = songs.slice(currentIndex + 1).filter(song => song.source === 'recommendation').length + shuffledRecommendations.length
          console.log(`[Recommendations] Adding ${shuffledRecommendations.length} recommendations. Upcoming recommendations will be: ${upcomingAfterAdd}`)
          console.log('[Recommendations] Recommendations to add:', shuffledRecommendations.map(r => r.Name))
          addToQueue(shuffledRecommendations, false, 'recommendation') // Add as recommendations
          console.log('[Recommendations] Successfully added recommendations to queue')
          // Reset failure timestamp on success
          lastFailedAttemptRef.current = 0
        } else {
          console.log('[Recommendations] No safe recommendations to add - marking as failed attempt')
          // Mark this as a failed attempt to prevent infinite retries
          lastFailedAttemptRef.current = Date.now()
        }

      } catch (error) {
        console.error('[Recommendations Hook] Failed to get recommendations:', error)
        // Ensure flags are reset even on error
        isRecommendingRef.current = false
        setIsFetchingRecommendations(false)
      } finally {
        clearTimeout(timeoutId)
        console.log('[Recommendations] Finished fetch, setting isRecommending = false')
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

