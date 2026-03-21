import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMusicStore } from '../../stores/musicStore'
import { useStatsStore, type PlayEvent } from '../../stores/statsStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import { useScrollLazyLoad } from '../../hooks/useScrollLazyLoad'
import { jellyfinClient } from '../../api/jellyfin'
import { ArrowLeft, Pause, Shuffle } from 'lucide-react'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useContextMenu } from '../../hooks/useContextMenu'
import Image from '../shared/Image'
import Spinner from '../shared/Spinner'
import { capitalizeFirst, formatDuration } from '../../utils/formatting'
import { useCassetteWheelAnimation } from '../../hooks/useCassetteWheelAnimation'
import { useLargeViewport } from '../../hooks/useLargeViewport'
import wheelImage from '../../assets/wheel.png'
import cassetteImage from '../../assets/cassette.png'
import {
  SMART_PLAYLISTS,
  getYearThrowbackSongs,
  getDecadeSongs,
  getLanguageSongs,
} from '../../utils/smartPlaylists'
import { filterExcludedGenres } from '../../utils/genreFilter'

// Cassette animation constants (same as PlaylistDetailPage)
const WHEEL_SIZE_PERCENT = (712 / 1233) * 100
const WHEEL_CENTER_Y_PERCENT = 48.8
const WHEEL_LEFT_CENTER_X_PERCENT = 29
const WHEEL_RIGHT_CENTER_X_PERCENT = 71

const INITIAL_VISIBLE_TRACKS = 45
const VISIBLE_TRACKS_INCREMENT = 45

function decadeLabel(decade: number): string {
  if (decade < 2000) return `${decade - 1900}s`
  return `${decade}s`
}

export default function SmartPlaylistDetailPage() {
  const { smartId } = useParams<{ smartId: string }>()
  const navigate = useNavigate()
  const allSongs = useMusicStore(s => s.songs)
  const { statsTrackingEnabled, excludedGenres } = useSettingsStore()
  const songs = useMemo(() => filterExcludedGenres(allSongs), [allSongs, excludedGenres])
  const fetchEvents = useStatsStore(s => s.fetchEvents)
  const oldestEventTs = useStatsStore(s => s.oldestEventTs)
  const { shuffleArtist, isPlaying } = usePlayerStore()
  const currentTrack = useCurrentTrack()
  const isQueueSidebarOpen = usePlayerStore(s => s.isQueueSidebarOpen)
  const isLargeViewport = useLargeViewport()

  const [tracks, setTracks] = useState<BaseItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [visibleTracksCount, setVisibleTracksCount] = useState(INITIAL_VISIBLE_TRACKS)

  useEffect(() => {
    if (!smartId || songs.length === 0) return

    const load = async () => {
      setLoading(true)

      let events: PlayEvent[] = []
      if (statsTrackingEnabled) {
        events = await fetchEvents(oldestEventTs || 0, Date.now())
      }

      const yearMatch = smartId.match(/^year-throwback-(\d{4})$/)
      if (yearMatch) {
        const year = parseInt(yearMatch[1])
        setTitle(`Your Top Songs ${year}`)
        setSubtitle(`Your most played tracks from ${year}.`)
        const result = getYearThrowbackSongs(year, songs, events)
        setTracks(result.map(toBaseItemDto))
        setLoading(false)
        return
      }

      const decadeMatch = smartId.match(/^decade-(\d{4})$/)
      if (decadeMatch) {
        const decade = parseInt(decadeMatch[1])
        setTitle(`${decadeLabel(decade)} Mix`)
        setSubtitle('')
        const result = getDecadeSongs(decade, songs)
        setTracks(result.map(toBaseItemDto))
        setLoading(false)
        return
      }

      const languageMatch = smartId.match(/^language-(.+)$/)
      if (languageMatch) {
        const lang = decodeURIComponent(languageMatch[1])
        setTitle(`${capitalizeFirst(lang)}`)
        setSubtitle('')
        const result = getLanguageSongs(lang, songs)
        setTracks(result.map(toBaseItemDto))
        setLoading(false)
        return
      }

      const sp = SMART_PLAYLISTS.find(p => p.id === smartId)
      if (sp) {
        setTitle(sp.name)
        setSubtitle(sp.subtitle)
        const result = sp.getSongs(songs, events)
        setTracks(result.map(toBaseItemDto))
      }

      setLoading(false)
    }

    load()
  }, [smartId, songs, statsTrackingEnabled, fetchEvents, oldestEventTs])

  useEffect(() => {
    setVisibleTracksCount(INITIAL_VISIBLE_TRACKS)
  }, [tracks.length])

  useScrollLazyLoad({
    totalCount: tracks.length,
    visibleCount: visibleTracksCount,
    increment: VISIBLE_TRACKS_INCREMENT,
    setVisibleCount: setVisibleTracksCount,
    threshold: 1.5,
  })

  const handleShuffleAll = () => {
    if (tracks.length > 0) shuffleArtist(tracks)
  }

  const isListPlaying = useMemo(() => {
    if (!currentTrack || tracks.length === 0) return false
    return tracks.some(t => t.Id === currentTrack.Id) && isPlaying
  }, [currentTrack, tracks, isPlaying])

  const wheelRotation = useCassetteWheelAnimation(isListPlaying)

  if (loading) {
    return (
      <div className="pb-20 flex items-center justify-center h-screen">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="pb-20">
      {/* Fixed header */}
      <div
        className={`fixed top-0 left-0 right-0 bg-black z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
      >
        <div className="max-w-page mx-auto">
          <div className="flex items-center gap-4 px-4" style={{ paddingTop: '1.5rem', paddingBottom: '1rem' }}>
            <button
              onClick={() => navigate(-1)}
              className="text-white hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      <div className="pt-11">
        <div className="mb-6 px-4 pt-4">
          {/* Cassette */}
          <div className="flex justify-center mb-6">
            <div className="relative" style={{ width: isLargeViewport ? '360px' : '256px', height: isLargeViewport ? '360px' : '256px' }}>
              {/* Left wheel */}
              <img
                src={wheelImage}
                alt=""
                style={{
                  position: 'absolute',
                  width: `${WHEEL_SIZE_PERCENT}%`,
                  height: `${WHEEL_SIZE_PERCENT}%`,
                  left: `${WHEEL_LEFT_CENTER_X_PERCENT - WHEEL_SIZE_PERCENT / 2}%`,
                  top: `${WHEEL_CENTER_Y_PERCENT - WHEEL_SIZE_PERCENT / 2}%`,
                  transform: `rotate(${wheelRotation}deg)`,
                  transformOrigin: 'center center',
                  zIndex: 3,
                }}
              />
              {/* Right wheel */}
              <img
                src={wheelImage}
                alt=""
                style={{
                  position: 'absolute',
                  width: `${WHEEL_SIZE_PERCENT}%`,
                  height: `${WHEEL_SIZE_PERCENT}%`,
                  left: `${WHEEL_RIGHT_CENTER_X_PERCENT - WHEEL_SIZE_PERCENT / 2}%`,
                  top: `${WHEEL_CENTER_Y_PERCENT - WHEEL_SIZE_PERCENT / 2}%`,
                  transform: `rotate(${wheelRotation}deg)`,
                  transformOrigin: 'center center',
                  zIndex: 3,
                }}
              />
              {/* Cassette image */}
              <img
                src={cassetteImage}
                alt="Cassette"
                className="w-full h-full object-contain"
                style={{ position: 'relative', zIndex: 2 }}
              />
              {/* Title on the cassette label */}
              <div
                className="absolute font-handwritten text-black text-center truncate pointer-events-none"
                style={{
                  top: '27%',
                  left: '6%',
                  width: '88%',
                  fontSize: isLargeViewport ? '1.55rem' : '1.1rem',
                  lineHeight: 1.2,
                  zIndex: 4,
                }}
              >
                {title}
              </div>
            </div>
          </div>

          <h2 className="text-4xl md:text-5xl font-bold mb-0.5 text-left break-words">{title}</h2>
          {tracks.length > 0 && (
            <div className="flex items-center justify-between gap-4 mt-2">
              <div className="text-gray-400 text-sm">
                {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}{subtitle && ` • ${subtitle}`}
              </div>
              <button
                onClick={isListPlaying ? () => usePlayerStore.getState().pause() : handleShuffleAll}
                className="bg-white/10 hover:bg-white/20 text-white font-semibold py-1.5 px-3 rounded-full transition-all hover:scale-105 flex items-center gap-1.5 backdrop-blur-sm border border-white/20 flex-shrink-0"
              >
                {isListPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </>
                ) : (
                  <>
                    <Shuffle className="w-3.5 h-3.5" />
                    Shuffle
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {tracks.length === 0 ? (
          <div className="flex items-center justify-center px-8 pt-24">
            <p className="text-gray-400 text-center">Not enough songs to generate this playlist</p>
          </div>
        ) : (
          <div className="space-y-0">
            {tracks.slice(0, visibleTracksCount).map((track) => (
              <SmartTrackItem
                key={track.Id}
                track={track}
                tracks={tracks}
                onContextMenu={(track, mode, position) => {
                  setContextMenuItem(track)
                  setContextMenuMode(mode || 'mobile')
                  setContextMenuPosition(position || null)
                  setContextMenuOpen(true)
                }}
              />
            ))}
          </div>
        )}
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
    </div>
  )
}

// ============================================================================
// Track item
// ============================================================================

function SmartTrackItem({
  track,
  tracks,
  onContextMenu,
}: {
  track: BaseItemDto
  tracks: BaseItemDto[]
  onContextMenu: (track: BaseItemDto, mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
}) {
  const navigate = useNavigate()
  const { playTrack } = usePlayerStore()
  const currentTrack = useCurrentTrack()

  const { handleContextMenu, longPressHandlers, shouldSuppressClick } = useContextMenu({
    item: track,
    onContextMenu,
  })

  return (
    <div
      className="relative w-full flex items-center gap-3 hover:bg-white/10 transition-colors group px-4 py-3 cursor-pointer"
      onClick={() => {
        if (shouldSuppressClick()) return
        playTrack(track, tracks)
      }}
      onContextMenu={handleContextMenu}
      {...longPressHandlers}
    >
      <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-900 self-center">
        <Image
          src={jellyfinClient.getAlbumArtUrl(track.AlbumId || track.Id, 96)}
          alt={track.Name}
          className="w-full h-full object-cover"
          showOutline={true}
          rounded="rounded-sm"
        />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className={`text-sm font-medium truncate transition-colors ${currentTrack?.Id === track.Id
          ? 'text-[var(--accent-color)]'
          : 'text-white group-hover:text-[var(--accent-color)]'
        }`}>
          {track.Name}
        </div>
        <div className="text-xs text-gray-400 truncate">
          {track.ArtistItems?.[0]?.Id ? (
            <span
              className="clickable-text"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
                e.stopPropagation()
                navigate(`/artist/${track.ArtistItems![0].Id}`)
              }}
            >
              {track.ArtistItems[0].Name || track.AlbumArtist || 'Unknown Artist'}
            </span>
          ) : (
            track.AlbumArtist || 'Unknown Artist'
          )}
          {track.Album && (
            <>
              {' • '}
              {track.AlbumId ? (
                <span
                  className="clickable-text"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
                    e.stopPropagation()
                    navigate(`/album/${track.AlbumId}`)
                  }}
                >
                  {track.Album}
                </span>
              ) : (
                track.Album
              )}
            </>
          )}
        </div>
      </div>
      {track.RunTimeTicks && (
        <div className="text-xs text-gray-500 flex-shrink-0 text-right">
          {formatDuration(track.RunTimeTicks)}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Helper
// ============================================================================

function toBaseItemDto(song: import('../../api/types').LightweightSong): BaseItemDto {
  return {
    Id: song.Id,
    Name: song.Name,
    AlbumArtist: song.AlbumArtist,
    ArtistItems: song.ArtistItems,
    Album: song.Album,
    AlbumId: song.AlbumId,
    RunTimeTicks: song.RunTimeTicks,
    Type: 'Audio',
  } as BaseItemDto
}
