import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Disc } from 'lucide-react'
import { useMusicStore } from '../../stores/musicStore'
import { jellyfinClient } from '../../api/jellyfin'
import { usePlayerStore } from '../../stores/playerStore'
import { useSyncStore } from '../../stores/syncStore'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import { useScrollLazyLoad } from '../../hooks/useScrollLazyLoad'
import SongItem from '../songs/SongItem'
import Image from '../shared/Image'
import { ArrowLeft, Shuffle, Pause, ArrowUpDown, Play, ListEnd } from 'lucide-react'
import Spinner from '../shared/Spinner'
import ContextMenu from '../shared/ContextMenu'
import Pagination from '../shared/Pagination'
import { useLongPress } from '../../hooks/useLongPress'
import type { BaseItemDto, LightweightSong } from '../../api/types'
import { logger } from '../../utils/logger'

const INITIAL_VISIBLE_ALBUMS = 45
const VISIBLE_ALBUMS_INCREMENT = 45
const ALBUMS_PER_PAGE = 84
const INITIAL_VISIBLE_SONGS = 45
const VISIBLE_SONGS_INCREMENT = 45

type SongSortOrder = 'Alphabetical' | 'Newest' | 'Oldest'

interface GenreAlbumItemProps {
  album: BaseItemDto
  onNavigate: (id: string) => void
  onContextMenu: (album: BaseItemDto, mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  showImage?: boolean
}

function GenreAlbumItem({ album, onNavigate, onContextMenu, showImage = true }: GenreAlbumItemProps) {
  const [imageError, setImageError] = useState(false)
  const contextMenuJustOpenedRef = useRef(false)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuJustOpenedRef.current = true
    onContextMenu(album, 'desktop', { x: e.clientX, y: e.clientY })
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 300)
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      onContextMenu(album, 'mobile')
    },
    onClick: () => {
      if (contextMenuJustOpenedRef.current) {
        contextMenuJustOpenedRef.current = false
        return
      }
      onNavigate(album.Id)
    },
  })

  return (
    <button
      onClick={() => {
        if (contextMenuJustOpenedRef.current) {
          contextMenuJustOpenedRef.current = false
          return
        }
        onNavigate(album.Id)
      }}
      onContextMenu={handleContextMenu}
      {...longPressHandlers}
      className="text-left group"
    >
      <div className="aspect-square rounded overflow-hidden mb-2 bg-zinc-900 flex items-center justify-center">
        {imageError ? (
          <Disc className="w-12 h-12 text-gray-500" />
        ) : showImage ? (
          <Image
            src={jellyfinClient.getAlbumArtUrl(album.Id, 474)}
            alt={album.Name}
            className="w-full h-full object-cover"
            showOutline={true}
            rounded="rounded"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full bg-zinc-900" />
        )}
      </div>
      <div className="text-sm font-medium text-white truncate">{album.Name}</div>
      <div className="text-xs text-gray-400 truncate">
        {album.AlbumArtist || album.ArtistItems?.[0]?.Name || 'Unknown Artist'}
      </div>
    </button>
  )
}

export default function GenreSongsPage() {
  const { id: rawId } = useParams<{ id: string }>()
  const id = rawId ? decodeURIComponent(rawId) : undefined
  const navigate = useNavigate()
  const { playAlbum, toggleShuffle, isPlaying, pause, shuffleGenreSongs, addToQueue } = usePlayerStore()
  const currentTrack = useCurrentTrack()
  const { genres, genreSongs, setGenreSongs } = useMusicStore()
  const { state: syncState } = useSyncStore()
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
  const [syncTrigger, setSyncTrigger] = useState(0)
  const [isShufflingGenre, setIsShufflingGenre] = useState(false)
  const [songSortOrder, setSongSortOrder] = useState<SongSortOrder>('Alphabetical')
  const [currentPage, setCurrentPage] = useState(0)
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

  // Refresh genre data when sync completes
  useEffect(() => {
    if (syncState === 'success' && id) {
      // Trigger a re-fetch of genre data after sync
      setSyncTrigger(prev => prev + 1)
    }
  }, [syncState, id])

  useEffect(() => {
    if (!id) return

    // Track if component is still mounted to prevent state updates after unmount
    let isMounted = true

    const loadGenreSongs = async () => {
      // Check cache first
      const cachedSongs = genreSongs[id]


      if (cachedSongs && cachedSongs.length > 0) {

        // Use cached genres from store if available, otherwise fetch
        let genresList = genres
        if (genresList.length === 0) {
          genresList = await jellyfinClient.getGenres()
        }

        if (!isMounted) return

        const foundGenre = genresList.find(g => g.Id === id)
        if (foundGenre) {
          setGenre(foundGenre)
        }
        setSongs(cachedSongs)
        setLoading(false)

        // Cache is still fresh, no update needed
        return
      }

      setLoading(true)
      try {
        // Use cached genres from store if available, otherwise fetch
        let genresList = genres
        if (genresList.length === 0) {
          genresList = await jellyfinClient.getGenres()
        }

        if (!isMounted) return

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

        if (!isMounted) return

        // Cache the songs
        setGenreSongs(id, filtered)
        setSongs(filtered)
      } catch (error) {
        if (!isMounted) return
        logger.error('Failed to load genre songs:', error)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadGenreSongs()

    return () => {
      isMounted = false
    }
  }, [id, genres, genreSongs, setGenreSongs, syncTrigger])

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


        logger.error('Failed to shuffle genre:', error)
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
          const albumData = {
            Id: song.AlbumId,
            Name: song.Album,
            AlbumArtist: song.AlbumArtist,
            ArtistItems: song.ArtistItems,
            ProductionYear: song.ProductionYear,
            PremiereDate: song.PremiereDate,
          } as BaseItemDto


          albumMap.set(song.AlbumId, albumData)
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

  // Determine if we should use pagination for albums (when there are more than 84)
  const usePaginationForAlbums = albums.length > 84

  // Get paginated albums if using pagination, otherwise use all albums
  const paginatedAlbums = useMemo(() => {
    if (!usePaginationForAlbums) return albums

    const startIndex = currentPage * ALBUMS_PER_PAGE
    const endIndex = startIndex + ALBUMS_PER_PAGE
    return albums.slice(startIndex, endIndex)
  }, [albums, currentPage, usePaginationForAlbums])

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
    if (album) {
      const year = album.ProductionYear || (album.PremiereDate ? new Date(album.PremiereDate).getFullYear() : 0)
      // Return timestamp for proper sorting (newest first)
      if (album.PremiereDate) {
        return new Date(album.PremiereDate).getTime()
      }
      // If only year is available, use year * 10000 to make it sortable
      return year * 10000
    }

    // Fallback: try to get date from song itself
    const year = song.ProductionYear || (song.PremiereDate ? new Date(song.PremiereDate).getFullYear() : 0)
    if (song.PremiereDate) {
      return new Date(song.PremiereDate).getTime()
    }
    return year * 10000
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

      // Secondary sort: by album name alphabetically
      const albumNameA = a.Album || ''
      const albumNameB = b.Album || ''
      if (albumNameA !== albumNameB) {
        return albumNameA.localeCompare(albumNameB)
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

  // Reset visible albums window when albums change (only for scroll loading)
  useEffect(() => {
    if (!usePaginationForAlbums) {
      setVisibleAlbumsCount(INITIAL_VISIBLE_ALBUMS)
    }
  }, [albums.length, usePaginationForAlbums])

  // Reset current page when albums change (when switching between genres)
  useEffect(() => {
    setCurrentPage(0)
  }, [id])

  // Albums use pagination buttons instead of scroll loading

  // Reset visible songs window when sortedSongs change
  useEffect(() => {
    setVisibleSongsCount(INITIAL_VISIBLE_SONGS)
  }, [sortedSongs.length])

  // Consolidated scroll-based lazy loading for songs and albums
  // Uses single efficient scroll listener instead of 4+ duplicate listeners
  useScrollLazyLoad({
    totalCount: sortedSongs.length,
    visibleCount: visibleSongsCount,
    increment: VISIBLE_SONGS_INCREMENT,
    setVisibleCount: setVisibleSongsCount,
    threshold: 1.0
  })

  useScrollLazyLoad({
    totalCount: albums.length,
    visibleCount: visibleAlbumsCount,
    increment: VISIBLE_ALBUMS_INCREMENT,
    setVisibleCount: setVisibleAlbumsCount,
    threshold: 1.0,
    enabled: !usePaginationForAlbums
  })

  if (loading) {
    return (
      <div className="pb-20">
        <div
          className={`fixed top-0 left-0 right-0 bg-black z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
          style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
        >
          <div className="max-w-[768px] mx-auto">
            <div className="flex items-center gap-4 py-4 pl-3 pr-4">
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
        <div
          className={`fixed top-0 left-0 right-0 bg-black z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
          style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
        >
          <div className="max-w-[768px] mx-auto">
            <div className="flex items-center gap-4 py-4 pl-3 pr-4">
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
        className={`fixed top-0 left-0 right-0 bg-black z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
      >
        <div className="max-w-[768px] mx-auto">
          <div className="flex items-center gap-4 py-4 pl-3 pr-4">
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

      {/* Gradient overlay below top bar */}
      <div
        className={`fixed left-0 right-0 z-[60] lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{
          top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 5rem - 16px)`,
          height: '24px',
            background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.8), transparent)'
        }}
      />

      <div style={{ paddingTop: `calc(env(safe-area-inset-top) + 5rem)` }}>
        {/* Albums section */}
        {albums.length > 0 && (
          <div className="mb-10 px-4 pt-4">
            <h2 className="text-xl font-bold text-white mb-4">Albums ({albums.length})</h2>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
              {(usePaginationForAlbums ? paginatedAlbums : albums).map((album, index) => {
                return (
                  <GenreAlbumItem
                    key={album.Id}
                    album={album}
                    onNavigate={(id) => navigate(`/album/${id}`)}
                    onContextMenu={(album, mode, position) => {
                      setContextMenuItem(album)
                      setContextMenuItemType('album')
                      setContextMenuMode(mode || 'mobile')
                      setContextMenuPosition(position || null)
                      setContextMenuOpen(true)
                    }}
                    showImage={usePaginationForAlbums ? true : index < visibleAlbumsCount}
                  />
                )
              })}
            </div>
          </div>
        )}
        {usePaginationForAlbums && albums.length > 0 && (
          <div className="-mt-10 mb-10">
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(albums.length / ALBUMS_PER_PAGE)}
              onPageChange={setCurrentPage}
              itemsPerPage={ALBUMS_PER_PAGE}
              totalItems={albums.length}
            />
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
                    className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-colors"
                    aria-label="Play all songs"
                  >
                    <Play className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleAddAllSongsFromGenreToQueue}
                    className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-colors"
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
              {sortedSongs.map((song, index) => {
                const shouldShowImage = index < visibleSongsCount
                return <SongItem key={song.Id} song={song} showImage={shouldShowImage} />
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
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </div>
  )
}


