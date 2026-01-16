import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowUpDown } from 'lucide-react'
import { useMusicStore } from '../../stores/musicStore'
import { usePlayerStore } from '../../stores/playerStore'
import { jellyfinClient } from '../../api/jellyfin'
import AlbumCard from './AlbumCard'
import Pagination from '../shared/Pagination'
import FilterBottomSheet from '../home/FilterBottomSheet'
import ContextMenu from '../shared/ContextMenu'
import Spinner from '../shared/Spinner'
import SearchOverlay, { type SearchSectionConfig } from '../shared/SearchOverlay'
import type { BaseItemDto } from '../../api/types'
import { fetchAllLibraryItems, unifiedSearch } from '../../utils/search'
import { logger } from '../../utils/logger'

// Section configuration for AlbumsPage: Albums first (no limit), then Artists (5), Playlists, Songs
const SEARCH_SECTIONS: SearchSectionConfig[] = [
  { type: 'albums' },
  { type: 'artists', limit: 5 },
  { type: 'playlists' },
  { type: 'songs' },
]

const ITEMS_PER_PAGE = 84
const INITIAL_VISIBLE_ALBUMS = 45
const VISIBLE_ALBUMS_INCREMENT = 45
const INITIAL_VISIBLE_SEARCH_SONG_IMAGES = 45
const VISIBLE_SEARCH_SONG_IMAGES_INCREMENT = 45

export default function AlbumsPage() {
  // Use selectors for better performance - only re-render when specific values change
  const albums = useMusicStore((state) => state.albums)
  const setAlbums = useMusicStore((state) => state.setAlbums)
  const sortPreferences = useMusicStore((state) => state.sortPreferences)
  const setSortPreference = useMusicStore((state) => state.setSortPreference)
  const setLoading = useMusicStore((state) => state.setLoading)
  const loading = useMusicStore((state) => state.loading)
  const genres = useMusicStore((state) => state.genres)
  const playTrack = usePlayerStore((state) => state.playTrack)
  const playAlbum = usePlayerStore((state) => state.playAlbum)
  const addToQueue = usePlayerStore((state) => state.addToQueue)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [rawSearchResults, setRawSearchResults] = useState<{
    artists: BaseItemDto[]
    albums: BaseItemDto[]
    playlists: BaseItemDto[]
    songs: BaseItemDto[]
  } | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const searchAbortControllerRef = useRef<AbortController | null>(null)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [contextMenuItemType, setContextMenuItemType] = useState<'album' | 'song' | 'artist' | 'playlist' | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [visibleAlbumsCount, setVisibleAlbumsCount] = useState(INITIAL_VISIBLE_ALBUMS)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const desktopSearchInputRef = useRef<HTMLInputElement>(null)

  // Filter state
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [yearRange, setYearRange] = useState<{ min: number | null; max: number | null }>({ min: null, max: null })
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
  const [activeFilterType, setActiveFilterType] = useState<'genre' | 'year' | null>(null)
  const [years, setYears] = useState<number[]>([])

  const sortOrder = sortPreferences.albums
  const isInitialLoad = useRef(true)
  const [isLoadingSortChange, setIsLoadingSortChange] = useState(false)
  const prevSortOrderRef = useRef(sortOrder)
  const [visibleSearchSongImageCount, setVisibleSearchSongImageCount] = useState(INITIAL_VISIBLE_SEARCH_SONG_IMAGES)
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)

  // Handle year filter from URL parameters
  useEffect(() => {
    const yearParam = searchParams.get('year')
    if (yearParam) {
      const year = parseInt(yearParam, 10)
      if (!isNaN(year) && year > 0) {
        setYearRange({ min: year, max: year })
        setIsSearchOpen(true)
        // Clear the URL parameter after reading it
        setSearchParams({}, { replace: true })
      }
    }
  }, [searchParams, setSearchParams])

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
        logger.error('Failed to load filter values:', error)
      }
    }
    loadFilterValues()
  }, [])

  // Check if filters are active
  const hasActiveFilters = selectedGenres.length > 0 || yearRange.min !== null || yearRange.max !== null

  useEffect(() => {
    // Cancel any previous search
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort()
    }

    const hasQuery = searchQuery.trim().length > 0

    if (hasQuery || hasActiveFilters) {
      setIsSearching(true)
      searchAbortControllerRef.current = new AbortController()

      const timeoutId = window.setTimeout(async () => {
        if (searchAbortControllerRef.current?.signal.aborted) return

        try {
          let results
          if (hasQuery) {
            results = await unifiedSearch(searchQuery, 450)
          } else {
            results = await fetchAllLibraryItems(450)
          }
          if (!searchAbortControllerRef.current?.signal.aborted) {
            setRawSearchResults(results)
          }
        } catch (error) {
          if (!searchAbortControllerRef.current?.signal.aborted) {
            logger.error('Search failed:', error)
            setRawSearchResults(null)
          }
        } finally {
          if (!searchAbortControllerRef.current?.signal.aborted) {
            setIsSearching(false)
          }
        }
      }, 250)

      return () => {
        window.clearTimeout(timeoutId)
        if (searchAbortControllerRef.current) {
          searchAbortControllerRef.current.abort()
        }
      }
    } else {
      searchAbortControllerRef.current = null
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
      albums: rawSearchResults.albums.filter(filterAlbumOrSong),
      artists: rawSearchResults.artists.filter(filterArtist),
      playlists: (rawSearchResults.playlists || []).filter(filterPlaylist),
      songs: rawSearchResults.songs.filter(filterAlbumOrSong),
    }
  }, [rawSearchResults, selectedGenres, yearRange])

  // Focus search input when overlay opens
  useEffect(() => {
    if (isSearchOpen) {
      const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)').matches
      const inputRef = isDesktop ? desktopSearchInputRef : searchInputRef
      setTimeout(() => {
        inputRef.current?.focus()
        if (inputRef.current) {
          const length = inputRef.current.value.length
          inputRef.current.setSelectionRange(length, length)
        }
      }, 50)
    }
  }, [isSearchOpen])

  // Handle escape key to close search (all devices)
  useEffect(() => {
    if (!isSearchOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        handleCancelSearch()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isSearchOpen])

  // Cleanup search abort controller on unmount
  useEffect(() => {
    return () => {
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort()
      }
    }
  }, [])

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

  const handlePlayAllSongs = () => {
    if (searchResults?.songs && searchResults.songs.length > 0) {
      playAlbum(searchResults.songs)
    }
  }

  const handleAddSongsToQueue = () => {
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
    const handleGlobalContextMenu = (e: MouseEvent) => {
    };

    document.addEventListener('contextmenu', handleGlobalContextMenu, true); // Use capture phase

    return () => {
      document.removeEventListener('contextmenu', handleGlobalContextMenu, true);
    };
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setCurrentPage(0)
    }
  }, [sortOrder, searchQuery])

  // Reset visible search song images when the query or search state changes
  useEffect(() => {
    setVisibleSearchSongImageCount(INITIAL_VISIBLE_SEARCH_SONG_IMAGES)
  }, [searchQuery, isSearchOpen, rawSearchResults?.songs.length])

  // Incrementally reveal more search song images as the user scrolls near the bottom
  const handleSearchScroll = useCallback(() => {
    if (!isSearchOpen || !(rawSearchResults?.songs?.length)) return

    const scrollTop = window.scrollY || document.documentElement.scrollTop
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const fullHeight = document.documentElement.scrollHeight

    if (scrollTop + viewportHeight * 1.5 >= fullHeight) {
      setVisibleSearchSongImageCount((prev) =>
        Math.min(prev + VISIBLE_SEARCH_SONG_IMAGES_INCREMENT, rawSearchResults.songs.length)
      )
    }
  }, [isSearchOpen, rawSearchResults?.songs.length])

  useEffect(() => {
    if (!isSearchOpen || !(rawSearchResults?.songs?.length)) return

    // Single window scroll listener handles all scroll events (including touch scrolling)
    window.addEventListener('scroll', handleSearchScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleSearchScroll)
    }
  }, [handleSearchScroll])

  // Reset visible albums window when page or album list changes
  useEffect(() => {
    setVisibleAlbumsCount(INITIAL_VISIBLE_ALBUMS)
  }, [currentPage, albums.length])

  // Incrementally reveal more albums as the user scrolls near the bottom
  const handleScroll = useCallback(() => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const fullHeight = document.documentElement.scrollHeight

    // When the user is within ~1.5 viewports of the bottom, load more rows
    if (scrollTop + viewportHeight * 1.5 >= fullHeight) {
      setVisibleAlbumsCount((prev) =>
        Math.min(prev + VISIBLE_ALBUMS_INCREMENT, albums.length)
      )
    }
  }, [albums.length])

  useEffect(() => {
    // Single window scroll listener handles all scroll events (including touch scrolling)
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll])

  useEffect(() => {
    if (!searchQuery.trim()) {
      // Check if sortOrder changed (not initial load)
      if (!isInitialLoad.current && prevSortOrderRef.current !== sortOrder) {
        setIsLoadingSortChange(true)
      }
      prevSortOrderRef.current = sortOrder
      loadAlbums()
    }
  }, [currentPage, sortOrder, searchQuery])

  useEffect(() => {
    // Mark initial load as complete after first render
    if (isInitialLoad.current) {
      isInitialLoad.current = false
    }
  }, [])

  const loadAlbums = async () => {
    setLoading('albums', true)
    try {
      const options: Parameters<typeof jellyfinClient.getAlbums>[0] = {
        limit: ITEMS_PER_PAGE,
        startIndex: currentPage * ITEMS_PER_PAGE,
      }

      if (sortOrder === 'RecentlyAdded') {
        options.sortBy = ['DateCreated']
        options.sortOrder = 'Descending'
      } else if (sortOrder === 'Newest') {
        options.sortBy = ['ProductionYear', 'SortName']
        options.sortOrder = ['Descending', 'Ascending']
      } else {
        options.sortBy = ['SortName']
        options.sortOrder = 'Ascending'
      }

      const result = await jellyfinClient.getAlbums(options)
      setAlbums(result.Items)
      setTotalCount(result.TotalRecordCount || 0)
    } catch (error) {
      logger.error('Failed to load albums:', error)
      setAlbums([])
      setTotalCount(0)
    } finally {
      setLoading('albums', false)
      setIsLoadingSortChange(false)
    }
  }

  return (
    <>
      <div className="pb-20">
        <div
          className={`fixed top-0 left-0 right-0 bg-black z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
          style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
        >
          <div className="max-w-[768px] mx-auto">
            <div className="p-4">
              {/* Header with title and search icon */}
              <div className="flex items-center justify-between mb-3">
                <h1 className="text-2xl font-bold text-white">Albums</h1>
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
                    onClick={() => {
                      const nextSort =
                        sortOrder === 'RecentlyAdded' ? 'Alphabetical' :
                          sortOrder === 'Alphabetical' ? 'Newest' :
                            'RecentlyAdded'
                      setSortPreference('albums', nextSort)
                    }}
                    className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                  >
                    {sortOrder === 'RecentlyAdded' ? 'Recently Added' :
                      sortOrder === 'Newest' ? 'Newest' :
                        'Alphabetically'}
                    <ArrowUpDown className="w-4 h-4" />
                  </button>
                  {loading.albums && !isInitialLoad.current && (
                    <div className="flex items-center">
                      <Spinner />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Gradient overlay below top bar */}
        <div
          className={`fixed left-0 right-0 z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
          style={{
            top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 7rem - 8px)`,
            height: '24px',
            background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.8), transparent)'
          }}
        />

        <div
          style={{ paddingTop: `calc(env(safe-area-inset-top) + 7rem)` }}
          onContextMenu={(e) => {
          }}
        >
          <div
            className={`${isLoadingSortChange ? 'opacity-50 pointer-events-none' : ''} ${isSearchOpen ? 'hidden [@media((hover:hover)_and_(pointer:fine)_and_(min-width:1024px))]:block' : ''}`}
            onContextMenu={(e) => {
            }}
          >
            {albums.length === 0 && !loading.albums ? (
                <div className="flex items-center justify-center py-16 text-gray-400">
                  <p>No albums found</p>
                </div>
              ) : (
                <>
                  <div className="p-4">
                    <div
                      className="grid grid-cols-3 md:grid-cols-4 gap-3"
                      onContextMenu={(e) => {
                      }}
                    >
                      {albums
                        .map((album, index) => (
                          <AlbumCard
                            key={album.Id}
                            album={album}
                            onContextMenu={openContextMenu}
                            contextMenuItemId={contextMenuItem?.Id || null}
                            showImage={index < visibleAlbumsCount}
                          />
                        ))}
                    </div>
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
        </div>
      </div>

      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={handleCancelSearch}
        title="Search"
        searchQuery={searchQuery}
        onSearchChange={handleSearch}
        onClearSearch={handleClearSearch}
        isLoading={isSearching}
        results={searchResults}
        sections={SEARCH_SECTIONS}
        filterConfig={{ showGenreFilter: true, showYearFilter: true }}
        filterState={{ selectedGenres, yearRange }}
        onOpenFilterSheet={openFilterSheet}
        onArtistClick={handleArtistClick}
        onAlbumClick={handleAlbumClick}
        onSongClick={handleSongClick}
        onPlaylistClick={handlePlaylistClick}
        onPlayAllSongs={handlePlayAllSongs}
        onAddSongsToQueue={handleAddSongsToQueue}
        visibleSongImageCount={visibleSearchSongImageCount}
        isQueueSidebarOpen={isQueueSidebarOpen}
        desktopSearchInputRef={desktopSearchInputRef}
        mobileSearchInputRef={searchInputRef}
      />

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




