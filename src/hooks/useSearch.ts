import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import type { BaseItemDto } from '../api/types'
import { fetchAllLibraryItems, unifiedSearch, type SearchFilterOptions } from '../utils/search'
import { logger } from '../utils/logger'

/**
 * Parses a grouping tag string into category and value.
 * Tags can be either:
 * - prefix_value format: "language_eng" -> { category: "language", value: "eng" }
 * - single word format: "instrumental" -> { category: "instrumental", value: null }
 */
function parseGroupingTag(tag: string): { category: string; value: string | null } | null {
  if (!tag || tag.trim() === '') return null
  const trimmed = tag.trim().toLowerCase()
  const underscoreIndex = trimmed.indexOf('_')
  if (underscoreIndex === -1) {
    return { category: trimmed, value: null }
  }
  return {
    category: trimmed.substring(0, underscoreIndex),
    value: trimmed.substring(underscoreIndex + 1)
  }
}

export interface SearchResults {
  artists: BaseItemDto[]
  albums: BaseItemDto[]
  playlists: BaseItemDto[]
  songs: BaseItemDto[]
}

export interface FilterState {
  selectedGenres: string[]
  yearRange: { min: number | null; max: number | null }
  selectedGroupings: Record<string, string[]> // category key -> selected values
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
  selectedGroupings: Record<string, string[]>
  setSelectedGroupings: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
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
  const [selectedGroupings, setSelectedGroupings] = useState<Record<string, string[]>>({})

  // Check if any groupings are selected
  const hasGroupingFilters = Object.values(selectedGroupings).some(values => values.length > 0)

  const hasActiveFilters = includeYearFilter
    ? selectedGenres.length > 0 || yearRange.min !== null || yearRange.max !== null || hasGroupingFilters
    : selectedGenres.length > 0 || hasGroupingFilters

  // Build server-side filter options from current filter state
  const buildServerFilters = useCallback((): SearchFilterOptions | undefined => {
    const filters: SearchFilterOptions = {}
    if (selectedGenres.length > 0) {
      filters.genres = selectedGenres
    }
    if (includeYearFilter && (yearRange.min !== null || yearRange.max !== null)) {
      // Build a list of individual years for the API
      const currentYear = new Date().getFullYear()
      const from = yearRange.min ?? 1900
      const to = yearRange.max ?? currentYear
      const years: number[] = []
      for (let y = from; y <= to; y++) {
        years.push(y)
      }
      filters.years = years
    }
    return filters.genres || filters.years ? filters : undefined
  }, [selectedGenres, yearRange, includeYearFilter])

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
          const serverFilters = buildServerFilters()
          let results
          if (hasQuery) {
            results = await unifiedSearch(searchQuery, limit, serverFilters)
          } else {
            results = await fetchAllLibraryItems(limit, serverFilters)
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
  }, [searchQuery, selectedGenres, yearRange, selectedGroupings, hasActiveFilters, debounceMs, limit, buildServerFilters])

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
      // Artists don't have grouping tags, so filter them out when grouping filter is active
      if (hasGroupingFilters) {
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

      // Apply grouping filters (songs only effectively, since albums don't have Grouping)
      if (hasGroupingFilters) {
        const itemGroupings = item.Grouping || []

        // Parse all of this item's grouping tags into a map: category -> values
        const itemCategoryValues = new Map<string, Set<string>>()
        const itemCategories = new Set<string>()

        itemGroupings.forEach(tag => {
          const parsed = parseGroupingTag(tag)
          if (!parsed) return
          itemCategories.add(parsed.category)
          if (!itemCategoryValues.has(parsed.category)) {
            itemCategoryValues.set(parsed.category, new Set())
          }
          if (parsed.value) {
            itemCategoryValues.get(parsed.category)!.add(parsed.value)
          }
        })

        // Check each selected category filter
        for (const [categoryKey, selectedValues] of Object.entries(selectedGroupings)) {
          if (selectedValues.length === 0) continue

          // Check if any selected value includes "no" (for single-value categories like "instrumental")
          const hasNo = selectedValues.includes('no')
          const hasYes = selectedValues.includes('yes')

          if (hasNo || hasYes) {
            // Single-value category (like "instrumental")
            const itemHasCategory = itemCategories.has(categoryKey)

            if (hasNo && !hasYes && itemHasCategory) {
              // User selected "Not [category]" only, but item HAS this category tag
              return false
            }
            if (hasYes && !hasNo && !itemHasCategory) {
              // User selected "[category]" only, but item does NOT have this category tag
              return false
            }
            // If both are selected, item passes this category filter
          } else {
            // Multi-value category (like "language", "mood")
            // OR logic: item must have at least one of the selected values
            const itemValues = itemCategoryValues.get(categoryKey)
            if (!itemValues || itemValues.size === 0) {
              // Item doesn't have any values for this category but filter requires some
              return false
            }

            const hasMatchingValue = selectedValues.some(selectedValue =>
              itemValues.has(selectedValue.toLowerCase())
            )
            if (!hasMatchingValue) return false
          }
        }
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
      // Playlists don't have grouping tags, so filter them out when grouping filter is active
      if (hasGroupingFilters) {
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
  }, [rawSearchResults, selectedGenres, yearRange, includeYearFilter, selectedGroupings, hasGroupingFilters])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setRawSearchResults(null)
  }, [])

  const clearAll = useCallback(() => {
    setSearchQuery('')
    setRawSearchResults(null)
    setSelectedGenres([])
    setYearRange({ min: null, max: null })
    setSelectedGroupings({})
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
    selectedGroupings,
    setSelectedGroupings,
    hasActiveFilters,
    clearSearch,
    clearAll,
  }
}
