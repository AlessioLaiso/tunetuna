import { useState, useEffect } from 'react'
import { Music, User, Disc, Clock, CirclePlay, Flame } from 'lucide-react'
import { jellyfinClient } from '../../api/jellyfin'

interface StatsCannedImageProps {
  fromMonth: string
  toMonth: string
  totalHours: number
  totalStreams: number
  uniqueArtists: number
  uniqueAlbums: number
  uniqueSongs: number
  topArtists: Array<{ name: string; artistId: string }>
  topSongs: Array<{ name: string; songId: string; albumId: string }>
  topAlbums: Array<{ name: string; albumId: string }>
  topGenres: Array<{ name: string }>
  id?: string
}

function formatDateRange(fromMonth: string, toMonth: string): string {
  const [fromYear, fromM] = fromMonth.split('-').map(Number)
  const [toYear, toM] = toMonth.split('-').map(Number)

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  if (fromMonth === toMonth) {
    return `${monthNames[fromM - 1]} ${fromYear}`
  }

  if (fromYear === toYear && fromM === 1 && toM === 12) {
    return `${fromYear}`
  }

  if (fromYear === toYear) {
    return `${shortMonths[fromM - 1]} - ${shortMonths[toM - 1]} ${fromYear}`
  }

  return `${shortMonths[fromM - 1]} ${fromYear} - ${shortMonths[toM - 1]} ${toYear}`
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

function StatsArtistImage({ artistId, alt, size, className, rounded = 'rounded-md' }: { artistId: string, alt: string, size: number, className: string, rounded?: string }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    setSrc(jellyfinClient.getArtistImageUrl(artistId, size))
  }, [artistId, size])

  const handleError = async () => {
    try {
      const { albums, songs } = await jellyfinClient.getArtistItems(artistId)
      const firstAlbum = albums[0]
      const firstSongWithAlbum = songs.find((song) => song.AlbumId) || songs[0]
      const artItem = firstAlbum || firstSongWithAlbum
      const artId = artItem ? (artItem.AlbumId || artItem.Id) : null

      if (artId) {
        setSrc(jellyfinClient.getAlbumArtUrl(artId, size))
      } else {
        setSrc(null)
      }
    } catch {
      setSrc(null)
    }
  }

  if (!src) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-zinc-800 ${rounded}`}>
        <User className="w-12 h-12 text-zinc-600" />
      </div>
    )
  }

  return <img src={src} alt={alt} className={className} onError={handleError} crossOrigin="anonymous" />
}

export default function StatsCannedImage({
  fromMonth,
  toMonth,
  totalHours,
  totalStreams,
  uniqueArtists,
  uniqueAlbums,
  uniqueSongs,
  topArtists,
  topSongs,
  topAlbums,
  topGenres,
  id = 'stats-canned-image'
}: StatsCannedImageProps) {
  // Use #1 album for background if available
  const bgUrl = topAlbums[0] ? jellyfinClient.getAlbumArtUrl(topAlbums[0].albumId, 500) : null
  const timeParts = formatHoursAndMinutesParts(totalHours)

  return (
    <div
      id={id}
      className="relative overflow-hidden"
      style={{ width: 1015, height: 1350, backgroundColor: '#0a0a0a' }}
    >
      {/* Background with blur and overlay - using img for better html2canvas support */}
      {bgUrl && (
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img
            src={bgUrl}
            alt=""
            className="w-full h-full object-cover"
            style={{
              filter: 'blur(80px)',
              transform: 'scale(1.25)',
              willChange: 'transform'
            }}
            crossOrigin="anonymous"
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>
      )}

      <div className="relative z-10 w-full h-full px-[52px] py-12 flex flex-col">
        {/* Hero stat */}
        <h1 className="text-white font-bold mb-8 flex items-baseline gap-4" style={{ fontSize: '88px', lineHeight: 1 }}>
          <span>{totalStreams.toLocaleString()}</span>
          <span className="text-white font-bold" style={{ fontSize: '88px' }}>streams</span>
        </h1>

        {/* 4 Stats Grid - Reverted to single line */}
        <div className="grid grid-cols-4 gap-6 mb-10">
          <div>
            <Clock className="w-8 h-8 text-white mb-2" />
            <p className="text-white text-2xl font-medium">
              {timeParts.value}{timeParts.unit}
              {timeParts.value2 !== undefined && ` ${timeParts.value2}${timeParts.unit2}`}
            </p>
          </div>
          <div>
            <User className="w-8 h-8 text-white mb-2" />
            <p className="text-white text-2xl font-medium">
              {uniqueArtists.toLocaleString()} Artists
            </p>
          </div>
          <div>
            <Disc className="w-8 h-8 text-white mb-2" />
            <p className="text-white text-2xl font-medium">
              {uniqueAlbums.toLocaleString()} Albums
            </p>
          </div>
          <div>
            <Music className="w-8 h-8 text-white mb-2" />
            <p className="text-white text-2xl font-medium">
              {uniqueSongs.toLocaleString()} Songs
            </p>
          </div>
        </div>

        {/* Image grid */}
        <div className="grid grid-cols-4 gap-6 mb-10 content-start">
          {/* Top Artists #1 - Spans 2x2 */}
          <div className="col-span-2 row-span-2 aspect-square rounded-[6px] overflow-hidden bg-zinc-800">
            {topArtists[0] ? (
              <StatsArtistImage
                artistId={topArtists[0].artistId}
                alt={topArtists[0].name}
                size={880}
                className="w-full h-full object-cover"
                rounded="rounded-[6px]"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                <User className="w-24 h-24 text-zinc-600" />
              </div>
            )}
          </div>

          {/* Top Artist #2 */}
          <div className="col-span-1 aspect-square rounded-[6px] overflow-hidden bg-zinc-800">
            {topArtists[1] ? (
              <StatsArtistImage
                artistId={topArtists[1].artistId}
                alt={topArtists[1].name}
                size={440}
                className="w-full h-full object-cover"
                rounded="rounded-[6px]"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                <User className="w-12 h-12 text-zinc-600" />
              </div>
            )}
          </div>

          {/* Empty slot top-right */}
          <div className="col-span-1"></div>

          {/* Album #1 */}
          <div className="col-span-1 aspect-square rounded-[6px] overflow-hidden bg-zinc-800">
            {topAlbums[0] ? (
              <img
                src={jellyfinClient.getAlbumArtUrl(topAlbums[0].albumId, 440)}
                alt={topAlbums[0].name}
                className="w-full h-full object-cover"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                <Disc className="w-12 h-12 text-zinc-600" />
              </div>
            )}
          </div>

          {/* Album #2 */}
          <div className="col-span-1 aspect-square rounded-[6px] overflow-hidden bg-zinc-800">
            {topAlbums[1] ? (
              <img
                src={jellyfinClient.getAlbumArtUrl(topAlbums[1].albumId, 440)}
                alt={topAlbums[1].name}
                className="w-full h-full object-cover"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                <Disc className="w-12 h-12 text-zinc-600" />
              </div>
            )}
          </div>
        </div>

        {/* 4 Lists Layout - 2 Columns */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 flex-1">
          {/* Left Column: Top Artists + Top Genres */}
          <div className="flex flex-col gap-10">
            {/* Top Artists */}
            <div>
              <p className="text-white/65 text-2xl mb-4">Top Artists</p>
              <div className="flex flex-col gap-3">
                {topArtists.slice(0, 5).map((artist, i) => (
                  <p key={i} className="text-white text-2xl truncate leading-tight">{artist.name}</p>
                ))}
              </div>
            </div>

            {/* Top Genres */}
            <div>
              <p className="text-white/65 text-2xl mb-4">Top Genres</p>
              <div className="flex flex-col gap-3">
                {topGenres.slice(0, 5).map((genre, i) => (
                  <p key={i} className="text-white text-2xl truncate leading-tight">{genre.name}</p>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Top Songs + Top Albums */}
          <div className="flex flex-col gap-10">
            {/* Top Songs */}
            <div>
              <p className="text-white/65 text-2xl mb-4">Top Songs</p>
              <div className="flex flex-col gap-3">
                {topSongs.slice(0, 5).map((song, i) => (
                  <p key={i} className="text-white text-2xl truncate leading-tight">{song.name}</p>
                ))}
              </div>
            </div>

            {/* Top Albums */}
            <div>
              <p className="text-white/65 text-2xl mb-4">Top Albums</p>
              <div className="flex flex-col gap-3">
                {topAlbums.slice(0, 3).map((album, i) => (
                  <p key={i} className="text-white text-2xl truncate leading-tight">{album.name}</p>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Branding */}
        <div className="mt-auto pt-6 flex justify-end">
          <span className="text-white text-2xl">
            <span className="font-bold">Tunetuna</span>
            <span className="text-zinc-400"> Canned, {formatDateRange(fromMonth, toMonth)}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
