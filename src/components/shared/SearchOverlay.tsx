import { useRef, useEffect, useState } from 'react'
import { useLongPress } from '../../hooks/useLongPress'
import { createPortal } from 'react-dom'
import { Guitar, Calendar, Play, ListEnd, Globe, Smile, Piano, Tag } from 'lucide-react'
import SearchInput from './SearchInput'
import SearchArtistItem from './SearchArtistItem'
import ContextMenu from './ContextMenu'
import { jellyfinClient } from '../../api/jellyfin'
import type { BaseItemDto, GroupingCategory } from '../../api/types'
import type { LucideIcon } from 'lucide-react'

// Section configuration for customizing which sections appear and in what order
export type SearchSectionType = 'artists' | 'albums' | 'songs' | 'playlists'

export interface SearchSectionConfig {
  type: SearchSectionType
  limit?: number // undefined means no limit
}

export interface SearchResults {
  artists: BaseItemDto[]
  albums: BaseItemDto[]
  songs: BaseItemDto[]
  playlists?: BaseItemDto[]
}

export interface FilterConfig {
  showGenreFilter: boolean
  showYearFilter: boolean
  showGroupingFilters: boolean
}

export interface FilterState {
  selectedGenres: string[]
  yearRange: { min: number | null; max: number | null }
  selectedGroupings: Record<string, string[]>
}

interface SearchOverlayProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  searchQuery: string
  onSearchChange: (query: string) => void
  onClearSearch: () => void
  isLoading: boolean
  results: SearchResults | null
  sections: SearchSectionConfig[]
  filterConfig: FilterConfig
  filterState: FilterState
  onOpenFilterSheet: (type: 'genre' | 'year') => void
  // Grouping filter props
  groupingCategories?: GroupingCategory[]
  onOpenGroupingFilterSheet?: (category: GroupingCategory) => void
  onArtistClick: (id: string) => void
  onAlbumClick: (id: string) => void
  onSongClick: (song: BaseItemDto) => void
  onPlaylistClick: (id: string) => void
  onPlayAllSongs: () => void
  onAddSongsToQueue: () => void
  isQueueSidebarOpen?: boolean
  // Desktop search input ref for auto-focus
  desktopSearchInputRef?: React.RefObject<HTMLInputElement | null>
  // Mobile search input ref for auto-focus
  mobileSearchInputRef?: React.RefObject<HTMLInputElement | null>
}

// Memoized album item component
interface SearchAlbumItemProps {
  album: BaseItemDto
  onClick: (id: string) => void
  onContextMenu: (item: BaseItemDto, type: 'album', mode: 'mobile' | 'desktop', position?: { x: number; y: number }) => void
  contextMenuItemId: string | null
}

function SearchAlbumItem({ album, onClick, onContextMenu, contextMenuItemId }: SearchAlbumItemProps) {
  const contextMenuJustOpenedRef = useRef(false)
  const isThisItemMenuOpen = contextMenuItemId === album.Id

  const handleClick = (e: React.MouseEvent) => {
    if (isThisItemMenuOpen || contextMenuJustOpenedRef.current) {
      e.preventDefault()
      e.stopPropagation()
      contextMenuJustOpenedRef.current = false
      return
    }
    onClick(album.Id)
  }

  const handleContextMenuClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuJustOpenedRef.current = true
    onContextMenu(album, 'album', 'desktop', { x: e.clientX, y: e.clientY })
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 300)
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      onContextMenu(album, 'album', 'mobile')
    },
  })

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContextMenuClick}
      className="text-left group"
      {...longPressHandlers}
    >
      <div className="aspect-square rounded overflow-hidden mb-3 bg-zinc-900 shadow-lg relative flex items-center justify-center">
        <img
          src={jellyfinClient.getAlbumArtUrl(album.Id, 474)}
          alt={album.Name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 pointer-events-none border border-white rounded" style={{ borderColor: 'rgba(255, 255, 255, 0.03)', borderWidth: '1px' }} />
      </div>
      <div className="text-sm font-semibold text-white truncate mb-1 group-hover:text-[var(--accent-color)] transition-colors">{album.Name}</div>
      <div className="text-xs text-gray-400 truncate">
        {album.AlbumArtist || album.ArtistItems?.[0]?.Name || 'Unknown Artist'}
      </div>
    </button>
  )
}

// Memoized song item component
interface SearchSongItemProps {
  song: BaseItemDto
  onClick: (song: BaseItemDto) => void
  onContextMenu: (item: BaseItemDto, type: 'song', mode: 'mobile' | 'desktop', position?: { x: number; y: number }) => void
  contextMenuItemId: string | null
  showImage?: boolean
}

function SearchSongItem({ song, onClick, onContextMenu, contextMenuItemId, showImage = true }: SearchSongItemProps) {
  const contextMenuJustOpenedRef = useRef(false)
  const isThisItemMenuOpen = contextMenuItemId === song.Id

  const formatDuration = (ticks: number): string => {
    const seconds = Math.floor(ticks / 10000000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleClick = (e: React.MouseEvent) => {
    if (isThisItemMenuOpen || contextMenuJustOpenedRef.current) {
      e.preventDefault()
      e.stopPropagation()
      contextMenuJustOpenedRef.current = false
      return
    }
    onClick(song)
  }

  const handleContextMenuClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuJustOpenedRef.current = true
    onContextMenu(song, 'song', 'desktop', { x: e.clientX, y: e.clientY })
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 300)
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      onContextMenu(song, 'song', 'mobile')
    },
  })

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContextMenuClick}
      className={`w-full flex items-center gap-3 hover:bg-white/10 transition-colors group px-4 py-3 ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
      {...longPressHandlers}
    >
      {showImage && (
        <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-900 self-center">
          <img
            src={jellyfinClient.getAlbumArtUrl(song.AlbumId || song.Id, 96)}
            alt={song.Name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">
          {song.Name}
        </div>
        <div className="text-xs text-gray-400 truncate">
          {song.ArtistItems?.map(a => a.Name).join(', ') || song.AlbumArtist || 'Unknown Artist'}
        </div>
      </div>
      {song.RunTimeTicks && (
        <div className="text-xs text-gray-500 flex-shrink-0">
          {formatDuration(song.RunTimeTicks)}
        </div>
      )}
    </button>
  )
}

// Playlist item component
interface PlaylistItemProps {
  playlist: BaseItemDto
  onClick: (id: string) => void
  onContextMenu: (item: BaseItemDto, type: 'playlist', mode: 'mobile' | 'desktop', position?: { x: number; y: number }) => void
}

function SearchPlaylistItem({ playlist, onClick, onContextMenu }: PlaylistItemProps) {
  const contextMenuJustOpenedRef = useRef(false)
  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      onContextMenu(playlist, 'playlist', 'mobile')
    },
  })
  return (
    <button
      onClick={() => {
        if (contextMenuJustOpenedRef.current) {
          contextMenuJustOpenedRef.current = false
          return
        }
        onClick(playlist.Id)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        contextMenuJustOpenedRef.current = true
        onContextMenu(playlist, 'playlist', 'desktop', { x: e.clientX, y: e.clientY })
        setTimeout(() => {
          contextMenuJustOpenedRef.current = false
        }, 300)
      }}
      className="w-full flex items-center gap-3 hover:bg-white/10 transition-colors group px-4 py-3"
      {...longPressHandlers}
    >
      <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-900 self-center">
        <img
          src={jellyfinClient.getAlbumArtUrl(playlist.Id, 96)}
          alt={playlist.Name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">
          {playlist.Name}
        </div>
        <div className="text-xs text-gray-400 truncate">
          {playlist.ChildCount ? `${playlist.ChildCount} tracks` : 'Playlist'}
        </div>
      </div>
    </button>
  )
}

// Icon mapping for grouping categories
const getGroupingIcon = (categoryKey: string): LucideIcon => {
  switch (categoryKey.toLowerCase()) {
    case 'language': return Globe
    case 'mood': return Smile
    case 'instrumental': return Piano
    default: return Tag
  }
}

export default function SearchOverlay({
  isOpen,
  onClose,
  title = 'Search',
  searchQuery,
  onSearchChange,
  onClearSearch,
  isLoading,
  results,
  sections,
  filterConfig,
  filterState,
  onOpenFilterSheet,
  groupingCategories = [],
  onOpenGroupingFilterSheet,
  onArtistClick,
  onAlbumClick,
  onSongClick,
  onPlaylistClick,
  onPlayAllSongs,
  onAddSongsToQueue,
  isQueueSidebarOpen = false,
  desktopSearchInputRef,
  mobileSearchInputRef,
}: SearchOverlayProps) {
  const internalDesktopRef = useRef<HTMLInputElement>(null)
  const internalMobileRef = useRef<HTMLInputElement>(null)
  const desktopInputRef = desktopSearchInputRef || internalDesktopRef
  const mobileInputRef = mobileSearchInputRef || internalMobileRef


  // Animation state for backdrop fade
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)

  // Handle open/close with animation
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      // Small delay to ensure DOM is ready before starting animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true)
        })
      })
    } else {
      setIsVisible(false)
      // Wait for animation to complete before unmounting
      const timer = setTimeout(() => {
        setShouldRender(false)
      }, 200) // Match transition duration
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Context menu state
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [contextMenuItemType, setContextMenuItemType] = useState<'artist' | 'album' | 'song' | 'playlist' | null>(null)

  const openContextMenu = (
    item: BaseItemDto,
    type: 'artist' | 'album' | 'song' | 'playlist',
    mode: 'mobile' | 'desktop',
    position?: { x: number; y: number }
  ) => {
    setContextMenuItem(item)
    setContextMenuItemType(type)
    setContextMenuMode(mode)
    setContextMenuPosition(position || null)
    setContextMenuOpen(true)
  }

  // Focus search input when overlay opens
  useEffect(() => {
    if (isOpen) {
      // Check if desktop or mobile
      const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)').matches
      if (isDesktop) {
        desktopInputRef.current?.focus()
      } else {
        mobileInputRef.current?.focus()
      }
    }
  }, [isOpen, desktopInputRef, mobileInputRef])

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onClose])

  const hasFilters = filterConfig.showGenreFilter || filterConfig.showYearFilter || (filterConfig.showGroupingFilters && groupingCategories.length > 0)
  const hasResults = results && (
    results.artists.length > 0 ||
    results.albums.length > 0 ||
    results.songs.length > 0 ||
    (results.playlists && results.playlists.length > 0)
  )

  // Render a section based on config
  const renderSection = (config: SearchSectionConfig, isMobile: boolean) => {
    if (!results) return null

    const { type, limit } = config
    const marginClass = isMobile ? '' : '-mx-4'
    const paddingClass = isMobile ? 'pl-2 pr-4' : ''

    switch (type) {
      case 'artists': {
        const items = limit ? results.artists.slice(0, limit) : results.artists
        if (items.length === 0) return null
        return (
          <div key="artists">
            <h2 className={`text-xl font-bold text-white mb-4 ${paddingClass}`}>Artists</h2>
            <div className={`space-y-0 ${marginClass}`}>
              {items.map((artist) => (
                <SearchArtistItem
                  key={artist.Id}
                  artist={artist}
                  onClick={onArtistClick}
                  onContextMenu={openContextMenu}
                  contextMenuItemId={contextMenuItem?.Id || null}
                />
              ))}
            </div>
          </div>
        )
      }

      case 'albums': {
        const items = limit ? results.albums.slice(0, limit) : results.albums
        if (items.length === 0) return null
        return (
          <div key="albums" className={isMobile ? paddingClass : ''}>
            <h2 className="text-xl font-bold text-white mb-4">Albums</h2>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
              {items.map((album) => (
                <SearchAlbumItem
                  key={album.Id}
                  album={album}
                  onClick={onAlbumClick}
                  onContextMenu={openContextMenu}
                  contextMenuItemId={contextMenuItem?.Id || null}
                />
              ))}
            </div>
          </div>
        )
      }

      case 'songs': {
        if (results.songs.length === 0) return null
        return (
          <div key="songs">
            <div className={`flex items-center justify-between mb-4 ${paddingClass}`}>
              <h2 className="text-xl font-bold text-white">Songs</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onPlayAllSongs}
                  className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-lg transition-colors"
                  aria-label="Play all songs"
                >
                  <Play className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={onAddSongsToQueue}
                  className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-lg transition-colors"
                  aria-label="Add all songs to queue"
                >
                  <ListEnd className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className={`space-y-0 ${marginClass}`}>
              {results.songs.map((song, index) => (
                <SearchSongItem
                  key={song.Id}
                  song={song}
                  onClick={onSongClick}
                  onContextMenu={openContextMenu}
                  contextMenuItemId={contextMenuItem?.Id || null}
                  showImage
                />
              ))}
            </div>
          </div>
        )
      }

      case 'playlists': {
        const items = results.playlists
        if (!items || items.length === 0) return null
        return (
          <div key="playlists">
            <h2 className={`text-xl font-bold text-white mb-4 ${paddingClass}`}>Playlists</h2>
            <div className={`space-y-0 ${marginClass}`}>
              {items.map((playlist) => (
                <SearchPlaylistItem
                  key={playlist.Id}
                  playlist={playlist}
                  onClick={onPlaylistClick}
                  onContextMenu={openContextMenu}
                />
              ))}
            </div>
          </div>
        )
      }

      default:
        return null
    }
  }

  // Render filter buttons
  const renderFilters = () => {
    if (!hasFilters) return null

    return (
      <>
        {filterConfig.showGenreFilter && (
          <button
            onClick={() => onOpenFilterSheet('genre')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              filterState.selectedGenres.length > 0
                ? 'bg-[var(--accent-color)] text-white'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            aria-label="Filter by genre"
          >
            <Guitar className="w-4 h-4" />
            <span className="text-sm font-medium">Genre</span>
          </button>
        )}
        {filterConfig.showYearFilter && (
          <button
            onClick={() => onOpenFilterSheet('year')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              filterState.yearRange.min !== null || filterState.yearRange.max !== null
                ? 'bg-[var(--accent-color)] text-white'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            aria-label="Filter by year"
          >
            <Calendar className="w-4 h-4" />
            <span className="text-sm font-medium">Year</span>
          </button>
        )}
        {filterConfig.showGroupingFilters && groupingCategories.map(category => {
          const Icon = getGroupingIcon(category.key)
          const hasSelection = (filterState.selectedGroupings[category.key]?.length || 0) > 0
          return (
            <button
              key={category.key}
              onClick={() => onOpenGroupingFilterSheet?.(category)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                hasSelection
                  ? 'bg-[var(--accent-color)] text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              aria-label={`Filter by ${category.name}`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{category.name}</span>
            </button>
          )
        })}
      </>
    )
  }

  // Render loading state
  const renderLoading = () => (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-800 border-t-[var(--accent-color)]"></div>
    </div>
  )

  // Render no results
  const renderNoResults = () => (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <div className="text-lg mb-2">No results found</div>
      <div className="text-sm">Try a different search term</div>
    </div>
  )

  // Render results content
  const renderContent = (isMobile: boolean) => {
    if (isLoading) return renderLoading()
    if (!results) return <div className="flex flex-col items-center justify-center py-16 text-gray-400" />
    if (!hasResults) return renderNoResults()

    return (
      <div className="space-y-8">
        {sections.map((config) => renderSection(config, isMobile))}
      </div>
    )
  }

  if (!shouldRender) return null

  return createPortal(
    <>
      {/* Backdrop for desktop dropdown mode - click to close */}
      <div
        className={`hidden [@media((hover:hover)_and_(pointer:fine)_and_(min-width:1024px))]:block fixed inset-0 z-[9998] bg-black/50 transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Desktop: positioning wrapper */}
      <div
        className={`hidden [@media((hover:hover)_and_(pointer:fine)_and_(min-width:1024px))]:flex fixed top-0 left-16 z-[9999] justify-center pointer-events-none ${isQueueSidebarOpen ? '' : 'right-0'}`}
        style={isQueueSidebarOpen ? { right: 'var(--sidebar-width)' } : undefined}
      >
        <div className="w-[768px] max-h-[80vh] bg-zinc-900 rounded-b-xl shadow-2xl pointer-events-auto border-l border-r border-b border-zinc-800 flex flex-col overflow-hidden">
          {/* Desktop header - sticky */}
          <div className="sticky top-0 bg-zinc-900 z-10 px-4 pt-4 pb-4 border-b border-zinc-800 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold text-white">{title}</div>
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-white text-sm font-medium hover:bg-zinc-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
            <SearchInput
              ref={desktopInputRef}
              value={searchQuery}
              onChange={onSearchChange}
              placeholder="Search for artists, albums, songs..."
              showClearButton={searchQuery.trim().length > 0}
              onClear={onClearSearch}
            />
          </div>

          {/* Desktop filters and results - scrollable */}
          <div className="overflow-y-auto flex-1 px-4 pb-8">
            {/* Filters */}
            {hasFilters && (
              <div className="flex flex-wrap items-center gap-3 pt-3 pb-4 mb-4">
                {renderFilters()}
              </div>
            )}

            {/* Desktop search results */}
            {renderContent(false)}
          </div>
        </div>
      </div>

      {/* Mobile: fullscreen */}
      <div className="fixed inset-0 bg-black z-[9999] flex flex-col p-0 m-0 [@media((hover:hover)_and_(pointer:fine)_and_(min-width:1024px))]:hidden">
        {/* Fixed overlay to hide content behind status bar */}
        <div
          className="fixed top-0 left-0 right-0 bg-black z-50 pointer-events-none"
          style={{ height: `env(safe-area-inset-top)`, top: `var(--header-offset, 0px)` }}
        />

        {/* Sticky search header with Cancel button */}
        <div className="sticky top-0 left-0 right-0 bg-black z-10 pt-0 pb-0 w-full m-0" style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}>
          <div className="max-w-[768px] mx-auto w-full">
            <div className="flex items-center gap-3 pl-2 pr-4 pt-4 pb-4">
              <div className="flex-1">
                <SearchInput
                  ref={mobileInputRef}
                  value={searchQuery}
                  onChange={onSearchChange}
                  showClearButton={searchQuery.trim().length > 0}
                  onClear={onClearSearch}
                />
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 text-white text-sm font-medium hover:text-zinc-300 transition-colors whitespace-nowrap flex-shrink-0"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable content area */}
        <div className="overflow-y-auto flex-1">
          <div className="max-w-[768px] mx-auto w-full">
            {/* Filter icons - scrolls below header */}
            {hasFilters && (
              <div className="bg-black pt-3 pb-4">
                <div className="flex flex-wrap items-center gap-3 pl-2 pr-4">
                  {renderFilters()}
                </div>
              </div>
            )}

            {/* Search results */}
            <div className="pb-32 pt-4">
              {renderContent(true)}
            </div>
          </div>
        </div>
      </div>

      <ContextMenu
        item={contextMenuItem}
        itemType={contextMenuItemType}
        isOpen={contextMenuOpen}
        onClose={() => {
          setContextMenuOpen(false)
          setContextMenuItem(null)
          setContextMenuItemType(null)
        }}
        zIndex={999999}
        mode={contextMenuMode}
        position={contextMenuPosition || undefined}
      />
    </>,
    document.body
  )
}
