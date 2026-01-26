import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import type { BaseItemDto } from '../api/types'
import { fetchAllLibraryItems, unifiedSearch } from '../utils/search'
import { logger } from '../utils/logger'

export interface SearchResults {
  artists: BaseItemDto[]
  albums: BaseItemDto[]
  playlists: BaseItemDto[]
  songs: BaseItemDto[]
}

export interface FilterState {
  selectedGenres: string[]
  yearRange: { min: number | null; max: number | null }
}

export interface UseSearchOptions {
  /** Debounce delay in ms. Set to 0 for no debounce. Default: 250 */
  debounceMs?: number
  /** Max items to fetch per category. Default: 450 */
  limit?: number
  /** Whether to include year filtering. Default: true */
  includeYearFilter?: boolean
}

export interface UseSearchReturn {
  searchQuery: string
  setSearchQuery: (query: string) => void
  isSearching: boolean
  rawSearchResults: SearchResults | null
  searchResults: SearchResults | null
  selectedGenres: string[]
  setSelectedGenres: (genres: string[]) => void
  yearRange: { min: number | null; max: number | null }
  setYearRange: (range: { min: number | null; max: number | null }) => void
  hasActiveFilters: boolean
  clearSearch: () => void
  clearAll: () => void
}

/**
 * Centralized search hook with proper abort handling and filtering.
 */
export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
  const { debounceMs = 250, limit = 450, includeYearFilter = true } = options

  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [rawSearchResults, setRawSearchResults] = useState<SearchResults | null>(null)
  const searchAbortControllerRef = useRef<AbortController | null>(null)

  // Filter state
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [yearRange, setYearRange] = useState<{ min: number | null; max: number | null }>({
    min: null,
    max: null,
  })

  const hasActiveFilters = includeYearFilter
    ? selectedGenres.length > 0 || yearRange.min !== null || yearRange.max !== null
    : selectedGenres.length > 0

  // Search effect with proper abort handling
  useEffect(() => {
    // Cancel any previous search
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort()
    }

    const hasQuery = searchQuery.trim().length > 0

    if (hasQuery || hasActiveFilters) {
      setIsSearching(true)
      const abortController = new AbortController()
      searchAbortControllerRef.current = abortController

      const executeSearch = async () => {
        if (abortController.signal.aborted) return

        try {
          let results
          if (hasQuery) {
            results = await unifiedSearch(searchQuery, limit)
          } else {
            results = await fetchAllLibraryItems(limit)
          }
          if (!abortController.signal.aborted) {
            setRawSearchResults(results)
          }
        } catch (error) {
          if (!abortController.signal.aborted) {
            logger.error('Search failed:', error)
            setRawSearchResults(null)
          }
        } finally {
          if (!abortController.signal.aborted) {
            setIsSearching(false)
          }
        }
      }

      if (debounceMs > 0) {
        const timeoutId = window.setTimeout(executeSearch, debounceMs)
        return () => {
          window.clearTimeout(timeoutId)
          abortController.abort()
        }
      } else {
        executeSearch()
        return () => {
          abortController.abort()
        }
      }
    } else {
      searchAbortControllerRef.current = null
      setRawSearchResults(null)
      setIsSearching(false)
    }
  }, [searchQuery, hasActiveFilters, debounceMs, limit])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort()
      }
    }
  }, [])

  // Apply filters to search results
  const searchResults = useMemo(() => {
    if (!rawSearchResults) return null

    const filterArtist = (item: BaseItemDto): boolean => {
      // Artists don't have years, so filter them out when year filter is active
      if (includeYearFilter && (yearRange.min !== null || yearRange.max !== null)) {
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

      if (includeYearFilter && (yearRange.min !== null || yearRange.max !== null)) {
        const itemYear = item.ProductionYear
        if (!itemYear || itemYear <= 0) return false
        if (yearRange.min !== null && itemYear < yearRange.min) return false
        if (yearRange.max !== null && itemYear > yearRange.max) return false
      }

      return true
    }

    const filterPlaylist = (item: BaseItemDto): boolean => {
      // Playlists don't have years, so filter them out when year filter is active
      if (includeYearFilter && (yearRange.min !== null || yearRange.max !== null)) {
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
  }, [rawSearchResults, selectedGenres, yearRange, includeYearFilter])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setRawSearchResults(null)
  }, [])

  const clearAll = useCallback(() => {
    setSearchQuery('')
    setRawSearchResults(null)
    setSelectedGenres([])
    setYearRange({ min: null, max: null })
  }, [])

  return {
    searchQuery,
    setSearchQuery,
    isSearching,
    rawSearchResults,
    searchResults,
    selectedGenres,
    setSelectedGenres,
    yearRange,
    setYearRange,
    hasActiveFilters,
    clearSearch,
    clearAll,
  }
}
