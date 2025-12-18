import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { ArrowUpDown, Guitar, Calendar, User, Disc, Play, ListEnd } from 'lucide-react'
import { useMusicStore } from '../../stores/musicStore'
import { usePlayerStore } from '../../stores/playerStore'
import { jellyfinClient } from '../../api/jellyfin'
import SearchInput from '../shared/SearchInput'
import SongItem from './SongItem'
import Pagination from '../shared/Pagination'
import FilterBottomSheet from '../home/FilterBottomSheet'
import ContextMenu from '../shared/ContextMenu'
import Spinner from '../shared/Spinner'
import { useLongPress } from '../../hooks/useLongPress'
import type { BaseItemDto } from '../../api/types'
import { normalizeQuotes } from '../../utils/formatting'
import { fetchAllLibraryItems, unifiedSearch } from '../../utils/search'

interface SearchArtistItemProps {
  artist: BaseItemDto
  onClick: (id: string) => void
  onContextMenu: (item: BaseItemDto, type: 'artist', mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId: string | null
}

const searchArtistAlbumArtCache = new Map<string, string | null>()

function SearchArtistItem({ artist, onClick, onContextMenu, contextMenuItemId }: SearchArtistItemProps) {
  const [imageError, setImageError] = useState(false)
  const contextMenuJustOpenedRef = useRef(false)
  const isThisItemMenuOpen = contextMenuItemId === artist.Id
  const [fallbackAlbumArtUrl, setFallbackAlbumArtUrl] = useState<string | null>(null)

  useEffect(() => {
    // Match the artists list behavior: if the artist already has a primary image,
    // prefer that and don't compute a fallback here.
    if (artist.ImageTags?.Primary) {
      setFallbackAlbumArtUrl(null)
      return
    }

    const cached = searchArtistAlbumArtCache.get(artist.Id)
    if (cached !== undefined) {
      setFallbackAlbumArtUrl(cached)
      return
    }

    let isCancelled = false

    const loadFallback = async () => {
      try {
        const { albums, songs } = await jellyfinClient.getArtistItems(artist.Id)

        // Prefer an album if available, otherwise fall back to a song's album art.
        const firstAlbum = albums[0]
        const firstSongWithAlbum = songs.find((song) => song.AlbumId) || songs[0]
        const artItem = firstAlbum || firstSongWithAlbum
        const artId = artItem ? (artItem.AlbumId || artItem.Id) : null
        const url = artId ? jellyfinClient.getAlbumArtUrl(artId, 96) : null
        searchArtistAlbumArtCache.set(artist.Id, url)
        if (!isCancelled) {
          setFallbackAlbumArtUrl(url)
        }
      } catch (error) {
        console.error('Failed to load fallback album art for artist (search item):', artist.Id, error)
        searchArtistAlbumArtCache.set(artist.Id, null)
      }
    }

    loadFallback()

    return () => {
      isCancelled = true
    }
  }, [artist.Id, artist.ImageTags])
  
  const handleClick = (e: React.MouseEvent) => {
    if (isThisItemMenuOpen || contextMenuJustOpenedRef.current) {
      e.preventDefault()
      e.stopPropagation()
      contextMenuJustOpenedRef.current = false
      return
    }
    onClick(artist.Id)
  }
  
  const handleContextMenuClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuJustOpenedRef.current = true
    onContextMenu(artist, 'artist', 'desktop', { x: e.clientX, y: e.clientY })
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 100)
  }
  
  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      onContextMenu(artist, 'artist', 'mobile')
    },
    onClick: handleClick,
  })

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContextMenuClick}
      {...longPressHandlers}
      className={`w-full flex items-center gap-4 hover:bg-white/10 transition-colors text-left cursor-pointer px-4 h-[72px] ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
    >
      <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-zinc-900 flex items-center justify-center">
        {imageError ? (
          <User className="w-6 h-6 text-gray-500" />
        ) : fallbackAlbumArtUrl || artist.ImageTags?.Primary ? (
          <img
            src={
              fallbackAlbumArtUrl ||
              jellyfinClient.getArtistImageUrl(artist.Id, 96)
            }
            alt={artist.Name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <User className="w-6 h-6 text-gray-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">{artist.Name}</div>
      </div>
    </button>
  )
}

interface SearchAlbumItemProps {
  album: BaseItemDto
  onClick: (id: string) => void
  onContextMenu: (item: BaseItemDto, type: 'album', mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId: string | null
}

function SearchAlbumItem({ album, onClick, onContextMenu, contextMenuItemId }: SearchAlbumItemProps) {
  const [imageError, setImageError] = useState(false)
  const contextMenuJustOpenedRef = useRef(false)
  const isThisItemMenuOpen = contextMenuItemId === album.Id
  
  const handleClick = (e: React.MouseEvent) => {
    if (isThisItemMenuOpen || contextMenuJustOpenedRef.current) {
      e.preventDefault()
      e.stopPropagation()
      contextMenuJustOpenedRef.current = false
      return
    }
    onClick(album.Id)
  }
  
  const handleContextMenuClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuJustOpenedRef.current = true
    onContextMenu(album, 'album', 'desktop', { x: e.clientX, y: e.clientY })
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 100)
  }
  
  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      onContextMenu(album, 'album', 'mobile')
    },
    onClick: handleClick,
  })
  
  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContextMenuClick}
      {...longPressHandlers}
      className="text-left group"
    >
      <div className="aspect-square rounded overflow-hidden mb-3 bg-zinc-900 shadow-lg relative flex items-center justify-center">
        {imageError ? (
          <Disc className="w-12 h-12 text-gray-500" />
        ) : (
          <>
            <img
              src={jellyfinClient.getAlbumArtUrl(album.Id, 474)}
              alt={album.Name}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
            <div className="absolute inset-0 pointer-events-none border border-white rounded" style={{ borderColor: 'rgba(255, 255, 255, 0.03)', borderWidth: '1px' }} />
          </>
        )}
      </div>
      <div className="text-sm font-semibold text-white truncate mb-1">{album.Name}</div>
      <div className="text-xs text-gray-400 truncate">
        {album.AlbumArtist || album.ArtistItems?.[0]?.Name || 'Unknown Artist'}
      </div>
    </button>
  )
}

interface SearchSongItemProps {
  song: BaseItemDto
  onClick: (song: BaseItemDto) => void
  onContextMenu: (item: BaseItemDto, type: 'song', mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId: string | null
  showImage?: boolean
}

function SearchSongItem({ song, onClick, onContextMenu, contextMenuItemId, showImage = true }: SearchSongItemProps) {
  const contextMenuJustOpenedRef = useRef(false)
  const isThisItemMenuOpen = contextMenuItemId === song.Id
  const [imageError, setImageError] = useState(false)
  
  const formatDuration = (ticks: number): string => {
    const seconds = Math.floor(ticks / 10000000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  
  const handleClick = (e: React.MouseEvent) => {
    if (isThisItemMenuOpen || contextMenuJustOpenedRef.current) {
      e.preventDefault()
      e.stopPropagation()
      contextMenuJustOpenedRef.current = false
      return
    }
    onClick(song)
  }
  
  const handleContextMenuClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuJustOpenedRef.current = true
    onContextMenu(song, 'song', 'desktop', { x: e.clientX, y: e.clientY })
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 100)
  }
  
  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      onContextMenu(song, 'song', 'mobile')
    },
    onClick: handleClick,
  })
  
  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContextMenuClick}
      {...longPressHandlers}
      className={`w-full flex items-center gap-3 hover:bg-white/10 transition-colors group px-4 py-3 ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
    >
      <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-900 self-center relative flex items-center justify-center">
        {imageError ? (
          <Disc className="w-7 h-7 text-gray-500" />
        ) : (
          <>
            <img
              src={jellyfinClient.getAlbumArtUrl(song.AlbumId || song.Id, 96)}
              alt={song.Name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImageError(true)}
            />
            <div
              className="absolute inset-0 pointer-events-none border border-white rounded-sm"
              style={{ borderColor: 'rgba(255, 255, 255, 0.03)', borderWidth: '1px' }}
            />
          </>
        )}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">{song.Name}</div>
        <div className="text-xs text-gray-400 truncate">
          {song.AlbumArtist || song.ArtistItems?.[0]?.Name || 'Unknown Artist'}
          {song.Album && ` • ${song.Album}`}
        </div>
      </div>
      {song.RunTimeTicks && (
        <div className="text-xs text-gray-500 flex-shrink-0 text-right">
          {formatDuration(song.RunTimeTicks)}
        </div>
      )}
    </button>
  )
}

const ITEMS_PER_PAGE = 90
const INITIAL_VISIBLE_SONGS = 45
const VISIBLE_SONGS_INCREMENT = 45
const INITIAL_VISIBLE_SEARCH_SONG_IMAGES = 45
const VISIBLE_SEARCH_SONG_IMAGES_INCREMENT = 45

export default function SongsPage() {
  const { songs, setSongs, sortPreferences, setSortPreference, setLoading, loading, genres } = useMusicStore()
  const { playTrack, playAlbum, addToQueue } = usePlayerStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [rawSearchResults, setRawSearchResults] = useState<{
    artists: BaseItemDto[]
    albums: BaseItemDto[]
    playlists: BaseItemDto[]
    songs: BaseItemDto[]
  } | null>(null)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [contextMenuItemType, setContextMenuItemType] = useState<'album' | 'song' | 'artist' | 'playlist' | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const navigate = useNavigate()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchScrollRef = useRef<HTMLDivElement | null>(null)

  // Filter state
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [yearRange, setYearRange] = useState<{ min: number | null; max: number | null }>({ min: null, max: null })
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
  const [activeFilterType, setActiveFilterType] = useState<'genre' | 'year' | null>(null)
  const [years, setYears] = useState<number[]>([])

  const sortOrder = sortPreferences.songs
  const isInitialLoad = useRef(true)
  const [isLoadingSortChange, setIsLoadingSortChange] = useState(false)
  const prevSortOrderRef = useRef(sortOrder)
  const [visibleSongsCount, setVisibleSongsCount] = useState(INITIAL_VISIBLE_SONGS)
  const [visibleSearchSongImageCount, setVisibleSearchSongImageCount] = useState(INITIAL_VISIBLE_SEARCH_SONG_IMAGES)

  // Load filter values
  useEffect(() => {
    const loadFilterValues = async () => {
      try {
        const store = useMusicStore.getState()
        if (store.years.length > 0) {
          setYears(store.years)
        } else {
          const yearsData = await jellyfinClient.getYears()
          setYears(yearsData)
        }
      } catch (error) {
        console.error('Failed to load filter values:', error)
      }
    }
    loadFilterValues()
  }, [])

  // Check if filters are active
  const hasActiveFilters = selectedGenres.length > 0 || yearRange.min !== null || yearRange.max !== null

  useEffect(() => {
    const hasQuery = searchQuery.trim().length > 0
    
    if (hasQuery || hasActiveFilters) {
      setIsSearching(true)
      const timeoutId = window.setTimeout(() => {
        const performSearch = async () => {
          try {
            if (hasQuery) {
              const results = await unifiedSearch(searchQuery, 450)
              setRawSearchResults(results)
            } else {
              const results = await fetchAllLibraryItems(450)
              setRawSearchResults(results)
            }
          } catch (error) {
            console.error('Search failed:', error)
            setRawSearchResults(null)
          } finally {
            setIsSearching(false)
          }
        }
        void performSearch()
      }, 250)

      return () => {
        window.clearTimeout(timeoutId)
      }
    } else {
      setRawSearchResults(null)
      setIsSearching(false)
    }
  }, [searchQuery, hasActiveFilters])

  // Apply filters to search results
  const searchResults = useMemo(() => {
    if (!rawSearchResults) return null

    const filterArtist = (item: BaseItemDto): boolean => {
      // Artists don't have years, so filter them out when year filter is active
      if (yearRange.min !== null || yearRange.max !== null) {
        return false
      }
      if (selectedGenres.length > 0) {
        const itemGenres = item.Genres || []
        const hasMatchingGenre = selectedGenres.some((selectedGenre) =>
          itemGenres.some((itemGenre) => itemGenre.toLowerCase() === selectedGenre.toLowerCase())
        )
        if (!hasMatchingGenre) return false
      }
      return true
    }

    const filterAlbumOrSong = (item: BaseItemDto): boolean => {
      if (selectedGenres.length > 0) {
        const itemGenres = item.Genres || []
        const hasMatchingGenre = selectedGenres.some((selectedGenre) =>
          itemGenres.some((itemGenre) => itemGenre.toLowerCase() === selectedGenre.toLowerCase())
        )
        if (!hasMatchingGenre) return false
      }

      if (yearRange.min !== null || yearRange.max !== null) {
        const itemYear = item.ProductionYear
        if (!itemYear || itemYear <= 0) return false
        if (yearRange.min !== null && itemYear < yearRange.min) return false
        if (yearRange.max !== null && itemYear > yearRange.max) return false
      }

      return true
    }

    const filterPlaylist = (item: BaseItemDto): boolean => {
      // Playlists don't have years, so filter them out when year filter is active
      if (yearRange.min !== null || yearRange.max !== null) {
        return false
      }
      // Playlists don't have genres in the same way, so filter them out when genre filter is active
      if (selectedGenres.length > 0) {
        return false
      }
      return true
    }

    return {
      songs: rawSearchResults.songs.filter(filterAlbumOrSong),
      artists: rawSearchResults.artists.filter(filterArtist),
      albums: rawSearchResults.albums.filter(filterAlbumOrSong),
      playlists: (rawSearchResults.playlists || []).filter(filterPlaylist),
    }
  }, [rawSearchResults, selectedGenres, yearRange])

  // Focus search input when overlay opens
  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus()
      // Set cursor position to end of input
      if (searchInputRef.current) {
        const length = searchInputRef.current.value.length
        searchInputRef.current.setSelectionRange(length, length)
      }
    }
  }, [isSearchOpen])

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (query.trim().length > 0 && !isSearchOpen) {
      setIsSearchOpen(true)
    }
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    setRawSearchResults(null)
  }

  const handleCancelSearch = () => {
    setIsSearchOpen(false)
    setSearchQuery('')
    setRawSearchResults(null)
    setSelectedGenres([])
    setYearRange({ min: null, max: null })
  }

  const openFilterSheet = (type: 'genre' | 'year') => {
    setActiveFilterType(type)
    setIsFilterSheetOpen(true)
  }

  const handleGenreApply = (selected: string[]) => {
    setSelectedGenres(selected)
  }

  const handleYearApply = (range: { min: number | null; max: number | null }) => {
    setYearRange(range)
  }

  const handleArtistClick = (artistId: string) => {
    navigate(`/artist/${artistId}`)
    setIsSearchOpen(false)
    setSearchQuery('')
    setRawSearchResults(null)
  }

  const handleAlbumClick = (albumId: string) => {
    navigate(`/album/${albumId}`)
    setIsSearchOpen(false)
    setSearchQuery('')
    setRawSearchResults(null)
  }

  const handleSongClick = (song: BaseItemDto) => {
    // Play only the selected song
    playTrack(song, [song])
    // Don't close search - keep it open so user can continue browsing
  }

  const handlePlayAllSongs = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (searchResults?.songs && searchResults.songs.length > 0) {
      playAlbum(searchResults.songs)
    }
  }

  const handleAddSongsToQueue = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (searchResults?.songs && searchResults.songs.length > 0) {
      addToQueue(searchResults.songs)
    }
  }

  const handlePlaylistClick = (playlistId: string) => {
    navigate(`/playlist/${playlistId}`)
    setIsSearchOpen(false)
    setSearchQuery('')
    setRawSearchResults(null)
  }

  const openContextMenu = (item: BaseItemDto, type: 'album' | 'song' | 'artist' | 'playlist', mode: 'mobile' | 'desktop' = 'mobile', position?: { x: number, y: number }) => {
    setContextMenuItem(item)
    setContextMenuItemType(type)
    setContextMenuMode(mode)
    setContextMenuPosition(position || null)
    setContextMenuOpen(true)
  }

  useEffect(() => {
    if (!searchQuery.trim()) {
      setCurrentPage(0)
    }
  }, [sortOrder, searchQuery])

  // Reset visible search song images when query or search open state changes
  useEffect(() => {
    setVisibleSearchSongImageCount(INITIAL_VISIBLE_SEARCH_SONG_IMAGES)
  }, [searchQuery, isSearchOpen, rawSearchResults?.songs.length])

  // Incrementally reveal more search song images as the user scrolls near the bottom
  useEffect(() => {
    const container = searchScrollRef.current
    if (!isSearchOpen || !container || !(rawSearchResults?.songs?.length)) return

    const handleScroll = () => {
      const scrollTop = container.scrollTop
      const viewportHeight = container.clientHeight
      const fullHeight = container.scrollHeight

      if (scrollTop + viewportHeight * 1.5 >= fullHeight) {
        setVisibleSearchSongImageCount((prev) =>
          Math.min(prev + VISIBLE_SEARCH_SONG_IMAGES_INCREMENT, rawSearchResults.songs.length)
        )
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [isSearchOpen, rawSearchResults?.songs.length, visibleSearchSongImageCount])

  // Reset visible songs window when page or songs list changes
  useEffect(() => {
    setVisibleSongsCount(INITIAL_VISIBLE_SONGS)
  }, [currentPage, songs.length])

  // Incrementally reveal more songs as the user scrolls near the bottom
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      const fullHeight = document.documentElement.scrollHeight

      // When the user is within ~1.5 viewports of the bottom, load more rows
      if (scrollTop + viewportHeight * 1.5 >= fullHeight) {
        setVisibleSongsCount((prev) =>
          Math.min(prev + VISIBLE_SONGS_INCREMENT, songs.length)
        )
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [songs.length])

  useEffect(() => {
    if (!searchQuery.trim()) {
      // Check if sortOrder changed (not initial load)
      if (!isInitialLoad.current && prevSortOrderRef.current !== sortOrder) {
        setIsLoadingSortChange(true)
      }
      prevSortOrderRef.current = sortOrder
      loadSongs()
    }
  }, [currentPage, sortOrder, searchQuery])

  useEffect(() => {
    // Mark initial load as complete after first render
    if (isInitialLoad.current) {
      isInitialLoad.current = false
    }
  }, [])

  const loadSongs = async () => {
    setLoading('songs', true)
    try {
      const options: any = {
        limit: ITEMS_PER_PAGE,
        startIndex: currentPage * ITEMS_PER_PAGE,
      }

      if (sortOrder === 'RecentlyAdded') {
        options.sortBy = ['DateCreated']
        options.sortOrder = 'Descending'
      } else {
        options.sortBy = ['SortName']
        options.sortOrder = 'Ascending'
      }

      const result = await jellyfinClient.getSongs(options)
      setSongs(result.Items)
      setTotalCount(result.TotalRecordCount || 0)
    } catch (error) {
      console.error('Failed to load songs:', error)
      setSongs([])
      setTotalCount(0)
    } finally {
      setLoading('songs', false)
      setIsLoadingSortChange(false)
    }
  }

  return (
    <>
      <div className="pb-20">
        <div className="fixed top-0 left-0 right-0 bg-black z-10 border-b border-zinc-800" style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}>
          <div className="max-w-[768px] mx-auto">
            <div className="p-4 lg:pl-8">
            {/* Header with title and search icon */}
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-2xl font-bold text-white">Songs</h1>
              <button
                onClick={() => setIsSearchOpen(true)}
                className="w-10 h-10 flex items-center justify-center text-white hover:bg-zinc-800 rounded-full transition-colors"
                aria-label="Search"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </button>
            </div>
            {/* Sorting control */}
            {!isSearchOpen && (
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setSortPreference('songs', sortOrder === 'RecentlyAdded' ? 'Alphabetical' : 'RecentlyAdded')}
                  className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  {sortOrder === 'RecentlyAdded' ? 'Recently Added' : 'Alphabetically'}
                  <ArrowUpDown className="w-4 h-4" />
                </button>
                {loading.songs && !isInitialLoad.current && (
                  <div className="flex items-center">
                    <Spinner />
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        </div>

        <div style={{ paddingTop: `calc(env(safe-area-inset-top) + 7rem)` }}>
        {!isSearchOpen && (
          <div className={isLoadingSortChange ? 'opacity-50 pointer-events-none' : ''}>
            {songs.length === 0 && !loading.songs ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <p>No songs found</p>
              </div>
            ) : (
              <>
                <div className="space-y-0">
                  {songs.map((song, index) => (
                    <SongItem
                      key={song.Id}
                      song={song}
                      showImage={index < visibleSongsCount}
                    />
                  ))}
                </div>
                <Pagination
                  currentPage={currentPage}
                  totalPages={Math.ceil(totalCount / ITEMS_PER_PAGE)}
                  onPageChange={setCurrentPage}
                  itemsPerPage={ITEMS_PER_PAGE}
                  totalItems={totalCount}
                />
              </>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Full-page search overlay - rendered via portal to escape stacking context */}
      {isSearchOpen && createPortal(
        <>
        <div
          ref={searchScrollRef}
          className="fixed inset-0 bg-black z-[9999] overflow-y-auto p-0 m-0"
        >
          {/* Fixed overlay to hide content behind status bar */}
          <div 
            className="fixed top-0 left-0 right-0 bg-black z-50 pointer-events-none"
            style={{ height: `env(safe-area-inset-top)`, top: `var(--header-offset, 0px)` }}
          />
          {/* Fixed search header with Cancel button */}
          <div className="fixed top-0 left-0 right-0 bg-black z-10 pt-0 pb-0 w-full m-0" style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))`, height: '76px' }}>
            <div className="max-w-[768px] mx-auto w-full">
              <div className="flex items-center gap-3 px-4 pt-4">
                <div className="flex-1">
                  <SearchInput
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={handleSearch}
                    showClearButton={searchQuery.trim().length > 0}
                    onClear={handleClearSearch}
                  />
                </div>
                <button
                  onClick={handleCancelSearch}
                  className="px-4 py-2 text-white text-sm font-medium hover:text-zinc-300 transition-colors whitespace-nowrap flex-shrink-0"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

          <div className="max-w-[768px] mx-auto w-full" style={{ paddingTop: `calc(76px + env(safe-area-inset-top))` }}>
            {/* Sticky filter icons */}
            <div className="sticky bg-black z-10 pt-3 pb-4 border-b border-zinc-800" style={{ top: `calc(76px + env(safe-area-inset-top))` }}>
              <div className="flex items-center gap-3 px-4">
              <button
                onClick={() => openFilterSheet('genre')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  selectedGenres.length > 0
                    ? 'bg-[var(--accent-color)] text-white'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                aria-label="Filter by genre"
              >
                <Guitar className="w-4 h-4" />
                <span className="text-sm font-medium">Genre</span>
              </button>
              
              <button
                onClick={() => openFilterSheet('year')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  yearRange.min !== null || yearRange.max !== null
                    ? 'bg-[var(--accent-color)] text-white'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                aria-label="Filter by year"
              >
                <Calendar className="w-4 h-4" />
                <span className="text-sm font-medium">Year</span>
              </button>
              </div>
            </div>

            {/* Search results */}
            <div className="pb-32 pt-4">
            {isSearching ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-800 border-t-[var(--accent-color)]"></div>
              </div>
            ) : searchResults ? (
              <div className="space-y-8">
                {searchResults.songs.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4 px-4">
                      <h2 className="text-xl font-bold text-white">Songs</h2>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handlePlayAllSongs}
                          className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-lg transition-colors"
                          aria-label="Play all songs"
                        >
                          <Play className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleAddSongsToQueue}
                          className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-lg transition-colors"
                          aria-label="Add all songs to queue"
                        >
                          <ListEnd className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-0">
                      {searchResults.songs.map((song, index) => (
                        <SearchSongItem
                          key={song.Id}
                          song={song}
                          onClick={handleSongClick}
                          onContextMenu={openContextMenu}
                          contextMenuItemId={contextMenuItem?.Id || null}
                          showImage={index < visibleSearchSongImageCount}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.artists.length > 0 && (
                  <div>
                    <h2 className="text-xl font-bold text-white mb-4 px-4">Artists</h2>
                    <div className="space-y-0">
                      {searchResults.artists.slice(0, 5).map((artist) => (
                        <SearchArtistItem
                          key={artist.Id}
                          artist={artist}
                          onClick={handleArtistClick}
                          onContextMenu={openContextMenu}
                          contextMenuItemId={contextMenuItem?.Id || null}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.albums.length > 0 && (
                  <div className="px-4">
                    <h2 className="text-xl font-bold text-white mb-4">Albums</h2>
                    <div className="grid grid-cols-3 gap-4">
                      {searchResults.albums.slice(0, 12).map((album) => (
                        <SearchAlbumItem
                          key={album.Id}
                          album={album}
                          onClick={handleAlbumClick}
                          onContextMenu={openContextMenu}
                          contextMenuItemId={contextMenuItem?.Id || null}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.playlists && searchResults.playlists.length > 0 && (
                  <div>
                    <h2 className="text-xl font-bold text-white mb-4 px-4">Playlists</h2>
                    <div className="space-y-0">
                      {searchResults.playlists.map((playlist) => (
                        <button
                          key={playlist.Id}
                          onClick={() => handlePlaylistClick(playlist.Id)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            openContextMenu(playlist, 'playlist', 'desktop', { x: e.clientX, y: e.clientY })
                          }}
                          className="w-full flex items-center gap-3 hover:bg-white/10 transition-colors group px-4 py-3"
                        >
                          <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-900 self-center">
                            <img
                              src={jellyfinClient.getAlbumArtUrl(playlist.Id, 96)}
                              alt={playlist.Name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <div className="text-sm font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">
                              {playlist.Name}
                            </div>
                            <div className="text-xs text-gray-400 truncate">
                              {playlist.ChildCount ? `${playlist.ChildCount} tracks` : 'Playlist'}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.artists.length === 0 && searchResults.albums.length === 0 && (!searchResults.playlists || searchResults.playlists.length === 0) && searchResults.songs.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400 px-4">
                    <div className="text-lg mb-2">No results found</div>
                    <div className="text-sm">Try a different search term</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 px-4">
              </div>
            )}
            </div>
          </div>
        </div>
        </>,
        document.body
      )}

      {/* Filter Bottom Sheets */}
      {activeFilterType === 'genre' && (
        <FilterBottomSheet
          isOpen={isFilterSheetOpen}
          onClose={() => setIsFilterSheetOpen(false)}
          filterType="genre"
          genres={genres}
          selectedValues={selectedGenres}
          onApply={handleGenreApply}
        />
      )}
      
      {activeFilterType === 'year' && (
        <FilterBottomSheet
          isOpen={isFilterSheetOpen}
          onClose={() => setIsFilterSheetOpen(false)}
          filterType="year"
          availableYears={years}
          yearRange={yearRange}
          onApplyYear={handleYearApply}
        />
      )}

      <ContextMenu
        item={contextMenuItem}
        itemType={contextMenuItemType}
        isOpen={contextMenuOpen}
        onClose={() => {
          setContextMenuOpen(false)
          setContextMenuItem(null)
          setContextMenuItemType(null)
        }}
        zIndex={99999}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </>
  )
}




