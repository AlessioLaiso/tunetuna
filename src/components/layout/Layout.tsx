import { ReactNode, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import TabBar from './TabBar'
import PlayerBar from '../player/PlayerBar'
import SyncStatusBar from '../shared/SyncStatusBar'
import { useRecommendations } from '../../hooks/useRecommendations'
import { useLibraryChanged } from '../../hooks/useLibraryChanged'
import { useSettingsStore } from '../../stores/settingsStore'
import { useMusicStore } from '../../stores/musicStore'
import { useSyncStore } from '../../stores/syncStore'
import { usePlayerStore } from '../../stores/playerStore'
import QueueSidebar from '../player/QueueSidebar'
import { jellyfinClient } from '../../api/jellyfin'
import { logger } from '../../utils/logger'
import { shuffleArray } from '../../utils/array'
import { probeAndUpdateServerUrl } from '../../utils/serverUrl'

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
  const location = useLocation()
  useRecommendations()
  useLibraryChanged()
  const { accentColor } = useSettingsStore()
  const { genres, songs, genreSongs } = useMusicStore()
  const { state: syncState, startSync, completeSync } = useSyncStore()

  const { isQueueSidebarOpen } = usePlayerStore()
  const autoSyncTriggered = useRef(false)

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

  // Auto-trigger full library sync after first login
  useEffect(() => {
    if (autoSyncTriggered.current) return

    // Wait briefly for store hydration before checking
    const timeout = setTimeout(async () => {
      const { lastSyncCompleted } = useMusicStore.getState()
      const { state } = useSyncStore.getState()

      // Only auto-sync if never synced before and not already syncing
      if (lastSyncCompleted !== null || state !== 'idle') return

      autoSyncTriggered.current = true
      const { setProgress } = useSyncStore.getState()

      startSync('auto', 'Syncing library...')
      try {
        await probeAndUpdateServerUrl()
        await jellyfinClient.syncLibrary({ scope: 'full' }, setProgress)

        // Check if user cancelled during sync
        if (useSyncStore.getState().state !== 'syncing') return

        const result = await jellyfinClient.getGenres()
        const sorted = (result || []).sort((a, b) =>
          (a.Name || '').localeCompare(b.Name || '')
        )
        useMusicStore.getState().setGenres(sorted)
        useMusicStore.getState().setLastSyncCompleted(Date.now())
        completeSync(true, 'Library synced successfully')
      } catch (error) {
        // Don't show error if user cancelled
        if (useSyncStore.getState().state === 'syncing') {
          completeSync(false, error instanceof Error ? error.message : 'Failed to sync library')
        }
      }
    }, 500)

    return () => clearTimeout(timeout)
  }, [startSync, completeSync])

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
        // Re-check after timeout - hydration may have completed
        const currentState = useMusicStore.getState()
        const currentTotal = currentState.songs.length + Object.values(currentState.genreSongs).flat().length
        if (currentTotal > 0) {
          return // Songs hydrated, no need to preload
        }

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
        <div className={`w-full mx-auto lg:flex lg:justify-center ${location.pathname === '/' ? 'max-w-[768px] min-[1680px]:max-w-[1080px]' : 'max-w-[768px]'}`}>
          <div className={`w-full ${location.pathname === '/' ? 'max-w-[768px] min-[1680px]:max-w-[1080px]' : 'max-w-[768px]'}`}>
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

