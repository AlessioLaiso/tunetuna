import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Settings, Shuffle } from 'lucide-react'
import SearchInput from '../shared/SearchInput'
import SearchOverlay, { type SearchSectionConfig } from '../shared/SearchOverlay'
import type { BaseItemDto } from '../../api/types'
import { jellyfinClient } from '../../api/jellyfin'
import FilterBottomSheet from './FilterBottomSheet'
import { useMusicStore } from '../../stores/musicStore'
import { usePlayerStore } from '../../stores/playerStore'
import { fetchAllLibraryItems, unifiedSearch } from '../../utils/search'
import { logger } from '../../utils/logger'

interface SearchBarProps {
  onSearchStateChange?: (isActive: boolean) => void
  title?: string
}

// Section configuration for SearchBar: Artists (5), Albums (12), Playlists (all), Songs (all)
const SEARCH_SECTIONS: SearchSectionConfig[] = [
  { type: 'artists', limit: 5 },
  { type: 'albums', limit: 12 },
  { type: 'playlists' },
  { type: 'songs' },
]

export default function SearchBar({ onSearchStateChange, title = 'Search' }: SearchBarProps) {
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
  const searchInputRef = useRef<HTMLInputElement>(null)
  const desktopSearchInputRef = useRef<HTMLInputElement>(null)

  // Filter state
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [yearRange, setYearRange] = useState<{ min: number | null; max: number | null }>({ min: null, max: null })
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
  const [activeFilterType, setActiveFilterType] = useState<'genre' | 'year' | null>(null)

  // Filter values
  const { genres } = useMusicStore()
  const [years, setYears] = useState<number[]>([])
  const [loadingFilterValues, setLoadingFilterValues] = useState(false)
  const [visibleSearchSongImageCount, setVisibleSearchSongImageCount] = useState(45)

  // Player functions
  const { playAlbum, addToQueue, playTrack, shuffleAllSongs, isQueueSidebarOpen } = usePlayerStore()

  // Loading state for shuffle button
  const [isShuffling, setIsShuffling] = useState(false)

  // Reset loading state after a timeout to prevent permanent disabling
  useEffect(() => {
    if (isShuffling) {
      const timeout = setTimeout(() => {
        setIsShuffling(false)
      }, 10000) // Reset after 10 seconds max
      return () => clearTimeout(timeout)
    }
  }, [isShuffling])

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Read URL parameters on mount and apply filters
  useEffect(() => {
    const yearMin = searchParams.get('yearMin')
    const yearMax = searchParams.get('yearMax')
    const genreParam = searchParams.get('genre')

    let hasUrlFilters = false

    if (yearMin || yearMax) {
      setYearRange({
        min: yearMin ? parseInt(yearMin, 10) : null,
        max: yearMax ? parseInt(yearMax, 10) : null,
      })
      hasUrlFilters = true
    }

    if (genreParam) {
      setSelectedGenres([genreParam])
      hasUrlFilters = true
    }

    // Open search overlay if URL filters are present
    if (hasUrlFilters) {
      setIsSearchOpen(true)
      // Clear the URL params after applying them
      setSearchParams({}, { replace: true })
    }
  }, []) // Only run on mount

  // Load filter values on mount
  useEffect(() => {
    const loadFilterValues = async () => {
      setLoadingFilterValues(true)
      try {
        const store = useMusicStore.getState()

        // Load years
        if (store.years.length > 0) {
          setYears(store.years)
        } else {
          const yearsData = await jellyfinClient.getYears()
          setYears(yearsData)
        }
      } catch (error) {
        logger.error('Failed to load filter values:', error)
      } finally {
        setLoadingFilterValues(false)
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

    // Search if there's a query OR if filters are active
    if (hasQuery || hasActiveFilters) {
      setIsSearching(true)
      // Capture controller in closure to avoid race conditions
      const controller = new AbortController()
      searchAbortControllerRef.current = controller

      // Execute search immediately - SearchInput already debounces
      const doSearch = async () => {
        if (controller.signal.aborted) return

        try {
          let results
          if (hasQuery) {
            results = await unifiedSearch(searchQuery, 450)
          } else {
            // When no query but filters are active, fetch a large slice directly
            results = await fetchAllLibraryItems(450)
          }
          if (!controller.signal.aborted) {
            setRawSearchResults(results)
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            logger.error('Search failed:', error)
            setRawSearchResults(null)
          }
        } finally {
          if (!controller.signal.aborted) {
            setIsSearching(false)
          }
        }
      }

      doSearch()

      return () => {
        controller.abort()
      }
    } else {
      searchAbortControllerRef.current = null
      setRawSearchResults(null)
      setIsSearching(false)
    }
  }, [searchQuery, hasActiveFilters])

  // Reset visible search song images when query or search state changes
  useEffect(() => {
    setVisibleSearchSongImageCount(45)
  }, [searchQuery, isSearchOpen, rawSearchResults?.songs.length])

  // Incrementally reveal more search song images as the user scrolls near the bottom
  useEffect(() => {
    if (!isSearchOpen || !(rawSearchResults?.songs?.length)) return

    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      const fullHeight = document.documentElement.scrollHeight

      if (scrollTop + viewportHeight * 1.5 >= fullHeight) {
        setVisibleSearchSongImageCount((prev) =>
          Math.min(prev + 45, rawSearchResults.songs.length)
        )
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isSearchOpen, rawSearchResults?.songs.length])

  // Apply filters to search results
  const searchResults = useMemo(() => {
    if (!rawSearchResults) return null

    // Filter function for artists - only apply genre filter (artists don't have ProductionYear)
    const filterArtist = (item: BaseItemDto): boolean => {
      // Artists don't have years, so filter them out when year filter is active
      if (yearRange.min !== null || yearRange.max !== null) {
        return false
      }
      // Genre filter
      if (selectedGenres.length > 0) {
        const itemGenres = item.Genres || []
        const hasMatchingGenre = selectedGenres.some((selectedGenre) =>
          itemGenres.some((itemGenre) => itemGenre.toLowerCase() === selectedGenre.toLowerCase())
        )
        if (!hasMatchingGenre) return false
      }
      return true
    }

    // Filter function for albums and songs - apply both genre and year filters
    const filterAlbumOrSong = (item: BaseItemDto): boolean => {
      // Genre filter
      if (selectedGenres.length > 0) {
        const itemGenres = item.Genres || []
        const hasMatchingGenre = selectedGenres.some((selectedGenre) =>
          itemGenres.some((itemGenre) => itemGenre.toLowerCase() === selectedGenre.toLowerCase())
        )
        if (!hasMatchingGenre) return false
      }

      // Year filter
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
      artists: rawSearchResults.artists.filter(filterArtist),
      albums: rawSearchResults.albums.filter(filterAlbumOrSong),
      playlists: (rawSearchResults.playlists || []).filter(filterPlaylist),
      songs: rawSearchResults.songs.filter(filterAlbumOrSong),
    }
  }, [rawSearchResults, selectedGenres, yearRange])

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    // Open search overlay when user starts typing
    if (query.trim().length > 0 && !isSearchOpen) {
      setIsSearchOpen(true)
    }
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

  const handlePlaylistClick = (playlistId: string) => {
    navigate(`/playlist/${playlistId}`)
    setIsSearchOpen(false)
    setSearchQuery('')
    setRawSearchResults(null)
  }

  const handleClearSearch = () => {
    // Clear the input but keep the overlay open
    setSearchQuery('')
    setRawSearchResults(null)
  }

  const handleCancelSearch = () => {
    // Close the overlay and clear everything
    setIsSearchOpen(false)
    setSearchQuery('')
    setRawSearchResults(null)
    // Clear filters
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

  const isSearchActive = isSearchOpen

  useEffect(() => {
    if (onSearchStateChange) {
      onSearchStateChange(isSearchActive)
    }
  }, [isSearchActive, onSearchStateChange])

  // Focus search input when overlay opens
  useEffect(() => {
    if (isSearchOpen) {
      // Check if we're on desktop (non-touch, wide screen)
      const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)').matches
      const inputRef = isDesktop ? desktopSearchInputRef : searchInputRef

      // Small delay to ensure DOM is ready
      setTimeout(() => {
        inputRef.current?.focus()
        // Set cursor position to end of input
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
    window.addEventListener('keydown', handleKeyDown, true) // capture phase
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

  return (
    <>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold text-white">
            Tunetuna
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {

                // Prevent concurrent shuffle operations
                const state = usePlayerStore.getState()
                const { isShuffleAllActive, isShuffleGenreActive, shuffle } = state


                if (isShuffling || isShuffleAllActive || isShuffleGenreActive) {


                  return // Already shuffling, ignore click
                }

                setIsShuffling(true)


                try {
                  await shuffleAllSongs()

                } catch (error) {
                  logger.error('Home shuffle button - shuffleAllSongs failed:', error)


                  logger.error('Shuffle all failed:', error)
                } finally {
                  setIsShuffling(false)


                }
              }}
              disabled={isShuffling}
              className="w-8 h-8 flex items-center justify-center text-white hover:bg-zinc-800 rounded-full transition-colors disabled:opacity-50"
              aria-label="Shuffle all songs"
            >
              {isShuffling ? (
                <div className="w-4 h-4 border-2 border-zinc-400 border-t-white rounded-full animate-spin"></div>
              ) : (
                <Shuffle className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="w-8 h-8 flex items-center justify-center text-white hover:bg-zinc-800 rounded-full transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="relative" onClick={() => setIsSearchOpen(true)}>
          <SearchInput
            value={searchQuery}
            onChange={handleSearch}
            placeholder="Search for artists, albums, songs..."
            showClearButton={searchQuery.trim().length > 0}
            onClear={handleClearSearch}
          />
        </div>
      </div>

      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={handleCancelSearch}
        title={title}
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
    </>
  )
}

