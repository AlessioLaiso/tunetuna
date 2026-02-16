import { useState, useEffect, useMemo, useRef } from 'react'
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
  Image as ImageIcon,
  Download,
  X,
  CirclePlay,
} from 'lucide-react'
import { jellyfinClient } from '../../api/jellyfin'
import { useStatsStore, type PlayEvent } from '../../stores/statsStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useMusicStore } from '../../stores/musicStore'
import { computeStats, type ComputedStats } from '../../utils/statsComputer'
import type { BaseItemDto } from '../../api/types'
import StatsCannedImage from './StatsCannedImage'
import html2canvas from 'html2canvas'
import { logger } from '../../utils/logger'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'

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

function formatHoursAndMinutesParts(hours: number): { value: number; unit: string; value2?: number; unit2?: string } {
  if (hours >= 72) {
    const days = Math.floor(hours / 24)
    const remainingHours = Math.round(hours % 24)
    if (remainingHours === 0) return { value: days, unit: 'd' }
    return { value: days, unit: 'd', value2: remainingHours, unit2: 'h' }
  }
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
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    setImageUrl(jellyfinClient.getArtistImageUrl(artistId, 240))
  }, [artistId])

  const handleImageError = async () => {
    try {
      const { albums, songs } = await jellyfinClient.getArtistItems(artistId)
      const firstAlbum = albums[0]
      const firstSongWithAlbum = songs.find((song) => song.AlbumId) || songs[0]
      const artItem = firstAlbum || firstSongWithAlbum
      const artId = artItem ? (artItem.AlbumId || artItem.Id) : null

      if (artId) {
        setImageUrl(jellyfinClient.getAlbumArtUrl(artId, 240))
      } else {
        setImageUrl(null)
      }
    } catch {
      setImageUrl(null)
    }
  }

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
          <img src={imageUrl} alt={artistName} className="w-full h-full object-cover" onError={handleImageError} />
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
  songId,
  songName,
  artistName,
  artistId,
  albumId,
  plays,
  singleDayPlays,
  showYear,
  onPlay,
}: {
  rank: number
  songId: string
  songName: string
  artistName: string
  artistId: string
  albumId: string
  plays: number
  singleDayPlays?: { count: number; date: string }
  showYear: boolean
  onPlay: (songId: string) => void
}) {
  const imageSize = rank === 1 ? 240 : rank === 2 ? 160 : 96
  const sizeClass = rank === 1 ? 'w-12 h-12 md:w-[120px] md:h-[120px]' : rank === 2 ? 'w-12 h-12 md:w-[80px] md:h-[80px]' : 'w-12 h-12'
  const iconSize = rank === 1 ? 'w-5 h-5 md:w-10 md:h-10' : rank === 2 ? 'w-5 h-5 md:w-8 md:h-8' : 'w-5 h-5'
  const leftPadding = rank === 1 ? 'md:pl-0' : rank === 2 ? 'md:pl-10' : 'pl-0 md:pl-[72px]'
  const imageUrl = jellyfinClient.getAlbumArtUrl(albumId, imageSize)

  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const contextMenuJustOpenedRef = useRef(false)

  const songItem = {
    Id: songId,
    Name: songName,
    AlbumId: albumId,
    Album: 'Album', // Placeholder as we don't have album name
    ArtistItems: [{ Id: artistId, Name: artistName }],
    Type: 'Audio',
    RunTimeTicks: 0
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuJustOpenedRef.current = true
    setContextMenuMode('desktop')
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
    setContextMenuOpen(true)
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 300)
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      setContextMenuMode('mobile')
      setContextMenuPosition(null)
      setContextMenuOpen(true)
    },
  })

  return (
    <>
      <button
        onClick={(e) => {
          if (contextMenuOpen || contextMenuJustOpenedRef.current) {
            e.preventDefault()
            e.stopPropagation()
            return
          }
          onPlay(songId)
        }}
        onContextMenu={handleContextMenu}
        {...longPressHandlers}
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
          <div className={`font-medium text-white truncate ${rank === 1 ? 'md:text-lg' : ''}`}>
            <span className="text-zinc-500 mr-2">{rank}</span>{songName}
          </div>
          <div className="text-zinc-400 text-sm truncate ml-[18px]">{artistName}</div>
          {singleDayPlays && (
            <div className="ml-[18px]"><SingleDayPlaysBadge count={singleDayPlays.count} date={singleDayPlays.date} showYear={showYear} /></div>
          )}
        </div>
        <div className="text-zinc-400 text-sm whitespace-nowrap">
          {plays} streams
        </div>
      </button>
      <ContextMenu
        item={songItem as BaseItemDto}
        itemType="song"
        isOpen={contextMenuOpen}
        onClose={() => setContextMenuOpen(false)}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </>
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
  const imageSize = rank === 1 ? 240 : rank === 2 ? 160 : 96
  const sizeClass = rank === 1 ? 'w-12 h-12 md:w-[120px] md:h-[120px]' : rank === 2 ? 'w-12 h-12 md:w-[80px] md:h-[80px]' : 'w-12 h-12'
  const iconSize = rank === 1 ? 'w-5 h-5 md:w-10 md:h-10' : rank === 2 ? 'w-5 h-5 md:w-8 md:h-8' : 'w-5 h-5'
  const leftPadding = rank === 1 ? 'md:pl-0' : rank === 2 ? 'md:pl-10' : 'pl-0 md:pl-[72px]'
  const imageUrl = jellyfinClient.getArtistImageUrl(artistId, imageSize)
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null)

  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const contextMenuJustOpenedRef = useRef(false)

  const artistItem = {
    Id: artistId,
    Name: artistName,
    Type: 'MusicArtist'
  }

  useEffect(() => {
    setCurrentImageUrl(imageUrl)
  }, [imageUrl])

  const handleImageError = async () => {
    try {
      const { albums, songs } = await jellyfinClient.getArtistItems(artistId)
      const firstAlbum = albums[0]
      const firstSongWithAlbum = songs.find((song) => song.AlbumId) || songs[0]
      const artItem = firstAlbum || firstSongWithAlbum
      const artId = artItem ? (artItem.AlbumId || artItem.Id) : null

      if (artId) {
        setCurrentImageUrl(jellyfinClient.getAlbumArtUrl(artId, imageSize))
      } else {
        setCurrentImageUrl(null)
      }
    } catch {
      setCurrentImageUrl(null)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuJustOpenedRef.current = true
    setContextMenuMode('desktop')
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
    setContextMenuOpen(true)
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 300)
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      setContextMenuMode('mobile')
      setContextMenuPosition(null)
      setContextMenuOpen(true)
    },
  })

  return (
    <>
      <button
        onClick={(e) => {
          if (contextMenuOpen || contextMenuJustOpenedRef.current) {
            e.preventDefault()
            e.stopPropagation()
            return
          }
          onClick()
        }}
        onContextMenu={handleContextMenu}
        {...longPressHandlers}
        className={`flex items-center gap-3 w-full py-2 rounded-lg hover:bg-zinc-800/50 transition-colors text-left ${leftPadding}`}
      >
        <div className={`${sizeClass} rounded-full bg-zinc-700 overflow-hidden flex-shrink-0`}>
          {currentImageUrl ? (
            <img src={currentImageUrl} alt={artistName} className="w-full h-full object-cover" onError={handleImageError} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className={`${iconSize} text-zinc-500`} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-medium text-white truncate ${rank === 1 ? 'md:text-lg' : ''}`}>
            <span className="text-zinc-500 mr-2">{rank}</span>{artistName}
          </div>
        </div>
        <div className="text-zinc-400 text-sm whitespace-nowrap">
          {formatHours(hours)}
        </div>
      </button>
      <ContextMenu
        item={artistItem as BaseItemDto}
        itemType="artist"
        isOpen={contextMenuOpen}
        onClose={() => setContextMenuOpen(false)}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </>
  )
}

// Bar chart for genres/decades
function HorizontalBar({
  label,
  value,
  maxValue,
  color = 'bg-[var(--accent-color)]',
  onClick,
}: {
  label: string
  value: number
  maxValue: number
  color?: string
  onClick?: () => void
}) {
  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0

  const Container = onClick ? 'button' : 'div'
  const containerProps = onClick
    ? { onClick, className: 'flex items-center gap-3 mb-2 w-full cursor-pointer hover:bg-zinc-800/50 rounded-lg py-1 -mx-2 px-2 transition-colors' }
    : { className: 'flex items-center gap-3 mb-2' }

  return (
    <Container {...containerProps}>
      <div className="w-44 text-zinc-300 text-sm truncate flex-shrink-0 text-left">{label}</div>
      <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden min-w-0">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="w-16 text-zinc-400 text-sm text-right flex-shrink-0">{formatHours(value)}</div>
    </Container>
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
  artistId,
  albumId,
  hours,
  onClick,
}: {
  rank: number
  albumName: string
  artistName: string
  artistId: string
  albumId: string
  hours: number
  onClick: () => void
}) {
  const imageSize = rank === 1 ? 240 : rank === 2 ? 160 : 96
  const sizeClass = rank === 1 ? 'w-12 h-12 md:w-[120px] md:h-[120px]' : rank === 2 ? 'w-12 h-12 md:w-[80px] md:h-[80px]' : 'w-12 h-12'
  const iconSize = rank === 1 ? 'w-5 h-5 md:w-10 md:h-10' : rank === 2 ? 'w-5 h-5 md:w-8 md:h-8' : 'w-5 h-5'
  const leftPadding = rank === 1 ? 'md:pl-0' : rank === 2 ? 'md:pl-10' : 'pl-0 md:pl-[72px]'
  const imageUrl = jellyfinClient.getAlbumArtUrl(albumId, imageSize)

  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const contextMenuJustOpenedRef = useRef(false)

  const albumItem = {
    Id: albumId,
    Name: albumName,
    ArtistItems: [{ Id: artistId, Name: artistName }],
    Type: 'MusicAlbum'
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuJustOpenedRef.current = true
    setContextMenuMode('desktop')
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
    setContextMenuOpen(true)
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 300)
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      setContextMenuMode('mobile')
      setContextMenuPosition(null)
      setContextMenuOpen(true)
    },
  })

  return (
    <>
      <button
        onClick={(e) => {
          if (contextMenuOpen || contextMenuJustOpenedRef.current) {
            e.preventDefault()
            e.stopPropagation()
            return
          }
          onClick()
        }}
        onContextMenu={handleContextMenu}
        {...longPressHandlers}
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
          <div className={`font-medium text-white truncate ${rank === 1 ? 'md:text-lg' : ''}`}>
            <span className="text-zinc-500 mr-2">{rank}</span>{albumName}
          </div>
          <div className="text-zinc-400 text-sm truncate ml-[18px]">{artistName}</div>
        </div>
        <div className="text-zinc-400 text-sm whitespace-nowrap">
          {formatHours(hours)}
        </div>
      </button>
      <ContextMenu
        item={albumItem as BaseItemDto}
        itemType="album"
        isOpen={contextMenuOpen}
        onClose={() => setContextMenuOpen(false)}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </>
  )
}

// Main component
export default function StatsPage() {
  const navigate = useNavigate()
  const { fetchEvents, oldestEventTs, initializeOldestTs, pendingEvents, metadataVersion } = useStatsStore()
  const { genres } = useMusicStore()
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)
  const playTrack = usePlayerStore(state => state.playTrack)

  // Handler to play a song by ID
  const handlePlaySong = async (songId: string) => {
    const song = await jellyfinClient.getSongById(songId)
    if (song) {
      playTrack(song, [song])
    }
  }

  // Handler to download the stats image
  const handleDownloadImage = async () => {
    // We target the export version which is off-screen but full resolution and unscaled
    const element = document.getElementById('stats-canned-image-export')
    if (!element) return

    try {
      const canvas = await html2canvas(element, {
        scale: 1, // Capture at 1:1 scale of the element (which is 1015x1350)
        backgroundColor: '#0a0a0a',
        useCORS: true,
        allowTaint: true,
        logging: false,
      })

      const link = document.createElement('a')
      link.download = `tunetuna-canned-${fromMonth}-${toMonth}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (error) {
      logger.error('Error generating image:', error)
    }
  }

  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<PlayEvent[]>([])
  const [fromMonth, setFromMonth] = useState<string>('')
  const [toMonth, setToMonth] = useState<string>('')
  const [showCannedModal, setShowCannedModal] = useState(false)

  // Initialize oldest timestamp on mount if not already set
  useEffect(() => {
    if (oldestEventTs === null) {
      initializeOldestTs()
    }
  }, [oldestEventTs, initializeOldestTs])

  // Compute effective oldest timestamp (from store or pending events)
  const effectiveOldestTs = useMemo(() => {
    // Combine stored oldest with pending events to get true oldest
    const timestamps = [oldestEventTs, ...pendingEvents.map(e => e.ts)].filter((t): t is number => t !== null)
    return timestamps.length > 0 ? Math.min(...timestamps) : null
  }, [oldestEventTs, pendingEvents])

  const monthOptions = useMemo(() => generateMonthOptions(effectiveOldestTs), [effectiveOldestTs])

  // Set default range on mount
  useEffect(() => {
    const { from, to } = getDefaultRange(effectiveOldestTs)
    setFromMonth(from)
    setToMonth(to)
  }, [effectiveOldestTs])

  // Fetch events when range changes or metadata updates
  useEffect(() => {
    if (!fromMonth || !toMonth) {
      setLoading(false)
      setEvents([])
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
  }, [fromMonth, toMonth, fetchEvents, metadataVersion, pendingEvents.length])

  // Compute stats from events
  const stats = useMemo(() => {
    if (events.length === 0) return null

    const [fromYear, fromM] = fromMonth.split('-').map(Number)
    const [toYear, toM] = toMonth.split('-').map(Number)

    const fromDate = new Date(fromYear, fromM - 1, 1)
    const toDate = new Date(toYear, toM, 0)

    return computeStats(events, fromDate, toDate)
  }, [events, fromMonth, toMonth])

  // Fetch album artist names for top albums (prefer album artist over song artist)
  const [albumArtistOverrides, setAlbumArtistOverrides] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!stats?.topAlbums.length) return

    const fetchAlbumArtists = async () => {
      const overrides: Record<string, string> = {}

      await Promise.all(
        stats.topAlbums.map(async (album) => {
          try {
            const albumDetails = await jellyfinClient.getAlbumById(album.albumId)
            if (albumDetails?.AlbumArtist) {
              overrides[album.albumId] = albumDetails.AlbumArtist
            }
          } catch {
            // Silently fail, will use song artist as fallback
          }
        })
      )

      setAlbumArtistOverrides(overrides)
    }

    fetchAlbumArtists()
  }, [stats?.topAlbums])

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
              <div className="flex items-center justify-between w-full sm:w-auto">
                <h1 className="text-2xl font-bold text-white">Tunetuna Canned</h1>
                <button
                  onClick={() => setShowCannedModal(true)}
                  className="sm:hidden w-8 h-8 flex items-center justify-center text-white hover:bg-zinc-800 rounded-full transition-colors"
                  aria-label="Generate shareable stats image"
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <MonthPicker
                  value={fromMonth}
                  options={monthOptions}
                  onChange={setFromMonth}
                />
                <span className="text-zinc-500 text-sm">to</span>
                <MonthPicker
                  value={toMonth}
                  options={monthOptions}
                  onChange={setToMonth}
                />
                <button
                  onClick={() => setShowCannedModal(true)}
                  className="hidden sm:flex w-8 h-8 items-center justify-center text-white hover:bg-zinc-800 rounded-full transition-colors"
                  aria-label="Generate shareable stats image"
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spacer for fixed header */}
      <div className="h-28 sm:h-16" />

      <div className="px-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-700/50">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <CirclePlay className="w-5 h-5" />
              <span className="text-sm font-medium">Streams</span>
            </div>
            <div className="text-4xl font-bold text-white">
              {stats.totalSongs.toLocaleString()}
            </div>
          </div>
          <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-700/50">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <Clock className="w-5 h-5" />
              <span className="text-sm font-medium">Time Listened</span>
            </div>
            <div className="text-4xl font-bold text-white">
              {(() => {
                const parts = formatHoursAndMinutesParts(stats.totalHours)
                return (
                  <>
                    {parts.value}<span className="text-lg font-normal text-white">{parts.unit}</span>
                    {parts.value2 !== undefined && (
                      <> {parts.value2}<span className="text-lg font-normal text-white">{parts.unit2}</span></>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
          {stats.mostListeningDay && (
            <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-700/50">
              <div className="flex items-center gap-2 text-zinc-400 mb-2">
                <TrendingUp className="w-5 h-5" />
                <span className="text-sm font-medium">
                  Top Day: {new Date(stats.mostListeningDay.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                  })}
                </span>
              </div>
              <div className="text-4xl font-bold text-white">
                {(() => {
                  const parts = formatHoursAndMinutesParts(stats.mostListeningDay.hours)
                  return (
                    <>
                      {parts.value}<span className="text-lg font-normal text-white">{parts.unit}</span>
                      {parts.value2 !== undefined && (
                        <> {parts.value2}<span className="text-lg font-normal text-white">{parts.unit2}</span></>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          )}
          <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-700/50">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <Music className="w-5 h-5" />
              <span className="text-sm font-medium">Songs</span>
            </div>
            <div className="text-4xl font-bold text-white">
              {stats.uniqueSongs.toLocaleString()}
            </div>
          </div>
          <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-700/50">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <User className="w-5 h-5" />
              <span className="text-sm font-medium">Artists</span>
            </div>
            <div className="text-4xl font-bold text-white">
              {stats.uniqueArtists.toLocaleString()}
            </div>
          </div>
          <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-700/50">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <Disc className="w-5 h-5" />
              <span className="text-sm font-medium">Albums</span>
            </div>
            <div className="text-4xl font-bold text-white">
              {stats.uniqueAlbums.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Top Songs */}
        {stats.topSongs.length > 0 && (
          <div className="mt-8">
            <SectionHeader icon={Music} title="Top Songs" />
            <div className="space-y-1">
              {stats.topSongs.map((song, i) => (
                <TopSongItem
                  key={song.songId}
                  rank={i + 1}
                  songId={song.songId}
                  songName={song.songName}
                  artistName={song.artistName}
                  artistId={song.artistId}
                  albumId={song.albumId}
                  plays={song.plays}
                  showYear={false}
                  onPlay={handlePlaySong}
                />
              ))}
            </div>
          </div>
        )}

        {/* Top Artists */}
        {stats.topArtists.length > 0 && (
          <div className="mt-8">
            <SectionHeader icon={User} title="Top Artists" />
            <div className="space-y-1">
              {stats.topArtists.map((artist, i) => (
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
          </div>
        )}

        {/* Top Albums */}
        {stats.topAlbums.length > 0 && (
          <div className="mt-8">
            <SectionHeader icon={Disc} title="Top Albums" />
            <div className="space-y-1">
              {stats.topAlbums.map((album, i) => (
                <TopAlbumItem
                  key={album.albumId}
                  rank={i + 1}
                  albumName={album.albumName}
                  artistName={albumArtistOverrides[album.albumId] || album.artistName}
                  artistId={album.artistId}
                  albumId={album.albumId}
                  hours={album.hours}
                  onClick={() => navigate(`/album/${album.albumId}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Top Genres */}
        {stats.topGenres.length > 0 && (
          <div className="mt-8">
            <SectionHeader icon={Guitar} title="Top Genres" />
            <div>
              {stats.topGenres.map((genre) => {
                // Find genre ID from music store
                const genreItem = genres.find(g => g.Name?.toLowerCase() === genre.genre.toLowerCase())
                return (
                  <HorizontalBar
                    key={genre.genre}
                    label={genre.genre}
                    value={genre.hours}
                    maxValue={maxGenreHours}
                    onClick={genreItem ? () => navigate(`/genre/${encodeURIComponent(genreItem.Id)}`) : undefined}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* Decades */}
        {stats.decades.length > 0 && (
          <>
            <SectionHeader icon={Clock} title="Top Decades" />
            <div>
              {stats.decades.slice().reverse().map((decade) => {
                // Parse decade string (e.g., "1990s") to get min/max years
                const decadeStart = parseInt(decade.decade.replace('s', ''), 10)
                const decadeEnd = decadeStart + 9
                return (
                  <HorizontalBar
                    key={decade.decade}
                    label={decade.decade}
                    value={decade.hours}
                    maxValue={maxDecadeHours}
                    onClick={() => navigate(`/?yearMin=${decadeStart}&yearMax=${decadeEnd}`)}
                  />
                )
              })}
            </div>
          </>
        )}

        {/* Top Genres × Decade */}
        {stats.topGenreDecades.length > 0 && (
          <>
            <SectionHeader icon={GalleryHorizontalEnd} title="Top Genres × Decade" />
            <div>
              {stats.topGenreDecades.map((combo) => {
                // Parse decade string (e.g., "1990s") to get min/max years
                const decadeStart = parseInt(combo.decade.replace('s', ''), 10)
                const decadeEnd = decadeStart + 9
                return (
                  <HorizontalBar
                    key={`${combo.genre}-${combo.decade}`}
                    label={`${combo.decade} ${combo.genre}`}
                    value={combo.hours}
                    maxValue={stats.topGenreDecades[0].hours}
                    onClick={() => navigate(`/?yearMin=${decadeStart}&yearMax=${decadeEnd}&genre=${encodeURIComponent(combo.genre)}`)}
                  />
                )
              })}
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

      {/* Canned Image Modal */}
      {showCannedModal && (
        <StatsImageModal
          stats={stats}
          fromMonth={fromMonth}
          toMonth={toMonth}
          onClose={() => setShowCannedModal(false)}
          onDownload={handleDownloadImage}
        />
      )}
    </div>
  )
}

function StatsImageModal({ stats, fromMonth, toMonth, onClose, onDownload }: { stats: ComputedStats, fromMonth: string, toMonth: string, onClose: () => void, onDownload: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return

      const { clientWidth, clientHeight } = containerRef.current
      // On mobile (<768px), we want full bleed so no safety padding
      // On desktop, we keep the 32px padding
      const padding = window.innerWidth < 768 ? 0 : 32
      const availableWidth = clientWidth - padding
      const availableHeight = clientHeight - padding

      const scaleX = availableWidth / 1015
      const scaleY = availableHeight / 1350

      // Use the smaller scale to fit both dimensions, capped at 0.9 on desktop, 1.0 on mobile
      const maxScale = window.innerWidth < 768 ? 1.0 : 0.9
      setScale(Math.min(scaleX, scaleY, maxScale))
    }

    updateScale() // Initial
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  return (
    <div
      className="fixed inset-0 bg-black/95 z-[100] flex flex-col items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >

      {/* Modal Header/Controls - Close Button Aligned to Image */}
      <div
        className="flex justify-end mb-2 flex-shrink-0 relative z-50 px-4 md:px-0"
        style={{ width: 1015 * scale }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center text-white bg-zinc-800/50 hover:bg-zinc-700/50 backdrop-blur-md rounded-full transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Image Container - Fit to screen */}
      <div
        ref={containerRef}
        className="relative flex items-center justify-center w-full flex-1 min-h-0 overflow-hidden pointer-events-none"
      >
        <div
          id="stats-image-preview-wrapper"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            width: 1015,
            height: 1350,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}
        >
          <StatsCannedImage
            id="stats-canned-image-preview"
            fromMonth={fromMonth}
            toMonth={toMonth}
            totalHours={stats.totalHours}
            totalStreams={stats.totalSongs}
            uniqueArtists={stats.uniqueArtists}
            uniqueAlbums={stats.uniqueAlbums}
            uniqueSongs={stats.uniqueSongs}
            topArtists={stats.topArtists.slice(0, 5).map((a) => ({ name: a.artistName, artistId: a.artistId }))}
            topSongs={stats.topSongs.slice(0, 5).map((s) => ({ name: s.songName, artistName: s.artistName, songId: s.songId, albumId: s.albumId }))}
            topAlbums={stats.topAlbums.slice(0, 3).map((a) => ({ name: a.albumName, artistName: a.artistName, albumId: a.albumId }))}
            topGenres={stats.topGenres.slice(0, 3).map((g) => ({ name: g.genre }))}
          />
        </div>
      </div>

      {/* Hidden Export Version - Strict 1015x1350, no scaling, off-screen */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          transform: 'translateX(-9999px)',
          width: 1015,
          height: 1350,
          opacity: 0, // Keep interactive (visible to HTML) but transparent
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: -1
        }}
      >
        <StatsCannedImage
          id="stats-canned-image-export"
          fromMonth={fromMonth}
          toMonth={toMonth}
          totalHours={stats.totalHours}
          totalStreams={stats.totalSongs}
          uniqueArtists={stats.uniqueArtists}
          uniqueAlbums={stats.uniqueAlbums}
          uniqueSongs={stats.uniqueSongs}
          topArtists={stats.topArtists.slice(0, 5).map((a) => ({ name: a.artistName, artistId: a.artistId }))}
          topSongs={stats.topSongs.slice(0, 5).map((s) => ({ name: s.songName, artistName: s.artistName, songId: s.songId, albumId: s.albumId }))}
          topAlbums={stats.topAlbums.slice(0, 3).map((a) => ({ name: a.albumName, artistName: a.artistName, albumId: a.albumId }))}
          topGenres={stats.topGenres.slice(0, 3).map((g) => ({ name: g.genre }))}
        />
      </div>
    </div>
  )
}
