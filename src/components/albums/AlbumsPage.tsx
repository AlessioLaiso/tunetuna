import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { useSearch } from '../../hooks/useSearch'
import { useSearchOpen } from '../../hooks/useSearchOpen'
import { useSearchFocus } from '../../hooks/useSearchFocus'
import { usePageContextMenu } from '../../hooks/usePageContextMenu'
import { useYears } from '../../hooks/useYears'
import { useSearchHandlers } from '../../hooks/useSearchHandlers'
import { useSortChangeLoading } from '../../hooks/useSortChangeLoading'
import { useScrollLazyLoad } from '../../hooks/useScrollLazyLoad'
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

export default function AlbumsPage() {
  // Use selectors for better performance - only re-render when specific values change
  const albums = useMusicStore((state) => state.albums)
  const setAlbums = useMusicStore((state) => state.setAlbums)
  const sortPreferences = useMusicStore((state) => state.sortPreferences)
  const setSortPreference = useMusicStore((state) => state.setSortPreference)
  const setLoading = useMusicStore((state) => state.setLoading)
  const loading = useMusicStore((state) => state.loading)
  const genres = useMusicStore((state) => state.genres)
  const { isSearchOpen, setIsSearchOpen, openSearch, proxyInputProps } = useSearchOpen()
  const { contextMenuOpen, contextMenuItem, contextMenuItemType, contextMenuMode, contextMenuPosition, openContextMenu, closeContextMenu } = usePageContextMenu()
  const [currentPage, setCurrentPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [visibleAlbumsCount, setVisibleAlbumsCount] = useState(INITIAL_VISIBLE_ALBUMS)
  const [searchParams, setSearchParams] = useSearchParams()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const desktopSearchInputRef = useRef<HTMLInputElement>(null)

  // Filter sheet state
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
  const [activeFilterType, setActiveFilterType] = useState<'genre' | 'year' | null>(null)
  const years = useYears()

  const sortOrder = sortPreferences.albums
  const { isInitialLoad, isLoadingSortChange, checkSortChange, clearSortLoading } = useSortChangeLoading(sortOrder)
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)

  // Use centralized search hook
  const {
    searchQuery,
    setSearchQuery,
    isSearching,
    searchResults,
    rawSearchResults,
    selectedGenres,
    setSelectedGenres,
    yearRange,
    setYearRange,
    hasActiveFilters,
    clearSearch,
    clearAll,
  } = useSearch()

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
  }, [searchParams, setSearchParams, setYearRange])

  useSearchFocus(isSearchOpen, searchInputRef, desktopSearchInputRef)

  const {
    handleSearch, handleClearSearch, handleCancelSearch,
    handleArtistClick, handleAlbumClick, handleSongClick,
    handlePlayAllSongs, handleAddSongsToQueue, handlePlaylistClick,
  } = useSearchHandlers({
    setSearchQuery, isSearchOpen, setIsSearchOpen, openSearch,
    clearSearch, clearAll, searchResults,
  })

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
  }, [isSearchOpen, handleCancelSearch])

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



  // Reset visible albums window when page or album list changes
  useEffect(() => {
    setVisibleAlbumsCount(INITIAL_VISIBLE_ALBUMS)
  }, [currentPage, albums.length])

  // Incrementally reveal more album images as the user scrolls
  useScrollLazyLoad({
    totalCount: albums.length,
    visibleCount: visibleAlbumsCount,
    increment: VISIBLE_ALBUMS_INCREMENT,
    setVisibleCount: setVisibleAlbumsCount,
    threshold: 1.0
  })

  useEffect(() => {
    if (!searchQuery.trim()) {
      checkSortChange()
      loadAlbums()
    }
  }, [currentPage, sortOrder, searchQuery])

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
      clearSortLoading()
    }
  }

  return (
    <>
      <input {...proxyInputProps} />
      <div className="pb-20">
        <div
          className={`fixed top-0 left-0 right-0 bg-black z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
          style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
        >
          <div className="max-w-page mx-auto">
            <div className="p-4 min-[780px]:px-[0.66rem]">
              {/* Header with title and search icon */}
              <div className="flex items-center justify-between mb-3">
                <h1 className="text-2xl font-bold text-white">Albums</h1>
                <button
                  onClick={openSearch}
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
              {!isSearchOpen && albums.length > 1 && (
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      const nextSort =
                        sortOrder === 'RecentlyAdded' ? 'Alphabetical' :
                          sortOrder === 'Alphabetical' ? 'Newest' :
                            'RecentlyAdded'
                      setSortPreference('albums', nextSort)
                    }}
                    className="text-sm text-gray-400 hover:text-[var(--accent-color)] transition-colors flex items-center gap-1"
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
                <div className="px-4">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(totalCount / ITEMS_PER_PAGE)}
                    onPageChange={setCurrentPage}
                    itemsPerPage={ITEMS_PER_PAGE}
                    totalItems={totalCount}
                  />
                </div>
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
        filterConfig={{ showGenreFilter: true, showYearFilter: true, showGroupingFilters: false }}
        filterState={{ selectedGenres, yearRange, selectedGroupings: {} }}
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
        onClose={closeContextMenu}
        zIndex={99999}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </>
  )
}




