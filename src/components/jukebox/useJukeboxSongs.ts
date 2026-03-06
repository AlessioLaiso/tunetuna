import { useState, useEffect, useCallback } from 'react'
import type { LightweightSong } from '../../api/types'
import { useMusicStore } from '../../stores/musicStore'
import { useStatsStore } from '../../stores/statsStore'
import { shuffleArray } from '../../utils/array'

const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000
const JUKEBOX_COUNT = 8

export function useJukeboxSongs(isOpen: boolean) {
  const [songs, setSongs] = useState<LightweightSong[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const pickSongs = useCallback(async () => {
    setIsLoading(true)
    try {
      const allSongs = useMusicStore.getState().songs
      if (allSongs.length === 0) {
        setSongs([])
        return
      }

      // Try to filter out songs played in the last 15 days
      let recentSongIds = new Set<string>()
      try {
        const now = Date.now()
        const fifteenDaysAgo = now - FIFTEEN_DAYS_MS
        const events = await useStatsStore.getState().fetchEvents(fifteenDaysAgo, now)
        recentSongIds = new Set(events.map(e => e.songId))
      } catch {
        // Stats unavailable — skip filter
      }

      let eligible = allSongs.filter(s => !recentSongIds.has(s.Id))
      if (eligible.length < JUKEBOX_COUNT) {
        eligible = allSongs
      }

      setSongs(shuffleArray(eligible).slice(0, JUKEBOX_COUNT))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      pickSongs()
    }
  }, [isOpen, refreshKey, pickSongs])

  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  return { songs, isLoading, refresh }
}
