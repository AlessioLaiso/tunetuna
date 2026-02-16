import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpDown } from 'lucide-react'
import { useMusicStore } from '../../stores/musicStore'
import { usePlayerStore } from '../../stores/playerStore'
import { jellyfinClient } from '../../api/jellyfin'
import ArtistCard from './ArtistCard'
import Pagination from '../shared/Pagination'
import FilterBottomSheet from '../home/FilterBottomSheet'
import ContextMenu from '../shared/ContextMenu'
import Spinner from '../shared/Spinner'
import SearchOverlay, { type SearchSectionConfig } from '../shared/SearchOverlay'
import type { BaseItemDto } from '../../api/types'
import { useSearch } from '../../hooks/useSearch'
import { logger } from '../../utils/logger'

// Section configuration for ArtistsPage: Artists (all), Albums (12), Playlists, Songs
const SEARCH_SECTIONS: SearchSectionConfig[] = [
  { type: 'artists' },
  { type: 'albums', limit: 12 },
  { type: 'playlists' },
  { type: 'songs' },
]

const ITEMS_PER_PAGE = 90

const INITIAL_VISIBLE_ARTISTS = 45
const VISIBLE_INCREMENT = 45

export default function ArtistsPage() {
  const { artists, setArtists, sortPreferences, setSortPreference, setLoading, loading, genres } = useMusicStore()
  const { playTrack, playAlbum, addToQueue } = usePlayerStore()
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [contextMenuItemType, setContextMenuItemType] = useState<'album' | 'song' | 'artist' | 'playlist' | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [visibleArtistsCount, setVisibleArtistsCount] = useState(INITIAL_VISIBLE_ARTISTS)
  const navigate = useNavigate()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const desktopSearchInputRef = useRef<HTMLInputElement>(null)

  // Filter sheet state
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
  const [activeFilterType, setActiveFilterType] = useState<'genre' | null>(null)

  const sortOrder = sortPreferences.artists
  const isInitialLoad = useRef(true)
  const [isLoadingSortChange, setIsLoadingSortChange] = useState(false)
  const prevSortOrderRef = useRef(sortOrder)
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)

  // Use centralized search hook (no year filter for artists page)
  const {
    searchQuery,
    setSearchQuery,
    isSearching,
    searchResults,
    selectedGenres,
    setSelectedGenres,
    hasActiveFilters,
    clearSearch,
    clearAll,
  } = useSearch({ includeYearFilter: false })

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

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (query.trim().length > 0 && !isSearchOpen) {
      setIsSearchOpen(true)
    }
  }

  const handleClearSearch = () => {
    clearSearch()
  }

  const handleCancelSearch = () => {
    setIsSearchOpen(false)
    clearAll()
  }

  const openFilterSheet = (type: 'genre' | 'year') => {
    if (type === 'genre') {
      setActiveFilterType('genre')
      setIsFilterSheetOpen(true)
    }
  }

  const handleGenreApply = (selected: string[]) => {
    setSelectedGenres(selected)
  }

  const handleArtistClick = (artistId: string) => {
    navigate(`/artist/${artistId}`)
    setIsSearchOpen(false)
    clearSearch()
  }

  const handleAlbumClick = (albumId: string) => {
    navigate(`/album/${albumId}`)
    setIsSearchOpen(false)
    clearSearch()
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
    clearSearch()
  }

  const openContextMenu = (item: BaseItemDto, type: 'album' | 'song' | 'artist' | 'playlist', mode: 'mobile' | 'desktop' = 'mobile', position?: { x: number, y: number }) => {
    setContextMenuItem(item)
    setContextMenuItemType(type)
    setContextMenuMode(mode)
    setContextMenuPosition(position || null)
    setContextMenuOpen(true)
  }

  const loadArtists = async () => {
    const loadStartTime = Date.now()
    setLoading('artists', true)
    try {
      const options: Parameters<typeof jellyfinClient.getArtists>[0] = {
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

      let result = await jellyfinClient.getArtists(options)

      // If no results with sort, try without sort options
      if ((result.Items?.length || 0) === 0) {
        result = await jellyfinClient.getArtists({
          limit: ITEMS_PER_PAGE,
          startIndex: currentPage * ITEMS_PER_PAGE,
        })
      }

      const artistsToSet = result.Items || []
      setTotalCount(result.TotalRecordCount || 0)
      const totalLoadTime = Date.now() - loadStartTime
      setArtists(artistsToSet)
    } catch (error) {
      logger.error('Failed to load artists:', error)
      setArtists([])
      setTotalCount(0)
    } finally {
      const loadingEndTime = Date.now()
      const totalTime = loadingEndTime - loadStartTime
      setLoading('artists', false)
      setIsLoadingSortChange(false)
    }
  }

  useEffect(() => {
    if (!searchQuery.trim() && !isSearchOpen) {
      setCurrentPage(0)
    }
  }, [sortOrder, searchQuery, isSearchOpen])

  // Reset visible artist window when the page of artists or artists list changes
  useEffect(() => {
    setVisibleArtistsCount(INITIAL_VISIBLE_ARTISTS)
  }, [currentPage, artists.length])

  // Incrementally reveal more artists as the user scrolls near the bottom
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      const fullHeight = document.documentElement.scrollHeight

      // When the user is within ~1.5 viewports of the bottom, load more rows
      if (scrollTop + viewportHeight * 1.5 >= fullHeight) {
        setVisibleArtistsCount((prev) => Math.min(prev + VISIBLE_INCREMENT, artists.length))
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [artists.length])

  useEffect(() => {
    if (!searchQuery.trim() && !isSearchOpen) {
      // Check if sortOrder changed (not initial load)
      if (!isInitialLoad.current && prevSortOrderRef.current !== sortOrder) {
        setIsLoadingSortChange(true)
      }
      prevSortOrderRef.current = sortOrder
      loadArtists()
    }
  }, [currentPage, sortOrder, searchQuery, isSearchOpen])

  useEffect(() => {
    // Mark initial load as complete after first render
    if (isInitialLoad.current) {
      isInitialLoad.current = false
    }
  }, [])

  return (
    <>
      <div className="pb-20">
        <div
          className={`fixed top-0 left-0 right-0 bg-black z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
          style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
        >
          <div className="max-w-[768px] mx-auto">
            <div className="p-4 min-[780px]:px-[0.66rem]">
              {/* Header with title and search icon */}
              <div className="flex items-center justify-between mb-3">
                <h1 className="text-2xl font-bold text-white">Artists</h1>
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
                    onClick={() => setSortPreference('artists', sortOrder === 'RecentlyAdded' ? 'Alphabetical' : 'RecentlyAdded')}
                    className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                  >
                    {sortOrder === 'RecentlyAdded' ? 'Recently Added' : 'Alphabetically'}
                    <ArrowUpDown className="w-4 h-4" />
                  </button>
                  {loading.artists && !isInitialLoad.current && (
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

        <div style={{ paddingTop: `calc(env(safe-area-inset-top) + 7rem)` }}>
          <div className={`${isLoadingSortChange ? 'opacity-50 pointer-events-none' : ''} ${isSearchOpen ? 'hidden [@media((hover:hover)_and_(pointer:fine)_and_(min-width:1024px))]:block' : ''}`}>
            {artists.length === 0 && !loading.artists && (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <p>No artists found</p>
              </div>
            )}
            {artists.length > 0 && (
              <>
                <div className="space-y-0">
                  {artists
                    .slice(0, visibleArtistsCount)
                    .map((artist) => {
                      return (
                        <ArtistCard
                          key={artist.Id}
                          artist={artist}
                          onContextMenu={openContextMenu}
                          contextMenuItemId={contextMenuItem?.Id || null}
                        />
                      )
                    })}
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
        searchQuery={searchQuery}
        onSearchChange={handleSearch}
        onClearSearch={handleClearSearch}
        isLoading={isSearching}
        results={searchResults}
        sections={SEARCH_SECTIONS}
        filterConfig={{ showGenreFilter: true, showYearFilter: false, showGroupingFilters: false }}
        filterState={{ selectedGenres, yearRange: { min: null, max: null }, selectedGroupings: {} }}
        onOpenFilterSheet={openFilterSheet}
        onArtistClick={handleArtistClick}
        onAlbumClick={handleAlbumClick}
        onSongClick={handleSongClick}
        onPlaylistClick={handlePlaylistClick}
        onPlayAllSongs={handlePlayAllSongs}
        onAddSongsToQueue={handleAddSongsToQueue}

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

