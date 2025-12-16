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
    queue,
    currentTrack,
    currentIndex,
    addToQueue,
    lastPlayedTrack,
    manuallyCleared,
    refreshCurrentTrack,
    isFetchingRecommendations,
    setIsFetchingRecommendations,
    collectionStartIndex,
    originalQueue,
    playedSongIds,
  } = usePlayerStore()
  const { enableQueueRecommendations } = useSettingsStore()
  const recentQueueRef = useRef<typeof queue>([])
  const isRecommendingRef = useRef(false)

  useEffect(() => {
    // Update recent queue (last 20 tracks)
    recentQueueRef.current = queue.slice(-20)
  }, [queue])

  useEffect(() => {
    const { shuffle } = usePlayerStore.getState()

    let tracksRemaining = 0

    if (currentIndex >= 0 && currentIndex < queue.length) {
      // Normal case: currentIndex points into the queue
      tracksRemaining = queue.length - currentIndex
    } else if (queue.length === 1 && currentTrack) {
      // Restore case: one item in queue and a currentTrack, but index is invalid
      tracksRemaining = 1
    } else if (queue.length === 0 && currentTrack) {
      // Extreme case: no queue at all but a playing track
      tracksRemaining = 1
    }

    const shouldTrigger = Boolean(
      enableQueueRecommendations &&
        !isRecommendingRef.current &&
        !manuallyCleared &&
        currentTrack &&
        tracksRemaining > 0 &&
        tracksRemaining <= 3
    )

    if (!shouldTrigger || !currentTrack) {
      return
    }

    isRecommendingRef.current = true
    setIsFetchingRecommendations?.(true)

    const runRecommendations = async () => {
      try {
        await refreshCurrentTrack()
        const refreshedTrack =
          usePlayerStore.getState().currentTrack || currentTrack

        const seeds: typeof queue = []
        const baseIndex =
          currentIndex >= 0 && currentIndex < queue.length ? currentIndex : -1

        if (baseIndex >= 0) {
          const currentSeed = queue[baseIndex]
          if (currentSeed) seeds.push(currentSeed)

          const nextSeed = queue[baseIndex + 1]
          if (nextSeed) seeds.push(nextSeed)

          const nextNextSeed = queue[baseIndex + 2]
          if (nextNextSeed) seeds.push(nextNextSeed)
        }

        if (seeds.length === 0 && refreshedTrack) {
          seeds.push(refreshedTrack as any)
        }

        let perSeedTarget = 12
        if (seeds.length === 2) perSeedTarget = 6
        if (seeds.length >= 3) perSeedTarget = 4

        const allRecommendedMap = new Map<string, typeof queue[0]>()

        for (let idx = 0; idx < seeds.length; idx++) {
          const seed = seeds[idx]
          if (!seed) continue

          const seedRecs = await getRecommendedSongs({
            currentTrack: seed,
            queue,
            recentQueue: recentQueueRef.current,
            lastPlayedTrack,
          })

          if (!Array.isArray(seedRecs) || seedRecs.length === 0) {
            console.warn(
              `[Recommendations Hook] Seed ${idx} returned no recommendations`
            )
            continue
          }

          const seedNew = seedRecs
            .filter((r) => r && r.Id && !allRecommendedMap.has(String(r.Id)))
            .slice(0, perSeedTarget)

          seedNew.forEach((r) => {
            allRecommendedMap.set(String(r.Id), r as any)
          })
        }

        let combined = Array.from(allRecommendedMap.values())

        const {
          queue: currentQueueNow,
          currentTrack: currentTrackNow,
          lastPlayedTrack: lastPlayedTrackNow,
          playedSongIds: currentPlayedSongIds,
        } = usePlayerStore.getState()

        const safeCombined = combined.filter((r) => {
          const inQueue = currentQueueNow.some((q) => q.Id === r.Id)
          const isCurrent = currentTrackNow?.Id === r.Id
          const isLastPlayed = lastPlayedTrackNow?.Id === r.Id
          const alreadyPlayed = currentPlayedSongIds.includes(r.Id)
          if (inQueue || isCurrent || isLastPlayed || alreadyPlayed) {
            console.warn(
              `[Recommendations Hook] Filtering out ${r.Name} (${r.Id}) - inQueue: ${inQueue}, isCurrent: ${isCurrent}, isLastPlayed: ${isLastPlayed}, alreadyPlayed: ${alreadyPlayed}`
            )
            return false
          }
          return true
        })

        if (safeCombined.length < combined.length) {
          console.warn(
            `[Recommendations Hook] Filtered out ${
              combined.length - safeCombined.length
            } songs that are now in queue/playing`
          )
        }

        if (safeCombined.length === 0) {
          console.warn(
            '[Recommendations Hook] No safe combined recommendations remain after filtering'
          )
          return
        }

        const shuffled = shuffleArray(safeCombined)
        const finalRecommendations = shuffled.slice(0, 12)

        if (finalRecommendations.length > 0) {
          addToQueue(finalRecommendations, true)
        } else {
          console.warn(
            '[Recommendations Hook] No recommendations to add after shuffling/slicing'
          )
        }
      } catch (error) {
        console.error(
          '[Recommendations Hook] CRITICAL: Failed to get multi-seed recommendations:',
          error
        )
        console.error('[Recommendations Hook] Error details:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : 'No stack trace',
          currentTrack: currentTrack?.Name,
          queueLength: queue.length,
        })
      } finally {
        isRecommendingRef.current = false
        setIsFetchingRecommendations?.(false)
      }
    }

    void runRecommendations()
  }, [
    currentIndex,
    queue.length,
    currentTrack,
    queue,
    addToQueue,
    lastPlayedTrack,
    manuallyCleared,
    refreshCurrentTrack,
    enableQueueRecommendations,
    setIsFetchingRecommendations,
  ])
}

