import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Music,
  Clock,
  TrendingUp,
  Flame,
  ChevronDown,
  Disc,
  User,
  Guitar,
  CalendarDays,
  GalleryHorizontalEnd,
} from 'lucide-react'
import { jellyfinClient } from '../../api/jellyfin'
import { useStatsStore, type PlayEvent } from '../../stores/statsStore'
import { usePlayerStore } from '../../stores/playerStore'
import { computeStats } from '../../utils/statsComputer'

// Month names for display
const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

interface MonthOption {
  value: string // "2025-04"
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

  return options.reverse() // Most recent first
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

function formatHours(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)} min`
  }
  if (hours < 10) {
    return `${hours.toFixed(1)}h`
  }
  return `${Math.round(hours)}h`
}

function formatHoursAndMinutesParts(hours: number): { value: number; unit: string; value2?: number; unit2?: string } {
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return { value: m, unit: 'min' }
  if (m === 0) return { value: h, unit: 'h' }
  return { value: h, unit: 'h', value2: m, unit2: 'min' }
}

function formatMonthShort(monthStr: string, showYear = false): string {
  const [year, month] = monthStr.split('-').map(Number)
  return showYear ? `${SHORT_MONTH_NAMES[month - 1]} ${year}` : SHORT_MONTH_NAMES[month - 1]
}

function formatMonthYear(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number)
  return `${SHORT_MONTH_NAMES[month - 1]} ${year}`
}

// Check if a date range has the same month in different years (e.g., Feb 2025 to Mar 2026 has Feb twice)
function rangeHasDuplicateMonths(fromMonth: string, toMonth: string): boolean {
  const [fromYear, fromM] = fromMonth.split('-').map(Number)
  const [toYear, toM] = toMonth.split('-').map(Number)

  // If same year, no duplicates possible
  if (fromYear === toYear) return false

  // If more than 12 months apart, definitely has duplicates
  const totalMonths = (toYear - fromYear) * 12 + (toM - fromM)
  if (totalMonths >= 12) return true

  // Check if any month number appears in both year ranges
  // e.g., Feb 2025 to Mar 2026: Feb appears twice (2025 and 2026)
  return toM >= fromM
}

// Badge component for single-day plays
function SingleDayPlaysBadge({ count, date, showYear }: { count: number; date: string; showYear: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-orange-400 text-sm mt-1">
      <Flame className="w-3.5 h-3.5" />
      <span>{count} plays on {new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(showYear && { year: 'numeric' }),
      })}</span>
    </div>
  )
}

// Section header component
function SectionHeader({ icon: Icon, title }: { icon: typeof Music; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 mt-8">
      <Icon className="w-5 h-5 text-zinc-400" />
      <h2 className="text-lg font-semibold text-zinc-300">{title}</h2>
    </div>
  )
}

// Timeline card component
function TimelineCard({
  month,
  artistName,
  artistId,
  hours,
  showYear,
  isTop,
  onClick,
}: {
  month: string
  artistName: string
  artistId: string
  hours: number
  showYear: boolean
  isTop: boolean
  onClick: () => void
}) {
  const imageUrl = jellyfinClient.getArtistImageUrl(artistId, 120)

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors text-center border ${isTop ? 'border-[var(--accent-color)]' : 'border-zinc-700'}`}
    >
      <div className="text-zinc-500 text-xs font-medium mb-2">
        {formatMonthShort(month, showYear)}
      </div>
      <div className="w-16 h-16 rounded-full bg-zinc-700 overflow-hidden mb-2">
        {imageUrl ? (
          <img src={imageUrl} alt={artistName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className="w-6 h-6 text-zinc-500" />
          </div>
        )}
      </div>
      <div className="font-medium text-white text-sm truncate w-full">{artistName}</div>
      <div className={`text-xs ${isTop ? 'text-[var(--accent-color)]' : 'text-zinc-400'}`}>{formatHours(hours)}</div>
    </button>
  )
}

// Top song item component
function TopSongItem({
  rank,
  songName,
  artistName,
  albumId,
  plays,
  singleDayPlays,
  showYear,
  onClick,
}: {
  rank: number
  songName: string
  artistName: string
  albumId: string
  plays: number
  singleDayPlays?: { count: number; date: string }
  showYear: boolean
  onClick: () => void
}) {
  const imageSize = rank === 1 ? 120 : rank === 2 ? 80 : 48
  const sizeClass = rank === 1 ? 'w-[120px] h-[120px]' : rank === 2 ? 'w-[80px] h-[80px]' : 'w-12 h-12'
  const iconSize = rank === 1 ? 'w-10 h-10' : rank === 2 ? 'w-8 h-8' : 'w-5 h-5'
  const leftPadding = rank === 1 ? '' : rank === 2 ? 'pl-10' : 'pl-[72px]'
  const imageUrl = jellyfinClient.getAlbumArtUrl(albumId, imageSize)

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full py-2 rounded-lg hover:bg-zinc-800/50 transition-colors text-left ${leftPadding}`}
    >
      <div className={`${sizeClass} rounded-sm bg-zinc-700 overflow-hidden flex-shrink-0`}>
        {imageUrl ? (
          <img src={imageUrl} alt={songName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className={`${iconSize} text-zinc-500`} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-medium text-white truncate ${rank === 1 ? 'text-lg' : ''}`}>
          <span className="text-zinc-500 mr-2">{rank}</span>{songName}
        </div>
        <div className="text-zinc-400 text-sm truncate ml-5">{artistName}</div>
        {singleDayPlays && (
          <div className="ml-5"><SingleDayPlaysBadge count={singleDayPlays.count} date={singleDayPlays.date} showYear={showYear} /></div>
        )}
      </div>
      <div className="text-zinc-400 text-sm whitespace-nowrap">
        {plays} plays
      </div>
    </button>
  )
}

// Top artist item component
function TopArtistItem({
  rank,
  artistName,
  artistId,
  hours,
  onClick,
}: {
  rank: number
  artistName: string
  artistId: string
  hours: number
  onClick: () => void
}) {
  const imageSize = rank === 1 ? 120 : rank === 2 ? 80 : 48
  const sizeClass = rank === 1 ? 'w-[120px] h-[120px]' : rank === 2 ? 'w-[80px] h-[80px]' : 'w-12 h-12'
  const iconSize = rank === 1 ? 'w-10 h-10' : rank === 2 ? 'w-8 h-8' : 'w-5 h-5'
  const leftPadding = rank === 1 ? '' : rank === 2 ? 'pl-10' : 'pl-[72px]'
  const imageUrl = jellyfinClient.getArtistImageUrl(artistId, imageSize)

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full py-2 rounded-lg hover:bg-zinc-800/50 transition-colors text-left ${leftPadding}`}
    >
      <div className={`${sizeClass} rounded-full bg-zinc-700 overflow-hidden flex-shrink-0`}>
        {imageUrl ? (
          <img src={imageUrl} alt={artistName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className={`${iconSize} text-zinc-500`} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-medium text-white truncate ${rank === 1 ? 'text-lg' : ''}`}>
          <span className="text-zinc-500 mr-2">{rank}</span>{artistName}
        </div>
      </div>
      <div className="text-zinc-400 text-sm whitespace-nowrap">
        {formatHours(hours)}
      </div>
    </button>
  )
}

// Bar chart for genres/decades
function HorizontalBar({
  label,
  value,
  maxValue,
  color = 'bg-[var(--accent-color)]',
}: {
  label: string
  value: number
  maxValue: number
  color?: string
}) {
  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0

  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="w-44 text-zinc-300 text-sm truncate flex-shrink-0">{label}</div>
      <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden min-w-0">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="w-14 text-zinc-400 text-sm text-right flex-shrink-0">{formatHours(value)}</div>
    </div>
  )
}

// Month picker dropdown
function MonthPicker({
  value,
  options,
  onChange,
}: {
  value: string
  options: MonthOption[]
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-zinc-800 text-white rounded-lg px-3 py-2 pr-8 text-sm font-medium cursor-pointer hover:bg-zinc-700 transition-colors"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {formatMonthYear(opt.value)}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
    </div>
  )
}

// Empty state
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Music className="w-16 h-16 text-zinc-600 mb-4" />
      <h2 className="text-xl font-semibold text-zinc-300 mb-2">No listening data yet</h2>
      <p className="text-zinc-500 max-w-sm">
        Start playing music to see your stats here
      </p>
    </div>
  )
}

// Loading state
function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-zinc-600 border-t-[var(--accent-color)] rounded-full animate-spin mb-4" />
      <p className="text-zinc-500">Loading your stats...</p>
    </div>
  )
}

// Top album item component
function TopAlbumItem({
  rank,
  albumName,
  artistName,
  albumId,
  hours,
  onClick,
}: {
  rank: number
  albumName: string
  artistName: string
  albumId: string
  hours: number
  onClick: () => void
}) {
  const imageSize = rank === 1 ? 120 : rank === 2 ? 80 : 48
  const sizeClass = rank === 1 ? 'w-[120px] h-[120px]' : rank === 2 ? 'w-[80px] h-[80px]' : 'w-12 h-12'
  const iconSize = rank === 1 ? 'w-10 h-10' : rank === 2 ? 'w-8 h-8' : 'w-5 h-5'
  const leftPadding = rank === 1 ? '' : rank === 2 ? 'pl-10' : 'pl-[72px]'
  const imageUrl = jellyfinClient.getAlbumArtUrl(albumId, imageSize)

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full py-2 rounded-lg hover:bg-zinc-800/50 transition-colors text-left ${leftPadding}`}
    >
      <div className={`${sizeClass} rounded-sm bg-zinc-700 overflow-hidden flex-shrink-0`}>
        {imageUrl ? (
          <img src={imageUrl} alt={albumName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Disc className={`${iconSize} text-zinc-500`} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-medium text-white truncate ${rank === 1 ? 'text-lg' : ''}`}>
          <span className="text-zinc-500 mr-2">{rank}</span>{albumName}
        </div>
        <div className="text-zinc-400 text-sm truncate ml-5">{artistName}</div>
      </div>
      <div className="text-zinc-400 text-sm whitespace-nowrap">
        {formatHours(hours)}
      </div>
    </button>
  )
}

// Main component
export default function StatsPage() {
  const navigate = useNavigate()
  const { fetchEvents, cachedEvents } = useStatsStore()
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)

  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<PlayEvent[]>([])
  const [fromMonth, setFromMonth] = useState<string>('')
  const [toMonth, setToMonth] = useState<string>('')

  // Get oldest event timestamp for month options
  const oldestTs = useMemo(() => {
    if (cachedEvents.length === 0) return null
    return Math.min(...cachedEvents.map(e => e.ts))
  }, [cachedEvents])

  const monthOptions = useMemo(() => generateMonthOptions(oldestTs), [oldestTs])

  // Set default range on mount
  useEffect(() => {
    const { from, to } = getDefaultRange(oldestTs)
    setFromMonth(from)
    setToMonth(to)
  }, [oldestTs])

  // Fetch events when range changes
  useEffect(() => {
    if (!fromMonth || !toMonth) {
      setLoading(false)
      return
    }

    const fetchData = async () => {
      setLoading(true)

      // Convert month strings to timestamps
      const [fromYear, fromM] = fromMonth.split('-').map(Number)
      const [toYear, toM] = toMonth.split('-').map(Number)

      const fromTs = new Date(fromYear, fromM - 1, 1).getTime()
      const toTs = new Date(toYear, toM, 0, 23, 59, 59, 999).getTime() // Last moment of the month

      const data = await fetchEvents(fromTs, toTs)
      setEvents(data)
      setLoading(false)
    }

    fetchData()
  }, [fromMonth, toMonth, fetchEvents])

  // Compute stats from events
  const stats = useMemo(() => {
    if (events.length === 0) return null

    const [fromYear, fromM] = fromMonth.split('-').map(Number)
    const [toYear, toM] = toMonth.split('-').map(Number)

    const fromDate = new Date(fromYear, fromM - 1, 1)
    const toDate = new Date(toYear, toM, 0)

    return computeStats(events, fromDate, toDate)
  }, [events, fromMonth, toMonth])

  if (loading) {
    return <LoadingState />
  }

  if (!stats || events.length === 0) {
    return <EmptyState />
  }

  const maxGenreHours = Math.max(...stats.topGenres.map(g => g.hours))
  const maxDecadeHours = Math.max(...stats.decades.map(d => d.hours))

  return (
    <div className="pb-32 lg:pb-20">
      {/* Header */}
      <div
        className={`fixed top-0 left-0 right-0 bg-black z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
      >
        <div className="max-w-[768px] mx-auto">
          <div className="p-4 pb-0 sm:pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <h1 className="text-2xl font-bold text-white">Tunetuna Canned</h1>
              <div className="flex gap-2 items-center">
                <MonthPicker
                  value={fromMonth}
                  options={monthOptions}
                  onChange={setFromMonth}
                />
                <span className="text-zinc-500">to</span>
                <MonthPicker
                  value={toMonth}
                  options={monthOptions}
                  onChange={setToMonth}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spacer for fixed header */}
      <div className="h-28 sm:h-16" />

      <div className="px-4">
        {/* Summary cards */}
        <div className="flex flex-col md:flex-row gap-4 mt-6">
          <div className="flex-1 bg-zinc-800/50 rounded-2xl p-5 border border-zinc-700/50">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <Music className="w-5 h-5" />
              <span className="text-sm font-medium">Songs Played</span>
            </div>
            <div className="text-4xl font-bold text-white">
              {stats.totalSongs.toLocaleString()}
            </div>
          </div>
          <div className="flex-1 bg-zinc-800/50 rounded-2xl p-5 border border-zinc-700/50">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <Clock className="w-5 h-5" />
              <span className="text-sm font-medium">Time Listened</span>
            </div>
            <div className="text-4xl font-bold text-white">
              {(() => {
                const parts = formatHoursAndMinutesParts(stats.totalHours)
                return (
                  <>
                    {parts.value}<span className="text-lg font-normal text-zinc-400">{parts.unit}</span>
                    {parts.value2 !== undefined && (
                      <> {parts.value2}<span className="text-lg font-normal text-zinc-400">{parts.unit2}</span></>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
          {stats.mostListeningDay && (
            <div className="flex-1 bg-zinc-800/50 rounded-2xl p-5 border border-zinc-700/50">
              <div className="flex items-center gap-2 text-zinc-400 mb-2">
                <TrendingUp className="w-5 h-5" />
                <span className="text-sm font-medium">
                  Top Day: {new Date(stats.mostListeningDay.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    ...(rangeHasDuplicateMonths(fromMonth, toMonth) && { year: 'numeric' }),
                  })}
                </span>
              </div>
              <div className="text-4xl font-bold text-white">
                {(() => {
                  const parts = formatHoursAndMinutesParts(stats.mostListeningDay.hours)
                  return (
                    <>
                      {parts.value}<span className="text-lg font-normal text-zinc-400">{parts.unit}</span>
                      {parts.value2 !== undefined && (
                        <> {parts.value2}<span className="text-lg font-normal text-zinc-400">{parts.unit2}</span></>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Top Songs */}
        <SectionHeader icon={Music} title="Top Songs" />
        <div className="space-y-1">
          {(() => {
            const top5 = stats.topSongs.slice(0, 5)
            const showYear = rangeHasDuplicateMonths(fromMonth, toMonth)
            // Find the song with the highest single-day plays among top 5
            const bestDaySong = top5.reduce((best, song) => {
              if (!song.obsessedDetail) return best
              if (!best || (song.obsessedDetail.count > (best.obsessedDetail?.count || 0))) {
                return song
              }
              return best
            }, null as typeof top5[0] | null)

            return top5.map((song, i) => (
              <TopSongItem
                key={song.songId}
                rank={i + 1}
                songName={song.songName}
                artistName={song.artistName}
                albumId={song.albumId}
                plays={song.plays}
                singleDayPlays={bestDaySong?.songId === song.songId ? song.obsessedDetail : undefined}
                showYear={showYear}
                onClick={() => navigate(`/album/${song.albumId}`)}
              />
            ))
          })()}
        </div>

        {/* Top Artists */}
        <SectionHeader icon={User} title="Top Artists" />
        <div className="space-y-1">
          {stats.topArtists.slice(0, 5).map((artist, i) => (
            <TopArtistItem
              key={artist.artistId}
              rank={i + 1}
              artistName={artist.artistName}
              artistId={artist.artistId}
              hours={artist.hours}
              onClick={() => navigate(`/artist/${artist.artistId}`)}
            />
          ))}
        </div>

        {/* Top Albums */}
        {stats.topAlbums.length > 0 && (
          <>
            <SectionHeader icon={Disc} title="Top Albums" />
            <div className="space-y-1">
              {stats.topAlbums.slice(0, 5).map((album, i) => (
                <TopAlbumItem
                  key={album.albumId}
                  rank={i + 1}
                  albumName={album.albumName}
                  artistName={album.artistName}
                  albumId={album.albumId}
                  hours={album.hours}
                  onClick={() => navigate(`/album/${album.albumId}`)}
                />
              ))}
            </div>
          </>
        )}

        {/* Top Genres */}
        {stats.topGenres.length > 0 && (
          <>
            <SectionHeader icon={Guitar} title="Top Genres" />
            <div>
              {stats.topGenres.slice(0, 5).map((genre) => (
                <HorizontalBar
                  key={genre.genre}
                  label={genre.genre}
                  value={genre.hours}
                  maxValue={maxGenreHours}
                />
              ))}
            </div>
          </>
        )}

        {/* Decades */}
        {stats.decades.length > 0 && (
          <>
            <SectionHeader icon={Clock} title="Top Decades" />
            <div>
              {stats.decades.slice().reverse().map((decade) => (
                <HorizontalBar
                  key={decade.decade}
                  label={decade.decade}
                  value={decade.hours}
                  maxValue={maxDecadeHours}
                />
              ))}
            </div>
          </>
        )}

        {/* Top Genres × Decade */}
        {stats.topGenreDecades.length > 0 && (
          <>
            <SectionHeader icon={GalleryHorizontalEnd} title="Top Genres × Decade" />
            <div>
              {stats.topGenreDecades.map((combo) => (
                <HorizontalBar
                  key={`${combo.genre}-${combo.decade}`}
                  label={`${combo.decade} ${combo.genre}`}
                  value={combo.hours}
                  maxValue={stats.topGenreDecades[0].hours}
                />
              ))}
            </div>
          </>
        )}

        {/* Top Artist by Month */}
        {stats.timeline.length >= 2 && (
          <>
            <SectionHeader icon={CalendarDays} title="Top Artist by Month" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(() => {
                const showYear = rangeHasDuplicateMonths(fromMonth, toMonth)
                const maxHours = Math.max(...stats.timeline.map(t => t.hours))
                return stats.timeline.map((item) => (
                  <TimelineCard
                    key={item.month}
                    month={item.month}
                    artistName={item.artistName}
                    artistId={item.artistId}
                    hours={item.hours}
                    showYear={showYear}
                    isTop={item.hours === maxHours}
                    onClick={() => navigate(`/artist/${item.artistId}`)}
                  />
                ))
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
