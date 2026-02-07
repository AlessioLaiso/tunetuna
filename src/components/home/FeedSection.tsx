import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Disc, Ellipsis, Music } from 'lucide-react'
import { useMusicStore } from '../../stores/musicStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { usePlayerStore } from '../../stores/playerStore'
import { jellyfinClient } from '../../api/jellyfin'
import Image from '../shared/Image'
import PlatformPicker from '../shared/PlatformPicker'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import { useLibraryLookup } from '../../hooks/useLibraryLookup'
import {
  fetchAppleMusicTopSongs,
  getAppleMusicArtworkUrl,
  fetchMuspyReleases,
  getCoverArtUrl,
  searchMusicBrainzReleaseGroup,
  fetchOdesliLinks,
  createSearchLinksResponse,
  type AppleMusicSong,
  type NewRelease,
  type OdesliResponse
} from '../../api/feed'
import { FEED_COOLDOWN_MS } from '../../utils/constants'
import type { BaseItemDto, LightweightSong } from '../../api/types'

interface HomeListItemProps {
  title: string
  subtitle: string
  artworkUrl: string
  fallbackArtworkUrl?: string
  secondFallbackUrl?: string
  rank?: number
  isCurrentTrack?: boolean
  isInLibrary?: boolean
  isMenuOpen?: boolean
  subtitleIcon?: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
  onLongPress?: (e: React.TouchEvent | React.MouseEvent) => void
  onExternalClick?: (e: React.MouseEvent) => void
}

export function HomeListItem({
  title,
  subtitle,
  artworkUrl,
  fallbackArtworkUrl,
  secondFallbackUrl,
  rank,
  isCurrentTrack,
  isInLibrary,
  isMenuOpen,
  subtitleIcon,
  onClick,
  onContextMenu,
  onLongPress,
  onExternalClick
}: HomeListItemProps) {
  const [imageError, setImageError] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  const [useSecondFallback, setUseSecondFallback] = useState(false)

  // Reset state when primary URL changes
  useEffect(() => {
    setImageError(false)
    setUseFallback(false)
    setUseSecondFallback(false)
  }, [artworkUrl])

  // Determine which URL to use
  let currentUrl = artworkUrl
  if (useSecondFallback && secondFallbackUrl) {
    currentUrl = secondFallbackUrl
  } else if (useFallback && fallbackArtworkUrl) {
    currentUrl = fallbackArtworkUrl
  }

  const handleImageError = () => {
    if (!useFallback && fallbackArtworkUrl) {
      setUseFallback(true)
    } else if (!useSecondFallback && secondFallbackUrl) {
      setUseSecondFallback(true)
    } else {
      setImageError(true)
    }
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      onLongPress?.(e)
    },
    onClick: (e) => onClick(e as React.MouseEvent),
  })

  return (
    <button
      onClick={(e) => onClick(e)}
      onContextMenu={onContextMenu}
      {...longPressHandlers}
      className={`w-full flex items-center gap-3 hover:bg-white/10 transition-colors group py-2.5 ${isMenuOpen ? 'bg-white/10' : ''}`}
    >

      <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-900 self-center flex items-center justify-center">
        {imageError ? (
          <Disc className="w-6 h-6 text-gray-500" />
        ) : (
          <Image
            src={currentUrl}
            alt={title}
            className="w-full h-full object-cover"
            showOutline={true}
            rounded="rounded-sm"
            onError={handleImageError}
          />
        )}
      </div>
      <div className="flex-1 min-w-0 text-left flex gap-3 items-baseline">
        {rank !== undefined && <span className="text-zinc-500 text-sm flex-shrink-0">{rank}</span>}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate text-white group-hover:text-[var(--accent-color)] transition-colors">
            {title}
          </div>
          <div className="text-xs text-gray-400 truncate flex items-center gap-1.5">
            {subtitle}
            {subtitleIcon && <span className="flex-shrink-0">{subtitleIcon}</span>}
          </div>
        </div>
      </div>
      {!isInLibrary && onExternalClick && (
        <div
          onClick={(e) => {
            e.stopPropagation()
            onExternalClick(e)
          }}
          className="flex-shrink-0 p-2 text-gray-400 hover:text-white cursor-pointer"
        >
          <Ellipsis className="w-4 h-4" />
        </div>
      )}
    </button>
  )
}

function FeedSkeleton() {
  return (
    <div className="animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5">
          <div className="w-12 h-12 rounded-sm bg-zinc-800" />
          <div className="flex-1">
            <div className="h-4 bg-zinc-800 rounded w-3/4 mb-1.5" />
            <div className="h-3 bg-zinc-800 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}


// Top 10 Section Component
export function Top10Section() {
  const { playTrack } = usePlayerStore()
  const { feedTopSongs, feedLastUpdated, loading, setFeedTopSongs, setFeedLastUpdated, setLoading } = useMusicStore()
  const { feedCountry, showTop10 } = useSettingsStore()
  const { findSong } = useLibraryLookup()

  const [platformPickerOpen, setPlatformPickerOpen] = useState(false)
  const [platformPickerMode, setPlatformPickerMode] = useState<'mobile' | 'desktop'>('mobile')
  const [platformPickerPosition, setPlatformPickerPosition] = useState<{ x: number; y: number } | null>(null)
  const [selectedOdesliData, setSelectedOdesliData] = useState<OdesliResponse | null>(null)
  const [loadingOdesli, setLoadingOdesli] = useState(false)
  const [topSongsError, setTopSongsError] = useState(false)
  const [selectedSongTitle, setSelectedSongTitle] = useState<string | null>(null)
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null)

  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [contextMenuItemId, setContextMenuItemId] = useState<string | null>(null)

  const fetchTopSongs = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && feedLastUpdated && (now - feedLastUpdated) < FEED_COOLDOWN_MS) {
      return
    }

    setLoading('feed', true)
    setTopSongsError(false)

    try {
      const topSongs = await fetchAppleMusicTopSongs(feedCountry, 10)
      setFeedTopSongs(topSongs)
      setFeedLastUpdated(now)
    } catch (error) {
      console.error('Failed to fetch top songs:', error)
      setTopSongsError(true)
    } finally {
      setLoading('feed', false)
    }
  }, [feedCountry, feedLastUpdated, setFeedTopSongs, setFeedLastUpdated, setLoading])

  useEffect(() => {
    if (showTop10) {
      const now = Date.now()
      const isStale = !feedLastUpdated || (now - feedLastUpdated) >= FEED_COOLDOWN_MS
      if (isStale) {
        fetchTopSongs(true)
      }
    }
  }, [showTop10, feedCountry]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTopSongClick = async (song: AppleMusicSong, matchedSong: LightweightSong | null, e: React.MouseEvent) => {
    if (matchedSong) {
      const fullSong = await jellyfinClient.getSongById(matchedSong.Id)
      if (fullSong) {
        playTrack(fullSong)
      }
    } else {
      await handleExternalClick(song, e)
    }
  }

  const handleExternalClick = async (song: AppleMusicSong, e: React.MouseEvent) => {
    const isMobile = !window.matchMedia('(hover: hover) and (pointer: fine)').matches
    setPlatformPickerMode(isMobile ? 'mobile' : 'desktop')
    if (!isMobile) {
      setPlatformPickerPosition({ x: e.clientX, y: e.clientY })
    }
    setSelectedSongTitle(song.name)
    setSelectedSongId(song.id)
    setLoadingOdesli(true)
    setPlatformPickerOpen(true)

    try {
      const odesliData = await fetchOdesliLinks(song.url)
      if (odesliData && Object.keys(odesliData.linksByPlatform).length > 0) {
        setSelectedOdesliData(odesliData)
      } else {
        // Fallback to search links if Odesli returns no results
        const searchLinks = createSearchLinksResponse(song.artistName, song.name)
        setSelectedOdesliData(searchLinks)
      }
    } catch {
      // Fallback to search links on error
      const searchLinks = createSearchLinksResponse(song.artistName, song.name)
      setSelectedOdesliData(searchLinks)
    } finally {
      setLoadingOdesli(false)
    }
  }

  if (!showTop10) return null

  const hasTopSongs = feedTopSongs.length > 0
  const isLoading = loading.feed
  const showSkeleton = isLoading && !hasTopSongs && !topSongsError

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold mb-2">Top 10</h2>
      {showSkeleton ? (
        <FeedSkeleton />
      ) : hasTopSongs ? (
        <div className="space-y-0">
          {feedTopSongs.map((song, index) => {
            const matchedSong = findSong(song.name, song.artistName)
            const isInLibrary = matchedSong !== null
            return (
              <HomeListItem
                key={song.id}
                rank={index + 1}
                title={song.name}
                subtitle={song.artistName}
                artworkUrl={isInLibrary && matchedSong.AlbumId
                  ? jellyfinClient.getAlbumArtUrl(matchedSong.AlbumId, 96)
                  : getAppleMusicArtworkUrl(song.artworkUrl100, 96)
                }
                isInLibrary={isInLibrary}
                isMenuOpen={contextMenuItemId === song.id || (selectedSongId === song.id && platformPickerOpen)}
                onClick={(e) => handleTopSongClick(song, matchedSong, e)}
                onContextMenu={async (e) => {
                  e.preventDefault()
                  if (matchedSong) {
                    const fullSong = await jellyfinClient.getSongById(matchedSong.Id)
                    if (fullSong) {
                      setContextMenuItem(fullSong)
                      setContextMenuItemId(song.id)
                      setContextMenuMode('desktop')
                      setContextMenuPosition({ x: e.clientX, y: e.clientY })
                      setContextMenuOpen(true)
                    }
                  }
                }}
                onLongPress={async () => {
                  if (matchedSong) {
                    const fullSong = await jellyfinClient.getSongById(matchedSong.Id)
                    if (fullSong) {
                      setContextMenuItem(fullSong)
                      setContextMenuItemId(song.id)
                      setContextMenuMode('mobile')
                      setContextMenuPosition(null)
                      setContextMenuOpen(true)
                    }
                  }
                }}
                onExternalClick={(e) => handleExternalClick(song, e)}
              />
            )
          })}
        </div>
      ) : (
        <div className="py-8 text-left text-gray-500 text-sm">
          Could not load charts
        </div>
      )}
      <PlatformPicker
        isOpen={platformPickerOpen}
        onClose={() => { setPlatformPickerOpen(false); setSelectedOdesliData(null); setSelectedSongId(null) }}
        odesliData={selectedOdesliData}
        loading={loadingOdesli}
        title={selectedSongTitle || undefined}
        mode={platformPickerMode}
        position={platformPickerPosition || undefined}
      />
      <ContextMenu
        item={contextMenuItem}
        itemType="song"
        isOpen={contextMenuOpen}
        onClose={() => { setContextMenuOpen(false); setContextMenuItem(null); setContextMenuItemId(null) }}
        zIndex={99999}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </div>
  )
}

// New Releases Section Component
export function NewReleasesSection() {
  const navigate = useNavigate()
  const { playTrack } = usePlayerStore()
  const { feedNewReleases, feedLastUpdated, loading, setFeedNewReleases, setFeedLastUpdated, setLoading } = useMusicStore()
  const { showNewReleases, muspyRssUrl } = useSettingsStore()
  const { findAlbum, findSong, findArtistImageUrl } = useLibraryLookup()

  const [platformPickerOpen, setPlatformPickerOpen] = useState(false)
  const [platformPickerMode, setPlatformPickerMode] = useState<'mobile' | 'desktop'>('mobile')
  const [platformPickerPosition, setPlatformPickerPosition] = useState<{ x: number; y: number } | null>(null)
  const [selectedOdesliData, setSelectedOdesliData] = useState<OdesliResponse | null>(null)
  const [loadingOdesli, setLoadingOdesli] = useState(false)
  const [newReleasesError, setNewReleasesError] = useState(false)
  const [selectedReleaseTitle, setSelectedReleaseTitle] = useState<string | null>(null)
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null)

  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [contextMenuItemId, setContextMenuItemId] = useState<string | null>(null)

  const fetchReleases = useCallback(async (force = false) => {
    if (!muspyRssUrl) return

    const now = Date.now()
    if (!force && feedLastUpdated && (now - feedLastUpdated) < FEED_COOLDOWN_MS) {
      return
    }

    setLoading('feed', true)
    setNewReleasesError(false)

    try {
      const releases = await fetchMuspyReleases(muspyRssUrl, 10)
      setFeedNewReleases(releases)
      setFeedLastUpdated(now)
    } catch (error) {
      console.error('Failed to fetch Muspy releases:', error)
      setNewReleasesError(true)
    } finally {
      setLoading('feed', false)
    }
  }, [muspyRssUrl, feedLastUpdated, setFeedNewReleases, setFeedLastUpdated, setLoading])

  useEffect(() => {
    if (showNewReleases && muspyRssUrl) {
      const now = Date.now()
      const isStale = !feedLastUpdated || (now - feedLastUpdated) >= FEED_COOLDOWN_MS
      if (isStale) {
        fetchReleases(true)
      }
    }
  }, [showNewReleases, muspyRssUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Background process to resolve missing MBIDs for new releases
  const attemptedSearchesRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const resolveMissingIds = async () => {
      // Find releases with temp IDs that haven't been searched yet
      const missing = feedNewReleases.filter(r =>
        r.id.startsWith('muspy-') && !attemptedSearchesRef.current.has(r.id)
      )

      if (missing.length === 0) return

      // Process sequentially to respect rate limits
      for (const release of missing) {
        // Mark as attempted immediately to prevent duplicate searches
        attemptedSearchesRef.current.add(release.id)

        try {
          console.log(`[FeedSection] Searching MB for: ${release.title} - ${release.artistName}`)
          const result = await searchMusicBrainzReleaseGroup(release.artistName, release.title)

          if (result) {
            console.log(`[FeedSection] Found MBID for "${release.title}": ${result.id} (${result.type})`)
            const current = useMusicStore.getState().feedNewReleases
            const updated = current.map(p =>
              p.id === release.id ? { ...p, id: result.id, type: result.type } : p
            )
            setFeedNewReleases(updated)
          } else {
            console.log(`[FeedSection] No MBID found for "${release.title}"`)
          }
        } catch (error) {
          console.error(`[FeedSection] Failed to search MB for "${release.title}":`, error)
        }
      }
    }

    if (feedNewReleases.length > 0) {
      resolveMissingIds()
    }
  }, [feedNewReleases, setFeedNewReleases])

  const handleReleaseClick = async (
    release: NewRelease,
    match: { type: 'album'; albumId: string } | { type: 'song'; song: LightweightSong } | null,
    e: React.MouseEvent
  ) => {
    if (match) {
      if (match.type === 'song') {
        const fullSong = await jellyfinClient.getSongById(match.song.Id)
        if (fullSong) {
          playTrack(fullSong)
        }
      } else {
        navigate(`/album/${match.albumId}`)
      }
    } else {
      await handleExternalClick(release, e)
    }
  }

  const handleExternalClick = async (release: NewRelease, e: React.MouseEvent) => {
    const isMobile = !window.matchMedia('(hover: hover) and (pointer: fine)').matches
    setPlatformPickerMode(isMobile ? 'mobile' : 'desktop')
    if (!isMobile) {
      setPlatformPickerPosition({ x: e.clientX, y: e.clientY })
    }
    setSelectedReleaseTitle(release.title)
    setSelectedReleaseId(release.id)
    setLoadingOdesli(true)
    setPlatformPickerOpen(true)

    const hasValidMbUrl = release.mbUrl && !release.id.startsWith('muspy-')

    try {
      let odesliData: OdesliResponse | null = null
      if (hasValidMbUrl) {
        odesliData = await fetchOdesliLinks(release.mbUrl!)
      }

      if (odesliData && Object.keys(odesliData.linksByPlatform).length > 0) {
        setSelectedOdesliData(odesliData)
      } else {
        const searchLinks = createSearchLinksResponse(release.artistName, release.title)
        setSelectedOdesliData(searchLinks)
      }
    } catch {
      const searchLinks = createSearchLinksResponse(release.artistName, release.title)
      setSelectedOdesliData(searchLinks)
    } finally {
      setLoadingOdesli(false)
    }
  }

  if (!showNewReleases || !muspyRssUrl) return null

  const hasNewReleases = feedNewReleases.length > 0
  const isLoading = loading.feed
  const hasMuspyConfigured = !!muspyRssUrl
  const showSkeleton = isLoading && !hasNewReleases && !newReleasesError && hasMuspyConfigured

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold mb-2">New Releases</h2>
      {showSkeleton ? (
        <FeedSkeleton />
      ) : hasNewReleases ? (
        <div className="space-y-0">
          {feedNewReleases.map((release) => {
            // For singles, try song match; otherwise match album
            const isSingle = release.type === 'Single'
            const matchedSong = isSingle ? findSong(release.title, release.artistName) : null
            const matchedAlbum = !matchedSong ? findAlbum(release.title, release.artistName) : null
            const match = matchedSong
              ? { type: 'song' as const, song: matchedSong }
              : matchedAlbum
                ? { type: 'album' as const, albumId: matchedAlbum.albumId }
                : null
            const isInLibrary = match !== null
            const hasValidMbid = !release.id.startsWith('muspy-')
            const coverArtUrl = hasValidMbid ? getCoverArtUrl(release.id, 250) : null
            const artistId = findArtistImageUrl(release.artistName)
            const artistFallbackUrl = artistId ? jellyfinClient.getArtistImageUrl(artistId, 96) : null

            let primaryUrl: string
            let firstFallback: string | undefined
            let secondFallback: string | undefined

            if (match?.type === 'song' && matchedSong?.AlbumId) {
              primaryUrl = jellyfinClient.getAlbumArtUrl(matchedSong.AlbumId, 96)
              firstFallback = coverArtUrl || undefined
              secondFallback = artistFallbackUrl || undefined
            } else if (match?.type === 'album' && matchedAlbum?.albumId) {
              primaryUrl = jellyfinClient.getAlbumArtUrl(matchedAlbum.albumId, 96)
              firstFallback = coverArtUrl || undefined
              secondFallback = artistFallbackUrl || undefined
            } else if (coverArtUrl) {
              primaryUrl = coverArtUrl
              firstFallback = artistFallbackUrl || undefined
            } else {
              primaryUrl = artistFallbackUrl || ''
            }

            const date = new Date(release.releaseDate)
            const isValidDate = !isNaN(date.getTime())
            const formattedDate = isValidDate
              ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : ''

            const subtitle = formattedDate
              ? `${release.artistName} • ${formattedDate}`
              : release.artistName

            const subtitleIcon = isSingle
              ? <Music className="w-3 h-3" />
              : <Disc className="w-3 h-3" />

            return (
              <HomeListItem
                key={release.id}
                title={release.title}
                subtitle={subtitle}
                subtitleIcon={subtitleIcon}
                artworkUrl={primaryUrl}
                fallbackArtworkUrl={firstFallback}
                secondFallbackUrl={secondFallback}
                isInLibrary={isInLibrary}
                isMenuOpen={contextMenuItemId === release.id || (selectedReleaseId === release.id && platformPickerOpen)}
                onClick={(e) => handleReleaseClick(release, match, e)}
                onContextMenu={async (e) => {
                  e.preventDefault()
                  if (match?.type === 'song' && matchedSong) {
                    const fullSong = await jellyfinClient.getSongById(matchedSong.Id)
                    if (fullSong) {
                      setContextMenuItem(fullSong)
                      setContextMenuItemId(release.id)
                      setContextMenuMode('desktop')
                      setContextMenuPosition({ x: e.clientX, y: e.clientY })
                      setContextMenuOpen(true)
                    }
                  } else if (match?.type === 'album' && matchedAlbum) {
                    const fullAlbum = await jellyfinClient.getAlbumById(matchedAlbum.albumId)
                    if (fullAlbum) {
                      setContextMenuItem(fullAlbum)
                      setContextMenuItemId(release.id)
                      setContextMenuMode('desktop')
                      setContextMenuPosition({ x: e.clientX, y: e.clientY })
                      setContextMenuOpen(true)
                    }
                  }
                }}
                onLongPress={async () => {
                  if (match?.type === 'song' && matchedSong) {
                    const fullSong = await jellyfinClient.getSongById(matchedSong.Id)
                    if (fullSong) {
                      setContextMenuItem(fullSong)
                      setContextMenuItemId(release.id)
                      setContextMenuMode('mobile')
                      setContextMenuPosition(null)
                      setContextMenuOpen(true)
                    }
                  } else if (match?.type === 'album' && matchedAlbum) {
                    const fullAlbum = await jellyfinClient.getAlbumById(matchedAlbum.albumId)
                    if (fullAlbum) {
                      setContextMenuItem(fullAlbum)
                      setContextMenuItemId(release.id)
                      setContextMenuMode('mobile')
                      setContextMenuPosition(null)
                      setContextMenuOpen(true)
                    }
                  }
                }}
                onExternalClick={(e) => handleExternalClick(release, e)}
              />
            )
          })}
        </div>
      ) : !hasMuspyConfigured ? (
        <div className="py-8 text-center text-gray-500 text-sm">
          Configure Muspy RSS in settings
        </div>
      ) : (
        <div className="py-8 text-left text-gray-500 text-sm">
          {newReleasesError ? 'Failed to load releases' : 'No new releases found'}
        </div>
      )}
      <PlatformPicker
        isOpen={platformPickerOpen}
        onClose={() => { setPlatformPickerOpen(false); setSelectedOdesliData(null); setSelectedReleaseId(null) }}
        odesliData={selectedOdesliData}
        loading={loadingOdesli}
        title={selectedReleaseTitle || undefined}
        mode={platformPickerMode}
        position={platformPickerPosition || undefined}
      />
      <ContextMenu
        item={contextMenuItem}
        itemType={contextMenuItem?.Type === 'Audio' ? 'song' : 'album'}
        isOpen={contextMenuOpen}
        onClose={() => { setContextMenuOpen(false); setContextMenuItem(null); setContextMenuItemId(null) }}
        zIndex={99999}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </div>
  )
}

// Recently Played Section Component
export function RecentlyPlayedSection({ twoColumns = false }: { twoColumns?: boolean }) {
  const { recentlyPlayed, setRecentlyPlayed, setLoading } = useMusicStore()
  const { showRecentlyPlayed } = useSettingsStore()
  const { playTrack } = usePlayerStore()
  const currentTrack = useCurrentTrack()

  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)

  useEffect(() => {
    const loadRecentlyPlayed = async () => {
      setLoading('recentlyPlayed', true)
      try {
        const result = await jellyfinClient.getRecentlyPlayed(10)
        setRecentlyPlayed(result.Items || [])
      } catch (error) {
        console.error(error)
      } finally {
        setLoading('recentlyPlayed', false)
      }
    }

    if (showRecentlyPlayed) {
      loadRecentlyPlayed()
    }
  }, [showRecentlyPlayed, setRecentlyPlayed, setLoading])

  const handleSongClick = (song: BaseItemDto) => {
    playTrack(song, recentlyPlayed)
  }

  if (!showRecentlyPlayed || !recentlyPlayed || recentlyPlayed.length === 0) {
    return null
  }

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold mb-2">Recently Played</h2>
      <div className={twoColumns ? 'md:grid md:grid-cols-2 md:gap-3 min-[1680px]:block' : ''}>
        {recentlyPlayed.map((song) => (
          <HomeListItem
            key={song.Id}
            title={song.Name || 'Unknown'}
            subtitle={`${song.AlbumArtist || song.ArtistItems?.[0]?.Name || 'Unknown Artist'}${song.Album ? ` • ${song.Album}` : ''}`}
            artworkUrl={jellyfinClient.getAlbumArtUrl(song.AlbumId || song.Id, 96)}
            isCurrentTrack={currentTrack?.Id === song.Id}
            isInLibrary={true}
            isMenuOpen={contextMenuItem?.Id === song.Id}
            onClick={() => handleSongClick(song)}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenuItem(song)
              setContextMenuMode('desktop')
              setContextMenuPosition({ x: e.clientX, y: e.clientY })
              setContextMenuOpen(true)
            }}
            onLongPress={() => {
              setContextMenuItem(song)
              setContextMenuMode('mobile')
              setContextMenuPosition(null)
              setContextMenuOpen(true)
            }}
          />
        ))}
      </div>
      <ContextMenu
        item={contextMenuItem}
        itemType="song"
        isOpen={contextMenuOpen}
        onClose={() => { setContextMenuOpen(false); setContextMenuItem(null) }}
        zIndex={99999}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </div>
  )
}
