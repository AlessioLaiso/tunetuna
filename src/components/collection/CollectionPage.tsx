import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpDown, Settings, Play, Shuffle, ListStart, ListEnd, ListPlus, BarChart3, ExternalLink } from 'lucide-react'
import { useCollectionStore } from '../../stores/collectionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useStatsStore } from '../../stores/statsStore'
import { useToastStore } from '../../stores/toastStore'
import { useLibraryLookup } from '../../hooks/useLibraryLookup'
import { cleanDiscogsArtistName } from '../../api/discogs'
import type { DiscogsRelease } from '../../api/discogs'
import type { BaseItemDto } from '../../api/types'
import ResponsiveModal from '../shared/ResponsiveModal'
import PlaylistPicker from '../playlists/PlaylistPicker'

type SortMode = 'artist' | 'album' | 'year' | 'format'

export default function CollectionPage() {
  const navigate = useNavigate()
  const { releases, isLoading, error, loadingProgress, formats, fetchCollection } = useCollectionStore()
  const { discogsToken } = useSettingsStore()
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)
  const [sortMode, setSortMode] = useState<SortMode>('artist')
  const [formatFilter, setFormatFilter] = useState<string | null>(null)
  const [showSortMenu, setShowSortMenu] = useState(false)

  // Context menu state for collection items
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuMode, setMenuMode] = useState<'mobile' | 'desktop'>('mobile')
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [menuRelease, setMenuRelease] = useState<DiscogsRelease | null>(null)
  const [menuLoading, setMenuLoading] = useState<string | null>(null)
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false)
  const [playlistPickerItemIds, setPlaylistPickerItemIds] = useState<string[]>([])
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)
  const suppressClickRef = useRef(false)

  const { fetchReleaseDetail, releaseDetailCache } = useCollectionStore()
  const { playAlbum, addToQueueWithToast, playNext, toggleShuffle } = usePlayerStore()
  const { logStream } = useStatsStore()
  const { addToast } = useToastStore()
  const { findSongWithAlbumHint } = useLibraryLookup()

  useEffect(() => {
    if (discogsToken && releases.length === 0 && !isLoading) {
      fetchCollection()
    }
  }, [discogsToken, releases.length, isLoading, fetchCollection])

  const filteredAndSorted = useMemo(() => {
    let items = [...releases]

    if (formatFilter) {
      items = items.filter((r) =>
        r.basic_information.formats.some((f) => f.name === formatFilter)
      )
    }

    switch (sortMode) {
      case 'artist':
        items.sort((a, b) => {
          const artistA = cleanDiscogsArtistName(a.basic_information.artists[0]?.name || '')
          const artistB = cleanDiscogsArtistName(b.basic_information.artists[0]?.name || '')
          const cmp = artistA.localeCompare(artistB)
          if (cmp !== 0) return cmp
          return (a.basic_information.year || 0) - (b.basic_information.year || 0)
        })
        break
      case 'album':
        items.sort((a, b) =>
          a.basic_information.title.localeCompare(b.basic_information.title)
        )
        break
      case 'year':
        items.sort((a, b) => (b.basic_information.year || 0) - (a.basic_information.year || 0))
        break
      case 'format':
        items.sort((a, b) => {
          const fmtA = a.basic_information.formats[0]?.name || ''
          const fmtB = b.basic_information.formats[0]?.name || ''
          const cmp = fmtA.localeCompare(fmtB)
          if (cmp !== 0) return cmp
          return a.basic_information.title.localeCompare(b.basic_information.title)
        })
        break
    }

    return items
  }, [releases, sortMode, formatFilter])

  // Helper: resolve library matches for a release (fetches detail if needed)
  const getLibraryMatches = useCallback(async (rel: DiscogsRelease) => {
    const info = rel.basic_information
    let detail = releaseDetailCache[info.id]
    if (!detail) {
      detail = await fetchReleaseDetail(info.id) as NonNullable<typeof detail>
      if (!detail) return []
    }
    const artist = cleanDiscogsArtistName(detail.artists[0]?.name || '')
    const tracks = detail.tracklist.filter(t => t.type_ === 'track')
    const usedIds = new Set<string>()
    const results: (NonNullable<ReturnType<typeof findSongWithAlbumHint>> | null)[] = new Array(tracks.length).fill(null)

    // Pass 1: exact matches only
    for (let i = 0; i < tracks.length; i++) {
      const match = findSongWithAlbumHint(tracks[i].title, artist, detail.title, usedIds, true)
      if (match) { usedIds.add(match.Id); results[i] = match }
    }
    // Pass 2: fuzzy matches for remaining
    for (let i = 0; i < tracks.length; i++) {
      if (results[i]) continue
      const match = findSongWithAlbumHint(tracks[i].title, artist, detail.title, usedIds)
      if (match) { usedIds.add(match.Id); results[i] = match }
    }
    const matches = results.filter(Boolean)
    return matches
  }, [releaseDetailCache, fetchReleaseDetail, findSongWithAlbumHint])

  const handleItemContextMenu = useCallback((rel: DiscogsRelease, mode: 'mobile' | 'desktop', position?: { x: number; y: number }) => {
    setMenuRelease(rel)
    setMenuMode(mode)
    setMenuPosition(position || null)
    setMenuOpen(true)
  }, [])

  const handleMenuAction = useCallback(async (action: string) => {
    if (!menuRelease) return
    setMenuLoading(action)
    try {
      if (action === 'openInDiscogs') {
        window.open(`https://www.discogs.com/release/${menuRelease.basic_information.id}`, '_blank', 'noopener,noreferrer')
        setMenuOpen(false)
        return
      }
      const matches = await getLibraryMatches(menuRelease)
      if (matches.length === 0) {
        addToast('No library matches found', 'error', 2000)
        setMenuOpen(false)
        return
      }
      if (action === 'play') {
        const { shuffle } = usePlayerStore.getState()
        if (shuffle) toggleShuffle()
        playAlbum(matches)
      } else if (action === 'shuffle') {
        const { shuffle } = usePlayerStore.getState()
        if (shuffle) toggleShuffle()
        playAlbum(matches)
        requestAnimationFrame(() => {
          const { shuffle: cur } = usePlayerStore.getState()
          if (!cur) toggleShuffle()
        })
      } else if (action === 'playNext') {
        playNext(matches)
      } else if (action === 'addToQueue') {
        addToQueueWithToast(matches)
      } else if (action === 'addToPlaylist') {
        setPlaylistPickerItemIds(matches.map(m => m.Id))
        setMenuOpen(false)
        setPlaylistPickerOpen(true)
        return
      } else if (action === 'logStream') {
        logStream(matches as unknown as BaseItemDto[])
        addToast(`Logged ${matches.length} track${matches.length !== 1 ? 's' : ''}`, 'success', 2000)
      }
      setMenuOpen(false)
    } finally {
      setMenuLoading(null)
    }
  }, [menuRelease, getLibraryMatches, playAlbum, playNext, addToQueueWithToast, toggleShuffle, logStream, addToast])

  const collectionMenuActions = [
    { id: 'play', label: 'Play', icon: Play },
    { id: 'shuffle', label: 'Shuffle', icon: Shuffle },
    { id: 'playNext', label: 'Play Next', icon: ListStart },
    { id: 'addToQueue', label: 'Add to Queue', icon: ListEnd },
    { id: 'addToPlaylist', label: 'Add to Playlist', icon: ListPlus },
    { id: 'logStream', label: 'Log Songs in Library to Stats', icon: BarChart3 },
    { id: 'openInDiscogs', label: 'Open in Discogs', icon: ExternalLink },
  ]

  // No token configured
  if (!discogsToken) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-gray-400 mb-4">Configure your Discogs token to view your physical collection</p>
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Go to Settings
        </button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin mb-4" />
        {loadingProgress && (
          <p className="text-gray-400 text-sm">
            Loading page {loadingProgress.page} of {loadingProgress.totalPages}...
          </p>
        )}
      </div>
    )
  }

  if (error) {
    const isTokenError = error.includes('401') || error.includes('identity')
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-red-400 mb-4">{isTokenError ? 'Invalid Discogs token' : error}</p>
        {isTokenError ? (
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Go to Settings
          </button>
        ) : (
          <button
            onClick={fetchCollection}
            className="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  if (releases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-gray-400">Your Discogs collection is empty</p>
      </div>
    )
  }

  const sortOptions: { value: SortMode; label: string }[] = [
    { value: 'artist', label: 'Artist' },
    { value: 'album', label: 'Album' },
    { value: 'year', label: 'Year' },
    ...(formats.length > 1 ? [{ value: 'format' as SortMode, label: 'Format' }] : []),
  ]

  const sortLabel = sortOptions.find((o) => o.value === sortMode)?.label || 'Artist'

  return (
    <div className="pb-20">
      {/* Fixed header */}
      <div
        className={`fixed top-0 left-0 right-0 bg-black z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{ top: 'calc(var(--header-offset, 0px) + env(safe-area-inset-top))' }}
      >
        <div className="max-w-[768px] mx-auto">
          <div className="p-4 min-[780px]:px-[0.66rem]">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-2xl font-bold text-white">Collection</h1>
              {/* Format filter */}
              {formats.length > 1 && (
                <select
                  value={formatFilter || ''}
                  onChange={(e) => setFormatFilter(e.target.value || null)}
                  className="bg-zinc-800 text-white text-sm rounded-lg px-2 py-1.5 border border-zinc-700 focus:outline-none focus:border-[var(--accent-color)] appearance-none pr-7"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
                >
                  <option value="">All formats</option>
                  {formats.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              )}
            </div>
            {/* Sort control */}
            <div className="flex items-center justify-between gap-2">
              <div className="relative">
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="text-sm text-gray-400 hover:text-[var(--accent-color)] transition-colors flex items-center gap-1"
                >
                  {sortLabel}
                  <ArrowUpDown className="w-4 h-4" />
                </button>
                {showSortMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                    <div className="absolute left-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden z-50 min-w-[120px]">
                      {sortOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setSortMode(opt.value)
                            setShowSortMenu(false)
                          }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            sortMode === opt.value
                              ? 'text-[var(--accent-color)] bg-zinc-700'
                              : 'text-white hover:bg-zinc-700'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Gradient overlay below top bar */}
      <div
        className={`fixed left-0 right-0 z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{
          top: 'calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 6rem)',
          height: '24px',
          background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.8), transparent)'
        }}
      />

      {/* Grid content */}
      <div style={{ paddingTop: 'calc(env(safe-area-inset-top) + 7rem)' }}>
        <div className="p-4">
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {filteredAndSorted.map((release) => {
              const info = release.basic_information
              const artistName = cleanDiscogsArtistName(info.artists[0]?.name || 'Unknown Artist')
              const formatName = info.formats[0]?.name || ''

              return (
                <button
                  key={`${release.id}-${info.id}`}
                  onClick={() => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false
                      return
                    }
                    navigate(`/collection/${info.id}`)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    handleItemContextMenu(release, 'desktop', { x: e.clientX, y: e.clientY })
                  }}
                  onTouchStart={() => {
                    longPressFiredRef.current = false
                    longPressTimerRef.current = setTimeout(() => {
                      longPressFiredRef.current = true
                      suppressClickRef.current = true
                      handleItemContextMenu(release, 'mobile')
                    }, 500)
                  }}
                  onTouchEnd={() => {
                    if (longPressTimerRef.current) {
                      clearTimeout(longPressTimerRef.current)
                      longPressTimerRef.current = null
                    }
                    if (longPressFiredRef.current) {
                      setTimeout(() => { suppressClickRef.current = false }, 300)
                    }
                  }}
                  onTouchMove={() => {
                    if (longPressTimerRef.current) {
                      clearTimeout(longPressTimerRef.current)
                      longPressTimerRef.current = null
                    }
                  }}
                  className="text-left group"
                >
                  <div className="aspect-square rounded overflow-hidden bg-zinc-900 relative flex items-center justify-center mb-1">
                    {info.cover_image ? (
                      <img
                        src={info.cover_image}
                        alt={info.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-zinc-900" />
                    )}
                  </div>
                  <div className="text-sm font-medium text-white truncate group-hover:text-[var(--accent-color)] transition-colors">
                    {info.title}
                  </div>
                  <div className="text-xs text-gray-400 truncate">{artistName}</div>
                  {(info.year > 0 || (formats.length > 1 && formatName)) && (
                    <div className="text-xs text-gray-500 truncate flex items-center gap-1">
                      {info.year > 0 && <span>{info.year}</span>}
                      {info.year > 0 && formats.length > 1 && formatName && <span>•</span>}
                      {formats.length > 1 && formatName && <span>{formatName}</span>}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Collection item context menu */}
      {menuMode === 'desktop' && menuOpen ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div
            className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 min-w-[200px]"
            style={{
              left: Math.min(menuPosition?.x || 100, window.innerWidth - 250),
              top: Math.min(menuPosition?.y || 100, window.innerHeight - (collectionMenuActions.length * 44 + 8) - 10),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {collectionMenuActions.map((action) => {
              const Icon = action.icon
              const isLoading = menuLoading === action.id
              return (
                <button
                  key={action.id}
                  onClick={() => handleMenuAction(action.id)}
                  disabled={!!menuLoading}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                >
                  <Icon className="w-4 h-4 text-white flex-shrink-0" />
                  <span className="flex-1 text-sm text-white">{action.label}</span>
                  {isLoading && (
                    <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <ResponsiveModal isOpen={menuOpen} onClose={() => setMenuOpen(false)}>
          <div className="pb-6">
            {menuRelease && (
              <div className="mb-4 ml-4">
                <div className="text-lg font-semibold text-white break-words">{menuRelease.basic_information.title}</div>
                <div className="text-sm text-gray-400">{cleanDiscogsArtistName(menuRelease.basic_information.artists[0]?.name || '')}</div>
              </div>
            )}
            <div className="space-y-1">
              {collectionMenuActions.map((action) => {
                const Icon = action.icon
                const isLoading = menuLoading === action.id
                return (
                  <button
                    key={action.id}
                    onClick={() => handleMenuAction(action.id)}
                    disabled={!!menuLoading}
                    className="w-full flex items-center gap-4 pl-4 pr-4 py-3 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Icon className="w-5 h-5 text-white" />
                    <span className="flex-1 text-left text-white font-medium">{action.label}</span>
                    {isLoading && (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </ResponsiveModal>
      )}

      <PlaylistPicker
        isOpen={playlistPickerOpen}
        onClose={() => setPlaylistPickerOpen(false)}
        itemIds={playlistPickerItemIds}
      />
    </div>
  )
}
