import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Disc } from 'lucide-react'
import { useMusicStore } from '../../stores/musicStore'
import { jellyfinClient } from '../../api/jellyfin'
import { usePlayerStore } from '../../stores/playerStore'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import SongItem from '../songs/SongItem'
import Image from '../shared/Image'
import { ArrowLeft, Shuffle, Pause, ArrowUpDown, Play, ListEnd } from 'lucide-react'
import Spinner from '../shared/Spinner'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'
import type { BaseItemDto, LightweightSong } from '../../api/types'

const INITIAL_VISIBLE_ALBUMS = 45
const VISIBLE_ALBUMS_INCREMENT = 45
const INITIAL_VISIBLE_SONGS = 45
const VISIBLE_SONGS_INCREMENT = 45

type SongSortOrder = 'Alphabetical' | 'Newest' | 'Oldest'

interface GenreAlbumItemProps {
  album: BaseItemDto
  year: number | null
  onNavigate: (id: string) => void
  onContextMenu: (album: BaseItemDto, mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
}

function GenreAlbumItem({ album, year, onNavigate, onContextMenu }: GenreAlbumItemProps) {
  const [imageError, setImageError] = useState(false)
  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      onContextMenu(album, 'mobile')
    },
    onClick: () => onNavigate(album.Id),
  })

  return (
    <button
      onClick={() => onNavigate(album.Id)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(album, 'desktop', { x: e.clientX, y: e.clientY })
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

export default function GenreSongsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { playAlbum, toggleShuffle, isPlaying, pause, shuffleGenreSongs, addToQueue } = usePlayerStore()
  const currentTrack = useCurrentTrack()
  const { genres, genreSongs, setGenreSongs } = useMusicStore()
  const [genre, setGenre] = useState<BaseItemDto | null>(null)
  const [songs, setSongs] = useState<LightweightSong[]>([])
  const [loading, setLoading] = useState(true)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [contextMenuItemType, setContextMenuItemType] = useState<'album' | 'song' | null>(null)
  const [visibleAlbumsCount, setVisibleAlbumsCount] = useState(INITIAL_VISIBLE_ALBUMS)
  const [visibleSongsCount, setVisibleSongsCount] = useState(INITIAL_VISIBLE_SONGS)
  const [isShufflingGenre, setIsShufflingGenre] = useState(false)
  const [songSortOrder, setSongSortOrder] = useState<SongSortOrder>('Alphabetical')
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)

  // Reset loading state after a timeout to prevent permanent disabling
  useEffect(() => {
    if (isShufflingGenre) {
      const timeout = setTimeout(() => {
        setIsShufflingGenre(false)
      }, 10000) // Reset after 10 seconds max
      return () => clearTimeout(timeout)
    }
  }, [isShufflingGenre])

  useEffect(() => {
    if (!id) return

    const loadGenreSongs = async () => {
      // Check cache first
      const cachedSongs = genreSongs[id]

      if (cachedSongs && cachedSongs.length > 0) {
        // Use cached genres from store if available, otherwise fetch
        let genresList = genres
        if (genresList.length === 0) {
          genresList = await jellyfinClient.getGenres()
        }

        const foundGenre = genresList.find(g => g.Id === id)
        if (foundGenre) {
          setGenre(foundGenre)
        }
        setSongs(cachedSongs)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        // Use cached genres from store if available, otherwise fetch
        let genresList = genres
        if (genresList.length === 0) {
          genresList = await jellyfinClient.getGenres()
        }

        const foundGenre = genresList.find(g => g.Id === id)
        if (!foundGenre) {
          setLoading(false)
          return
        }
        setGenre(foundGenre)

        const genreName = foundGenre.Name
        if (!genreName) {
          setLoading(false)
          return
        }

        // Load songs for this genre using the helper function
        const filtered = await jellyfinClient.getGenreSongs(id, genreName)

        // Cache the songs
        setGenreSongs(id, filtered)
        setSongs(filtered)
      } catch (error) {
        console.error('Failed to load genre songs:', error)
      } finally {
        setLoading(false)
      }
    }

    loadGenreSongs()
  }, [id, genres, genreSongs, setGenreSongs])

  const handleShufflePlay = async () => {


    if (songs.length > 0 && genre?.Id && genre?.Name && !isShufflingGenre) {

      // Prevent concurrent shuffle operations
      const state = usePlayerStore.getState()
      const { isShuffleAllActive, isShuffleGenreActive, shuffle } = state

      if (isShuffleAllActive || isShuffleGenreActive) {
        return // Another shuffle is active, ignore click
      }

      setIsShufflingGenre(true)


      try {
        await shuffleGenreSongs(genre.Id, genre.Name)


      } catch (error) {


        console.error('Failed to shuffle genre:', error)
      } finally {
        setIsShufflingGenre(false)


      }
    } else {


    }
  }

  // Extract unique albums from songs and sort by date (newest to oldest)
  const albums = useMemo(() => {
    const albumMap = new Map<string, BaseItemDto>()
    songs.forEach(song => {
      if (song.AlbumId && song.Album) {
        if (!albumMap.has(song.AlbumId)) {
          albumMap.set(song.AlbumId, {
            Id: song.AlbumId,
            Name: song.Album,
            AlbumArtist: song.AlbumArtist,
            ArtistItems: song.ArtistItems,
            ProductionYear: song.ProductionYear,
            PremiereDate: song.PremiereDate,
          } as BaseItemDto)
        }
      }
    })
    return Array.from(albumMap.values()).sort((a, b) => {
      const yearA = a.ProductionYear || (a.PremiereDate ? new Date(a.PremiereDate).getFullYear() : 0)
      const yearB = b.ProductionYear || (b.PremiereDate ? new Date(b.PremiereDate).getFullYear() : 0)

      // Sort by year (newest first)
      if (yearA !== yearB) {
        return yearB - yearA
      }

      // If same year, sort by name
      const nameA = a.Name || ''
      const nameB = b.Name || ''
      return nameA.localeCompare(nameB)
    })
  }, [songs])

  // Group songs by artist, then album by date, then track number
  const groupedSongs = useMemo(() => {
    // Group by artist
    const artistMap = new Map<string, Map<string, BaseItemDto[]>>()

    songs.forEach(song => {
      const artistName = song.AlbumArtist || song.ArtistItems?.[0]?.Name || 'Unknown Artist'
      const albumId = song.AlbumId || 'no-album'

      if (!artistMap.has(artistName)) {
        artistMap.set(artistName, new Map())
      }

      const albumMap = artistMap.get(artistName)!
      if (!albumMap.has(albumId)) {
        albumMap.set(albumId, [])
      }

      albumMap.get(albumId)!.push(song)
    })

    // Sort within each group
    const result: Array<{ artist: string; albums: Array<{ albumId: string; albumName: string; songs: BaseItemDto[] }> }> = []

    artistMap.forEach((albumMap, artistName) => {
      const albums: Array<{ albumId: string; albumName: string; songs: BaseItemDto[] }> = []

      albumMap.forEach((songs, albumId) => {
        // Sort songs by track number
        const sortedSongs = [...songs].sort((a, b) => {
          const trackA = a.IndexNumber || 0
          const trackB = b.IndexNumber || 0
          return trackA - trackB
        })

        const albumName = sortedSongs[0]?.Album || 'Unknown Album'
        albums.push({ albumId, albumName, songs: sortedSongs })
      })

      // Sort albums by date (newest first), then by name
      albums.sort((a, b) => {
        const songA = a.songs[0]
        const songB = b.songs[0]

        const yearA = songA?.ProductionYear || (songA?.PremiereDate ? new Date(songA.PremiereDate).getFullYear() : 0)
        const yearB = songB?.ProductionYear || (songB?.PremiereDate ? new Date(songB.PremiereDate).getFullYear() : 0)

        if (yearA !== yearB) {
          return yearB - yearA
        }

        return a.albumName.localeCompare(b.albumName)
      })

      result.push({ artist: artistName, albums })
    })

    // Sort artists alphabetically
    result.sort((a, b) => a.artist.localeCompare(b.artist))

    return result
  }, [songs])

  // Helper function to get album date for a song
  const getSongAlbumDate = (song: LightweightSong, albums: BaseItemDto[]): number => {
    const album = albums.find(a => a.Id === song.AlbumId)
    if (!album) return 0

    if (album.ProductionYear) {
      return album.ProductionYear
    }

    if (album.PremiereDate) {
      const date = new Date(album.PremiereDate)
      return date.getFullYear()
    }

    return 0
  }

  // Sort songs based on current sort order
  const sortedSongs = useMemo(() => {
    if (songSortOrder === 'Alphabetical') {
      return [...songs].sort((a, b) => {
        const nameA = a.Name || ''
        const nameB = b.Name || ''
        return nameA.localeCompare(nameB)
      })
    }

    // For Newest and Oldest, sort by album date, then album ID, then track number, then name
    return [...songs].sort((a, b) => {
      const dateA = getSongAlbumDate(a, albums)
      const dateB = getSongAlbumDate(b, albums)

      // Primary sort: by album date
      if (dateA !== dateB) {
        return songSortOrder === 'Newest' ? dateB - dateA : dateA - dateB
      }

      // Secondary sort: by album ID (keeps songs from same album together)
      const albumA = a.AlbumId || ''
      const albumB = b.AlbumId || ''
      if (albumA !== albumB) {
        return albumA.localeCompare(albumB)
      }

      // Tertiary sort: by track number
      const trackA = a.IndexNumber || 0
      const trackB = b.IndexNumber || 0
      if (trackA !== trackB) {
        return trackA - trackB
      }

      // Quaternary sort: alphabetically by name (fallback)
      const nameA = a.Name || ''
      const nameB = b.Name || ''
      return nameA.localeCompare(nameB)
    })
  }, [songs, songSortOrder, albums])

  // Cycle through sort orders
  const cycleSongSortOrder = () => {
    setSongSortOrder(current => {
      if (current === 'Alphabetical') return 'Newest'
      if (current === 'Newest') return 'Oldest'
      return 'Alphabetical'
    })
  }

  // Play all songs from genre in current sort order
  const handlePlayAllSongsFromGenre = () => {
    if (sortedSongs.length > 0) {
      playAlbum(sortedSongs)
    }
  }

  // Add all songs from genre to queue in current sort order
  const handleAddAllSongsFromGenreToQueue = () => {
    if (sortedSongs.length > 0) {
      addToQueue(sortedSongs)
    }
  }

  // Reset visible albums window when albums change
  useEffect(() => {
    setVisibleAlbumsCount(INITIAL_VISIBLE_ALBUMS)
  }, [albums.length])

  // Incrementally reveal more albums as the user scrolls near the bottom
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      const fullHeight = document.documentElement.scrollHeight

      // When the user is within ~1.5 viewports of the bottom, load more rows
      if (scrollTop + viewportHeight * 1.5 >= fullHeight) {
        setVisibleAlbumsCount((prev) =>
          Math.min(prev + VISIBLE_ALBUMS_INCREMENT, albums.length)
        )
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [albums.length])

  // Reset visible songs window when sortedSongs change
  useEffect(() => {
    setVisibleSongsCount(INITIAL_VISIBLE_SONGS)
  }, [sortedSongs.length])

  // Incrementally reveal more songs as the user scrolls near the bottom
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      const fullHeight = document.documentElement.scrollHeight

      // When the user is within ~1.5 viewports of the bottom, load more rows
      if (scrollTop + viewportHeight * 1.5 >= fullHeight) {
        setVisibleSongsCount((prev) =>
          Math.min(prev + VISIBLE_SONGS_INCREMENT, sortedSongs.length)
        )
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [sortedSongs.length])

  if (loading) {
    return (
      <div className="pb-20">
        <div className="fixed top-0 left-0 right-0 bg-black z-10 border-b border-zinc-800" style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}>
          <div className="max-w-[768px] mx-auto">
            <div className="flex items-center gap-4 p-4">
              <button
                onClick={() => navigate(-1)}
                className="text-white hover:text-zinc-300 transition-colors"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <h1 className="text-xl font-bold flex-1 truncate">{genre?.Name || ''}</h1>
              <div className="flex items-center">
                <Spinner />
              </div>
            </div>
          </div>
        </div>
        <div className="pt-20">
          <div className="flex items-center justify-center h-screen text-gray-400">
          </div>
        </div>
      </div>
    )
  }

  if (!genre || songs.length === 0) {
    return (
      <div className="pb-20">
        <div className="fixed top-0 left-0 right-0 bg-black z-10 border-b border-zinc-800" style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}>
          <div className="max-w-[768px] mx-auto">
            <div className="flex items-center gap-4 p-4">
              <button
                onClick={() => navigate(-1)}
                className="text-white hover:text-zinc-300 transition-colors"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <h1 className="text-xl font-bold flex-1 truncate">Genre</h1>
            </div>
          </div>
        </div>
        <div className="pt-20">
          <div className="flex items-center justify-center h-screen text-gray-400">
            <p>Genre not found or no songs available</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div
        className={`fixed top-0 left-0 right-0 bg-black z-10 border-b border-zinc-800 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'xl:right-[320px]' : 'xl:right-0'}`}
        style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
      >
        <div className="max-w-[768px] mx-auto">
          <div className="flex items-center gap-4 p-4">
            <button
              onClick={() => navigate(-1)}
              className="text-white hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold flex-1 truncate">{genre.Name}</h1>
            <button
              onClick={handleShufflePlay}
              disabled={isShufflingGenre}
              className="w-8 h-8 flex items-center justify-center text-white hover:bg-zinc-800 rounded-full transition-colors disabled:opacity-50"
              aria-label="Shuffle genre songs"
            >
              {isShufflingGenre ? (
                <div className="w-4 h-4 border-2 border-zinc-400 border-t-white rounded-full animate-spin"></div>
              ) : (
                <Shuffle className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div style={{ paddingTop: `calc(env(safe-area-inset-top) + 5rem)` }}>
        {/* Albums section */}
        {albums.length > 0 && (
          <div className="mb-10 px-4 pt-4">
            <h2 className="text-xl font-bold text-white mb-4">Albums ({albums.length})</h2>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
              {albums.slice(0, visibleAlbumsCount).map((album) => {
                const year = album.ProductionYear || (album.PremiereDate ? new Date(album.PremiereDate).getFullYear() : null)
                return (
                  <GenreAlbumItem
                    key={album.Id}
                    album={album}
                    year={year}
                    onNavigate={(id) => navigate(`/album/${id}`)}
                    onContextMenu={(album, mode, position) => {
                      setContextMenuItem(album)
                      setContextMenuItemType('album')
                      setContextMenuMode(mode || 'mobile')
                      setContextMenuPosition(position || null)
                      setContextMenuOpen(true)
                    }}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* Songs section */}
        {songs.length > 0 && (
          <div>
            <div className="px-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold text-white">Songs ({songs.length})</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePlayAllSongsFromGenre}
                    className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-lg transition-colors"
                    aria-label="Play all songs"
                  >
                    <Play className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleAddAllSongsFromGenreToQueue}
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
              {sortedSongs.slice(0, visibleSongsCount).map((song) => (
                <SongItem key={song.Id} song={song} />
              ))}
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
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </div>
  )
}

