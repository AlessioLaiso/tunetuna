import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { jellyfinClient } from '../../api/jellyfin'
import { usePlayerStore } from '../../stores/playerStore'
import Image from '../shared/Image'
import { ArrowLeft, Shuffle, Pause, ChevronDown, ChevronUp, MoreHorizontal, Disc, ArrowUpDown, Play, ListEnd } from 'lucide-react'
import type { BaseItemDto } from '../../api/types'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'
import Spinner from '../shared/Spinner'

type SongSortOrder = 'Alphabetical' | 'Newest' | 'Oldest'

interface ArtistAlbumItemProps {
  album: BaseItemDto
  year: string | null
  onNavigate: (id: string) => void
  onContextMenu: (album: BaseItemDto) => void
}

function ArtistAlbumItem({ album, year, onNavigate, onContextMenu }: ArtistAlbumItemProps) {
  const [imageError, setImageError] = useState(false)
  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      onContextMenu(album)
    },
    onClick: () => onNavigate(album.Id),
  })
  return (
    <button
      onClick={() => onNavigate(album.Id)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(album)
      }}
      {...longPressHandlers}
      className="text-left group"
    >
      <div className="aspect-square rounded overflow-hidden mb-2 bg-zinc-900 flex items-center justify-center">
        {imageError ? (
          <Disc className="w-12 h-12 text-gray-500" />
        ) : (
          <Image
            src={jellyfinClient.getAlbumArtUrl(album.Id, 474)}
            alt={album.Name}
            className="w-full h-full object-cover"
            showOutline={true}
            rounded="rounded"
            onError={() => setImageError(true)}
          />
        )}
      </div>
      <div className="text-sm font-medium text-white truncate">{album.Name}</div>
      {year && (
        <div className="text-xs text-gray-400 truncate">{year}</div>
      )}
    </button>
  )
}

interface ArtistSongItemProps {
  song: BaseItemDto
  album: string | null
  year: string | null
  onClick: (song: BaseItemDto) => void
  onContextMenu: (song: BaseItemDto) => void
}

function ArtistSongItem({ song, album, year, onClick, onContextMenu }: ArtistSongItemProps) {
  const { currentTrack } = usePlayerStore()
  const formatDuration = (ticks: number): string => {
    const seconds = Math.floor(ticks / 10000000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      onContextMenu(song)
    },
    onClick: () => onClick(song),
  })
  return (
    <button
      onClick={() => onClick(song)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(song)
      }}
      {...longPressHandlers}
      className="w-full flex items-center gap-3 hover:bg-white/10 transition-colors group px-4 py-3"
    >
      <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-900 self-center">
        <Image
          src={jellyfinClient.getAlbumArtUrl(song.AlbumId || song.Id, 96)}
          alt={song.Name}
          className="w-full h-full object-cover"
          showOutline={true}
          rounded="rounded-sm"
        />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className={`text-sm font-medium truncate transition-colors ${
          currentTrack?.Id === song.Id 
            ? 'text-[var(--accent-color)]' 
            : 'text-white group-hover:text-[var(--accent-color)]'
        }`}>
          {song.Name}
        </div>
        {(album || year) && (
          <div className="text-xs text-gray-400 flex items-center gap-1 min-w-0">
            {album && (
              <span className="truncate">{album}</span>
            )}
            {album && year && (
              <span className="flex-shrink-0">•</span>
            )}
            {year && (
              <span className="flex-shrink-0">{year}</span>
            )}
          </div>
        )}
      </div>
      {song.RunTimeTicks && (
        <div className="text-xs text-gray-500 flex-shrink-0 text-right">
          {formatDuration(song.RunTimeTicks)}
        </div>
      )}
    </button>
  )
}

export default function ArtistDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { playAlbum, playTrack, currentTrack, isPlaying, pause, addToQueue } = usePlayerStore()
  const [artist, setArtist] = useState<BaseItemDto | null>(null)
  const [albums, setAlbums] = useState<BaseItemDto[]>([])
  const [songs, setSongs] = useState<BaseItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const [bioExpanded, setBioExpanded] = useState(false)
  const [isBioExpandable, setIsBioExpandable] = useState(true)
  const [hasImage, setHasImage] = useState(true)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [contextMenuItemType, setContextMenuItemType] = useState<'album' | 'song' | 'artist' | null>(null)
  const [artistContextMenuOpen, setArtistContextMenuOpen] = useState(false)
  const [songSortOrder, setSongSortOrder] = useState<SongSortOrder>('Alphabetical')
  const bioMeasureRef = useRef<HTMLParagraphElement | null>(null)

  // Scroll to top when component mounts or artist ID changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [id])

  // Normalize artist name by removing special characters for comparison
  const normalizeArtistName = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[_\*\-\.]/g, '') // Remove underscore, asterisk, dash, period
      .trim()
  }

  useEffect(() => {
    if (!id) return

    const loadArtistData = async () => {
      setLoading(true)
      try {
        // Get artist info with Overview field
        const artistDetail = await jellyfinClient.getArtistById(id)
        let currentArtist = artistDetail
        if (!currentArtist) {
          // Fallback to getArtists if getArtistById doesn't work
          const artistsResult = await jellyfinClient.getArtists({ limit: 1000 })
          const foundArtist = artistsResult.Items.find(a => a.Id === id)
          if (foundArtist) {
            currentArtist = foundArtist
          }
        }
        
        if (!currentArtist) {
          setLoading(false)
          return
        }
        
        setArtist(currentArtist)
        setHasImage(true) // Reset image state when artist changes
        
        // Get artist items
        const result = await jellyfinClient.getArtistItems(id)
        
        // If no songs/albums found, try to find a similar artist with content
        if (result.albums.length === 0 && result.songs.length === 0 && currentArtist.Name) {
          
          const normalizedName = normalizeArtistName(currentArtist.Name)
          // Search for similar artists
          const searchResults = await jellyfinClient.search(currentArtist.Name, 50)
          const similarArtists = searchResults.Artists?.Items || []
          
          // Find an artist with the same normalized name but different ID that has content
          for (const similarArtist of similarArtists) {
            if (similarArtist.Id !== id && normalizeArtistName(similarArtist.Name) === normalizedName) {
              // Check if this similar artist has content
              const similarResult = await jellyfinClient.getArtistItems(similarArtist.Id)
              
              if (similarResult.albums.length > 0 || similarResult.songs.length > 0) {
                // Redirect to the similar artist that has content
                navigate(`/artist/${similarArtist.Id}`, { replace: true })
                return
              }
            }
          }
        }
        
        // Sort albums from newest to oldest by year
        const sortedAlbums = [...result.albums].sort((a, b) => {
          const yearA = a.ProductionYear || (a.PremiereDate ? new Date(a.PremiereDate).getFullYear() : 0)
          const yearB = b.ProductionYear || (b.PremiereDate ? new Date(b.PremiereDate).getFullYear() : 0)
          return yearB - yearA
        })
        setAlbums(sortedAlbums)
        setSongs(result.songs)
      } catch (error) {
        console.error('Failed to load artist data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadArtistData()
  }, [id, navigate])

  // Measure whether artist overview exceeds two lines
  useEffect(() => {
    if (!artist?.Overview) {
      return
    }

    // Assume long overview by default so we start in collapsed mode,
    // then let measurement disable expansion if it actually fits in two lines.
    setIsBioExpandable(true)

    let frameId: number | null = null
    let timeoutId: number | null = null
    let extraTimeoutId: number | null = null
    let hasRetried = false

    const runMeasure = () => {
      const el = bioMeasureRef.current
      if (!el || !artist?.Overview) {
        setIsBioExpandable(false)
        return
      }

      const style = window.getComputedStyle(el)
      let lineHeight = parseFloat(style.lineHeight || '0')

      if (!Number.isFinite(lineHeight) || lineHeight === 0) {
        const fontSize = parseFloat(style.fontSize || '16')
        lineHeight = fontSize * 1.5
      }

      if (lineHeight === 0) {
        setIsBioExpandable(false)
        return
      }

      const scrollHeight = el.scrollHeight

      // If scrollHeight is 0 on first pass, try one more time after layout settles
      if (scrollHeight === 0 && !hasRetried) {
        hasRetried = true
        scheduleMeasure()
        return
      }

      const lineCount = Math.round(scrollHeight / lineHeight)
      const isExpandable = lineCount > 2
      setIsBioExpandable(isExpandable)
    }

    const scheduleMeasure = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }

      frameId = requestAnimationFrame(() => {
        timeoutId = window.setTimeout(runMeasure, 0)
      })

      // Run a second measurement slightly later to catch late layout/font changes
      if (extraTimeoutId !== null) {
        clearTimeout(extraTimeoutId)
      }
      extraTimeoutId = window.setTimeout(() => {
        hasRetried = false
        runMeasure()
      }, 300)
    }

    const handleResize = () => {
      hasRetried = false
      scheduleMeasure()
    }

    scheduleMeasure()
    window.addEventListener('resize', handleResize)

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      if (extraTimeoutId !== null) {
        clearTimeout(extraTimeoutId)
      }
      window.removeEventListener('resize', handleResize)
    }
  }, [artist?.Overview])


  const handleShuffleAll = () => {
    if (sortedSongs.length > 0) {
      const shuffled = [...sortedSongs].sort(() => Math.random() - 0.5)
      playAlbum(shuffled)
    }
  }

  const getAlbumYear = (album: BaseItemDto): string | null => {
    if (album.ProductionYear) {
      return album.ProductionYear.toString()
    }
    if (album.PremiereDate) {
      return new Date(album.PremiereDate).getFullYear().toString()
    }
    return null
  }

  const formatDuration = (ticks: number): string => {
    const seconds = Math.floor(ticks / 10000000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getSongAlbumAndYear = (song: BaseItemDto): { album: string | null; year: string | null } => {
    const album = song.Album || null
    let year: string | null = null
    
    // Try to find the album in albums array to get year
    if (song.AlbumId) {
      const albumData = albums.find(a => a.Id === song.AlbumId)
      if (albumData) {
        year = getAlbumYear(albumData)
      }
    }
    
    return { album, year }
  }

  const getSongAlbumDate = (song: BaseItemDto): number => {
    // Try to find the album in albums array to get date
    if (song.AlbumId) {
      const albumData = albums.find(a => a.Id === song.AlbumId)
      if (albumData) {
        const year = albumData.ProductionYear || (albumData.PremiereDate ? new Date(albumData.PremiereDate).getFullYear() : 0)
        const month = albumData.PremiereDate ? new Date(albumData.PremiereDate).getMonth() : 0
        const day = albumData.PremiereDate ? new Date(albumData.PremiereDate).getDate() : 0
        // Return timestamp for proper sorting (newest first)
        if (albumData.PremiereDate) {
          return new Date(albumData.PremiereDate).getTime()
        }
        // If only year is available, use year * 10000 to make it sortable
        return year * 10000
      }
    }
    // Fallback: try to get date from song itself
    const year = song.ProductionYear || (song.PremiereDate ? new Date(song.PremiereDate).getFullYear() : 0)
    if (song.PremiereDate) {
      return new Date(song.PremiereDate).getTime()
    }
    return year * 10000
  }

  const sortedSongs = useMemo(() => {
    if (songSortOrder === 'Alphabetical') {
      return [...songs].sort((a, b) => {
        const nameA = a.Name || ''
        const nameB = b.Name || ''
        return nameA.localeCompare(nameB)
      })
    }

    // Date-based sort: group by album date, then album, then track number, then name
    const compareByDate = (a: BaseItemDto, b: BaseItemDto, newestFirst: boolean) => {
      const dateA = getSongAlbumDate(a)
      const dateB = getSongAlbumDate(b)
      const albumIdA = a.AlbumId || ''
      const albumIdB = b.AlbumId || ''

      // First sort by album date
      if (dateA !== dateB) {
        return newestFirst ? dateB - dateA : dateA - dateB
      }

      // If same date, group by album (songs from same album should be together)
      if (albumIdA !== albumIdB) {
        return albumIdA.localeCompare(albumIdB)
      }

      // Within same album, sort by track number
      const trackA = a.IndexNumber || 0
      const trackB = b.IndexNumber || 0

      // If same track number, fall back to alphabetical
      if (trackA !== trackB) {
        return trackA - trackB
      }

      return (a.Name || '').localeCompare(b.Name || '')
    }

    const newestFirst = songSortOrder === 'Newest'
    return [...songs].sort((a, b) => compareByDate(a, b, newestFirst))
  }, [songs, songSortOrder, albums])

  const handlePlayAllSongsFromArtist = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (sortedSongs.length > 0) {
      playAlbum(sortedSongs)
    }
  }

  const handleAddAllSongsFromArtistToQueue = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (sortedSongs.length > 0) {
      addToQueue(sortedSongs)
    }
  }

  const cycleSongSortOrder = () => {
    setSongSortOrder((current) => {
      if (current === 'Alphabetical') return 'Newest'
      if (current === 'Newest') return 'Oldest'
      return 'Alphabetical'
    })
  }

  if (loading) {
    return (
      <div className="pb-20">
        <div className="flex items-center justify-center h-screen text-gray-400">
          <Spinner />
        </div>
      </div>
    )
  }

  if (!artist) {
    return (
      <div className="pb-20">
        <div className="flex items-center justify-center h-screen text-gray-400">
          <p>Artist not found on the Jellyfin server</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20">
      {/* Fixed header with back button */}
      <div className="fixed top-0 left-0 right-0 z-[60]" style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}>
        <div className="max-w-[768px] mx-auto">
          <div className="relative flex items-center justify-between gap-4 p-4">
          <button
            onClick={() => navigate(-1)}
            className="text-white hover:text-gray-300 transition-colors z-10"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          {artist && (
            <button
              onClick={() => setArtistContextMenuOpen(true)}
              className="text-white hover:text-gray-300 transition-colors z-10"
            >
              <MoreHorizontal className="w-6 h-6" />
            </button>
          )}
          </div>
        </div>
      </div>

      {/* Hero section with large artist image / backdrop */}
      <div
        className="relative z-30 w-screen"
        style={{
          marginTop: `calc(-1 * env(safe-area-inset-top))`,
          marginLeft: 'calc(50% - 50vw)',
          marginRight: 'calc(50% - 50vw)',
        }}
      >
        {hasImage && (
          <div
            className="relative w-full min-h-64 md:min-h-80 bg-black"
            style={{ paddingTop: `env(safe-area-inset-top)` }}
          >
            {/* Mobile: primary artist image */}
            <div className="w-full flex items-center justify-center md:hidden">
              <Image
                src={jellyfinClient.getArtistImageUrl(artist.Id)}
                alt={artist.Name}
                className="w-full h-auto object-contain"
                onError={() => setHasImage(false)}
              />
            </div>

            {/* Desktop: backdrop image, edge-to-edge */}
            <div className="hidden md:block w-full h-80">
              <img
                src={jellyfinClient.getArtistBackdropUrl(artist.Id)}
                alt={artist.Name}
                className="w-full h-full object-cover"
                onError={() => setHasImage(false)}
              />
            </div>

            <div className="absolute inset-x-0 top-0 bottom-[-1px] bg-gradient-to-b from-transparent via-black/60 to-black pointer-events-none" />
          </div>
        )}
        
        {/* Artist info overlay */}
        <div className={`left-0 right-0 ${hasImage ? 'absolute' : 'relative'} ${hasImage ? 'pt-16' : 'pt-12'}`} style={hasImage ? { bottom: '-28px', paddingBottom: '1.5rem' } : {}}>
          <div className="max-w-[768px] mx-auto px-4 flex items-end gap-6 md:grid md:grid-cols-3 md:gap-4">
            {/* Artist image (desktop/tablet only, sized like one album column) */}
            {hasImage && (
              <div className="hidden md:block md:col-span-1">
                <div className="aspect-square rounded overflow-hidden bg-zinc-900 flex items-center justify-center">
                  <Image
                    src={jellyfinClient.getArtistImageUrl(artist.Id)}
                    alt={artist.Name}
                    className="w-full h-full object-cover"
                    showOutline={true}
                    rounded="rounded"
                  />
                </div>
              </div>
            )}
            {/* Artist name and controls */}
            <div className={`flex-1 min-w-0 pb-2 ${hasImage ? 'md:col-span-2' : 'md:col-span-3'}`}>
              <div className="mb-4 mt-4">
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 break-words">{artist.Name}</h1>
                <div className="flex items-center justify-between gap-4 mt-2">
                  <p className="text-sm text-gray-300">
                    {albums.length} {albums.length === 1 ? 'album' : 'albums'} • {sortedSongs.length} {sortedSongs.length === 1 ? 'song' : 'songs'}
                  </p>
                  <button
                    onClick={() => {
                      const isCurrentArtistPlaying = currentTrack && isPlaying && (
                        currentTrack.ArtistItems?.some(artist => artist.Id === id) ||
                        currentTrack.AlbumArtist === artist?.Name
                      )
                      if (isCurrentArtistPlaying) {
                        pause()
                      } else {
                        handleShuffleAll()
                      }
                    }}
                    className="bg-white/10 hover:bg-white/20 text-white font-semibold py-1.5 px-3 rounded-full transition-all hover:scale-105 flex items-center gap-1.5 backdrop-blur-sm border border-white/20 flex-shrink-0"
                  >
                    {currentTrack && isPlaying && (
                      currentTrack.ArtistItems?.some(artist => artist.Id === id) ||
                      currentTrack.AlbumArtist === artist?.Name
                    ) ? (
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
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content section */}
      <div className="pt-6 md:pt-10">
        {/* Bio section - always collapsed by default with chevron, regardless of length */}
        {artist.Overview && (
          <div className="mb-6 -mt-4 px-4">
            <div className="text-white relative">
              {/* Hidden measurement paragraph (left in place for potential future use) */}
              <p
                ref={bioMeasureRef}
                className="text-sm text-gray-300 leading-relaxed absolute opacity-0 pointer-events-none -z-10"
              >
                {artist.Overview}
              </p>

              {!bioExpanded && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBioExpanded(true)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-sm text-gray-300 leading-relaxed line-clamp-2">
                      {artist.Overview}
                    </p>
                  </button>
                  <button
                    onClick={() => setBioExpanded(true)}
                    className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              )}

              {bioExpanded && (
                <div>
                  <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                    {artist.Overview}
                  </p>
                  <button
                    onClick={() => setBioExpanded(false)}
                    className="mt-2 flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors ml-auto"
                  >
                    Show less
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Albums section */}
        {albums.length > 0 && (
          <div className="mb-10 px-4">
            <h2 className="text-2xl font-bold text-white mb-4">Albums ({albums.length})</h2>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
              {albums.map((album) => {
                const year = getAlbumYear(album)
                return (
                  <ArtistAlbumItem
                    key={album.Id}
                    album={album}
                    year={year}
                    onNavigate={(id) => navigate(`/album/${id}`)}
                    onContextMenu={(album) => {
                      setContextMenuItem(album)
                      setContextMenuItemType('album')
                      setContextMenuOpen(true)
                    }}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* All songs section */}
        {songs.length > 0 && (
          <div id="songs-section">
            <div className="px-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold text-white">Songs ({songs.length})</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePlayAllSongsFromArtist}
                    className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-lg transition-colors"
                    aria-label="Play all songs"
                  >
                    <Play className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleAddAllSongsFromArtistToQueue}
                    className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-lg transition-colors"
                    aria-label="Add all songs to queue"
                  >
                    <ListEnd className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="mt-1">
                <button
                  type="button"
                  onClick={cycleSongSortOrder}
                  className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  {songSortOrder}
                  <ArrowUpDown className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="space-y-0">
              {sortedSongs.map((song) => {
                const { album, year } = getSongAlbumAndYear(song)
                return (
                  <ArtistSongItem
                    key={song.Id}
                    song={song}
                    album={album}
                    year={year}
                    onClick={playTrack}
                    onContextMenu={(song) => {
                      setContextMenuItem(song)
                      setContextMenuItemType('song')
                      setContextMenuOpen(true)
                    }}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>
      <ContextMenu
        item={contextMenuItem}
        itemType={contextMenuItemType}
        isOpen={contextMenuOpen}
        onClose={() => {
          setContextMenuOpen(false)
          setContextMenuItem(null)
          setContextMenuItemType(null)
        }}
      />
      <ContextMenu
        item={artist}
        itemType="artist"
        isOpen={artistContextMenuOpen}
        onClose={() => {
          setArtistContextMenuOpen(false)
        }}
      />
    </div>
  )
}

