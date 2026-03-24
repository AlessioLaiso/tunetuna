import { useEffect, useState, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowUpDown } from 'lucide-react'
import { useMusicStore, getGroupingCategories } from '../../stores/musicStore'
import { usePlayerStore } from '../../stores/playerStore'
import { jellyfinClient } from '../../api/jellyfin'
import SongItem from './SongItem'
import Pagination from '../shared/Pagination'
import FilterBottomSheet from '../home/FilterBottomSheet'
import ContextMenu from '../shared/ContextMenu'
import Spinner from '../shared/Spinner'
import SearchOverlay, { type SearchSectionConfig } from '../shared/SearchOverlay'
import type { BaseItemDto, GroupingCategory } from '../../api/types'
import { useSearch } from '../../hooks/useSearch'
import { useSearchOpen } from '../../hooks/useSearchOpen'
import { useSearchFocus } from '../../hooks/useSearchFocus'
import { usePageContextMenu } from '../../hooks/usePageContextMenu'
import { useYears } from '../../hooks/useYears'
import { useSearchHandlers } from '../../hooks/useSearchHandlers'
import { useSortChangeLoading } from '../../hooks/useSortChangeLoading'
import { logger } from '../../utils/logger'

// Section configuration for SongsPage: Songs first (no limit), then Artists (5), Albums (12), Playlists
const SEARCH_SECTIONS: SearchSectionConfig[] = [
  { type: 'songs' },
  { type: 'artists', limit: 5 },
  { type: 'albums', limit: 12 },
  { type: 'playlists' },
]

const ITEMS_PER_PAGE = 90
const INITIAL_VISIBLE_SONGS = 45
const VISIBLE_SONGS_INCREMENT = 45

export default function SongsPage() {
  // Use local state for paginated display - don't overwrite global songs cache
  const [pageSongs, setPageSongs] = useState<BaseItemDto[]>([])
  const sortPreferences = useMusicStore((state) => state.sortPreferences)
  const setSortPreference = useMusicStore((state) => state.setSortPreference)
  const setLoading = useMusicStore((state) => state.setLoading)
  const loading = useMusicStore((state) => state.loading)
  const genres = useMusicStore((state) => state.genres)
  const isQueueSidebarOpen = usePlayerStore((state) => state.isQueueSidebarOpen)
  const { isSearchOpen, setIsSearchOpen, openSearch, proxyInputProps } = useSearchOpen()
  const { contextMenuOpen, contextMenuItem, contextMenuItemType, contextMenuMode, contextMenuPosition, openContextMenu, closeContextMenu } = usePageContextMenu()
  const [currentPage, setCurrentPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  // Filter sheet state
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
  const [activeFilterType, setActiveFilterType] = useState<'genre' | 'year' | 'grouping' | 'bpm' | null>(null)
  const [activeGroupingCategory, setActiveGroupingCategory] = useState<GroupingCategory | null>(null)
  const years = useYears()

  // Get songs from store for grouping categories
  const songs = useMusicStore((state) => state.songs)

  // Compute grouping categories from songs
  const groupingCategories = useMemo(() => getGroupingCategories(songs), [songs])

  const sortOrder = sortPreferences.songs
  const { isInitialLoad, isLoadingSortChange, checkSortChange, clearSortLoading } = useSortChangeLoading(sortOrder)
  const [visibleSongsCount, setVisibleSongsCount] = useState(INITIAL_VISIBLE_SONGS)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const desktopSearchInputRef = useRef<HTMLInputElement>(null)

  // Use centralized search hook
  const {
    searchQuery,
    setSearchQuery,
    isSearching,
    searchResults,
    selectedGenres,
    setSelectedGenres,
    yearRange,
    setYearRange,
    bpmRange,
    setBpmRange,
    selectedGroupings,
    setSelectedGroupings,
    groupingMatchModes,
    setGroupingMatchModes,
    hasActiveFilters,
    clearSearch,
    clearAll,
  } = useSearch()

  const [searchParams, setSearchParams] = useSearchParams()

  // Handle year and grouping filters from URL parameters
  useEffect(() => {
    const yearParam = searchParams.get('year')
    const groupingParam = searchParams.get('grouping')
    let applied = false

    if (yearParam) {
      const year = parseInt(yearParam, 10)
      if (!isNaN(year) && year > 0) {
        setYearRange({ min: year, max: year })
        applied = true
      }
    }

    if (groupingParam) {
      const underscoreIndex = groupingParam.indexOf('_')
      if (underscoreIndex === -1) {
        // Single-value tag like "instrumental"
        setSelectedGroupings(prev => ({ ...prev, [groupingParam]: ['yes'] }))
      } else {
        const categoryKey = groupingParam.substring(0, underscoreIndex)
        const value = groupingParam.substring(underscoreIndex + 1)
        setSelectedGroupings(prev => ({ ...prev, [categoryKey]: [value] }))
      }
      applied = true
    }

    if (applied) {
      setIsSearchOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, setYearRange, setSelectedGroupings])

  useSearchFocus(isSearchOpen, searchInputRef, desktopSearchInputRef)

  const {
    handleSearch, handleClearSearch, handleCancelSearch,
    handleArtistClick, handleAlbumClick, handleSongClick,
    handlePlayAllSongs, handleAddSongsToQueue, handlePlaylistClick,
  } = useSearchHandlers({
    setSearchQuery, isSearchOpen, setIsSearchOpen, openSearch,
    clearSearch, clearAll, searchResults,
  })

  // Compute available BPM values from songs (sorted ascending for range picker)
  const availableBpms = useMemo(() => {
    const bpms = new Set<number>()
    for (const song of songs) {
      if (song.Bpm) bpms.add(song.Bpm)
    }
    return Array.from(bpms).sort((a, b) => a - b)
  }, [songs])

  const hasBpmData = availableBpms.length > 0

  const openFilterSheet = (type: 'genre' | 'year' | 'bpm') => {
    setActiveFilterType(type)
    setIsFilterSheetOpen(true)
  }

  const handleGenreApply = (selected: string[]) => {
    setSelectedGenres(selected)
  }

  const handleYearApply = (range: { min: number | null; max: number | null }) => {
    setYearRange(range)
  }

  const handleBpmApply = (range: { min: number | null; max: number | null }) => {
    setBpmRange(range)
  }

  const openGroupingFilterSheet = (category: GroupingCategory) => {
    setActiveGroupingCategory(category)
    setActiveFilterType('grouping')
    setIsFilterSheetOpen(true)
  }

  const handleGroupingApply = (categoryKey: string, selected: string[]) => {
    setSelectedGroupings(prev => ({
      ...prev,
      [categoryKey]: selected
    }))
  }

  const handleGroupingMatchModeChange = (categoryKey: string, mode: 'or' | 'and') => {
    setGroupingMatchModes(prev => ({
      ...prev,
      [categoryKey]: mode
    }))
  }

  useEffect(() => {
    if (!searchQuery.trim()) {
      setCurrentPage(0)
    }
  }, [sortOrder, searchQuery])

  // Reset visible songs window when page or songs list changes
  useEffect(() => {
    setVisibleSongsCount(INITIAL_VISIBLE_SONGS)
  }, [currentPage, pageSongs.length])

  // Incrementally reveal more songs as the user scrolls near the bottom
  useEffect(() => {
    // The layout uses a .main-scrollable container with overflow-y: auto
    const container = document.querySelector('.main-scrollable')
    if (!container) return

    const handleScroll = () => {
      const scrollTop = container.scrollTop
      const viewportHeight = container.clientHeight
      const fullHeight = container.scrollHeight

      // When the user is within ~1.5 viewports of the bottom, load more rows
      if (scrollTop + viewportHeight * 1.5 >= fullHeight) {
        setVisibleSongsCount((prev) =>
          Math.min(prev + VISIBLE_SONGS_INCREMENT, pageSongs.length)
        )
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [pageSongs.length, visibleSongsCount])

  useEffect(() => {
    if (!searchQuery.trim()) {
      checkSortChange()
      loadSongs()
    }
  }, [currentPage, sortOrder, searchQuery])

  const loadSongs = async () => {
    setLoading('songs', true)
    try {
      const options: Parameters<typeof jellyfinClient.getSongs>[0] = {
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
      setPageSongs(result.Items)
      setTotalCount(result.TotalRecordCount || 0)
    } catch (error) {
      logger.error('Failed to load songs:', error)
      setPageSongs([])
      setTotalCount(0)
    } finally {
      setLoading('songs', false)
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
                <h1 className="text-2xl font-bold text-white">Songs</h1>
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
              {!isSearchOpen && pageSongs.length > 1 && (
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setSortPreference('songs', sortOrder === 'RecentlyAdded' ? 'Alphabetical' : 'RecentlyAdded')}
                    className="text-sm text-gray-400 hover:text-[var(--accent-color)] transition-colors flex items-center gap-1"
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
            {pageSongs.length === 0 && !loading.songs ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <p>No songs found</p>
              </div>
            ) : (
              <>
                <div className="space-y-0">
                  {pageSongs.map((song, index) => (
                    <SongItem
                      key={song.Id}
                      song={song}
                      showImage={index < visibleSongsCount}
                      onContextMenu={openContextMenu}
                      contextMenuItemId={contextMenuItem?.Id || null}
                    />
                  ))}
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
        searchQuery={searchQuery}
        onSearchChange={handleSearch}
        onClearSearch={handleClearSearch}
        isLoading={isSearching}
        results={searchResults}
        sections={SEARCH_SECTIONS}
        filterConfig={{ showGenreFilter: true, showYearFilter: true, showGroupingFilters: true, showBpmFilter: hasBpmData }}
        filterState={{ selectedGenres, yearRange, bpmRange, selectedGroupings }}
        onOpenFilterSheet={openFilterSheet}
        groupingCategories={groupingCategories}
        onOpenGroupingFilterSheet={openGroupingFilterSheet}
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

      {activeFilterType === 'bpm' && (
        <FilterBottomSheet
          isOpen={isFilterSheetOpen}
          onClose={() => setIsFilterSheetOpen(false)}
          filterType="bpm"
          availableBpms={availableBpms}
          bpmRange={bpmRange}
          onApplyBpm={handleBpmApply}
        />
      )}

      {activeFilterType === 'grouping' && activeGroupingCategory && (
        <FilterBottomSheet
          isOpen={isFilterSheetOpen}
          onClose={() => setIsFilterSheetOpen(false)}
          filterType="grouping"
          groupingCategory={activeGroupingCategory}
          selectedGroupingValues={selectedGroupings[activeGroupingCategory.key] || []}
          onApplyGrouping={handleGroupingApply}
          groupingMatchMode={groupingMatchModes[activeGroupingCategory.key] || 'or'}
          onGroupingMatchModeChange={handleGroupingMatchModeChange}
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




