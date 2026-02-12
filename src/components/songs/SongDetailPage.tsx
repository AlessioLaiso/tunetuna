import React, { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { jellyfinClient } from '../../api/jellyfin'
import { usePlayerStore } from '../../stores/playerStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useStatsStore } from '../../stores/statsStore'
import { useMusicStore } from '../../stores/musicStore'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import Image from '../shared/Image'
import Spinner from '../shared/Spinner'
import ContextMenu from '../shared/ContextMenu'
import { ArrowLeft, MoreHorizontal, Play, Pause, ChevronDown, User, Disc, Hash, Clock, Calendar, Guitar, Tag, FolderOpen, BarChart3, MicVocal, Globe, Smile, Piano, FileAudio } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { BaseItemDto } from '../../api/types'
import { formatDuration } from '../../utils/formatting'
import { logger } from '../../utils/logger'

// Month helpers (same logic as StatsPage)
const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

interface MonthOption {
  value: string
}

function generateMonthOptions(oldestTs: number | null): MonthOption[] {
  const options: MonthOption[] = []
  const now = new Date()
  const start = oldestTs ? new Date(oldestTs) : new Date(now.getFullYear(), 0, 1)

  let current = new Date(start.getFullYear(), start.getMonth(), 1)

  while (current <= now) {
    const value = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`
    options.push({ value })
    current.setMonth(current.getMonth() + 1)
  }

  return options.reverse()
}

function getDefaultRange(oldestTs: number | null): { from: string; to: string } {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  if (!oldestTs) {
    return { from: currentMonth, to: currentMonth }
  }

  const twelveMonthsAgo = new Date(now)
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11)

  const oldestDate = new Date(oldestTs)

  const fromDate = oldestDate > twelveMonthsAgo ? oldestDate : twelveMonthsAgo
  const fromMonth = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}`

  return { from: fromMonth, to: currentMonth }
}

function formatMonthYear(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number)
  return `${SHORT_MONTH_NAMES[month - 1]} ${year}`
}

function capitalizeFirst(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function parseGroupingTags(tags: string[]): { key: string; category: string; values: { display: string; raw: string }[] }[] {
  const categoryMap = new Map<string, { display: string; raw: string }[]>()

  tags.forEach(tag => {
    const trimmed = tag.trim().toLowerCase()
    if (!trimmed) return
    const underscoreIndex = trimmed.indexOf('_')
    if (underscoreIndex === -1) {
      // Single-value tag like "instrumental"
      if (!categoryMap.has(trimmed)) {
        categoryMap.set(trimmed, [])
      }
    } else {
      const category = trimmed.substring(0, underscoreIndex)
      const value = trimmed.substring(underscoreIndex + 1)
      if (!categoryMap.has(category)) {
        categoryMap.set(category, [])
      }
      categoryMap.get(category)!.push({ display: capitalizeFirst(value), raw: value })
    }
  })

  return Array.from(categoryMap.entries()).map(([key, values]) => ({
    key,
    category: capitalizeFirst(key),
    values,
  }))
}

// Icon mapping for grouping categories (matches SearchOverlay)
function getGroupingIcon(categoryKey: string): LucideIcon {
  switch (categoryKey.toLowerCase()) {
    case 'language': return Globe
    case 'mood': return Smile
    case 'instrumental': return Piano
    default: return Tag
  }
}

export default function SongDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { playTrack, isPlaying, play, pause: pausePlayback } = usePlayerStore()
  const currentTrack = useCurrentTrack()
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)
  const { pageVisibility } = useSettingsStore()
  const { genres } = useMusicStore()

  const [song, setSong] = useState<BaseItemDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [lyrics, setLyrics] = useState<string | null>(null)
  const [lyricsLoading, setLyricsLoading] = useState(true)
  const [hasImage, setHasImage] = useState(true)
  const [hasBackdrop, setHasBackdrop] = useState(true)

  // Context menu state
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)

  // Stats state
  const { fetchEvents, oldestEventTs, initializeOldestTs, pendingEvents } = useStatsStore()
  const [streamCount, setStreamCount] = useState<number | null>(null)
  const [fromMonth, setFromMonth] = useState('')
  const [toMonth, setToMonth] = useState('')

  const effectiveOldestTs = useMemo(() => {
    const timestamps = [oldestEventTs, ...pendingEvents.map(e => e.ts)].filter((t): t is number => t !== null)
    return timestamps.length > 0 ? Math.min(...timestamps) : null
  }, [oldestEventTs, pendingEvents])

  const monthOptions = useMemo(() => generateMonthOptions(effectiveOldestTs), [effectiveOldestTs])

  // Initialize stats
  useEffect(() => {
    if (pageVisibility.stats && oldestEventTs === null) {
      initializeOldestTs()
    }
  }, [pageVisibility.stats, oldestEventTs, initializeOldestTs])

  // Set default range
  useEffect(() => {
    if (!pageVisibility.stats) return
    const { from, to } = getDefaultRange(effectiveOldestTs)
    setFromMonth(from)
    setToMonth(to)
  }, [effectiveOldestTs, pageVisibility.stats])

  // Fetch stream count
  useEffect(() => {
    if (!pageVisibility.stats || !fromMonth || !toMonth || !id) return

    const fetchStreamCount = async () => {
      const [fromYear, fromM] = fromMonth.split('-').map(Number)
      const [toYear, toM] = toMonth.split('-').map(Number)

      const fromTs = new Date(fromYear, fromM - 1, 1).getTime()
      const toTs = new Date(toYear, toM, 0, 23, 59, 59, 999).getTime()

      const events = await fetchEvents(fromTs, toTs)
      const count = events.filter(e => e.songId === id).length
      setStreamCount(count)
    }

    fetchStreamCount()
  }, [pageVisibility.stats, fromMonth, toMonth, id, fetchEvents, pendingEvents.length])

  // Load song data
  useEffect(() => {
    if (!id) return

    let isMounted = true

    const loadData = async () => {
      setLoading(true)
      setLyricsLoading(true)

      try {
        const [songData, lyricsData] = await Promise.all([
          jellyfinClient.getSongById(id),
          jellyfinClient.getLyrics(id),
        ])

        if (!isMounted) return

        if (songData) {
          setSong(songData)
          setHasImage(!!songData.AlbumId)
        }
        setLyrics(lyricsData)
      } catch (error) {
        if (!isMounted) return
        logger.error('Failed to load song data:', error)
      } finally {
        if (isMounted) {
          setLoading(false)
          setLyricsLoading(false)
        }
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [id])

  const getGenreId = (genreName: string): string | null => {
    const genre = genres.find(g => g.Name?.toLowerCase() === genreName.toLowerCase())
    return genre?.Id || null
  }

  const isCurrentSongPlaying = currentTrack?.Id === song?.Id && isPlaying

  const groupingCategories = useMemo(() => {
    // Grouping tags may come from the Grouping field directly,
    // or need to be extracted from Tags (where MusicTags plugin stores them as "grouping:mood_party")
    let groupingTags = song?.Grouping
    if ((!groupingTags || groupingTags.length === 0) && song?.Tags) {
      groupingTags = song.Tags
        .filter(tag => tag.startsWith('grouping:'))
        .map(tag => tag.replace('grouping:', ''))
    }
    if (!groupingTags || groupingTags.length === 0) return []
    return parseGroupingTags(groupingTags)
  }, [song?.Grouping, song?.Tags])

  if (loading) {
    return (
      <div className="pb-20">
        <div className="flex items-center justify-center h-screen">
          <Spinner />
        </div>
      </div>
    )
  }

  if (!song) {
    return (
      <div className="pb-20">
        <div className="flex items-center justify-center h-screen text-gray-400">
          <p>Song not found</p>
        </div>
      </div>
    )
  }

  const artistName = song.ArtistItems?.[0]?.Name || song.AlbumArtist || null
  const artistId = song.ArtistItems?.[0]?.Id || null

  return (
    <div className="pb-20">
      {/* Fixed header */}
      <div
        className={`fixed top-0 left-0 right-0 z-[60] lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : ''}`}
        style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
      >
        <div className="max-w-[768px] mx-auto">
          <div className="relative flex items-center justify-between gap-4 py-4 pl-3 pr-4">
            <button
              onClick={() => navigate(-1)}
              className="text-white hover:text-zinc-300 transition-colors z-10"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <button
              onClick={(e) => {
                if (window.innerWidth < 768) {
                  setContextMenuMode('mobile')
                  setContextMenuPosition(null)
                } else {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setContextMenuMode('desktop')
                  setContextMenuPosition({
                    x: rect.left + rect.width / 2,
                    y: rect.bottom + 5
                  })
                }
                setContextMenuOpen(true)
              }}
              className="text-white hover:text-zinc-300 transition-colors z-10"
            >
              <MoreHorizontal className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Hero section with backdrop */}
      <div
        className="relative z-30 w-screen"
        style={{
          marginTop: `calc(-1 * env(safe-area-inset-top))`,
          marginLeft: 'calc(50% - 50vw)',
          marginRight: 'calc(50% - 50vw)',
        }}
      >
        {hasBackdrop && artistId && (
          <div
            className="relative w-full min-h-64 md:min-h-80 bg-black"
            style={{ paddingTop: `env(safe-area-inset-top)` }}
          >
            {/* Mobile: blurred album art as backdrop */}
            <div className="w-full h-64 md:hidden">
              {hasImage && song.AlbumId ? (
                <img
                  src={jellyfinClient.getAlbumArtUrl(song.AlbumId)}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={() => setHasBackdrop(false)}
                />
              ) : (
                <div className="w-full h-full bg-zinc-900" />
              )}
            </div>

            {/* Desktop: artist backdrop image */}
            <div className="hidden md:block w-full h-80">
              <img
                src={jellyfinClient.getArtistBackdropUrl(artistId, 1920)}
                alt=""
                className="w-full h-full object-cover object-[center_20%]"
                onError={() => setHasBackdrop(false)}
              />
            </div>

            <div className="absolute inset-x-0 top-0 bottom-[-1px] bg-gradient-to-b from-transparent via-black/60 to-black pointer-events-none" />
          </div>
        )}

        {/* Song info overlay */}
        <div className={`left-0 right-0 ${hasBackdrop && artistId ? 'absolute' : 'relative'} ${hasBackdrop && artistId ? 'pt-16' : 'pt-12'}`} style={hasBackdrop && artistId ? { bottom: '-28px', paddingBottom: '1.5rem' } : {}}>
          <div className="max-w-[768px] mx-auto px-4 flex items-end gap-6 md:grid md:grid-cols-3 md:gap-4">
            {/* Album art (desktop/tablet: on the left; mobile: hidden since backdrop is album art) */}
            {hasImage && song.AlbumId && (
              <div className="hidden md:block md:col-span-1">
                <div className="aspect-square rounded overflow-hidden bg-zinc-900 flex items-center justify-center">
                  <Image
                    src={jellyfinClient.getAlbumArtUrl(song.AlbumId)}
                    alt={song.Name}
                    className="w-full h-full object-cover"
                    showOutline={true}
                    rounded="rounded"
                    onError={() => setHasImage(false)}
                  />
                </div>
              </div>
            )}
            {/* Song title and play button */}
            <div className={`flex-1 min-w-0 pb-2 ${hasImage ? 'md:col-span-2' : 'md:col-span-3'}`}>
              <div className="mb-4 mt-4">
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 break-words">{song.Name}</h1>
                <div className="flex items-center justify-end gap-4 mt-2">
                  <button
                    onClick={() => {
                      if (isCurrentSongPlaying) {
                        pausePlayback()
                      } else if (currentTrack?.Id === song.Id) {
                        play()
                      } else {
                        playTrack(song)
                      }
                    }}
                    className="bg-white/10 hover:bg-white/20 text-white font-semibold py-1.5 px-3 rounded-full transition-all hover:scale-105 flex items-center gap-1.5 backdrop-blur-sm border border-white/20 flex-shrink-0"
                  >
                    {isCurrentSongPlaying ? (
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
          </div>
        </div>
      </div>

      {/* Content section */}
      <div className={`${hasBackdrop && artistId ? 'pt-3 md:pt-7' : 'pt-3'}`}>
        {/* Metadata section */}
        <div className="px-4 mt-2">
          <div className="grid gap-x-3 gap-y-6 items-start" style={{ gridTemplateColumns: 'auto auto 1fr' }}>
            {artistName && (
              <MetadataRow
                icon={User}
                label="Artist"
                value={artistName}
                onClick={artistId ? () => navigate(`/artist/${artistId}`) : undefined}
              />
            )}
            {song.Album && (
              <MetadataRow
                icon={Disc}
                label="Album"
                value={song.Album}
                onClick={song.AlbumId ? () => navigate(`/album/${song.AlbumId}`) : undefined}
              />
            )}
            {song.IndexNumber != null && (
              <MetadataRow
                icon={Hash}
                label={song.ParentIndexNumber != null && song.ParentIndexNumber > 1 ? `Disc ${song.ParentIndexNumber}, Track` : 'Track'}
                value={String(song.IndexNumber)}
              />
            )}
            {song.RunTimeTicks != null && (
              <MetadataRow icon={Clock} label="Duration" value={formatDuration(song.RunTimeTicks)} />
            )}
            {song.ProductionYear != null && (
              <MetadataRow
                icon={Calendar}
                label="Year"
                value={String(song.ProductionYear)}
                onClick={() => navigate(`/songs?year=${song.ProductionYear}`)}
              />
            )}
            {song.Genres && song.Genres.length > 0 && (
              <>
                <Guitar className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                <span className="text-gray-400 text-base flex-shrink-0 truncate" style={{ maxWidth: '128px' }}>
                  {song.Genres.length === 1 ? 'Genre' : 'Genres'}
                </span>
                <div className="flex flex-wrap gap-x-1">
                  {song.Genres.map((genre, i) => (
                    <span key={genre}>
                      <button
                        onClick={() => {
                          const genreId = getGenreId(genre)
                          if (genreId) navigate(`/genre/${encodeURIComponent(genreId)}`)
                        }}
                        className="text-base text-white hover:text-gray-300 transition-colors"
                      >
                        {genre}
                      </button>
                      {i < song.Genres!.length - 1 && <span className="text-white">, </span>}
                    </span>
                  ))}
                </div>
              </>
            )}
            {groupingCategories.map(({ key, category, values }) => {
              const GroupingIcon = getGroupingIcon(key)
              if (values.length === 0) {
                // Single-value boolean tag like "instrumental"
                return (
                  <MetadataRow
                    key={key}
                    icon={GroupingIcon}
                    label="Tag"
                    value={category}
                    onClick={() => navigate(`/songs?grouping=${key}`)}
                  />
                )
              }
              return (
                <React.Fragment key={key}>
                  <GroupingIcon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  <span className="text-gray-400 text-base flex-shrink-0 truncate" style={{ maxWidth: '128px' }}>{category}</span>
                  <div className="flex flex-wrap gap-x-1">
                    {values.map((v, i) => (
                      <span key={v.raw}>
                        <button
                          onClick={() => navigate(key === 'mood' ? `/mood/${v.raw}` : `/songs?grouping=${key}_${v.raw}`)}
                          className="text-base text-white hover:text-gray-300 transition-colors"
                        >
                          {v.display}
                        </button>
                        {i < values.length - 1 && <span className="text-white">, </span>}
                      </span>
                    ))}
                  </div>
                </React.Fragment>
              )
            })}
            {/* Stream count */}
            {pageVisibility.stats && (
              <>
                <BarChart3 className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                <span className="text-gray-400 text-base flex-shrink-0 truncate" style={{ maxWidth: '128px' }}>Streams</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base text-white">
                    {streamCount !== null ? `${streamCount}` : '...'}
                  </span>
                  <div className="flex gap-1.5 items-center">
                    <div className="relative">
                      <select
                        value={fromMonth}
                        onChange={(e) => setFromMonth(e.target.value)}
                        className="appearance-none bg-zinc-800 text-white rounded-lg px-2 py-1 pr-6 text-xs font-medium cursor-pointer hover:bg-zinc-700 transition-colors"
                      >
                        {monthOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {formatMonthYear(opt.value)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                    </div>
                    <span className="text-zinc-400 text-xs">to</span>
                    <div className="relative">
                      <select
                        value={toMonth}
                        onChange={(e) => setToMonth(e.target.value)}
                        className="appearance-none bg-zinc-800 text-white rounded-lg px-2 py-1 pr-6 text-xs font-medium cursor-pointer hover:bg-zinc-700 transition-colors"
                      >
                        {monthOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {formatMonthYear(opt.value)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </>
            )}
            {song.Path && (
              <MetadataRow icon={FolderOpen} label="Path" value={song.Path} />
            )}
            {(() => {
              const audioStream = song.MediaSources?.[0]?.MediaStreams?.find(s => s.Type === 'Audio')
              const container = song.MediaSources?.[0]?.Container
              if (!audioStream && !container) return null
              const parts: string[] = []
              if (audioStream?.Codec) parts.push(audioStream.Codec.toUpperCase())
              if (audioStream?.BitDepth && audioStream?.SampleRate) {
                parts.push(`${audioStream.BitDepth}-bit / ${(audioStream.SampleRate / 1000).toFixed(1)} kHz`)
              } else if (audioStream?.SampleRate) {
                parts.push(`${(audioStream.SampleRate / 1000).toFixed(1)} kHz`)
              }
              if (audioStream?.BitRate) {
                parts.push(`${Math.round(audioStream.BitRate / 1000)} kbps`)
              } else if (song.MediaSources?.[0]?.Bitrate) {
                parts.push(`${Math.round(song.MediaSources[0].Bitrate / 1000)} kbps`)
              }
              if (audioStream?.Channels) {
                parts.push(audioStream.Channels === 1 ? 'Mono' : audioStream.Channels === 2 ? 'Stereo' : `${audioStream.Channels}ch`)
              }
              if (parts.length === 0 && container) parts.push(container.toUpperCase())
              if (parts.length === 0) return null
              return <MetadataRow icon={FileAudio} label="Format" value={parts.join(' · ')} />
            })()}

            {/* Lyrics as a metadata row */}
            {(lyricsLoading || lyrics) && (
              <>
                {/* Desktop: icon + label + lyrics inline in grid */}
                <MicVocal className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1 hidden md:block" />
                <span className="text-gray-400 text-base flex-shrink-0 truncate hidden md:block" style={{ maxWidth: '128px' }}>Lyrics</span>
                <div className="hidden md:block">
                  {lyricsLoading ? (
                    <span className="text-base text-white/50">Loading...</span>
                  ) : lyrics ? (
                    <div className="text-white whitespace-pre-line text-base">
                      {lyrics.split('\n').map((line, index) => (
                        <div key={index} className="mb-1 leading-relaxed">
                          {line}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                {/* Mobile: icon + label on one line, lyrics below, spanning all columns */}
                <div className="md:hidden" style={{ gridColumn: '1 / -1' }}>
                  <div className="flex items-center gap-3 mb-3">
                    <MicVocal className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-400 text-base">Lyrics</span>
                  </div>
                  {lyricsLoading ? (
                    <div className="text-base text-white/50 pl-7">Loading...</div>
                  ) : lyrics ? (
                    <div className="text-white whitespace-pre-line text-base pl-7">
                      {lyrics.split('\n').map((line, index) => (
                        <div key={index} className="mb-1 leading-relaxed">
                          {line}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Context menu */}
      <ContextMenu
        item={song}
        itemType="song"
        isOpen={contextMenuOpen}
        onClose={() => setContextMenuOpen(false)}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </div>
  )
}

function MetadataRow({ icon: Icon, label, value, onClick }: { icon: LucideIcon; label: string; value: string; onClick?: () => void }) {
  return (
    <>
      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
      <span className="text-gray-400 text-base flex-shrink-0 truncate" style={{ maxWidth: '128px' }}>{label}</span>
      {onClick ? (
        <button
          onClick={onClick}
          className="text-base text-white hover:text-gray-300 transition-colors text-left break-all"
        >
          {value}
        </button>
      ) : (
        <span className="text-base text-white break-all">{value}</span>
      )}
    </>
  )
}
