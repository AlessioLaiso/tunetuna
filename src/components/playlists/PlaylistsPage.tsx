import { useCallback, useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpDown, Plus } from 'lucide-react'
import { jellyfinClient } from '../../api/jellyfin'
import { useMusicStore } from '../../stores/musicStore'
import { usePlayerStore } from '../../stores/playerStore'
import PlaylistItem from './PlaylistItem'
import PlaylistFormModal from './PlaylistFormModal'
import ContextMenu from '../shared/ContextMenu'
import Spinner from '../shared/Spinner'
import SearchOverlay, { type SearchSectionConfig } from '../shared/SearchOverlay'
import type { BaseItemDto } from '../../api/types'
import { logger } from '../../utils/logger'
import { useSearchOpen } from '../../hooks/useSearchOpen'
import { useSearch } from '../../hooks/useSearch'
import { useSearchHandlers } from '../../hooks/useSearchHandlers'

// Section configuration for PlaylistsPage: Playlists first (all), then Artists (5), Albums (12), Songs
const SEARCH_SECTIONS: SearchSectionConfig[] = [
  { type: 'playlists' },
  { type: 'artists', limit: 5 },
  { type: 'albums', limit: 12 },
  { type: 'songs' },
]

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<BaseItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const sortPreferences = useMusicStore(s => s.sortPreferences)
  const setSortPreference = useMusicStore(s => s.setSortPreference)
  const sortOrder = sortPreferences.playlists
  const isInitialLoad = useRef(true)
  const [isLoadingSortChange, setIsLoadingSortChange] = useState(false)
  const prevSortOrderRef = useRef(sortOrder)
  const navigate = useNavigate()

  // Search state (no filters on this page)
  const { isSearchOpen, setIsSearchOpen, openSearch, proxyInputProps } = useSearchOpen()
  const { searchQuery, setSearchQuery, isSearching, searchResults, clearSearch, clearAll } = useSearch()
  const {
    handleSearch, handleClearSearch, handleCancelSearch,
    handleArtistClick, handleAlbumClick, handleSongClick,
    handleAddSongsToQueue, handlePlaylistClick,
  } = useSearchHandlers({
    setSearchQuery, isSearchOpen, setIsSearchOpen, openSearch,
    clearSearch, clearAll, searchResults,
  })
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [contextMenuItemType, setContextMenuItemType] = useState<'album' | 'song' | 'artist' | 'playlist' | null>(null)
  // Setters unused since the context menu always opens in the default
  // mobile mode at the default position on this page.
  const [contextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false)

  const loadPlaylists = useCallback(async () => {
    setLoading(true)
    try {
      const options: Parameters<typeof jellyfinClient.getPlaylists>[0] = {
        limit: 100,
      }

      if (sortOrder === 'RecentlyAdded') {
        options.sortBy = ['DateCreated']
        options.sortOrder = 'Descending'
      } else {
        options.sortBy = ['SortName']
        options.sortOrder = 'Ascending'
      }

      const result = await jellyfinClient.getPlaylists(options)
      setPlaylists(result.Items)
    } catch (error) {
      logger.error('Failed to load playlists:', error)
    } finally {
      setLoading(false)
      setIsLoadingSortChange(false)
    }
  }, [sortOrder])

  // Refresh playlist list when playlists are created/deleted/renamed elsewhere
  useEffect(() => {
    const handler = () => loadPlaylists()
    window.addEventListener('playlistUpdated', handler)
    return () => window.removeEventListener('playlistUpdated', handler)
  }, [loadPlaylists])

  useEffect(() => {
    if (!isSearchOpen) {
      // Check if sortOrder changed (not initial load)
      if (!isInitialLoad.current && prevSortOrderRef.current !== sortOrder) {
        setIsLoadingSortChange(true)
      }
      prevSortOrderRef.current = sortOrder
      loadPlaylists()
    }
  }, [loadPlaylists, sortOrder, isSearchOpen])

  useEffect(() => {
    // Mark initial load as complete after first render
    if (isInitialLoad.current) {
      isInitialLoad.current = false
    }
  }, [])

  // No-op since PlaylistsPage doesn't have filters, but needed for SearchOverlay interface
  const openFilterSheet = (_type: 'genre' | 'year') => { }

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
                <h1 className="text-2xl font-bold text-white">Playlists</h1>
                <div className="flex items-center gap-1">
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
                  <button
                    onClick={() => setShowCreatePlaylist(true)}
                    className="w-10 h-10 flex items-center justify-center text-white hover:bg-zinc-800 rounded-full transition-colors"
                    aria-label="Create playlist"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </div>
              </div>
              {/* Sorting control */}
              {!isSearchOpen && playlists.length > 1 && (
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setSortPreference('playlists', sortOrder === 'RecentlyAdded' ? 'Alphabetical' : 'RecentlyAdded')}
                    className="text-sm text-gray-400 hover:text-[var(--accent-color)] transition-colors flex items-center gap-1"
                  >
                    {sortOrder === 'RecentlyAdded' ? 'Recently added' : 'Alphabetically'}
                    <ArrowUpDown className="w-4 h-4" />
                  </button>
                  {loading && !isInitialLoad.current && (
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
            {playlists.length === 0 && !loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <p>No playlists found</p>
              </div>
            ) : (
              <div className="p-4">
                <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                  {playlists.map((playlist) => (
                    <PlaylistItem key={playlist.Id} playlist={playlist} />
                  ))}
                </div>
              </div>
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
        filterConfig={{ showGenreFilter: false, showYearFilter: false, showGroupingFilters: false }}
        filterState={{ selectedGenres: [], yearRange: { min: null, max: null }, selectedGroupings: {} }}
        onOpenFilterSheet={openFilterSheet}
        onArtistClick={handleArtistClick}
        onAlbumClick={handleAlbumClick}
        onSongClick={handleSongClick}
        onPlaylistClick={handlePlaylistClick}
        onAddSongsToQueue={handleAddSongsToQueue}

        isQueueSidebarOpen={isQueueSidebarOpen}
      />

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

      <PlaylistFormModal
        isOpen={showCreatePlaylist}
        onClose={() => setShowCreatePlaylist(false)}
        onCreated={(playlistId) => navigate(`/playlist/${playlistId}`)}
      />
    </>
  )
}
