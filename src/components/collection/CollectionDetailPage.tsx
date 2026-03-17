import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Pause, MoreHorizontal, Shuffle, ListStart, ListEnd, ListPlus, BarChart3, ExternalLink } from 'lucide-react'
import { useCollectionStore } from '../../stores/collectionStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import { useStatsStore } from '../../stores/statsStore'
import { useToastStore } from '../../stores/toastStore'
import { useLibraryLookup } from '../../hooks/useLibraryLookup'
import { useContextMenu } from '../../hooks/useContextMenu'
import { useLargeViewport } from '../../hooks/useLargeViewport'
import { cleanDiscogsArtistName } from '../../api/discogs'
import { jellyfinClient } from '../../api/jellyfin'
import type { DiscogsReleaseDetail, DiscogsTrack } from '../../api/discogs'
import type { LightweightSong, BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import ResponsiveModal from '../shared/ResponsiveModal'
import PlaylistPicker from '../playlists/PlaylistPicker'
import Spinner from '../shared/Spinner'
import Image from '../shared/Image'
import vinylImage from '../../assets/vinyl.png'

interface MatchedTrack {
  discogsTrack: DiscogsTrack
  libraryMatch: LightweightSong | null
}

function getTrackNumber(track: MatchedTrack, index: number): string {
  const rawPos = track.discogsTrack.position || ''
  const discPrefixMatch = rawPos.match(/^\d+-(\d+)$/)
  return discPrefixMatch ? String(parseInt(discPrefixMatch[1], 10)) : rawPos || String(index + 1)
}

function CollectionTrackItem({
  track,
  index,
  artistName,
  libraryMatches,
  onContextMenu,
  contextMenuItemId,
  trackNumberWidth,
}: {
  track: MatchedTrack
  index: number
  artistName: string
  libraryMatches: LightweightSong[]
  onContextMenu: (item: LightweightSong, mode: 'mobile' | 'desktop', position?: { x: number; y: number }) => void
  contextMenuItemId: string | null
  trackNumberWidth: string
}) {
  const { playTrack } = usePlayerStore()
  const currentTrack = useCurrentTrack()
  const isMatched = !!track.libraryMatch
  const isPlaying = currentTrack?.Id === track.libraryMatch?.Id

  const { handleContextMenu, longPressHandlers, shouldSuppressClick } = useContextMenu({
    item: track.libraryMatch as LightweightSong,
    onContextMenu: isMatched ? onContextMenu : undefined,
  })

  const handleClick = () => {
    if (shouldSuppressClick()) return
    if (isMatched && track.libraryMatch) {
      playTrack(track.libraryMatch, libraryMatches)
    }
  }

  const trackNumber = getTrackNumber(track, index)

  return (
    <button
      onClick={handleClick}
      onContextMenu={isMatched ? handleContextMenu : undefined}
      {...(isMatched ? longPressHandlers : {})}
      disabled={!isMatched}
      className={`w-full flex items-baseline py-3 pl-4 transition-colors ${
        isMatched
          ? `hover:bg-white/10 group ${contextMenuItemId === track.libraryMatch?.Id ? 'bg-white/10' : ''}`
          : 'opacity-60 cursor-default'
      }`}
    >
      <span className={`text-sm text-left flex-shrink-0 mr-4 ${
        isPlaying ? 'text-[var(--accent-color)]' : isMatched ? 'text-gray-500' : 'text-gray-700'
      }`} style={{ width: trackNumberWidth }}>
        {trackNumber}
      </span>
      <div className="flex-1 min-w-0 text-left">
        <div className={`text-sm font-medium truncate transition-colors ${
          isPlaying
            ? 'text-[var(--accent-color)]'
            : isMatched
              ? 'text-white group-hover:text-[var(--accent-color)]'
              : 'text-gray-600'
        }`}>
          {track.discogsTrack.title}
        </div>
        {/* Show the Jellyfin artist if it differs from album artist (more than just capitalization) */}
        {isMatched && track.libraryMatch?.ArtistItems?.[0]?.Name &&
          track.libraryMatch.ArtistItems[0].Name.toLowerCase() !== artistName.toLowerCase() && (
          <div className="text-xs text-gray-400 truncate">
            {track.libraryMatch.ArtistItems[0].Name}
          </div>
        )}
      </div>
      {track.discogsTrack.duration && (
        <div className={`text-xs flex-shrink-0 text-right mr-4 ${
          isMatched ? 'text-gray-500' : 'text-gray-700'
        }`}>
          {track.discogsTrack.duration}
        </div>
      )}
    </button>
  )
}

export default function CollectionDetailPage() {
  const { releaseId } = useParams<{ releaseId: string }>()
  const navigate = useNavigate()
  const { releases, fetchReleaseDetail } = useCollectionStore()
  const { playAlbum, isPlaying, play, pause, addToQueueWithToast, playNext, toggleShuffle } = usePlayerStore()
  const currentTrack = useCurrentTrack()
  const { logStream } = useStatsStore()
  const { addToast } = useToastStore()
  const { findSongWithAlbumHint, findLibraryArtistName } = useLibraryLookup()
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)
  const isLargeViewport = useLargeViewport()

  const [detail, setDetail] = useState<DiscogsReleaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [discImageUrl, setDiscImageUrl] = useState<string | null>(null)
  const [artistLogoUrl, setArtistLogoUrl] = useState<string | null>(null)
  const [hasArtistLogo, setHasArtistLogo] = useState(false)
  const [hasImage, setHasImage] = useState(true)

  // Context menu state (track-level)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<LightweightSong | null>(null)

  // Collection-level overflow menu state
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false)
  const [collectionMenuMode, setCollectionMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [collectionMenuPosition, setCollectionMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [collectionMenuLoading, setCollectionMenuLoading] = useState<string | null>(null)

  // Playlist picker state
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false)
  const [playlistPickerItemIds, setPlaylistPickerItemIds] = useState<string[]>([])

  // Disc rotation animation (matching AlbumDetailPage pattern)
  const [showVinyl, setShowVinyl] = useState(false)
  const [hideAlbumArt, setHideAlbumArt] = useState(false)
  const [rotationAngle, setRotationAngle] = useState(0)
  const rotationRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)
  const lastTimeRef = useRef(0)
  const reverseAnimationStartedRef = useRef(false)
  const shouldSplitRef = useRef(false)
  const hasInitializedRef = useRef(false)
  const previousPlayingRef = useRef(false)

  const numericReleaseId = releaseId ? parseInt(releaseId, 10) : null

  const release = useMemo(
    () => releases.find((r) => r.basic_information.id === numericReleaseId),
    [releases, numericReleaseId]
  )

  // Fetch release detail
  useEffect(() => {
    if (!numericReleaseId) return
    setLoading(true)
    setLoadError(false)
    fetchReleaseDetail(numericReleaseId).then((d) => {
      if (d) {
        setDetail(d)
      } else {
        setLoadError(true)
      }
      setLoading(false)
    })
  }, [numericReleaseId, fetchReleaseDetail])

  // Match tracks against Jellyfin library
  const artistName = useMemo(() => {
    if (detail) return cleanDiscogsArtistName(detail.artists[0]?.name || '')
    if (release) return cleanDiscogsArtistName(release.basic_information.artists[0]?.name || '')
    return ''
  }, [detail, release])

  // If Jellyfin artist name differs from Discogs only in capitalization, use Jellyfin's.
  // Otherwise, use Discogs as-is.
  const libraryArtistName = useMemo(() => findLibraryArtistName(artistName), [artistName, findLibraryArtistName])
  const artistNamesMatchCaseInsensitive = useMemo(
    () => !!libraryArtistName && libraryArtistName.toLowerCase() === artistName.toLowerCase(),
    [libraryArtistName, artistName]
  )
  const displayArtistName = artistNamesMatchCaseInsensitive ? libraryArtistName! : artistName

  const matchedTracks: MatchedTrack[] = useMemo(() => {
    if (!detail) return []
    const tracks = detail.tracklist.filter((t) => t.type_ === 'track')
    const results: MatchedTrack[] = tracks.map((t) => ({ discogsTrack: t, libraryMatch: null }))
    const usedIds = new Set<string>()

    // Pass 1: exact title matches only (prevents fuzzy matches from stealing exact ones)
    for (let i = 0; i < tracks.length; i++) {
      const match = findSongWithAlbumHint(tracks[i].title, artistName, detail.title, usedIds, true)
      if (match) {
        usedIds.add(match.Id)
        results[i].libraryMatch = match
      }
    }

    // Pass 2: fuzzy matches for remaining unmatched tracks
    for (let i = 0; i < tracks.length; i++) {
      if (results[i].libraryMatch) continue
      const match = findSongWithAlbumHint(tracks[i].title, artistName, detail.title, usedIds)
      if (match) {
        usedIds.add(match.Id)
        results[i].libraryMatch = match
      }
    }

    return results
  }, [detail, findSongWithAlbumHint, artistName])

  // Parse disc number from position (e.g. "1-03" → disc 1, "2-09" → disc 2)
  // Also detect explicit heading entries and vinyl side labels (A1, B2)
  const tracksByDisc = useMemo(() => {
    if (matchedTracks.length === 0) return new Map<string, MatchedTrack[]>()

    const discs = new Map<string, MatchedTrack[]>()

    // First check if positions contain disc prefixes like "1-03", "2-01"
    const hasDiscPrefix = matchedTracks.some((t) => /^\d+-\d+$/.test(t.discogsTrack.position))
    // Check for vinyl side labels (A1, B1, C1, etc.)
    const hasSideLabels = matchedTracks.some((t) => /^[A-Z]\d+$/i.test(t.discogsTrack.position))

    if (hasDiscPrefix) {
      for (const track of matchedTracks) {
        const match = track.discogsTrack.position.match(/^(\d+)-/)
        const disc = match ? `Disc ${match[1]}` : 'Disc 1'
        if (!discs.has(disc)) discs.set(disc, [])
        discs.get(disc)!.push(track)
      }
    } else if (hasSideLabels) {
      for (const track of matchedTracks) {
        const sideMatch = track.discogsTrack.position.match(/^([A-Z])/i)
        const side = sideMatch ? `Side ${sideMatch[1].toUpperCase()}` : ''
        if (!discs.has(side)) discs.set(side, [])
        discs.get(side)!.push(track)
      }
    } else {
      // Check for explicit heading entries in the original tracklist
      if (detail) {
        let currentHeading = ''
        let trackIdx = 0
        for (const t of detail.tracklist) {
          if (t.type_ === 'heading') {
            currentHeading = t.title
          } else if (t.type_ === 'track') {
            if (trackIdx < matchedTracks.length) {
              const label = currentHeading || ''
              if (!discs.has(label)) discs.set(label, [])
              discs.get(label)!.push(matchedTracks[trackIdx])
            }
            trackIdx++
          }
        }
      }
      // If no grouping was detected, put all in one group
      if (discs.size === 0) {
        discs.set('', matchedTracks)
      }
    }

    return discs
  }, [matchedTracks, detail])

  const hasMultipleDiscs = tracksByDisc.size > 1 || (tracksByDisc.size === 1 && !tracksByDisc.has(''))

  // Build format string from Discogs data (e.g. "CD, Album, Stereo, Édition Française, O-card")
  const formatString = useMemo(() => {
    const formats = detail?.formats || release?.basic_information.formats
    if (!formats || formats.length === 0) return ''
    const parts: string[] = []
    for (const fmt of formats) {
      parts.push(fmt.name)
      if (fmt.descriptions) {
        parts.push(...fmt.descriptions)
      }
      if (fmt.text) {
        parts.push(...fmt.text.split(',').map(s => s.trim()).filter(Boolean))
      }
    }
    return parts.join(', ')
  }, [detail, release])

  // Detect cassette format — skip vinyl/medium animation for cassettes
  const isCassette = useMemo(() => {
    const formats = detail?.formats || release?.basic_information.formats
    if (!formats) return false
    return formats.some(fmt => /cassette/i.test(fmt.name))
  }, [detail, release])

  const libraryMatches = useMemo(
    () => matchedTracks.filter((t) => t.libraryMatch).map((t) => t.libraryMatch!),
    [matchedTracks]
  )

  // Load disc image and artist logo from Jellyfin when we have matched tracks
  useEffect(() => {
    let isMounted = true
    const albumId = libraryMatches[0]?.AlbumId

    // Check if album has a Disc image tag before setting URL
    if (albumId) {
      jellyfinClient.getAlbumById(albumId).then(album => {
        if (!isMounted) return
        if (album?.ImageTags?.Disc) {
          setDiscImageUrl(jellyfinClient.getImageUrl(albumId, 'Disc', 600))
        } else {
          setDiscImageUrl(null)
        }
      }).catch(() => {
        if (!isMounted) return
        setDiscImageUrl(null)
      })
    } else {
      setDiscImageUrl(null)
    }

    // Load artist logo (skip for Various Artists)
    const artistId = libraryMatches[0]?.ArtistItems?.[0]?.Id
    const isVariousArtists = (libraryMatches[0]?.AlbumArtist || '').toLowerCase() === 'various artists'
    if (artistId && !isVariousArtists) {
      jellyfinClient.getArtistById(artistId).then(artist => {
        if (!isMounted) return
        if (artist?.ImageTags?.Logo) {
          setArtistLogoUrl(jellyfinClient.getImageUrl(artistId, 'Logo'))
          setHasArtistLogo(true)
        } else {
          setHasArtistLogo(false)
          setArtistLogoUrl(null)
        }
      }).catch(() => {
        if (!isMounted) return
        setHasArtistLogo(false)
        setArtistLogoUrl(null)
      })
    } else {
      setHasArtistLogo(false)
      setArtistLogoUrl(null)
    }

    return () => { isMounted = false }
  }, [libraryMatches])

  // Check if we're currently playing from this collection release
  const isPlayingFromCollection = useMemo(
    () => libraryMatches.some((m) => m.Id === currentTrack?.Id) && isPlaying,
    [libraryMatches, currentTrack, isPlaying]
  )



  // Vinyl visibility animation (matching AlbumDetailPage) — disabled for cassettes
  useEffect(() => {
    if (isCassette) {
      setShowVinyl(false)
      setHideAlbumArt(false)
      hasInitializedRef.current = true
      return
    }

    const playbackStateChanged = previousPlayingRef.current !== isPlayingFromCollection
    if (playbackStateChanged) {
      reverseAnimationStartedRef.current = false
    }
    previousPlayingRef.current = isPlayingFromCollection

    if (!hasImage) {
      setShowVinyl(false)
      setHideAlbumArt(false)
      return
    }

    if (isPlayingFromCollection) {
      if (!hasInitializedRef.current || !showVinyl) {
        setShowVinyl(true)
        setHideAlbumArt(false)
        hasInitializedRef.current = true
      }

      shouldSplitRef.current = window.innerWidth >= 560

      if (!reverseAnimationStartedRef.current) {
        reverseAnimationStartedRef.current = true
        setTimeout(() => {
          if (isPlayingFromCollection) {
            setHideAlbumArt(true)
          }
        }, 500)
      }
    } else if (hasInitializedRef.current && showVinyl) {
      if (!reverseAnimationStartedRef.current) {
        reverseAnimationStartedRef.current = true
        setHideAlbumArt(false)
      }
    } else if (!hasInitializedRef.current) {
      setShowVinyl(false)
      setHideAlbumArt(false)
      hasInitializedRef.current = true
    }
  }, [isPlayingFromCollection, showVinyl, hasImage, isCassette])

  // Resize handler for split animation
  useEffect(() => {
    const handleResize = () => {
      if (isPlayingFromCollection && showVinyl) {
        const newShouldSplit = window.innerWidth >= 560
        shouldSplitRef.current = newShouldSplit
        if (hideAlbumArt) {
          setHideAlbumArt(false)
          setTimeout(() => setHideAlbumArt(true), 10)
        }
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isPlayingFromCollection, showVinyl, hideAlbumArt])

  // Rotation animation
  useEffect(() => {
    if (isPlayingFromCollection) {
      const animate = (currentTime: number) => {
        if (lastTimeRef.current === 0) lastTimeRef.current = currentTime
        const deltaTime = currentTime - lastTimeRef.current
        const rotationSpeed = 360 / 10000
        rotationRef.current = (rotationRef.current + rotationSpeed * deltaTime) % 360
        setRotationAngle(rotationRef.current)
        lastTimeRef.current = currentTime
        animationFrameRef.current = requestAnimationFrame(animate)
      }
      lastTimeRef.current = 0
      animationFrameRef.current = requestAnimationFrame(animate)
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      lastTimeRef.current = 0
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [isPlayingFromCollection])

  const handlePlayAll = () => {
    if (libraryMatches.length === 0) return
    playAlbum(libraryMatches)
  }

  const handleCollectionMenuAction = useCallback(async (action: string) => {
    if (libraryMatches.length === 0) return
    setCollectionMenuLoading(action)
    try {
      if (action === 'play') {
        const { shuffle } = usePlayerStore.getState()
        if (shuffle) toggleShuffle()
        playAlbum(libraryMatches)
      } else if (action === 'shuffle') {
        const { shuffle } = usePlayerStore.getState()
        if (shuffle) toggleShuffle()
        playAlbum(libraryMatches)
        requestAnimationFrame(() => {
          const { shuffle: cur } = usePlayerStore.getState()
          if (!cur) toggleShuffle()
        })
      } else if (action === 'playNext') {
        playNext(libraryMatches)
      } else if (action === 'addToQueue') {
        addToQueueWithToast(libraryMatches)
      } else if (action === 'addToPlaylist') {
        setPlaylistPickerItemIds(libraryMatches.map(m => m.Id))
        setCollectionMenuOpen(false)
        setPlaylistPickerOpen(true)
        return
      } else if (action === 'openInDiscogs') {
        window.open(`https://www.discogs.com/release/${numericReleaseId}`, '_blank', 'noopener,noreferrer')
        setCollectionMenuOpen(false)
        return
      } else if (action === 'logStream') {
        logStream(libraryMatches as unknown as BaseItemDto[])
        addToast(`Logged ${libraryMatches.length} track${libraryMatches.length !== 1 ? 's' : ''}`, 'success', 2000)
      } else if (action.startsWith('logStreamDisc:')) {
        const discLabel = action.substring('logStreamDisc:'.length)
        const discTracks = tracksByDisc.get(discLabel)
        if (discTracks) {
          const discMatches = discTracks.filter(t => t.libraryMatch).map(t => t.libraryMatch!)
          if (discMatches.length > 0) {
            logStream(discMatches as unknown as BaseItemDto[])
            addToast(`Logged ${discMatches.length} track${discMatches.length !== 1 ? 's' : ''}`, 'success', 2000)
          }
        }
      }
      setCollectionMenuOpen(false)
    } finally {
      setCollectionMenuLoading(null)
    }
  }, [libraryMatches, tracksByDisc, playAlbum, playNext, addToQueueWithToast, toggleShuffle, logStream, addToast])

  const collectionMenuActions = useMemo(() => {
    const actions = [
      { id: 'play', label: 'Play', icon: Play },
      { id: 'shuffle', label: 'Shuffle', icon: Shuffle },
      { id: 'playNext', label: 'Play Next', icon: ListStart },
      { id: 'addToQueue', label: 'Add to Queue', icon: ListEnd },
      { id: 'addToPlaylist', label: 'Add to Playlist', icon: ListPlus },
      { id: 'logStream', label: 'Log Songs in Library to Stats', icon: BarChart3 },
    ] as { id: string; label: string; icon: typeof Play }[]
    if (hasMultipleDiscs) {
      for (const [discLabel] of tracksByDisc) {
        if (discLabel) {
          actions.push({ id: `logStreamDisc:${discLabel}`, label: `Log ${discLabel} to Stats`, icon: BarChart3 })
        }
      }
    }
    actions.push({ id: 'openInDiscogs', label: 'Open in Discogs', icon: ExternalLink })
    return actions
  }, [hasMultipleDiscs, tracksByDisc])

  const handleTrackContextMenu = useCallback(
    (item: LightweightSong, mode: 'mobile' | 'desktop', position?: { x: number; y: number }) => {
      setContextMenuItem(item)
      setContextMenuMode(mode)
      setContextMenuPosition(position || null)
      setContextMenuOpen(true)
    },
    []
  )

  const coverImage = detail?.images?.find((img) => img.type === 'primary')?.uri
    || release?.basic_information.cover_image
    || ''

  if (loading) {
    return (
      <div className="pb-20">
        <div className="flex items-center justify-center h-screen">
          <Spinner />
        </div>
      </div>
    )
  }

  if (!detail || loadError) {
    return (
      <div className="pb-20">
        <div className="flex flex-col items-center justify-center h-screen text-gray-400 px-6 text-center">
          <p className="text-red-400 mb-4">{loadError ? 'Failed to load release details' : 'Release not found'}</p>
          <button
            onClick={() => navigate('/collection')}
            className="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
          >
            Back to Collection
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20" style={{ overflowX: 'hidden', maxWidth: '100vw', width: '100%' }}>
      {/* Status bar transparent overlay */}
      <div
        className="fixed top-0 left-0 right-0 z-[55] pointer-events-none"
        style={{ height: 'env(safe-area-inset-top)', top: 'var(--header-offset, 0px)', background: 'transparent' }}
      />
      {/* Gradient overlay */}
      <div
        className="fixed top-0 left-0 right-0 z-10 pointer-events-none"
        style={{
          height: 'calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 4rem)',
          top: 'var(--header-offset, 0px)',
          background: `linear-gradient(to bottom,
            #000000 0%,
            #000000 calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 0.5rem),
            rgba(0, 0, 0, 0.95) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 1rem),
            rgba(0, 0, 0, 0.85) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 1.5rem),
            rgba(0, 0, 0, 0.7) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 2rem),
            rgba(0, 0, 0, 0.5) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 2.5rem),
            rgba(0, 0, 0, 0.3) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 3rem),
            rgba(0, 0, 0, 0.15) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 3.5rem),
            rgba(0, 0, 0, 0) calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 4rem)
          )`
        }}
      />
      {/* Header with back button */}
      <div
        className={`fixed top-0 left-0 right-0 z-20 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{ top: 'calc(var(--header-offset, 0px) + env(safe-area-inset-top))' }}
      >
        <div className="max-w-[768px] mx-auto relative">
          <div className="flex items-center justify-between gap-4 py-4 pl-3 pr-4 relative z-10">
            <button
              onClick={() => navigate('/collection')}
              className="text-white hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            {libraryMatches.length > 0 && (
              <button
                onClick={(e) => {
                  if (window.innerWidth < 768) {
                    setCollectionMenuMode('mobile')
                    setCollectionMenuPosition(null)
                  } else {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setCollectionMenuMode('desktop')
                    setCollectionMenuPosition({
                      x: rect.left + rect.width / 2,
                      y: rect.bottom + 5
                    })
                  }
                  setCollectionMenuOpen(true)
                }}
                className="text-white hover:text-zinc-300 transition-colors"
              >
                <MoreHorizontal className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="pt-11">
        {/* Album art + disc animation */}
        <div className="mb-6 px-4 pt-4" style={{ overflow: 'visible' }}>
          {hasImage && (
            <div className="flex justify-center mb-6 relative" style={{ overflowX: 'visible', overflowY: 'visible', paddingLeft: '16px', paddingRight: '16px' }}>
              <div
                className="relative"
                style={{
                  overflow: 'visible',
                  width: isLargeViewport ? '360px' : '256px',
                  height: isLargeViewport ? '360px' : '256px',
                }}
              >
                {/* Vinyl Record */}
                <div
                  className="absolute inset-0 rounded-full overflow-hidden"
                  style={{
                    opacity: showVinyl ? 1 : 0,
                    zIndex: 1,
                    transform: (isPlayingFromCollection && shouldSplitRef.current)
                      ? 'translateX(calc(50% + 8px))'
                      : 'translateX(0)',
                    transition: 'transform 500ms ease-in-out, opacity 300ms ease-in-out',
                  }}
                >
                  <div
                    className="w-full h-full"
                    style={{ transformOrigin: 'center center', transform: `rotate(${rotationAngle}deg)` }}
                  >
                    {discImageUrl ? (
                      <img
                        src={discImageUrl}
                        alt="Disc"
                        className="w-full h-full object-cover rounded-full"
                        onError={() => setDiscImageUrl(null)}
                      />
                    ) : (
                      <>
                        <img
                          src={vinylImage}
                          alt="Vinyl Record"
                          className="w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                        {/* Zinc 400 circle covering white center (only when we have something to overlay) */}
                        {((hasArtistLogo && artistLogoUrl) || hasImage) && (
                          <div
                            className="absolute top-1/2 left-1/2 rounded-full"
                            style={{
                              width: '52%',
                              height: '52%',
                              backgroundColor: '#a1a1aa',
                              transform: 'translate(-50%, -50%)',
                              transformOrigin: 'center center',
                            }}
                          />
                        )}
                        {/* Artist Logo or Album Art Overlay - centered */}
                        {hasArtistLogo && artistLogoUrl ? (
                          <div
                            className="absolute top-1/2 left-1/2 rounded-full overflow-hidden flex items-center justify-center"
                            style={{
                              width: '47%',
                              height: '47%',
                              transform: 'translate(-50%, -50%)',
                              transformOrigin: 'center center',
                            }}
                          >
                            <img
                              src={artistLogoUrl}
                              alt="Artist Logo"
                              className="w-full h-full object-contain"
                              onError={() => {
                                setHasArtistLogo(false)
                                setArtistLogoUrl(null)
                              }}
                            />
                          </div>
                        ) : hasImage && coverImage ? (
                          <div
                            className="absolute top-1/2 left-1/2 rounded-full overflow-hidden flex items-center justify-center"
                            style={{
                              width: '52%',
                              height: '52%',
                              transform: 'translate(-50%, -50%)',
                              transformOrigin: 'center center',
                            }}
                          >
                            <img src={coverImage} alt={detail.title} className="w-full h-full object-cover" />
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                {/* Album Art */}
                <div
                  className="absolute inset-0 rounded overflow-hidden bg-zinc-900 transition-all duration-500"
                  style={{
                    transform: isPlayingFromCollection
                      ? shouldSplitRef.current
                        ? 'translateX(calc(-50% - 8px))'
                        : 'translateX(calc(-100% - 24px))'
                      : hideAlbumArt
                        ? shouldSplitRef.current
                          ? 'translateX(calc(-50% - 8px))'
                          : 'translateX(calc(-100% - 24px))'
                        : 'translateX(0)',
                    opacity: 1,
                    transitionProperty: 'transform',
                    transitionDuration: '500ms',
                    transitionTimingFunction: 'ease-in-out',
                    zIndex: 10,
                  }}
                >
                  {coverImage ? (
                    <Image
                      src={coverImage}
                      alt={detail.title}
                      className="w-full h-full object-cover"
                      showOutline={true}
                      rounded="rounded"
                      onError={() => setHasImage(false)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 rounded">
                      No Image
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Album info */}
          <div className="w-full">
            <h2 className="text-4xl md:text-5xl font-bold mb-0.5 text-left break-words">{detail.title}</h2>
            <div className="flex items-center justify-between gap-4 mt-2">
              <div className="text-gray-400 flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                <span>{displayArtistName}</span>
                {detail.year > 0 && (
                  <>
                    <span>•</span>
                    <span>{detail.year}</span>
                  </>
                )}
                {formatString && (
                  <>
                    <span>•</span>
                    <span>{formatString}</span>
                  </>
                )}
                {libraryMatches.length < matchedTracks.length && (
                  <>
                    <span>•</span>
                    <span>{libraryMatches.length} of {matchedTracks.length} in library</span>
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  if (isPlayingFromCollection) {
                    pause()
                  } else if (currentTrack && libraryMatches.some(m => m.Id === currentTrack.Id) && !isPlaying) {
                    play()
                  } else {
                    handlePlayAll()
                  }
                }}
                disabled={libraryMatches.length === 0}
                className="bg-white/10 hover:bg-white/20 text-white font-semibold py-1.5 px-3 rounded-full transition-all hover:scale-105 flex items-center gap-1.5 backdrop-blur-sm border border-white/20 disabled:opacity-40 disabled:hover:scale-100 flex-shrink-0"
              >
                {isPlayingFromCollection ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Play
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Tracklist */}
        <div className="space-y-0">
          {Array.from(tracksByDisc.entries()).map(([discLabel, discTracks], discIndex) => {
            const maxLen = Math.max(...discTracks.map((t, i) => getTrackNumber(t, i).length))
            const trackNumberWidth = `${maxLen}ch`
            return (
              <div key={discLabel || 'all'}>
                {hasMultipleDiscs && discLabel && (
                  <div className={`px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider ${discIndex > 0 ? 'pt-4' : ''}`}>
                    {discLabel}
                  </div>
                )}
                {discTracks.map((track, index) => (
                  <CollectionTrackItem
                    key={`${track.discogsTrack.position}-${index}`}
                    track={track}
                    index={index}
                    artistName={artistName}
                    libraryMatches={libraryMatches}
                    onContextMenu={handleTrackContextMenu}
                    contextMenuItemId={contextMenuItem?.Id || null}
                    trackNumberWidth={trackNumberWidth}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      <ContextMenu
        item={contextMenuItem}
        itemType="song"
        isOpen={contextMenuOpen}
        onClose={() => {
          setContextMenuOpen(false)
          setContextMenuItem(null)
        }}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />

      {/* Collection-level overflow menu */}
      {collectionMenuMode === 'desktop' && collectionMenuOpen ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCollectionMenuOpen(false)} />
          <div
            className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 min-w-[200px]"
            style={{
              left: Math.min(collectionMenuPosition?.x || 100, window.innerWidth - 250),
              top: Math.min(collectionMenuPosition?.y || 100, window.innerHeight - (collectionMenuActions.length * 44 + 8) - 10),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {collectionMenuActions.map((action) => {
              const Icon = action.icon
              const isLoading = collectionMenuLoading === action.id
              return (
                <button
                  key={action.id}
                  onClick={() => handleCollectionMenuAction(action.id)}
                  disabled={!!collectionMenuLoading}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                >
                  <Icon className="w-4 h-4 text-white flex-shrink-0" />
                  <span className="flex-1 text-sm text-white">{action.label}</span>
                  {isLoading && (
                    <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <ResponsiveModal isOpen={collectionMenuOpen} onClose={() => setCollectionMenuOpen(false)}>
          <div className="pb-6">
            <div className="mb-4 ml-4">
              <div className="text-lg font-semibold text-white break-words">{detail.title}</div>
            </div>
            <div className="space-y-1">
              {collectionMenuActions.map((action) => {
                const Icon = action.icon
                const isLoading = collectionMenuLoading === action.id
                return (
                  <button
                    key={action.id}
                    onClick={() => handleCollectionMenuAction(action.id)}
                    disabled={!!collectionMenuLoading}
                    className="w-full flex items-center gap-4 pl-4 pr-4 py-3 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Icon className="w-5 h-5 text-white" />
                    <span className="flex-1 text-left text-white font-medium">{action.label}</span>
                    {isLoading && (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </ResponsiveModal>
      )}

      <PlaylistPicker
        isOpen={playlistPickerOpen}
        onClose={() => setPlaylistPickerOpen(false)}
        itemIds={playlistPickerItemIds}
      />
    </div>
  )
}
