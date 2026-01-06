import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { ArrowUpDown, User, Disc, Play, ListEnd } from 'lucide-react'
import { jellyfinClient } from '../../api/jellyfin'
import { useMusicStore } from '../../stores/musicStore'
import { usePlayerStore } from '../../stores/playerStore'
import SearchInput from '../shared/SearchInput'
import PlaylistItem from './PlaylistItem'
import ContextMenu from '../shared/ContextMenu'
import Spinner from '../shared/Spinner'
import { useLongPress } from '../../hooks/useLongPress'
import type { BaseItemDto } from '../../api/types'
import { normalizeQuotes } from '../../utils/formatting'
import { unifiedSearch } from '../../utils/search'

interface SearchArtistItemProps {
  artist: BaseItemDto
  onClick: (id: string) => void
  onContextMenu: (item: BaseItemDto, type: 'artist', mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId: string | null
}

const playlistsSearchArtistAlbumArtCache = new Map<string, string | null>()

function SearchArtistItem({ artist, onClick, onContextMenu, contextMenuItemId }: SearchArtistItemProps) {
  const [imageError, setImageError] = useState(false)
  const contextMenuJustOpenedRef = useRef(false)
  const isThisItemMenuOpen = contextMenuItemId === artist.Id
  const [fallbackAlbumArtUrl, setFallbackAlbumArtUrl] = useState<string | null>(null)

  useEffect(() => {
    // Match ArtistCard behavior: only compute fallback when there is no primary artist image
    if (artist.ImageTags?.Primary) {
      setFallbackAlbumArtUrl(null)
      return
    }

    const cached = playlistsSearchArtistAlbumArtCache.get(artist.Id)
    if (cached !== undefined) {
      setFallbackAlbumArtUrl(cached)
      return
    }

    let isCancelled = false

    const loadFallback = async () => {
      try {
        const { albums, songs } = await jellyfinClient.getArtistItems(artist.Id)

        const firstAlbum = albums[0]
        const firstSongWithAlbum = songs.find((song) => song.AlbumId) || songs[0]
        const artItem = firstAlbum || firstSongWithAlbum
        const artId = artItem ? (artItem.AlbumId || artItem.Id) : null
        const url = artId ? jellyfinClient.getAlbumArtUrl(artId, 96) : null
        playlistsSearchArtistAlbumArtCache.set(artist.Id, url)
        if (!isCancelled) {
          setFallbackAlbumArtUrl(url)
        }
      } catch (error) {
        console.error('Failed to load fallback album art for artist (playlists search):', artist.Id, error)
        playlistsSearchArtistAlbumArtCache.set(artist.Id, null)
      }
    }

    loadFallback()

    return () => {
      isCancelled = true
    }
  }, [artist.Id, artist.ImageTags])

  const handleClick = (e: React.MouseEvent) => {
    if (isThisItemMenuOpen || contextMenuJustOpenedRef.current) {
      e.preventDefault()
      e.stopPropagation()
      contextMenuJustOpenedRef.current = false
      return
    }
    onClick(artist.Id)
  }

  const handleContextMenuClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    contextMenuJustOpenedRef.current = true
    onContextMenu(artist, 'artist')
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 300)
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      onContextMenu(artist, 'artist')
    },
    onClick: handleClick,
  })

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContextMenuClick}
      {...longPressHandlers}
      className={`w-full flex items-center gap-4 hover:bg-white/10 transition-colors text-left px-4 h-[72px] ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
    >
      <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-zinc-900 flex items-center justify-center">
        {imageError ? (
          <User className="w-6 h-6 text-gray-500" />
        ) : artist.ImageTags?.Primary || fallbackAlbumArtUrl ? (
          <img
            src={
              artist.ImageTags?.Primary
                ? jellyfinClient.getArtistImageUrl(artist.Id, 96)
                : fallbackAlbumArtUrl || ''
            }
            alt={artist.Name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <User className="w-6 h-6 text-gray-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">{artist.Name}</div>
      </div>
    </button>
  )
}

interface SearchAlbumItemProps {
  album: BaseItemDto
  onClick: (id: string) => void
  onContextMenu: (item: BaseItemDto, type: 'album', mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId: string | null
}

function SearchAlbumItem({ album, onClick, onContextMenu, contextMenuItemId }: SearchAlbumItemProps) {
  const [imageError, setImageError] = useState(false)
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
    onContextMenu(album, 'album')
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 300)
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      onContextMenu(album, 'album')
    },
    onClick: handleClick,
  })

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContextMenuClick}
      {...longPressHandlers}
      className="text-left group"
    >
      <div className="aspect-square rounded overflow-hidden mb-3 bg-zinc-900 shadow-lg relative flex items-center justify-center">
        {imageError ? (
          <Disc className="w-12 h-12 text-gray-500" />
        ) : (
          <>
            <img
              src={jellyfinClient.getAlbumArtUrl(album.Id, 474)}
              alt={album.Name}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
            <div className="absolute inset-0 pointer-events-none border border-white rounded" style={{ borderColor: 'rgba(255, 255, 255, 0.03)', borderWidth: '1px' }} />
          </>
        )}
      </div>
      <div className="text-sm font-semibold text-white truncate mb-1">{album.Name}</div>
      <div className="text-xs text-gray-400 truncate">
        {album.AlbumArtist || album.ArtistItems?.[0]?.Name || 'Unknown Artist'}
      </div>
    </button>
  )
}

interface SearchSongItemProps {
  song: BaseItemDto
  onClick: (song: BaseItemDto) => void
  onContextMenu: (item: BaseItemDto, type: 'song', mode?: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
  contextMenuItemId: string | null
}

function SearchSongItem({ song, onClick, onContextMenu, contextMenuItemId, showImage = true }: SearchSongItemProps & { showImage?: boolean }) {
  const contextMenuJustOpenedRef = useRef(false)
  const isThisItemMenuOpen = contextMenuItemId === song.Id
  const [imageError, setImageError] = useState(false)

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
    onContextMenu(song, 'song')
    setTimeout(() => {
      contextMenuJustOpenedRef.current = false
    }, 300)
  }

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      contextMenuJustOpenedRef.current = true
      onContextMenu(song, 'song')
    },
    onClick: handleClick,
  })

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContextMenuClick}
      {...longPressHandlers}
      className={`w-full flex items-center gap-3 hover:bg-white/10 transition-colors group px-4 py-3 ${isThisItemMenuOpen ? 'bg-white/10' : ''}`}
    >
      <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-zinc-900 self-center relative flex items-center justify-center">
        {imageError ? (
          <Disc className="w-7 h-7 text-gray-500" />
        ) : (
          <>
            <img
              src={jellyfinClient.getAlbumArtUrl(song.AlbumId || song.Id, 96)}
              alt={song.Name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImageError(true)}
            />
            <div
              className="absolute inset-0 pointer-events-none border border-white rounded-sm"
              style={{ borderColor: 'rgba(255, 255, 255, 0.03)', borderWidth: '1px' }}
            />
          </>
        )}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">{song.Name}</div>
        <div className="text-xs text-gray-400 truncate">
          {song.AlbumArtist || song.ArtistItems?.[0]?.Name || 'Unknown Artist'}
          {song.Album && ` • ${song.Album}`}
        </div>
      </div>
      {song.RunTimeTicks && (
        <div className="text-xs text-gray-500 flex-shrink-0 text-right">
          {formatDuration(song.RunTimeTicks)}
        </div>
      )}
    </button>
  )
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<BaseItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const { sortPreferences, setSortPreference } = useMusicStore()
  const { playTrack, playAlbum, addToQueue } = usePlayerStore()
  const sortOrder = sortPreferences.playlists
  const isInitialLoad = useRef(true)
  const [isLoadingSortChange, setIsLoadingSortChange] = useState(false)
  const prevSortOrderRef = useRef(sortOrder)
  const navigate = useNavigate()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const desktopSearchInputRef = useRef<HTMLInputElement>(null)

  // Search state
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
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [contextMenuItemType, setContextMenuItemType] = useState<'album' | 'song' | 'artist' | 'playlist' | null>(null)
  const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
  const [visibleSearchSongImageCount, setVisibleSearchSongImageCount] = useState(45)
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)

  useEffect(() => {
    if (!isSearchOpen) {
      // Check if sortOrder changed (not initial load)
      if (!isInitialLoad.current && prevSortOrderRef.current !== sortOrder) {
        setIsLoadingSortChange(true)
      }
      prevSortOrderRef.current = sortOrder
      loadPlaylists()
    }
  }, [sortOrder, isSearchOpen])

  useEffect(() => {
    // Mark initial load as complete after first render
    if (isInitialLoad.current) {
      isInitialLoad.current = false
    }
  }, [])

  useEffect(() => {
    // Cancel any previous search
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort()
    }

    if (searchQuery.trim()) {
      setIsSearching(true)
      searchAbortControllerRef.current = new AbortController()

      const timeoutId = window.setTimeout(async () => {
        if (searchAbortControllerRef.current?.signal.aborted) return

        try {
          const results = await unifiedSearch(searchQuery, 450)
          if (!searchAbortControllerRef.current?.signal.aborted) {
            setRawSearchResults(results)
          }
        } catch (error) {
          if (!searchAbortControllerRef.current?.signal.aborted) {
            console.error('Search failed:', error)
            setRawSearchResults(null)
          }
        } finally {
          if (!searchAbortControllerRef.current?.signal.aborted) {
            setIsSearching(false)
          }
        }
      }, 250)

      return () => {
        window.clearTimeout(timeoutId)
        if (searchAbortControllerRef.current) {
          searchAbortControllerRef.current.abort()
        }
      }
    } else {
      searchAbortControllerRef.current = null
      setRawSearchResults(null)
      setIsSearching(false)
    }
  }, [searchQuery])

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
  }, [isSearchOpen])

  // Cleanup search abort controller on unmount
  useEffect(() => {
    return () => {
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort()
      }
    }
  }, [])

  const loadPlaylists = async () => {
    setLoading(true)
    try {
      const options: any = {
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
      console.error('Failed to load playlists:', error)
    } finally {
      setLoading(false)
      setIsLoadingSortChange(false)
    }
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (query.trim().length > 0 && !isSearchOpen) {
      setIsSearchOpen(true)
    }
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    setRawSearchResults(null)
  }

  const handleCancelSearch = () => {
    setIsSearchOpen(false)
    setSearchQuery('')
    setRawSearchResults(null)
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

  const handlePlayAllSongs = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (searchResults?.songs && searchResults.songs.length > 0) {
      playAlbum(searchResults.songs)
    }
  }

  const handleAddSongsToQueue = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (searchResults?.songs && searchResults.songs.length > 0) {
      addToQueue(searchResults.songs)
    }
  }

  const handlePlaylistClick = (playlistId: string) => {
    navigate(`/playlist/${playlistId}`)
    setIsSearchOpen(false)
    setSearchQuery('')
    setRawSearchResults(null)
  }

  const openContextMenu = (item: BaseItemDto, type: 'album' | 'song' | 'artist' | 'playlist', mode: 'mobile' | 'desktop' = 'mobile', position?: { x: number, y: number }) => {
    setContextMenuItem(item)
    setContextMenuItemType(type)
    setContextMenuMode(mode)
    setContextMenuPosition(position || null)
    setContextMenuOpen(true)
  }

  // Order results: playlists first, then artists, albums, songs
  const searchResults = useMemo(() => {
    if (!rawSearchResults) return null
    return {
      playlists: rawSearchResults.playlists || [],
      artists: rawSearchResults.artists || [],
      albums: rawSearchResults.albums || [],
      songs: rawSearchResults.songs || [],
    }
  }, [rawSearchResults])

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
                <h1 className="text-2xl font-bold text-white">Playlists</h1>
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
                    onClick={() => setSortPreference('playlists', sortOrder === 'RecentlyAdded' ? 'Alphabetical' : 'RecentlyAdded')}
                    className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                  >
                    {sortOrder === 'RecentlyAdded' ? 'Recently Added' : 'Alphabetically'}
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
                <div className="space-y-0">
                  {playlists.map((playlist) => (
                    <PlaylistItem key={playlist.Id} playlist={playlist} />
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Full-page search overlay - rendered via portal to escape stacking context */}
      {isSearchOpen && createPortal(
        <>
          {/* Backdrop for desktop dropdown mode - click to close */}
          <div
            className="hidden [@media((hover:hover)_and_(pointer:fine)_and_(min-width:1024px))]:block fixed inset-0 z-[9998] bg-black/50"
            onClick={handleCancelSearch}
          />
          {/* Desktop: positioning wrapper that fills content area and centers the dropdown */}
          <div
            className={`hidden [@media((hover:hover)_and_(pointer:fine)_and_(min-width:1024px))]:flex fixed top-0 left-16 z-[9999] justify-center pointer-events-none ${isQueueSidebarOpen ? '' : 'right-0'}`}
            style={isQueueSidebarOpen ? { right: 'var(--sidebar-width)' } : undefined}
          >
            <div className="w-[768px] max-h-[80vh] overflow-y-auto bg-zinc-900 rounded-b-xl shadow-2xl pointer-events-auto">
              {/* Desktop header */}
              <div className="px-4 pt-4 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-lg font-semibold text-white">Search</div>
                  <button
                    onClick={handleCancelSearch}
                    className="px-3 py-1.5 text-white text-sm font-medium hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <SearchInput
                  ref={desktopSearchInputRef}
                  value={searchQuery}
                  onChange={handleSearch}
                  placeholder="Search for artists, albums, songs..."
                  showClearButton={searchQuery.trim().length > 0}
                  onClear={handleClearSearch}
                />
              </div>
              {/* Desktop search results */}
              <div className="px-4 pb-8">
                {isSearching ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-800 border-t-[var(--accent-color)]"></div>
                  </div>
                ) : searchResults ? (
                  <div className="space-y-8">
                    {searchResults.playlists.length > 0 && (
                      <div>
                        <h2 className="text-xl font-bold text-white mb-4">Playlists</h2>
                        <div className="space-y-0 -mx-4">
                          {searchResults.playlists.map((playlist) => (
                            <button
                              key={playlist.Id}
                              onClick={() => handlePlaylistClick(playlist.Id)}
                              onContextMenu={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                openContextMenu(playlist, 'playlist', 'desktop', { x: e.clientX, y: e.clientY })
                              }}
                              className="w-full flex items-center gap-3 hover:bg-white/10 transition-colors group px-4 py-3"
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
                          ))}
                        </div>
                      </div>
                    )}
                    {searchResults.artists.length > 0 && (
                      <div>
                        <h2 className="text-xl font-bold text-white mb-4">Artists</h2>
                        <div className="space-y-0 -mx-4">
                          {searchResults.artists.slice(0, 5).map((artist) => (
                            <SearchArtistItem
                              key={artist.Id}
                              artist={artist}
                              onClick={handleArtistClick}
                              onContextMenu={openContextMenu}
                              contextMenuItemId={contextMenuItem?.Id || null}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {searchResults.albums.length > 0 && (
                      <div>
                        <h2 className="text-xl font-bold text-white mb-4">Albums</h2>
                        <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                          {searchResults.albums.slice(0, 12).map((album) => (
                            <SearchAlbumItem
                              key={album.Id}
                              album={album}
                              onClick={handleAlbumClick}
                              onContextMenu={openContextMenu}
                              contextMenuItemId={contextMenuItem?.Id || null}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {searchResults.songs.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-xl font-bold text-white">Songs</h2>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handlePlayAllSongs}
                              className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-lg transition-colors"
                              aria-label="Play all songs"
                            >
                              <Play className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              onClick={handleAddSongsToQueue}
                              className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-lg transition-colors"
                              aria-label="Add all songs to queue"
                            >
                              <ListEnd className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-0 -mx-4">
                          {searchResults.songs.map((song, index) => (
                            <SearchSongItem
                              key={song.Id}
                              song={song}
                              onClick={handleSongClick}
                              onContextMenu={openContextMenu}
                              contextMenuItemId={contextMenuItem?.Id || null}
                              showImage={index < visibleSearchSongImageCount}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {searchResults.playlists.length === 0 && searchResults.artists.length === 0 && searchResults.albums.length === 0 && searchResults.songs.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <div className="text-lg mb-2">No results found</div>
                        <div className="text-sm">Try a different search term</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400" />
                )}
              </div>
            </div>
          </div>
          {/* Mobile: fullscreen */}
          <div className="fixed inset-0 bg-black z-[9999] overflow-y-auto p-0 m-0 [@media((hover:hover)_and_(pointer:fine)_and_(min-width:1024px))]:hidden">
            {/* Fixed overlay to hide content behind status bar */}
            <div
              className="fixed top-0 left-0 right-0 bg-black z-50 pointer-events-none"
              style={{ height: `env(safe-area-inset-top)`, top: `var(--header-offset, 0px)` }}
            />
            {/* Fixed search header with Cancel button */}
            <div className="fixed top-0 left-0 right-0 bg-black z-10 pt-0 pb-0 w-full m-0" style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))`, height: '76px' }}>
              <div className="max-w-[768px] mx-auto w-full">
                <div className="flex items-center gap-3 px-4 pt-4">
                  <div className="flex-1">
                    <SearchInput
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={handleSearch}
                      showClearButton={searchQuery.trim().length > 0}
                      onClear={handleClearSearch}
                    />
                  </div>
                  <button
                    onClick={handleCancelSearch}
                    className="px-4 py-2 text-white text-sm font-medium hover:text-zinc-300 transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>

            {/* Gradient overlay below search header */}
            <div
              className={`fixed left-0 right-0 z-[60] lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
              style={{
                top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 76px)`,
                height: '24px',
                background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.8), transparent)'
              }}
            />

            <div className="max-w-[768px] mx-auto w-full" style={{ paddingTop: `calc(76px + env(safe-area-inset-top))` }}>
              {/* Search results */}
              <div className="pb-32 pt-4">
                {isSearching ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-800 border-t-[var(--accent-color)]"></div>
                  </div>
                ) : searchResults ? (
                  <div className="space-y-8">
                    {searchResults.playlists.length > 0 && (
                      <div>
                        <h2 className="text-xl font-bold text-white mb-4 px-4">Playlists</h2>
                        <div className="space-y-0">
                          {searchResults.playlists.map((playlist) => (
                            <button
                              key={playlist.Id}
                              onClick={() => handlePlaylistClick(playlist.Id)}
                              onContextMenu={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                openContextMenu(playlist, 'playlist', 'desktop', { x: e.clientX, y: e.clientY })
                              }}
                              className="w-full flex items-center gap-3 hover:bg-white/10 transition-colors group px-4 py-3"
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
                          ))}
                        </div>
                      </div>
                    )}
                    {searchResults.artists.length > 0 && (
                      <div>
                        <h2 className="text-xl font-bold text-white mb-4 px-4">Artists</h2>
                        <div className="space-y-0">
                          {searchResults.artists.slice(0, 5).map((artist) => (
                            <SearchArtistItem
                              key={artist.Id}
                              artist={artist}
                              onClick={handleArtistClick}
                              onContextMenu={openContextMenu}
                              contextMenuItemId={contextMenuItem?.Id || null}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {searchResults.albums.length > 0 && (
                      <div className="px-4">
                        <h2 className="text-xl font-bold text-white mb-4">Albums</h2>
                        <div className="grid grid-cols-3 gap-4">
                          {searchResults.albums.slice(0, 12).map((album) => (
                            <SearchAlbumItem
                              key={album.Id}
                              album={album}
                              onClick={handleAlbumClick}
                              onContextMenu={openContextMenu}
                              contextMenuItemId={contextMenuItem?.Id || null}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {searchResults.songs.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-4 px-4">
                          <h2 className="text-xl font-bold text-white">Songs</h2>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handlePlayAllSongs}
                              className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-lg transition-colors"
                              aria-label="Play all songs"
                            >
                              <Play className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              onClick={handleAddSongsToQueue}
                              className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-lg transition-colors"
                              aria-label="Add all songs to queue"
                            >
                              <ListEnd className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-0">
                          {searchResults.songs.map((song, index) => (
                            <SearchSongItem
                              key={song.Id}
                              song={song}
                              onClick={handleSongClick}
                              onContextMenu={openContextMenu}
                              contextMenuItemId={contextMenuItem?.Id || null}
                              showImage={index < visibleSearchSongImageCount}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {searchResults.playlists.length === 0 && searchResults.artists.length === 0 && searchResults.albums.length === 0 && searchResults.songs.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-gray-400 px-4">
                        <div className="text-lg mb-2">No results found</div>
                        <div className="text-sm">Try a different search term</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400 px-4" />
                )}
              </div>
            </div>
          </div>
        </>,
        document.body
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
