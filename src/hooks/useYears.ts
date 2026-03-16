import { useState, useEffect } from 'react'
import { useMusicStore } from '../stores/musicStore'
import { jellyfinClient } from '../api/jellyfin'
import { logger } from '../utils/logger'

/**
 * Loads year filter values from the store or API.
 * Used by SongsPage and AlbumsPage for year-based filtering.
 */
export function useYears() {
  const [years, setYears] = useState<number[]>([])

  useEffect(() => {
    const loadFilterValues = async () => {
      try {
        const store = useMusicStore.getState()
        if (store.years.length > 0) {
          setYears(store.years)
        } else {
          const yearsData = await jellyfinClient.getYears()
          setYears(yearsData)
        }
      } catch (error) {
        logger.error('Failed to load filter values:', error)
      }
    }
    loadFilterValues()
  }, [])

  return years
}
