import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Music } from 'lucide-react'
import { jellyfinClient } from '../../api/jellyfin'
import { useStatsStore, type PlayEvent } from '../../stores/statsStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useMusicStore } from '../../stores/musicStore'
import {
  getRollingSixMonthRange,
  formatRangeSubtitle,
  computeArtistTopSongs,
  type ArtistTopSong,
} from '../../utils/statsComputer'
import { getFeaturedArtistData } from '../../stores/musicStore'
import { normalizeName } from '../../utils/featuredArtists'
import Pagination from '../shared/Pagination'
import Image from '../shared/Image'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'
import type { BaseItemDto } from '../../api/types'

const ITEMS_PER_PAGE = 50

function ArtistTopSongDetailRow({
  song,
  rank,
  onPlay,
  onContextMenu,
}: {
  song: ArtistTopSong
  rank: number
  onPlay: (songId: string) => void
  onContextMenu: (song: ArtistTopSong, mode: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
}) {
  const navigate = useNavigate()
  const rankDigits = String(rank).length
  const rankItemWidth = `${rankDigits * 0.6 + 0.2}rem`
  const imageUrl = jellyfinClient.getAlbumArtUrl(song.albumId, 96)

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      onContextMenu(song, 'mobile')
    },
    onClick: () => onPlay(song.songId),
  })

  return (
    <button
      onClick={() => onPlay(song.songId)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(song, 'desktop', { x: e.clientX, y: e.clientY })
      }}
      {...longPressHandlers}
      className="flex items-start gap-3 w-full py-2 rounded-lg hover:bg-zinc-800/50 transition-colors text-left group"
    >
      <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0">
        <Image
          src={imageUrl}
          alt={song.songName}
          className="w-full h-full object-cover"
          showOutline={true}
          rounded="rounded-sm"
          fallbackIcon={Music}
        />
      </div>
      <span className="text-zinc-500 tabular-nums flex-shrink-0" style={{ width: rankItemWidth }}>{rank}</span>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">
          {song.songName}
        </div>
        <div className="text-zinc-400 text-sm truncate flex items-center gap-1 min-w-0">
          {song.primaryArtistName && (
            song.primaryArtistId ? (
              <span
                className="clickable-text truncate flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  if (song.primaryArtistId) navigate(`/artist/${song.primaryArtistId}`)
                }}
              >
                {song.primaryArtistName}
              </span>
            ) : (
              <span className="truncate flex-shrink-0">{song.primaryArtistName}</span>
            )
          )}
          {song.primaryArtistName && song.albumName && (
            <span className="flex-shrink-0">•</span>
          )}
          {song.albumName && (
            song.albumId ? (
              <span
                className="clickable-text truncate"
                onClick={(e) => {
                  e.stopPropagation()
                  if (song.albumId) navigate(`/album/${song.albumId}`)
                }}
              >
                {song.albumName}
              </span>
            ) : (
              <span className="truncate">{song.albumName}</span>
            )
          )}
          {song.albumName && song.year && (
            <span className="flex-shrink-0">•</span>
          )}
          {song.year && (
            <span className="flex-shrink-0">{song.year}</span>
          )}
        </div>
      </div>
      <div className="text-zinc-400 text-sm whitespace-nowrap tabular-nums">
        {song.plays} streams
      </div>
    </button>
  )
}

export default function ArtistTopSongsDetailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)
  const playTrack = usePlayerStore(state => state.playTrack)
  const { fetchEvents, pendingEvents, metadataVersion } = useStatsStore()
  const storeSongs = useMusicStore(state => state.songs)

  const artistIdParam = searchParams.get('artist') || ''
  const artistNameParam = searchParams.get('artistName') || ''

  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<PlayEvent[]>([])
  const [page, setPage] = useState(0)
  const [allTopSongs, setAllTopSongs] = useState<ArtistTopSong[]>([])

  // Context menu state (song rows)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)

  const range = useMemo(() => getRollingSixMonthRange(), [])
  const fromTs = range.fromDate.getTime()
  const toTs = range.toDate.getTime()

  const aliasIds = useMemo(() => {
    if (!artistIdParam) return []
    const ids = new Set<string>([artistIdParam])
    if (artistNameParam) {
      const featuredData = getFeaturedArtistData(storeSongs)
      const normalized = normalizeName(artistNameParam)
      const aliases = featuredData.artistIdsByName.get(normalized)
      if (aliases) {
        for (const id of aliases) ids.add(id)
      }
    }
    return [...ids]
  }, [artistIdParam, artistNameParam, storeSongs])

  // Song lookup keyed by ID, used to resolve row metadata (primary artist,
  // album, year) so rows render the same secondary line as the main Songs section.
  const songLookup = useMemo(() => {
    const map = new Map<string, {
      Name: string
      AlbumArtist?: string
      ArtistItems?: Array<{ Id?: string, Name?: string }>
      Album?: string
      AlbumId?: string
      ProductionYear?: number
      PremiereDate?: string
    }>()
    for (const s of storeSongs) {
      map.set(s.Id, {
        Name: s.Name,
        AlbumArtist: s.AlbumArtist,
        ArtistItems: s.ArtistItems,
        Album: s.Album,
        AlbumId: s.AlbumId,
        ProductionYear: s.ProductionYear,
        PremiereDate: s.PremiereDate,
      })
    }
    return map
  }, [storeSongs])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      try {
        const data = await fetchEvents(fromTs, toTs)
        if (mounted) setEvents(data)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [fromTs, toTs, fetchEvents, pendingEvents.length, metadataVersion])

  // All streamed songs by this artist in the last 6 months, ranked by streams
  useEffect(() => {
    if (loading || events.length === 0 || (aliasIds.length === 0 && !artistNameParam)) {
      setAllTopSongs([])
      return
    }
    setAllTopSongs(computeArtistTopSongs(events, aliasIds, artistNameParam, songLookup, Infinity))
  }, [events, aliasIds, artistNameParam, songLookup, loading])

  const totalPages = Math.ceil(allTopSongs.length / ITEMS_PER_PAGE)
  const pageItems = allTopSongs.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE)

  const subtitle = useMemo(
    () => formatRangeSubtitle(range.fromMonth, range.toMonth),
    [range.fromMonth, range.toMonth],
  )
  const title = `Top Songs by ${artistNameParam || 'this artist'}`

  const handlePlaySong = async (songId: string) => {
    // Play the clicked song with the rest of the artist's top songs (ranked)
    // as the queue, matching the inline Top songs section behavior.
    const songs = await Promise.all(allTopSongs.map(s => jellyfinClient.getSongById(s.songId)))
    const queue = songs.filter((s): s is BaseItemDto => s !== null)
    if (!queue.length) return
    const clicked = queue.find(s => s.Id === songId) || queue[0]
    playTrack(clicked, queue)
  }

  const openContextMenu = (song: ArtistTopSong, mode: 'mobile' | 'desktop', position?: { x: number, y: number }) => {
    setContextMenuItem({
      Id: song.songId,
      Name: song.songName,
      AlbumId: song.albumId,
      Album: song.albumName || undefined,
      ArtistItems: song.primaryArtistId ? [{ Id: song.primaryArtistId, Name: song.primaryArtistName || 'Unknown' }] : undefined,
      AlbumArtist: song.primaryArtistName || undefined,
      Type: 'Audio',
    } as BaseItemDto)
    setContextMenuMode(mode)
    setContextMenuPosition(position || null)
    setContextMenuOpen(true)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-zinc-600 border-t-[var(--accent-color)] rounded-full animate-spin mb-4" />
        <p className="text-zinc-500">Loading...</p>
      </div>
    )
  }

  if (allTopSongs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Music className="w-16 h-16 text-zinc-600 mb-4" />
        <h2 className="text-xl font-semibold text-zinc-300 mb-2">No data</h2>
      </div>
    )
  }

  return (
    <div className="pb-32 lg:pb-20">
      {/* Fixed header */}
      <div
        className={`fixed top-0 left-0 right-0 bg-black z-[60] lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : ''}`}
        style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
      >
        <div className="max-w-page mx-auto">
          <div className="flex items-center justify-between gap-3 py-4 pl-3 pr-4">
            <button
              onClick={() => navigate(-1)}
              className="text-white hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Gradient overlay below top bar */}
      <div
        className={`fixed left-0 right-0 z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : ''}`}
        style={{
          top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 3.5rem - 8px)`,
          height: '24px',
          background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.8), transparent)'
        }}
      />

      {/* Spacer */}
      <div className="h-20" />

      {/* Title section */}
      <div className="px-4 mb-6">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">{title}</h1>
        {subtitle && (
          <p className="text-gray-400">{subtitle}</p>
        )}
      </div>

      <div className="px-4">
        <div className="space-y-1">
          {pageItems.map((song, i) => {
            const rank = page * ITEMS_PER_PAGE + i + 1
            return (
              <ArtistTopSongDetailRow
                key={song.songId}
                song={song}
                rank={rank}
                onPlay={handlePlaySong}
                onContextMenu={openContextMenu}
              />
            )
          })}
        </div>

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={(p) => { setPage(p); window.scrollTo(0, 0) }}
          itemsPerPage={ITEMS_PER_PAGE}
          totalItems={allTopSongs.length}
        />
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
        zIndex={99999}
      />
    </div>
  )
}