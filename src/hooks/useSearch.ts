import { useEffect, useState, useRef, useMemo, useCallback, useDeferredValue } from 'react'
import type { BaseItemDto } from '../api/types'
import { fetchAllLibraryItems, unifiedSearch, type SearchFilterOptions } from '../utils/search'
import { searchLibrary, browseLibrary, queryWords } from '../utils/localSearch'
import { useMusicStore } from '../stores/musicStore'
import { useSearchCatalogStore, loadSearchCatalog } from '../stores/searchCatalogStore'
import { useHasHydrated } from './useLibraryLookup'
import { logger } from '../utils/logger'
import { parseGroupingTag } from '../utils/formatting'

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
  groupingMatchModes: Record<string, 'or' | 'and'> // category key -> match mode
}

export interface UseSearchOptions {
  /** Server fallback only: debounce delay in ms. Set to 0 for no debounce. Default: 250 */
  debounceMs?: number
  /** Server fallback only: max items to fetch per category. Default: 450 */
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
  bpmRange: { min: number | null; max: number | null }
  setBpmRange: (range: { min: number | null; max: number | null }) => void
  selectedGroupings: Record<string, string[]>
  setSelectedGroupings: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
  groupingMatchModes: Record<string, 'or' | 'and'>
  setGroupingMatchModes: React.Dispatch<React.SetStateAction<Record<string, 'or' | 'and'>>>
  hasActiveFilters: boolean
  clearSearch: () => void
  clearAll: () => void
}

/** Stable empty list, so memos and the search index cache don't see a new array each render */
const NO_ITEMS: BaseItemDto[] = []

/** Runs `task` when the browser is idle (or soon, where unsupported). Returns a cancel function. */
function runWhenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(task, { timeout: 2000 })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(task, 200)
  return () => window.clearTimeout(id)
}

/**
 * Centralized search hook used by every page with a search overlay.
 *
 * Searches in memory: songs, artists, albums and playlists, all saved on the
 * device by the library sync (playlists also refreshed in the background). No
 * request per keystroke, so results update as you type. While the song
 * cache is unavailable (first sync not finished, or not loaded from
 * IndexedDB yet) it falls back to searching the server, debounced.
 *
 * Filters (genre, year, grouping, BPM) are applied to either result set in
 * the same way. Pages differ only in the options they pass and which filters
 * and sections their overlay shows.
 */
export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
  const { debounceMs = 250, limit = 450, includeYearFilter = true } = options

  const [searchQuery, setSearchQuery] = useState('')
  // Typing stays responsive while a large result list re-renders
  const deferredQuery = useDeferredValue(searchQuery)

  const cachedSongs = useMusicStore(state => state.songs)
  const hasHydrated = useHasHydrated()
  const searchCatalog = useMusicStore(state => state.searchCatalog)
  const catalogArtists = searchCatalog?.artists ?? NO_ITEMS
  const catalogAlbums = searchCatalog?.albums ?? NO_ITEMS
  const catalogPlaylists = searchCatalog?.playlists ?? NO_ITEMS
  const catalogFailed = useSearchCatalogStore(state => state.failed)

  // Server fallback state
  const [serverResults, setServerResults] = useState<SearchResults | null>(null)
  const [isServerSearching, setIsServerSearching] = useState(false)
  const searchAbortControllerRef = useRef<AbortController | null>(null)

  // Filter state
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [yearRange, setYearRange] = useState<{ min: number | null; max: number | null }>({
    min: null,
    max: null,
  })
  const [bpmRange, setBpmRange] = useState<{ min: number | null; max: number | null }>({
    min: null,
    max: null,
  })
  const [selectedGroupings, setSelectedGroupings] = useState<Record<string, string[]>>({})
  const [groupingMatchModes, setGroupingMatchModes] = useState<Record<string, 'or' | 'and'>>({})

  // Check if any groupings are selected
  const hasGroupingFilters = Object.values(selectedGroupings).some(values => values.length > 0)
  const hasBpmFilter = bpmRange.min !== null || bpmRange.max !== null

  const hasActiveFilters = includeYearFilter
    ? selectedGenres.length > 0 || yearRange.min !== null || yearRange.max !== null || hasGroupingFilters || hasBpmFilter
    : selectedGenres.length > 0 || hasGroupingFilters || hasBpmFilter

  const hasQuery = searchQuery.trim().length > 0
  const isActive = hasQuery || hasActiveFilters
  // Search the server while the song cache is unavailable: not loaded from
  // IndexedDB yet (or the load failed, which zustand never reports as
  // done), or empty because the first sync hasn't finished
  const useServer = !hasHydrated || cachedSongs.length === 0
  // Saved by the library sync, so normally ready once the cache has loaded.
  // A failed load (no saved catalog yet) still lets songs be searched.
  const catalogReady = searchCatalog !== null || catalogFailed

  // Fetch what the sync doesn't keep current (playlists, or a catalog never
  // saved) once the page is idle, so it doesn't compete with the page's own
  // startup requests. A search that starts first fetches it right away.
  useEffect(() => {
    if (isActive) {
      void loadSearchCatalog()
      return
    }
    return runWhenIdle(() => void loadSearchCatalog())
  }, [isActive])

  // Build the search index while idle, right after the saved library loads,
  // so the first keystroke doesn't pay for it. The index is cached per
  // library array, so this is a no-op until the library or catalog changes.
  useEffect(() => {
    if (useServer || !catalogReady) return
    return runWhenIdle(() => browseLibrary({
      songs: cachedSongs,
      artists: catalogArtists,
      albums: catalogAlbums,
      playlists: catalogPlaylists,
    }))
  }, [useServer, catalogReady, cachedSongs, catalogArtists, catalogAlbums, catalogPlaylists])

  const localResults = useMemo((): SearchResults | null => {
    if (useServer || !catalogReady) return null
    const deferredHasQuery = queryWords(deferredQuery).length > 0
    if (!deferredHasQuery && !hasActiveFilters) return null
    const source = {
      songs: cachedSongs,
      artists: catalogArtists,
      albums: catalogAlbums,
      playlists: catalogPlaylists,
    }
    return deferredHasQuery ? searchLibrary(deferredQuery, source) : browseLibrary(source)
  }, [useServer, catalogReady, deferredQuery, hasActiveFilters, cachedSongs, catalogArtists, catalogAlbums, catalogPlaylists])

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
    // Build tags for grouping filters (convert to Jellyfin tag format)
    // Jellyfin's Tags parameter uses AND logic (item must match all tags),
    // so we can push AND-mode filters entirely server-side.
    // For OR-mode with multiple values, send one tag to narrow the result set.
    if (Object.keys(selectedGroupings).length > 0) {
      const tags: string[] = []
      for (const [categoryKey, selectedValues] of Object.entries(selectedGroupings)) {
        if (selectedValues.length === 0) continue
        // Skip yes/no (boolean-type categories) — handled client-side only
        if (selectedValues.some(v => ['yes', 'no'].includes(v))) continue

        const matchMode = groupingMatchModes[categoryKey] || 'or'
        if (matchMode === 'and') {
          // AND mode: send ALL selected tags — Jellyfin filters with AND natively
          selectedValues.forEach(v => tags.push(`grouping:${categoryKey}_${v}`))
        } else {
          // OR mode: send first tag to narrow the server result set,
          // remaining OR filtering happens client-side
          tags.push(`grouping:${categoryKey}_${selectedValues[0]}`)
        }
      }
      if (tags.length > 0) {
        filters.tags = tags
      }
      if (hasGroupingFilters) {
        filters.hasGroupingFilters = true
      }
    }
    return filters.genres || filters.years || filters.tags || filters.hasGroupingFilters ? filters : undefined
  }, [selectedGenres, yearRange, includeYearFilter, selectedGroupings, groupingMatchModes, hasGroupingFilters])

  // Server fallback, used only while the song cache is empty
  useEffect(() => {
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort()
    }

    if (!useServer || !isActive) {
      searchAbortControllerRef.current = null
      setServerResults(null)
      setIsServerSearching(false)
      return
    }

    setIsServerSearching(true)
    const abortController = new AbortController()
    searchAbortControllerRef.current = abortController

    const executeSearch = async () => {
      if (abortController.signal.aborted) return

      try {
        const serverFilters = buildServerFilters()
        const results = hasQuery
          ? await unifiedSearch(searchQuery, limit, serverFilters)
          : await fetchAllLibraryItems(limit, serverFilters)
        if (!abortController.signal.aborted) {
          setServerResults(results)
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          logger.error('Search failed:', error)
          setServerResults(null)
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsServerSearching(false)
        }
      }
    }

    const timeoutId = window.setTimeout(executeSearch, debounceMs)
    return () => {
      window.clearTimeout(timeoutId)
      abortController.abort()
    }
  }, [useServer, isActive, hasQuery, searchQuery, debounceMs, limit, buildServerFilters])

  const rawSearchResults = useServer ? serverResults : localResults
  const isSearching = isActive && (useServer ? isServerSearching : !catalogReady)

  // Build a BPM lookup map from cached songs for filtering
  const bpmMap = useMemo(() => {
    if (!hasBpmFilter) return null
    const map = new Map<string, number>()
    for (const song of cachedSongs) {
      if (song.Bpm) map.set(song.Id, song.Bpm)
    }
    return map
  }, [cachedSongs, hasBpmFilter])

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
      // Artists don't have BPM, so filter them out when BPM filter is active
      if (hasBpmFilter) {
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

      // Apply grouping filters (songs only; albums are excluded in filterAlbum)
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
            const itemValues = itemCategoryValues.get(categoryKey)
            if (!itemValues || itemValues.size === 0) {
              // Item doesn't have any values for this category but filter requires some
              return false
            }

            const matchMode = groupingMatchModes[categoryKey] || 'or'
            if (matchMode === 'and') {
              // AND logic: item must have ALL selected values
              const hasAllValues = selectedValues.every(selectedValue =>
                itemValues.has(selectedValue.toLowerCase())
              )
              if (!hasAllValues) return false
            } else {
              // OR logic: item must have at least one of the selected values
              const hasMatchingValue = selectedValues.some(selectedValue =>
                itemValues.has(selectedValue.toLowerCase())
              )
              if (!hasMatchingValue) return false
            }
          }
        }
      }

      // Apply BPM range filter
      if (hasBpmFilter && bpmMap) {
        const itemBpm = bpmMap.get(item.Id)
        if (!itemBpm) return false
        if (bpmRange.min !== null && itemBpm < bpmRange.min) return false
        if (bpmRange.max !== null && itemBpm > bpmRange.max) return false
      }

      return true
    }

    const filterPlaylist = (_item: BaseItemDto): boolean => {
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
      // Playlists don't have BPM
      if (hasBpmFilter) {
        return false
      }
      return true
    }

    const filterAlbum = (item: BaseItemDto): boolean => {
      // Albums don't have grouping tags, so filter them out when grouping filter is active
      if (hasGroupingFilters) return false
      return filterAlbumOrSong(item)
    }

    return {
      artists: rawSearchResults.artists.filter(filterArtist),
      albums: rawSearchResults.albums.filter(filterAlbum),
      playlists: (rawSearchResults.playlists || []).filter(filterPlaylist),
      songs: rawSearchResults.songs.filter(filterAlbumOrSong),
    }
  }, [rawSearchResults, selectedGenres, yearRange, bpmRange, includeYearFilter, selectedGroupings, groupingMatchModes, hasGroupingFilters, hasBpmFilter, bpmMap])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setServerResults(null)
  }, [])

  const clearAll = useCallback(() => {
    setSearchQuery('')
    setServerResults(null)
    setSelectedGenres([])
    setYearRange({ min: null, max: null })
    setBpmRange({ min: null, max: null })
    setSelectedGroupings({})
    setGroupingMatchModes({})
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
    bpmRange,
    setBpmRange,
    selectedGroupings,
    setSelectedGroupings,
    groupingMatchModes,
    setGroupingMatchModes,
    hasActiveFilters,
    clearSearch,
    clearAll,
  }
}
