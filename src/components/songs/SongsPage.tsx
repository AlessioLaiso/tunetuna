import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const playTrack = usePlayerStore((state) => state.playTrack)
  const playAlbum = usePlayerStore((state) => state.playAlbum)
  const addToQueue = usePlayerStore((state) => state.addToQueue)
  const isQueueSidebarOpen = usePlayerStore((state) => state.isQueueSidebarOpen)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [contextMenuItemType, setContextMenuItemType] = useState<'album' | 'song' | 'artist' | 'playlist' | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const navigate = useNavigate()

  // Filter sheet state
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
  const [activeFilterType, setActiveFilterType] = useState<'genre' | 'year' | 'grouping' | null>(null)
  const [activeGroupingCategory, setActiveGroupingCategory] = useState<GroupingCategory | null>(null)
  const [years, setYears] = useState<number[]>([])

  // Get songs from store for grouping categories
  const songs = useMusicStore((state) => state.songs)

  // Compute grouping categories from songs
  const groupingCategories = useMemo(() => getGroupingCategories(songs), [songs])

  const sortOrder = sortPreferences.songs
  const isInitialLoad = useRef(true)
  const [isLoadingSortChange, setIsLoadingSortChange] = useState(false)
  const prevSortOrderRef = useRef(sortOrder)
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
    selectedGroupings,
    setSelectedGroupings,
    hasActiveFilters,
    clearSearch,
    clearAll,
  } = useSearch()

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
    setActiveFilterType(type)
    setIsFilterSheetOpen(true)
  }

  const handleGenreApply = (selected: string[]) => {
    setSelectedGenres(selected)
  }

  const handleYearApply = (range: { min: number | null; max: number | null }) => {
    setYearRange(range)
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
        filterConfig={{ showGenreFilter: true, showYearFilter: true, showGroupingFilters: true }}
        filterState={{ selectedGenres, yearRange, selectedGroupings }}
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

      {activeFilterType === 'grouping' && activeGroupingCategory && (
        <FilterBottomSheet
          isOpen={isFilterSheetOpen}
          onClose={() => setIsFilterSheetOpen(false)}
          filterType="grouping"
          groupingCategory={activeGroupingCategory}
          selectedGroupingValues={selectedGroupings[activeGroupingCategory.key] || []}
          onApplyGrouping={handleGroupingApply}
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




