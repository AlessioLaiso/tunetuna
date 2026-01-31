import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Settings, Shuffle } from 'lucide-react'
import SearchInput from '../shared/SearchInput'
import SearchOverlay, { type SearchSectionConfig } from '../shared/SearchOverlay'
import type { BaseItemDto } from '../../api/types'
import { jellyfinClient } from '../../api/jellyfin'
import FilterBottomSheet from './FilterBottomSheet'
import { useMusicStore } from '../../stores/musicStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useSearch } from '../../hooks/useSearch'
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
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const desktopSearchInputRef = useRef<HTMLInputElement>(null)

  // Filter sheet state
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
  const [activeFilterType, setActiveFilterType] = useState<'genre' | 'year' | null>(null)

  // Filter values
  const { genres } = useMusicStore()
  const [years, setYears] = useState<number[]>([])


  // Player functions
  const { playAlbum, addToQueue, playTrack, shuffleAllSongs, isQueueSidebarOpen } = usePlayerStore()

  // Loading state for shuffle button
  const [isShuffling, setIsShuffling] = useState(false)

  // Use centralized search hook (no debounce - SearchInput already debounces)
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
    clearSearch,
    clearAll,
  } = useSearch({ debounceMs: 0 })

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
      }
    }

    loadFilterValues()
  }, [])


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

  const handlePlaylistClick = (playlistId: string) => {
    navigate(`/playlist/${playlistId}`)
    setIsSearchOpen(false)
    clearSearch()
  }

  const handleClearSearch = () => {
    // Clear the input but keep the overlay open
    clearSearch()
  }

  const handleCancelSearch = () => {
    // Close the overlay and clear everything
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

