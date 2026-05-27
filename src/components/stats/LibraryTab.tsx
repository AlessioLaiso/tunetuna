import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music, User, Disc, Guitar, Clock, CirclePlay, Clock3, Repeat2, Loader2 } from 'lucide-react'
import { jellyfinClient } from '../../api/jellyfin'
import { useMusicStore } from '../../stores/musicStore'
import { useLibrarySnapshotStore } from '../../stores/librarySnapshotStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useStatsStore, type PlayEvent } from '../../stores/statsStore'
import { computeLibraryStats } from '../../utils/libraryStatsComputer'
import { getAccentColorRgba } from '../../utils/badgeTooltipUtils'
import { BadgeWithTooltip } from './BadgeWithTooltip'

interface Props {
  events: PlayEvent[]
  fromMonth: string
  toMonth: string
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

function SectionHeader({ icon: Icon, title }: { icon: typeof Music; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 mt-8">
      <Icon className="w-5 h-5 text-zinc-400" />
      <h2 className="text-lg font-semibold text-zinc-300">{title}</h2>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  played,
  total,
  timeMode,
}: {
  icon: typeof Music
  label: string
  played: number
  total: number
  timeMode?: boolean
}) {
  const formatValue = (value: number) => {
    if (timeMode) {
      return formatHours(value)
    }
    return value.toLocaleString()
  }

  return (
    <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-700/50">
      <div className="flex items-center gap-2 text-zinc-400 mb-2">
        <Icon className="w-5 h-5" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="tabular-nums">
        <div className="text-4xl font-bold text-white">{formatValue(total)}</div>
        <div className="text-sm font-medium text-white mt-1">
          {formatValue(played)} streamed
        </div>
      </div>
    </div>
  )
}

// Bar where the played portion is rendered in the accent color and the
// remaining (unplayed) portion in a dimmer accent color. The whole bar's width is
// proportional to `total / maxTotal`. Optionally shows a multiplier badge on the right.
function StackedBar({
  label,
  played,
  total,
  maxTotal,
  onClick,
  badge,
  badgeOpacity,
  badgeTooltip,
  timeMode,
}: {
  label: string
  played: number
  total: number
  maxTotal: number
  onClick?: () => void
  badge?: string
  badgeOpacity?: number
  badgeTooltip?: string
  timeMode?: boolean
}) {
  const overplayed = played > total
  const totalWidthPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0
  const playedWidthPct = maxTotal > 0 ? (played / maxTotal) * 100 : 0

  const Container = onClick ? 'button' : 'div'
  const containerProps = onClick
    ? { onClick, className: 'flex items-center gap-3 mb-2 w-full cursor-pointer hover:bg-zinc-800/50 rounded-lg py-1 transition-colors' }
    : { className: 'flex items-center gap-3 mb-2' }

  return (
    <Container {...containerProps}>
      <div className="w-28 min-[464px]:w-44 text-zinc-300 text-sm truncate flex-shrink-0 text-left">{label}</div>
      <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden min-w-0 relative">
        {timeMode ? (
          <div className="h-full transition-all duration-500 rounded-full" style={{ width: `${playedWidthPct}%`, backgroundColor: `var(--accent-color)` }} />
        ) : overplayed ? (
          <>
            <div className="h-full transition-all duration-500 rounded-full" style={{ width: `${playedWidthPct}%`, backgroundColor: `var(--accent-color)` }} />
            {total > 0 && (
              <div
                className="absolute top-0 bottom-0"
                style={{ left: `calc(${totalWidthPct}% - 1px)`, width: '2px', backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
                title={`Library: ${total.toLocaleString()}`}
              />
            )}
          </>
        ) : (
          <div className="h-full transition-all duration-500 flex rounded-full" style={{ width: `${totalWidthPct}%` }}>
            <div className="h-full transition-all duration-500 rounded-l-full" style={{ width: `${total > 0 ? (played / total) * 100 : 0}%`, backgroundColor: `var(--accent-color)` }} />
            <div className="h-full transition-all duration-500 rounded-r-full" style={{ width: `${total > 0 ? ((total - played) / total) * 100 : 0}%`, backgroundColor: `var(--accent-color)`, opacity: 0.6 }} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {badge && badgeOpacity !== undefined ? (
          <>
            {timeMode ? (
              <div className="w-16 text-sm text-right tabular-nums text-zinc-400 flex-shrink-0">
                {formatHours(total)}
              </div>
            ) : (
              <div className="w-24 text-sm text-right tabular-nums flex-shrink-0">
                <span className="text-zinc-400">{played.toLocaleString()}</span>
                <span className="text-zinc-600"> / </span>
                <span className="text-zinc-300">{total.toLocaleString()}</span>
              </div>
            )}
            <BadgeWithTooltip
              badge={badge}
              opacity={badgeOpacity}
              tooltip={badgeTooltip ?? `Streamed for ${formatHours(played)}, which is ${badge} the ${formatHours(total)} in your library`}
              className="flex-shrink-0"
            />
          </>
        ) : (
          <div className="w-24 text-sm text-right tabular-nums flex-shrink-0">
            <span className="text-zinc-400">{played.toLocaleString()}</span>
            <span className="text-zinc-600"> / </span>
            <span className="text-zinc-300">{total.toLocaleString()}</span>
          </div>
        )}
      </div>
    </Container>
  )
}

function ArtistRow({
  rank,
  artistId,
  artistName,
  owned,
  played,
  timeMode,
  multiplier,
  allMultipliers,
  coverage,
  allCoverages,
}: {
  rank: number
  artistId: string
  artistName: string
  owned: number
  played: number
  timeMode?: boolean
  multiplier?: number
  allMultipliers?: number[]
  coverage?: number
  allCoverages?: number[]
}) {
  const navigate = useNavigate()
  const imageSize = rank === 1 ? 240 : rank === 2 ? 160 : 96
  const sizeClass = rank === 1 ? 'w-12 h-12 md:w-[120px] md:h-[120px]' : rank === 2 ? 'w-12 h-12 md:w-[80px] md:h-[80px]' : 'w-12 h-12'
  const iconSize = rank === 1 ? 'w-5 h-5 md:w-10 md:h-10' : rank === 2 ? 'w-5 h-5 md:w-8 md:h-8' : 'w-5 h-5'
  const leftPadding = rank === 1 ? 'md:pl-0' : rank === 2 ? 'md:pl-10' : 'pl-0 md:pl-[72px]'
  const imageUrl = jellyfinClient.getArtistImageUrl(artistId, imageSize)
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(imageUrl)

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
      setCurrentImageUrl(artId ? jellyfinClient.getAlbumArtUrl(artId, imageSize) : null)
    } catch {
      setCurrentImageUrl(null)
    }
  }

  const computeOpacity = (value: number | undefined, all: number[] | undefined) => {
    if (!all || all.length === 0 || value === undefined) return 1
    const valid = all.filter(m => m > 0)
    if (valid.length === 0) return 1
    const min = Math.min(...valid, 1)
    const max = Math.max(...valid, 1)
    if (max === min) return 1
    const normalized = (value - min) / (max - min)
    return 0.2 + normalized * 0.8
  }
  const getBadgeOpacity = () => computeOpacity(multiplier, allMultipliers)
  const getCoverageOpacity = () => computeOpacity(coverage, allCoverages)

  return (
    <button
      onClick={() => navigate(`/artist/${artistId}`)}
      className={`flex items-center gap-3 w-full py-2 rounded-lg hover:bg-zinc-800/50 transition-colors text-left group ${leftPadding}`}
    >
      <div className={`${sizeClass} rounded-full bg-zinc-700 overflow-hidden flex-shrink-0 relative`}>
        {currentImageUrl ? (
          <img src={currentImageUrl} alt={artistName} className="w-full h-full object-cover" onError={handleImageError} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className={`${iconSize} text-zinc-500`} />
          </div>
        )}
        <div className="absolute inset-0 pointer-events-none border rounded-full" style={{ borderColor: 'rgba(117, 117, 117, 0.3)', borderWidth: '1px' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors ${rank === 1 ? 'md:text-lg' : ''}`}>
          <span className="text-zinc-500 mr-2 tabular-nums">{rank}</span>{artistName}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {timeMode && multiplier !== undefined ? (
          <>
            <div className="text-sm whitespace-nowrap tabular-nums text-zinc-400">
              {formatHours(owned)}
            </div>
            <BadgeWithTooltip
              badge={`${multiplier.toFixed(1)}×`}
              opacity={getBadgeOpacity()}
              tooltip={`Streamed for ${formatHours(played)}, which is ${multiplier.toFixed(1)}× the ${formatHours(owned)} in your library`}
            />
          </>
        ) : (
          <>
            <div className="text-sm whitespace-nowrap tabular-nums">
              <span className="text-zinc-400">{played}</span>
              <span className="text-zinc-500"> / </span>
              <span className="text-zinc-300">{owned}</span>
            </div>
            {coverage !== undefined && (
              <BadgeWithTooltip
                badge={`${Math.round(coverage * 100)}%`}
                opacity={getCoverageOpacity()}
                tooltip={`Played ${played.toLocaleString()} of ${owned.toLocaleString()} songs (${Math.round(coverage * 100)}%) by this artist`}
              />
            )}
          </>
        )}
      </div>
    </button>
  )
}

export default function LibraryTab({ events, fromMonth, toMonth }: Props) {
  const navigate = useNavigate()
  const { artists, genres: musicGenres, songs } = useMusicStore()
  const { snapshots, loaded, loadSnapshots, snapshotForRange } = useLibrarySnapshotStore()
  const { metadataVersion } = useStatsStore()
  const showTime = useSettingsStore((s) => s.libraryStatsTimeMode)

  useEffect(() => {
    if (!loaded) loadSnapshots()
  }, [loaded, loadSnapshots])

  const { fromTs, toTs, fromDate, toDate } = useMemo(() => {
    const [fromYear, fromM] = fromMonth.split('-').map(Number)
    const [toYear, toM] = toMonth.split('-').map(Number)
    const fromDate = new Date(fromYear, fromM - 1, 1)
    const toDate = new Date(toYear, toM, 0, 23, 59, 59, 999)
    return { fromTs: fromDate.getTime(), toTs: toDate.getTime(), fromDate, toDate }
  }, [fromMonth, toMonth])

  const snapshot = useMemo(() => snapshotForRange(fromTs, toTs), [snapshotForRange, fromTs, toTs, snapshots])


  const stats = useMemo(() => {
    return computeLibraryStats(events, fromDate, toDate, snapshot, artists, songs)
    // metadataVersion forces refresh after metadata edits propagate to events
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, fromDate, toDate, snapshot, artists, metadataVersion])

  if (!loaded) {
    return (
      <div className="px-4 flex flex-col items-center justify-center py-20 text-center">
        <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="px-4 flex flex-col items-center justify-center py-20 text-center">
        <Music className="w-16 h-16 text-zinc-600 mb-4" />
        <h2 className="text-xl font-semibold text-zinc-300 mb-2">No library snapshot yet</h2>
        <p className="text-zinc-500 max-w-sm">Sync your library to capture a library snapshot</p>
      </div>
    )
  }

  const topArtistsList = showTime
    ? stats.topArtists.slice().sort((a, b) => b.hoursOwned - a.hoursOwned).slice(0, 10)
    : stats.topArtists.slice(0, 10)
  const topGenres = showTime
    ? stats.genres.slice().sort((a, b) => b.hoursOwned - a.hoursOwned || b.playedHours - a.playedHours).slice(0, 50)
    : stats.genres.slice().sort((a, b) => b.owned - a.owned || b.played - a.played).slice(0, 50)
  const decadesAsc = stats.decades.slice().reverse() // newest first to match Canned

  // Use time-based or track-based values depending on mode.
  // Include played values so overplayed rows (played > owned) still fit the scale.
  const maxGenre = Math.max(
    ...topGenres.map(g => showTime ? Math.max(g.hoursOwned, g.playedHours) : Math.max(g.owned, g.played)),
    1,
  )
  const maxDecade = Math.max(
    ...decadesAsc.map(d => showTime ? Math.max(d.hoursOwned, d.playedHours) : Math.max(d.owned, d.played)),
    1,
  )

  // Calculate multipliers and find range for color scaling (always based on time comparison)
  const genreMultipliers = topGenres.map(g => (g.playedHours > 0 && g.hoursOwned > 0 ? g.playedHours / g.hoursOwned : 0))
  const decadeMultipliers = decadesAsc.map(d => (d.playedHours > 0 && d.hoursOwned > 0 ? d.playedHours / d.hoursOwned : 0))

  // Songs-mode coverage: fraction of owned songs that were played (0..1)
  const genreCoverage = topGenres.map(g => (g.owned > 0 ? Math.min(g.played / g.owned, 1) : 0))
  const decadeCoverage = decadesAsc.map(d => (d.owned > 0 ? Math.min(d.played / d.owned, 1) : 0))

  const makeOpacityFn = (values: number[]) => {
    const valid = values.filter(m => m > 0)
    const min = Math.min(...valid, 1)
    const max = Math.max(...valid, 1)
    return (v: number) => {
      if (max === min) return 1
      const normalized = (v - min) / (max - min)
      return 0.2 + normalized * 0.8 // 20% to 100%
    }
  }

  const getGenreOpacity = makeOpacityFn(genreMultipliers)
  const getDecadeOpacity = makeOpacityFn(decadeMultipliers)
  const getGenreCoverageOpacity = makeOpacityFn(genreCoverage)
  const getDecadeCoverageOpacity = makeOpacityFn(decadeCoverage)

  return (
    <div className="px-4">
      {/* Summary section title */}
      <div className="sm:mt-12 mb-6">
        <div className="flex items-center gap-2">
          <CirclePlay className="w-5 h-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-zinc-300">Streamed from your library</h2>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={showTime ? Clock3 : Music}
          label={showTime ? 'Total time' : 'Songs'}
          played={showTime ? stats.playedHours : stats.playedSongs}
          total={showTime ? stats.totalHoursOwned : stats.totalSongs}
          timeMode={showTime}
        />
        <SummaryCard
          icon={User}
          label="Artists"
          played={stats.playedArtists}
          total={stats.totalArtists}
        />
        <SummaryCard
          icon={Disc}
          label="Albums"
          played={stats.playedAlbums}
          total={stats.totalAlbums}
        />
        <SummaryCard
          icon={Guitar}
          label="Genres"
          played={stats.playedGenres}
          total={stats.totalGenres}
        />
      </div>

      {/* Top artists by catalog depth */}
      {topArtistsList.length > 0 && (
        <div className="mt-12">
          <SectionHeader icon={User} title="Top artists in your library" />
          <div className="space-y-1">
            {topArtistsList.map((a, i) => {
              const artistMultiplier = a.hoursOwned > 0 ? a.playedHours / a.hoursOwned : 0
              const artistCoverage = a.owned > 0 ? Math.min(a.played / a.owned, 1) : 0
              return (
                <ArtistRow
                  key={a.artistId}
                  rank={i + 1}
                  artistId={a.artistId}
                  artistName={a.artistName}
                  owned={showTime ? a.hoursOwned : a.owned}
                  played={showTime ? a.playedHours : a.played}
                  timeMode={showTime}
                  multiplier={showTime ? artistMultiplier : undefined}
                  allMultipliers={showTime ? [...topArtistsList.map(ar => ar.hoursOwned > 0 ? ar.playedHours / ar.hoursOwned : 0)] : undefined}
                  coverage={!showTime ? artistCoverage : undefined}
                  allCoverages={!showTime ? topArtistsList.map(ar => ar.owned > 0 ? Math.min(ar.played / ar.owned, 1) : 0) : undefined}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Most-played artists relative to library (in time mode only) */}
      {showTime && stats.topArtists.length > 0 && (
        <div className="mt-12">
          <SectionHeader icon={Repeat2} title="Most-played artists relative to library" />
          <div className="space-y-1">
            {stats.topArtists
              .map((a) => ({
                artist: a,
                multiplier: a.hoursOwned > 0 ? a.playedHours / a.hoursOwned : 0,
              }))
              .sort((a, b) => b.multiplier - a.multiplier)
              .slice(0, 10)
              .map(({ artist: a, multiplier }, i) => (
                <ArtistRow
                  key={`${a.artistId}-repeat`}
                  rank={i + 1}
                  artistId={a.artistId}
                  artistName={a.artistName}
                  owned={a.hoursOwned}
                  played={a.playedHours}
                  timeMode={true}
                  multiplier={multiplier}
                  allMultipliers={stats.topArtists
                    .map((ar) => (ar.hoursOwned > 0 ? ar.playedHours / ar.hoursOwned : 0))
                    .filter((m) => m > 0)}
                />
              ))}
          </div>
        </div>
      )}

      {/* Decades */}
      {decadesAsc.length > 0 && (
        <div className="mt-12">
          <SectionHeader icon={Clock} title="Decades" />
          <div>
            {decadesAsc.map((d, idx) => {
              const decadeStart = parseInt(d.decade.replace('s', ''), 10)
              const decadeEnd = decadeStart + 9
              const mult = decadeMultipliers[idx] || 0
              const coverage = decadeCoverage[idx] || 0
              const pct = Math.round(coverage * 100)
              return (
                <StackedBar
                  key={d.decade}
                  label={d.decade}
                  played={showTime ? d.playedHours : d.played}
                  total={showTime ? d.hoursOwned : d.owned}
                  maxTotal={maxDecade}
                  onClick={() => navigate(`/?yearMin=${decadeStart}&yearMax=${decadeEnd}`)}
                  badge={showTime ? `${mult.toFixed(1)}×` : `${pct}%`}
                  badgeOpacity={showTime ? getDecadeOpacity(mult) : getDecadeCoverageOpacity(coverage)}
                  badgeTooltip={showTime
                    ? undefined
                    : `Played ${d.played.toLocaleString()} of ${d.owned.toLocaleString()} songs (${pct}%) from this decade`}
                  timeMode={showTime}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Genres */}
      {topGenres.length > 0 && (
        <div className="mt-12">
          <SectionHeader icon={Guitar} title="Genres" />
          <div>
            {topGenres.map((g, idx) => {
              const genreItem = musicGenres.find(mg => mg.Name?.toLowerCase() === g.genre.toLowerCase())
              const mult = genreMultipliers[idx] || 0
              const coverage = genreCoverage[idx] || 0
              const pct = Math.round(coverage * 100)
              return (
                <StackedBar
                  key={g.genre}
                  label={g.genre}
                  played={showTime ? g.playedHours : g.played}
                  total={showTime ? g.hoursOwned : g.owned}
                  maxTotal={maxGenre}
                  onClick={genreItem ? () => navigate(`/genre/${encodeURIComponent(genreItem.Id)}`) : undefined}
                  badge={showTime ? `${mult.toFixed(1)}×` : `${pct}%`}
                  badgeOpacity={showTime ? getGenreOpacity(mult) : getGenreCoverageOpacity(coverage)}
                  badgeTooltip={showTime
                    ? undefined
                    : `Played ${g.played.toLocaleString()} of ${g.owned.toLocaleString()} songs (${pct}%) in this genre`}
                  timeMode={showTime}
                />
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
