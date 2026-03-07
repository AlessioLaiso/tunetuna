import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Music,
  User,
  Disc,
  Guitar,
  GalleryHorizontalEnd,
} from 'lucide-react'
import { jellyfinClient } from '../../api/jellyfin'
import { useStatsStore, type PlayEvent } from '../../stores/statsStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useMusicStore } from '../../stores/musicStore'
import { computeStats } from '../../utils/statsComputer'
import Pagination from '../shared/Pagination'

const ITEMS_PER_PAGE = 100

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

function formatMonthYear(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number)
  return `${SHORT_MONTH_NAMES[month - 1]} ${year}`
}

function formatHours(hours: number): string {
  if (hours >= 72) {
    const days = Math.floor(hours / 24)
    const remainingHours = Math.round(hours % 24)
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
  }
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

type Category = 'songs' | 'artists' | 'albums' | 'genres' | 'genre-decades'

const CATEGORY_CONFIG: Record<Category, { title: string; icon: typeof Music }> = {
  songs: { title: 'Top Songs', icon: Music },
  artists: { title: 'Top Artists', icon: User },
  albums: { title: 'Top Albums', icon: Disc },
  genres: { title: 'Top Genres', icon: Guitar },
  'genre-decades': { title: 'Top Genres \u00d7 Decade', icon: GalleryHorizontalEnd },
}

export default function StatsDetailPage() {
  const { category } = useParams<{ category: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)
  const playTrack = usePlayerStore(state => state.playTrack)
  const { fetchEvents, pendingEvents, metadataVersion } = useStatsStore()
  const { genres } = useMusicStore()

  const fromMonth = searchParams.get('from') || ''
  const toMonth = searchParams.get('to') || ''

  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<PlayEvent[]>([])
  const [page, setPage] = useState(0)
  const [albumArtistOverrides, setAlbumArtistOverrides] = useState<Record<string, string>>({})

  const cat = (category || 'songs') as Category
  const config = CATEGORY_CONFIG[cat]

  // Fetch events
  useEffect(() => {
    if (!fromMonth || !toMonth) {
      setLoading(false)
      return
    }

    const fetchData = async () => {
      setLoading(true)
      const [fromYear, fromM] = fromMonth.split('-').map(Number)
      const [toYear, toM] = toMonth.split('-').map(Number)
      const fromTs = new Date(fromYear, fromM - 1, 1).getTime()
      const toTs = new Date(toYear, toM, 0, 23, 59, 59, 999).getTime()
      const data = await fetchEvents(fromTs, toTs)
      setEvents(data)
      setLoading(false)
    }

    fetchData()
  }, [fromMonth, toMonth, fetchEvents, metadataVersion, pendingEvents.length])

  // Compute full stats (no limit)
  const stats = useMemo(() => {
    if (events.length === 0) return null
    const [fromYear, fromM] = fromMonth.split('-').map(Number)
    const [toYear, toM] = toMonth.split('-').map(Number)
    const fromDate = new Date(fromYear, fromM - 1, 1)
    const toDate = new Date(toYear, toM, 0)
    return computeStats(events, fromDate, toDate, { topLimit: Infinity })
  }, [events, fromMonth, toMonth])

  // Fetch album artist overrides for albums category
  useEffect(() => {
    if (cat !== 'albums' || !stats?.topAlbums.length) return

    const pageItems = stats.topAlbums.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE)
    const fetchAlbumArtists = async () => {
      const overrides: Record<string, string> = {}
      await Promise.all(
        pageItems.map(async (album) => {
          if (albumArtistOverrides[album.albumId]) return
          try {
            const albumDetails = await jellyfinClient.getAlbumById(album.albumId)
            if (albumDetails?.AlbumArtist) {
              overrides[album.albumId] = albumDetails.AlbumArtist
            }
          } catch { /* fallback to song artist */ }
        })
      )
      if (Object.keys(overrides).length > 0) {
        setAlbumArtistOverrides(prev => ({ ...prev, ...overrides }))
      }
    }
    fetchAlbumArtists()
  }, [cat, stats?.topAlbums, page])

  const handlePlaySong = async (songId: string) => {
    const song = await jellyfinClient.getSongById(songId)
    if (song) {
      playTrack(song, [song])
    }
  }

  // Get items for current category
  const items = useMemo(() => {
    if (!stats) return []
    switch (cat) {
      case 'songs': return stats.topSongs
      case 'artists': return stats.topArtists
      case 'albums': return stats.topAlbums
      case 'genres': return stats.topGenres
      case 'genre-decades': return stats.topGenreDecades
      default: return []
    }
  }, [stats, cat])

  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE)
  const pageItems = items.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE)

  // Build subtitle from date range
  const subtitle = fromMonth && toMonth
    ? fromMonth === toMonth
      ? formatMonthYear(fromMonth)
      : `${formatMonthYear(fromMonth)} - ${formatMonthYear(toMonth)}`
    : ''

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-zinc-600 border-t-[var(--accent-color)] rounded-full animate-spin mb-4" />
        <p className="text-zinc-500">Loading...</p>
      </div>
    )
  }

  if (!stats || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Music className="w-16 h-16 text-zinc-600 mb-4" />
        <h2 className="text-xl font-semibold text-zinc-300 mb-2">No data</h2>
      </div>
    )
  }

  const Icon = config?.icon || Music

  return (
    <div className="pb-32 lg:pb-20">
      {/* Fixed header */}
      <div
        className={`fixed top-0 left-0 right-0 bg-black z-[60] lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : ''}`}
        style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
      >
        <div className="max-w-[768px] mx-auto">
          <div className="flex items-center gap-3 py-4 pl-3 pr-4">
            <button
              onClick={() => navigate(-1)}
              className="text-white hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Icon className="w-5 h-5 text-zinc-400" />
                <h1 className="text-lg font-bold text-white truncate">{config?.title || 'Stats'}</h1>
              </div>
              {subtitle && (
                <p className="text-sm text-zinc-400 ml-7">{subtitle}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Spacer */}
      <div className="h-20" />

      <div className="px-4">
        {/* Songs */}
        {cat === 'songs' && (
          <div className="space-y-1">
            {(pageItems as typeof stats.topSongs).map((song, i) => {
              const rank = page * ITEMS_PER_PAGE + i + 1
              const imageUrl = jellyfinClient.getAlbumArtUrl(song.albumId, 96)
              return (
                <button
                  key={song.songId}
                  onClick={() => handlePlaySong(song.songId)}
                  className="flex items-center gap-3 w-full py-2 rounded-lg hover:bg-zinc-800/50 transition-colors text-left group"
                >
                  <div className="w-12 h-12 rounded-sm bg-zinc-700 overflow-hidden flex-shrink-0">
                    {imageUrl ? (
                      <img src={imageUrl} alt={song.songName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-5 h-5 text-zinc-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">
                      <span className="text-zinc-500 mr-2">{rank}</span>{song.songName}
                    </div>
                    <div className="text-zinc-400 text-sm truncate ml-[18px]">
                      <span
                        className="clickable-text"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (song.artistId) navigate(`/artist/${song.artistId}`)
                        }}
                      >
                        {song.artistName}
                      </span>
                    </div>
                  </div>
                  <div className="text-zinc-400 text-sm whitespace-nowrap">
                    {song.plays} streams
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Artists */}
        {cat === 'artists' && (
          <div className="space-y-1">
            {(pageItems as typeof stats.topArtists).map((artist, i) => {
              const rank = page * ITEMS_PER_PAGE + i + 1
              const imageUrl = jellyfinClient.getArtistImageUrl(artist.artistId, 96)
              return (
                <button
                  key={artist.artistId}
                  onClick={() => navigate(`/artist/${artist.artistId}`)}
                  className="flex items-center gap-3 w-full py-2 rounded-lg hover:bg-zinc-800/50 transition-colors text-left group"
                >
                  <div className="w-12 h-12 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
                    {imageUrl ? (
                      <img src={imageUrl} alt={artist.artistName} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User className="w-5 h-5 text-zinc-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">
                      <span className="text-zinc-500 mr-2">{rank}</span>{artist.artistName}
                    </div>
                  </div>
                  <div className="text-zinc-400 text-sm whitespace-nowrap">
                    {formatHours(artist.hours)}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Albums */}
        {cat === 'albums' && (
          <div className="space-y-1">
            {(pageItems as typeof stats.topAlbums).map((album, i) => {
              const rank = page * ITEMS_PER_PAGE + i + 1
              const imageUrl = jellyfinClient.getAlbumArtUrl(album.albumId, 96)
              const displayArtist = albumArtistOverrides[album.albumId] || album.artistName
              return (
                <button
                  key={album.albumId}
                  onClick={() => navigate(`/album/${album.albumId}`)}
                  className="flex items-center gap-3 w-full py-2 rounded-lg hover:bg-zinc-800/50 transition-colors text-left group"
                >
                  <div className="w-12 h-12 rounded-sm bg-zinc-700 overflow-hidden flex-shrink-0">
                    {imageUrl ? (
                      <img src={imageUrl} alt={album.albumName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc className="w-5 h-5 text-zinc-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">
                      <span className="text-zinc-500 mr-2">{rank}</span>{album.albumName}
                    </div>
                    <div className="text-zinc-400 text-sm truncate ml-[18px]">
                      <span
                        className="clickable-text"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (album.artistId) navigate(`/artist/${album.artistId}`)
                        }}
                      >
                        {displayArtist}
                      </span>
                    </div>
                  </div>
                  <div className="text-zinc-400 text-sm whitespace-nowrap">
                    {formatHours(album.hours)}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Genres */}
        {cat === 'genres' && (() => {
          const genreItems = pageItems as typeof stats.topGenres
          const maxHours = stats.topGenres.length > 0 ? stats.topGenres[0].hours : 0
          return (
            <div>
              {genreItems.map((genre, i) => {
                const rank = page * ITEMS_PER_PAGE + i + 1
                const percentage = maxHours > 0 ? (genre.hours / maxHours) * 100 : 0
                const genreItem = genres.find(g => g.Name?.toLowerCase() === genre.genre.toLowerCase())
                return (
                  <button
                    key={genre.genre}
                    onClick={genreItem ? () => navigate(`/genre/${encodeURIComponent(genreItem.Id)}`) : undefined}
                    className="flex items-center gap-3 mb-2 w-full cursor-pointer hover:bg-zinc-800/50 rounded-lg py-1 transition-colors group"
                  >
                    <div className="w-8 text-zinc-500 text-sm text-right flex-shrink-0">{rank}</div>
                    <div className="w-36 text-zinc-300 text-sm truncate flex-shrink-0 text-left group-hover:text-[var(--accent-color)] transition-colors">{genre.genre}</div>
                    <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden min-w-0">
                      <div
                        className="h-full bg-[var(--accent-color)] rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="w-16 text-zinc-400 text-sm text-right flex-shrink-0">{formatHours(genre.hours)}</div>
                  </button>
                )
              })}
            </div>
          )
        })()}

        {/* Genre x Decades */}
        {cat === 'genre-decades' && (() => {
          const comboItems = pageItems as typeof stats.topGenreDecades
          const maxHours = stats.topGenreDecades.length > 0 ? stats.topGenreDecades[0].hours : 0
          return (
            <div>
              {comboItems.map((combo, i) => {
                const rank = page * ITEMS_PER_PAGE + i + 1
                const percentage = maxHours > 0 ? (combo.hours / maxHours) * 100 : 0
                const decadeStart = parseInt(combo.decade.replace('s', ''), 10)
                const decadeEnd = decadeStart + 9
                return (
                  <button
                    key={`${combo.genre}-${combo.decade}`}
                    onClick={() => navigate(`/?yearMin=${decadeStart}&yearMax=${decadeEnd}&genre=${encodeURIComponent(combo.genre)}`)}
                    className="flex items-center gap-3 mb-2 w-full cursor-pointer hover:bg-zinc-800/50 rounded-lg py-1 transition-colors group"
                  >
                    <div className="w-8 text-zinc-500 text-sm text-right flex-shrink-0">{rank}</div>
                    <div className="w-44 text-zinc-300 text-sm truncate flex-shrink-0 text-left group-hover:text-[var(--accent-color)] transition-colors">{combo.decade} {combo.genre}</div>
                    <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden min-w-0">
                      <div
                        className="h-full bg-[var(--accent-color)] rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="w-16 text-zinc-400 text-sm text-right flex-shrink-0">{formatHours(combo.hours)}</div>
                  </button>
                )
              })}
            </div>
          )
        })()}

        {/* Pagination */}
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={(p) => { setPage(p); window.scrollTo(0, 0) }}
          itemsPerPage={ITEMS_PER_PAGE}
          totalItems={items.length}
        />
      </div>
    </div>
  )
}
