import { ReactNode, useEffect } from 'react'
import TabBar from './TabBar'
import PlayerBar from '../player/PlayerBar'
import SyncStatusBar from '../shared/SyncStatusBar'
import { useRecommendations } from '../../hooks/useRecommendations'
import { useSettingsStore } from '../../stores/settingsStore'
import { useMusicStore } from '../../stores/musicStore'
import { useSyncStore } from '../../stores/syncStore'
import { usePlayerStore } from '../../stores/playerStore'
import QueueSidebar from '../player/QueueSidebar'
import { jellyfinClient } from '../../api/jellyfin'
import type { LightweightSong, BaseItemDto } from '../../api/types'
import { logger } from '../../utils/logger'

const colorMap: Record<string, string> = {
  slate: '#64748b',
  gray: '#6b7280',
  zinc: '#71717a',
  neutral: '#737373',
  stone: '#78716c',
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  lime: '#84cc16',
  green: '#22c55e',
  emerald: '#10b981',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  fuchsia: '#d946ef',
  pink: '#ec4899',
  rose: '#f43f5e',
}

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  useRecommendations()
  const { accentColor } = useSettingsStore()
  const { genres, songs, genreSongs } = useMusicStore()
  const { state: syncState } = useSyncStore()

  const { isQueueSidebarOpen } = usePlayerStore()

  // Fisher-Yates shuffle algorithm
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  // Utility function to generate fresh shuffle pool
  const generateShufflePool = (allSongs: LightweightSong[], recentlyPlayed: BaseItemDto[], poolSize = 30) => {
    if (allSongs.length === 0) return []

    // Exclude recently played songs (last 10) to avoid repetition
    const recentlyPlayedIds = new Set(recentlyPlayed.slice(0, 10).map(song => song.Id))
    const availableSongs = allSongs.filter(song => !recentlyPlayedIds.has(song.Id))

    // If we don't have enough songs after exclusion, include some recent ones
    let poolSongs = availableSongs
    if (poolSongs.length < poolSize) {
      const recentToInclude = recentlyPlayed.slice(0, poolSize - poolSongs.length)
      poolSongs = [...poolSongs, ...recentToInclude.map(rp =>
        allSongs.find(s => s.Id === rp.Id)
      ).filter(Boolean)]
    }

    // Shuffle and return pool
    return shuffleArray(poolSongs).slice(0, poolSize)
  }

  useEffect(() => {
    const colorHex = colorMap[accentColor] || colorMap.blue
    document.documentElement.style.setProperty('--accent-color', colorHex)
  }, [accentColor])

  // Update header offset when sync state changes
  useEffect(() => {
    const headerOffset = syncState !== 'idle' ? '28px' : '0px'
    document.documentElement.style.setProperty('--header-offset', headerOffset)
  }, [syncState])

  // Preload genres in background if not already loaded
  useEffect(() => {
    if (genres.length === 0) {
      // Preload genres in background - non-blocking
      jellyfinClient.getGenres().catch(err => {
        logger.warn('Background genre preload failed:', err)
      })
    }
  }, [genres.length])

  // Minimal preload for instant shuffle start
  useEffect(() => {
    const musicStore = useMusicStore.getState()
    const totalSongs = songs.length + Object.values(genreSongs).flat().length

    // Create shuffle pool if songs exist but pool is empty (existing users)
    if (totalSongs > 0 && musicStore.shufflePool.length === 0) {
      try {
        musicStore.refreshShufflePool()
      } catch (error) {
        logger.warn('Failed to refresh shuffle pool:', error)
      }
    }
    // Preload minimal songs if nothing cached (first-time users)
    else if (totalSongs === 0) {
      setTimeout(async () => {
        try {
          // Get total song count first
          const countResult = await jellyfinClient.getSongs({ limit: 1 })
          const librarySize = countResult.TotalRecordCount || 1000

          // Generate 3 random offsets across the entire library
          const offsets = []
          for (let i = 0; i < 3; i++) {
            const randomOffset = Math.floor(Math.random() * librarySize)
            offsets.push(randomOffset)
          }

          // Fetch 1 song from each random offset (parallel requests)
          const samplePromises = offsets.map(offset =>
            jellyfinClient.getSongs({
              limit: 1,
              sortBy: ['SortName'],
              sortOrder: 'Ascending',
              startIndex: offset
            })
          )

          const results = await Promise.all(samplePromises)
          const sampledSongs = results.flatMap(result => result.Items || [])

          if (sampledSongs.length > 0) {
            const lightweightSongs = sampledSongs.map(song => ({
              Id: song.Id,
              Name: song.Name,
              AlbumArtist: song.AlbumArtist,
              ArtistItems: song.ArtistItems,
              Album: song.Album,
              AlbumId: song.AlbumId,
              IndexNumber: song.IndexNumber,
              ProductionYear: song.ProductionYear,
              PremiereDate: song.PremiereDate,
              RunTimeTicks: song.RunTimeTicks,
              Genres: song.Genres
            }))

            // Cache songs and create shuffle pool from the diverse samples
            useMusicStore.setState({
              songs: lightweightSongs,
              shufflePool: shuffleArray(lightweightSongs), // Use all sampled songs
              lastPoolUpdate: Date.now()
            })
          }
        } catch (error) {
          logger.warn('Minimal song preload failed:', error)
          // Shuffle will work via API fallback - no big deal
        }
      }, 300) // Quick delay, not 500ms
    }
  }, [songs.length, genreSongs])

  const topOffset = syncState !== 'idle' ? '28px' : '0px'

  return (
    <>
      {/* Fixed overlay to hide content behind status bar */}
      <div
        className="fixed top-0 right-0 bg-black z-50 pointer-events-none left-0 lg:left-8"
        style={{
          height: `env(safe-area-inset-top)`,
          top: syncState !== 'idle' ? '28px' : '0px'
        }}
      />
      <SyncStatusBar />
      {/* Fixed overlay to hide content behind TabBar - only on mobile */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-zinc-900 z-40 pointer-events-none lg:hidden"
        style={{ height: `calc(4rem + env(safe-area-inset-bottom) - 8px)` }}
      />
      {/* Fixed overlay to hide content behind vertical TabBar - only on desktop */}
      <div
        className="fixed top-0 left-0 bottom-0 bg-black z-30 pointer-events-none hidden lg:block"
        style={{ width: '4rem' }}
      />
      <div
        className={`main-scrollable h-screen bg-black text-white lg:pl-16 transition-[padding] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-padding' : ''}`}
        style={{
          paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))',
          paddingTop: syncState !== 'idle' ? '28px' : '0',
          overflowY: 'auto',
          overflowX: 'hidden',
          maxWidth: '100vw',
          width: '100%',
          scrollbarGutter: 'stable'
        }}
      >
        <div className="max-w-[768px] w-full mx-auto lg:flex lg:justify-center">
          <div className="w-full max-w-[768px]">
            {children}
          </div>
        </div>
        <PlayerBar />
        <TabBar />
      </div>
      <QueueSidebar />
    </>
  )
}

