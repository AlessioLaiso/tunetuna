import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Github, HeartHandshake, LogOut, Rabbit, Turtle, Lock, Download, Upload, Trash2, AlertTriangle, Search, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAuthStore } from '../../stores/authStore'
import { useSyncStore } from '../../stores/syncStore'
import { useToastStore } from '../../stores/toastStore'
import { jellyfinClient } from '../../api/jellyfin'
import { useMusicStore } from '../../stores/musicStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useStatsStore } from '../../stores/statsStore'
import ResponsiveModal from '../shared/ResponsiveModal'
import { isServerUrlLocked, isLocalServerUrlLocked, getLockedLocalServerUrl } from '../../utils/config'
import { probeAndUpdateServerUrl } from '../../utils/serverUrl'

const tailwindColors = [
  { name: 'zinc', hex: '#71717a' },
  { name: 'red', hex: '#ef4444' },
  { name: 'orange', hex: '#f97316' },
  { name: 'amber', hex: '#f59e0b' },
  { name: 'yellow', hex: '#eab308' },
  { name: 'lime', hex: '#84cc16' },
  { name: 'green', hex: '#22c55e' },
  { name: 'emerald', hex: '#10b981' },
  { name: 'teal', hex: '#14b8a6' },
  { name: 'cyan', hex: '#06b6d4' },
  { name: 'sky', hex: '#0ea5e9' },
  { name: 'blue', hex: '#3b82f6' },
  { name: 'indigo', hex: '#6366f1' },
  { name: 'violet', hex: '#8b5cf6' },
  { name: 'purple', hex: '#a855f7' },
  { name: 'fuchsia', hex: '#d946ef' },
  { name: 'pink', hex: '#ec4899' },
  { name: 'rose', hex: '#f43f5e' },
]

export default function SettingsPage() {
  const navigate = useNavigate()
  const { pageVisibility, setPageVisibility, accentColor, setAccentColor, statsTrackingEnabled, setStatsTrackingEnabled, feedCountry, setFeedCountry, showMoodCards, setShowMoodCards, showTop10, setShowTop10, showNewReleases, setShowNewReleases, showRecentlyPlayed, setShowRecentlyPlayed, muspyRssUrl, setMuspyRssUrl, localServerUrl, setLocalServerUrl, discogsToken, setDiscogsToken, excludedGenres, setExcludedGenres } = useSettingsStore()
  const { setFeedTopSongs, setFeedNewReleases, setFeedLastUpdated } = useMusicStore()
  const { logout, serverUrl } = useAuthStore()
  const { setGenres, lastSyncCompleted, setLastSyncCompleted, genres: allGenres } = useMusicStore()
  const { state: syncState, startSync, completeSync } = useSyncStore()
  const { addToast } = useToastStore()
  const { exportStats, importStats, clearAllStats, hasStats, pendingEvents, lastSyncedAt, syncToServer, detectMismatchedEvents, remapEvents, removeMismatchedEvents } = useStatsStore()
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)
  const [showSyncOptions, setShowSyncOptions] = useState(false)
  const [showClearStatsConfirm, setShowClearStatsConfirm] = useState(false)
  const [showMismatchModal, setShowMismatchModal] = useState(false)
  const [mismatchCount, setMismatchCount] = useState(0)
  const [mismatchTotal, setMismatchTotal] = useState(0)
  const [autoMatchable, setAutoMatchable] = useState<{ songName: string; artistName: string; eventCount: number }[]>([])
  const [unmatchedSongs, setUnmatchedSongs] = useState<{ songName: string; artistName: string; eventCount: number }[]>([])
  const [showAutoMatchList, setShowAutoMatchList] = useState(false)
  const [showUnmatchedList, setShowUnmatchedList] = useState(false)
  const [isRemapping, setIsRemapping] = useState(false)
  // Manual mapping: key is "songName::artistName", value is selected library songId
  const [manualMappings, setManualMappings] = useState<Map<string, string>>(new Map())
  // Which unmatched song is currently being searched (by key)
  const [searchingFor, setSearchingFor] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isRemoving, setIsRemoving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [statsExist, setStatsExist] = useState(false)
  const [isTop10Spinning, setIsTop10Spinning] = useState(false)
  const [isNewReleasesSpinning, setIsNewReleasesSpinning] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [genreSearch, setGenreSearch] = useState('')
  const [genreDropdownOpen, setGenreDropdownOpen] = useState(false)
  const genreDropdownRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredGenres = useMemo(() => {
    const genreNames = allGenres.map(g => g.Name).filter((n): n is string => !!n).sort()
    if (!genreSearch) return genreNames
    const lower = genreSearch.toLowerCase()
    return genreNames.filter(g => g.toLowerCase().includes(lower))
  }, [allGenres, genreSearch])

  // Close genre dropdown on outside click
  useEffect(() => {
    if (!genreDropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      if (genreDropdownRef.current && !genreDropdownRef.current.contains(e.target as Node)) {
        setGenreDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [genreDropdownOpen])

  // Check if stats exist on mount and when pendingEvents changes
  useEffect(() => {
    const checkStats = async () => {
      const exists = await hasStats()
      setStatsExist(exists)
    }
    checkStats()
  }, [hasStats, pendingEvents.length, lastSyncedAt])

  // Check for mismatched stats on mount (recovery case — bad data already imported)
  const songs = useMusicStore(s => s.songs)
  useEffect(() => {
    if (songs.length > 0 && statsExist) {
      checkForMismatches()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs.length, statsExist])

  // Check if server URL is locked by administrator
  const serverLocked = isServerUrlLocked()
  const localUrlLocked = isLocalServerUrlLocked()
  const lockedLocalUrl = getLockedLocalServerUrl()

  const handleCloseSyncOptions = () => {
    setShowSyncOptions(false)
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handleSyncStats = async () => {
    setIsSyncing(true)
    const countBefore = pendingEvents.length
    await syncToServer()
    const countAfter = useStatsStore.getState().pendingEvents.length
    setIsSyncing(false)

    if (countAfter === 0) {
      addToast(`Synced ${countBefore} event${countBefore !== 1 ? 's' : ''}`, 'success')
    } else if (countAfter < countBefore) {
      addToast(`Synced ${countBefore - countAfter} events, ${countAfter} still pending`, 'success')
    } else {
      addToast('Sync failed - server may be unreachable', 'error')
    }
  }

  const togglePage = (page: keyof typeof pageVisibility) => {
    setPageVisibility({ [page]: !pageVisibility[page] })
  }

  const handleSyncLibrary = async (options: { scope: 'incremental' | 'full' }) => {
    const { setProgress } = useSyncStore.getState()

    try {
      await probeAndUpdateServerUrl()
      startSync('settings', 'Syncing...')
      // Pass progress callback only for full sync
      const onProgress = options.scope === 'full' ? setProgress : undefined
      await jellyfinClient.syncLibrary(options, onProgress)
      const result = await jellyfinClient.getGenres()
      const sorted = (result || []).sort((a, b) =>
        (a.Name || '').localeCompare(b.Name || '')
      )
      setGenres(sorted)
      setLastSyncCompleted(Date.now())
      completeSync(true, 'Library synced successfully')
    } catch (error) {
      completeSync(false, error instanceof Error ? error.message : 'Failed to sync library')
    }
  }

  const handleCopyServerUrl = async () => {
    if (!serverUrl) return
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(serverUrl)
        addToast('Server URL copied', 'success')
        return
      }
      // Fallback for older browsers/PWA contexts
      const textArea = document.createElement('textarea')
      textArea.value = serverUrl
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      textArea.style.top = '-9999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      if (successful) {
        addToast('Server URL copied', 'success')
      } else {
        addToast('Failed to copy URL', 'error')
      }
    } catch {
      addToast('Failed to copy URL', 'error')
    }
  }

  const handleExportStats = async () => {
    setIsExporting(true)
    try {
      await exportStats()
      addToast('Stats exported successfully', 'success')
    } catch {
      addToast('Failed to export stats', 'error')
    } finally {
      setIsExporting(false)
    }
  }

  const handleClearAllStats = async () => {
    setIsClearing(true)
    try {
      const success = await clearAllStats()
      if (success) {
        addToast('All stats cleared', 'success')
        setStatsExist(false)
      } else {
        addToast('Local stats cleared, but server clear failed', 'info')
      }
    } catch {
      addToast('Failed to clear stats', 'error')
    } finally {
      setIsClearing(false)
      setShowClearStatsConfirm(false)
    }
  }

  const checkForMismatches = async () => {
    try {
      const { mismatched, total, autoMatchable: auto, unmatched } = await detectMismatchedEvents()
      if (mismatched > 0) {
        setMismatchCount(mismatched)
        setMismatchTotal(total)
        setAutoMatchable(auto)
        setUnmatchedSongs(unmatched)
        setShowAutoMatchList(false)
        setShowUnmatchedList(false)
        setManualMappings(new Map())
        setSearchingFor(null)
        setSearchQuery('')
        setShowMismatchModal(true)
      }
    } catch {
      // Silently fail — detection is best-effort
    }
  }

  const handleRemapEvents = async () => {
    setIsRemapping(true)
    try {
      const result = await remapEvents(manualMappings.size > 0 ? manualMappings : undefined)
      addToast(`Remapped ${result.remapped} event${result.remapped !== 1 ? 's' : ''}${result.unmatched > 0 ? `, ${result.unmatched} unmatched` : ''}`, 'success')
      setShowMismatchModal(false)
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to remap events', 'error')
    } finally {
      setIsRemapping(false)
    }
  }

  const handleRemoveMismatchedEvents = async () => {
    setIsRemoving(true)
    try {
      const result = await removeMismatchedEvents()
      addToast(`Removed ${result.removed} event${result.removed !== 1 ? 's' : ''}, kept ${result.kept}`, 'success')
      setShowMismatchModal(false)
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to remove events', 'error')
    } finally {
      setIsRemoving(false)
    }
  }

  const handleImportStats = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    try {
      const result = await importStats(file)
      if (result.imported > 0) {
        addToast(`Imported ${result.imported} events${result.skipped > 0 ? `, ${result.skipped} duplicates skipped` : ''}`, 'success')
        setStatsExist(true)
        // Check for mismatches after successful import
        await checkForMismatches()
      } else {
        addToast('No new events to import (all duplicates)', 'info')
      }
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to import stats', 'error')
    } finally {
      setIsImporting(false)
      // Reset file input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="pb-20">
      <div
        className={`fixed top-0 left-0 right-0 bg-black z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
      >
        <div className="max-w-page mx-auto">
          <div className="flex items-center gap-4 py-4 pl-3 pr-4">
            <button
              onClick={() => navigate('/')}
              className="text-white hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold flex-1">Settings</h1>
            <div className="flex items-center gap-2">
              <a
                href="https://github.com/AlessioLaiso/tunetuna"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-white hover:text-[var(--accent-color)] transition-colors"
              >
                <Github className="w-5 h-5" />
              </a>
              <a
                href="https://www.paypal.com/donate/?hosted_button_id=XBVKHU3JV9W8N"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-transparent border border-[var(--accent-color)] text-white hover:bg-[var(--accent-color)]/10 font-semibold rounded-full transition-colors text-sm"
              >
                <HeartHandshake className="w-5 h-5" />
                <span>Donate</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Gradient overlay below top bar */}
      <div
        className={`fixed left-0 right-0 z-[60] lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{
          top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 3.75rem)`,
          height: '24px',
          background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.8), transparent)'
        }}
      />

      <div className="p-4 space-y-8" style={{ paddingTop: `calc(env(safe-area-inset-top) + 7rem)` }}>
        {/* Page Visibility Section */}
        <section>
          <div className="bg-zinc-900 rounded-lg divide-y divide-zinc-800">
            <h2 className="text-lg font-bold text-white p-3">Page Visibility</h2>
            {(['artists', 'albums', 'songs', 'genres', 'playlists', 'collection', 'stats'] as const).map((page) => (
              <div
                key={page}
                className="p-3"
              >
                <div className="flex items-center justify-between">
                  <label className="text-white capitalize font-medium">{page}</label>
                  <button
                    onClick={() => togglePage(page)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${pageVisibility[page] ? 'bg-[var(--accent-color)]' : 'bg-zinc-600'
                      }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${pageVisibility[page] ? 'translate-x-6' : 'translate-x-0'
                        }`}
                    />
                  </button>
                </div>
                {page === 'collection' && pageVisibility.collection && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-400 mb-2">
                      Track your physical collection on{' '}
                      <a
                        href="https://www.discogs.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent-color)] hover:underline"
                      >
                        Discogs
                      </a>
                      {' '}and paste your personal access token here
                    </p>
                    <input
                      type="password"
                      value={discogsToken}
                      onChange={(e) => setDiscogsToken(e.target.value)}
                      placeholder="Personal access token"
                      className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-[var(--accent-color)] placeholder:text-zinc-500"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Home Section */}
        <section>
          <div className="bg-zinc-900 rounded-lg divide-y divide-zinc-800">
            <h2 className="text-lg font-bold text-white p-3">Home</h2>
            <div className="p-3">
              <div className="flex items-center justify-between">
                <label className="text-white font-medium">Mixes</label>
                <button
                  onClick={() => setShowMoodCards(!showMoodCards)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${showMoodCards ? 'bg-[var(--accent-color)]' : 'bg-zinc-600'}`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${showMoodCards ? 'translate-x-6' : 'translate-x-0'}`}
                  />
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Some mixes require logging listening stats and the <a href="https://github.com/jyourstone/jellyfin-musictags-plugin" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-color)] hover:underline">Jellyfin MusicTags Plugin</a>. For moods, set the <a href="https://github.com/AlessioLaiso/music-mood-tagger" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-color)] hover:underline">grouping tag</a> of your songs to 'mood_value1; mood_value2'. For languages, set grouping as 'language_value1'.
              </p>
            </div>

            <div className="flex items-center justify-between p-3">
              <label className="text-white font-medium">Recently Played</label>
              <button
                onClick={() => setShowRecentlyPlayed(!showRecentlyPlayed)}
                className={`relative w-12 h-6 rounded-full transition-colors ${showRecentlyPlayed ? 'bg-[var(--accent-color)]' : 'bg-zinc-600'}`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${showRecentlyPlayed ? 'translate-x-6' : 'translate-x-0'}`}
                />
              </button>
            </div>

            <div className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-white font-medium">Top 10</label>
                  {showTop10 && (
                    <button
                      onClick={() => {
                        setFeedTopSongs([])
                        setFeedLastUpdated(0)
                        setIsTop10Spinning(true)
                        setTimeout(() => setIsTop10Spinning(false), 500)
                      }}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 ${isTop10Spinning ? 'spin-once' : ''}`} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowTop10(!showTop10)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${showTop10 ? 'bg-[var(--accent-color)]' : 'bg-zinc-600'}`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${showTop10 ? 'translate-x-6' : 'translate-x-0'}`}
                  />
                </button>
              </div>
              {showTop10 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-400 mb-2">
                    Country for Apple Music Top 10 chart
                  </p>
                  <select
                    value={feedCountry}
                    onChange={(e) => {
                      setFeedCountry(e.target.value)
                      setFeedTopSongs([])
                      setFeedLastUpdated(0)
                    }}
                    className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 pr-8 border border-zinc-700 focus:outline-none focus:border-[var(--accent-color)] appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                  >
                    <option value="au">Australia</option>
                    <option value="br">Brazil</option>
                    <option value="ca">Canada</option>
                    <option value="dk">Denmark</option>
                    <option value="fi">Finland</option>
                    <option value="fr">France</option>
                    <option value="de">Germany</option>
                    <option value="in">India</option>
                    <option value="ie">Ireland</option>
                    <option value="it">Italy</option>
                    <option value="jp">Japan</option>
                    <option value="mx">Mexico</option>
                    <option value="nl">Netherlands</option>
                    <option value="nz">New Zealand</option>
                    <option value="no">Norway</option>
                    <option value="kr">South Korea</option>
                    <option value="es">Spain</option>
                    <option value="se">Sweden</option>
                    <option value="gb">United Kingdom</option>
                    <option value="us">United States</option>
                  </select>
                </div>
              )}
            </div>

            <div className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-white font-medium">New Releases</label>
                  {showNewReleases && (
                    <button
                      onClick={() => {
                        setFeedNewReleases([])
                        setFeedLastUpdated(0)
                        setIsNewReleasesSpinning(true)
                        setTimeout(() => setIsNewReleasesSpinning(false), 500)
                      }}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 ${isNewReleasesSpinning ? 'spin-once' : ''}`} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowNewReleases(!showNewReleases)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${showNewReleases ? 'bg-[var(--accent-color)]' : 'bg-zinc-600'}`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${showNewReleases ? 'translate-x-6' : 'translate-x-0'}`}
                  />
                </button>
              </div>
              {showNewReleases && (
                <div className="mt-3">
                  <p className="text-xs text-gray-400 mb-2">
                    Get your RSS feed URL from{' '}
                    <a
                      href="https://muspy.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent-color)] hover:underline"
                    >
                      muspy.com
                    </a>
                    {' '}and paste it here
                  </p>
                  <input
                    type="url"
                    value={muspyRssUrl}
                    onChange={(e) => {
                      const value = e.target.value
                      if (value === '' || value.startsWith('https://muspy.com/feed')) {
                        setMuspyRssUrl(value)
                      }
                    }}
                    placeholder="https://muspy.com/feed?id=..."
                    className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-[var(--accent-color)] placeholder:text-zinc-500"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Preferences Section */}
        <section>
          <div className="bg-zinc-900 rounded-lg divide-y divide-zinc-800">
            <h2 className="text-lg font-bold text-white p-3">Preferences</h2>

            <div className="p-3">
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="w-full flex items-center justify-between"
              >
                <label className="text-white font-medium">Accent Color</label>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showColorPicker ? 'rotate-180' : ''}`} />
              </button>
              {showColorPicker && (
                <div className="grid grid-cols-6 md:grid-cols-9 gap-3 mt-3">
                  {tailwindColors.map((color) => (
                    <button
                      key={color.name}
                      onClick={() => {
                        setAccentColor(color.name)
                        setShowColorPicker(false)
                      }}
                      className={`aspect-square rounded-lg transition-all ${accentColor === color.name
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-110'
                        : 'hover:scale-105'
                        }`}
                      style={{ backgroundColor: color.hex }}
                      aria-label={`Select ${color.name} color`}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="p-3">
              <div className="flex items-center justify-between">
                <label className="text-white font-medium">Log Listening Stats</label>
                <button
                  onClick={() => setStatsTrackingEnabled(!statsTrackingEnabled)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${statsTrackingEnabled ? 'bg-[var(--accent-color)]' : 'bg-zinc-600'}`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${statsTrackingEnabled ? 'translate-x-6' : 'translate-x-0'}`}
                  />
                </button>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                {pendingEvents.length > 0 && (
                  <button
                    onClick={handleSyncStats}
                    disabled={isSyncing}
                    className="hover:text-white transition-colors disabled:opacity-50"
                  >
                    {isSyncing
                      ? 'Syncing...'
                      : `${pendingEvents.length} event${pendingEvents.length !== 1 ? 's' : ''} pending sync`
                    }
                  </button>
                )}
                {lastSyncedAt && (
                  <p>Last synced: {new Date(lastSyncedAt).getFullYear()} {new Date(lastSyncedAt).toLocaleString('default', { month: 'short' })} {new Date(lastSyncedAt).getDate().toString().padStart(2, '0')} at {new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                )}
              </div>
              <div className="flex gap-3 mt-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className="flex-1 px-4 py-3 bg-transparent border border-[var(--accent-color)] text-white hover:bg-[var(--accent-color)]/10 disabled:opacity-50 disabled:cursor-not-allowed font-semibold rounded-full transition-colors flex items-center justify-center gap-2"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Importing...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      <span>Import</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleExportStats}
                  disabled={isExporting || !statsExist}
                  className="flex-1 px-4 py-3 bg-transparent border border-[var(--accent-color)] text-white hover:bg-[var(--accent-color)]/10 disabled:opacity-50 disabled:cursor-not-allowed font-semibold rounded-full transition-colors flex items-center justify-center gap-2"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      <span>Export</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setShowClearStatsConfirm(true)}
                  disabled={isClearing || !statsExist}
                  className="flex-1 px-4 py-3 bg-transparent border border-red-500 text-red-500 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed font-semibold rounded-full transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" />
                  <span>Clear</span>
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportStats}
                className="hidden"
              />
            </div>

            <div className="p-3">
              <label className="text-white font-medium block mb-1">Excluded Genres</label>
              <p className="text-xs text-gray-400 mb-3">
                Songs from these genres won't appear in shuffle all and mixes.
              </p>

              {excludedGenres.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {excludedGenres.map(genre => (
                    <button
                      key={genre}
                      onClick={() => setExcludedGenres(excludedGenres.filter(g => g !== genre))}
                      className="flex items-center gap-1 px-2 py-1 bg-zinc-700 text-white text-sm rounded-md hover:bg-zinc-600 transition-colors"
                    >
                      <span>{genre}</span>
                      <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}

              <div className="relative" ref={genreDropdownRef}>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    value={genreSearch}
                    onChange={(e) => {
                      setGenreSearch(e.target.value)
                      setGenreDropdownOpen(true)
                    }}
                    onFocus={() => setGenreDropdownOpen(true)}
                    placeholder="Search genres to exclude..."
                    className="w-full bg-zinc-800 text-white rounded-lg pl-8 pr-3 py-2 border border-zinc-700 focus:outline-none focus:border-[var(--accent-color)] placeholder:text-zinc-500 text-sm"
                  />
                </div>
                {genreDropdownOpen && filteredGenres.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg">
                    {filteredGenres.map(genre => {
                      const isExcluded = excludedGenres.includes(genre)
                      return (
                        <button
                          key={genre}
                          onClick={() => {
                            if (isExcluded) {
                              setExcludedGenres(excludedGenres.filter(g => g !== genre))
                            } else {
                              setExcludedGenres([...excludedGenres, genre])
                            }
                            setGenreSearch('')
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-zinc-700 transition-colors"
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                            isExcluded ? 'bg-[var(--accent-color)] border-[var(--accent-color)]' : 'border-zinc-500'
                          }`}>
                            {isExcluded && (
                              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <span className={isExcluded ? 'text-[var(--accent-color)]' : 'text-white'}>{genre}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Jellyfin Library Section */}
        <section>
          <div className="bg-zinc-900 rounded-lg">
            <div className="p-3">
              <h2 className="text-lg font-bold text-white">Jellyfin Library</h2>
              <div className="text-xs text-gray-400 mt-1">
                <button
                  type="button"
                  onClick={handleCopyServerUrl}
                  disabled={!serverUrl}
                  className={`text-left break-all transition-colors flex items-center gap-1 ${serverUrl
                    ? 'hover:text-[var(--accent-color)] cursor-pointer'
                    : 'text-gray-600 cursor-not-allowed'
                    }`}
                >
                  {serverLocked && <Lock className="w-3 h-3 flex-shrink-0" />}
                  {serverUrl ? `Server: ${serverUrl}` : 'Server: Not configured'}
                </button>
                {syncState === 'idle' && lastSyncCompleted && (
                  <p>
                    Last synced: {new Date(lastSyncCompleted).getFullYear()} {new Date(lastSyncCompleted).toLocaleString('default', { month: 'short' })} {new Date(lastSyncCompleted).getDate().toString().padStart(2, '0')} at {new Date(lastSyncCompleted).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
                {localUrlLocked && lockedLocalUrl && (
                  <span className="text-left break-all flex items-center gap-1">
                    <Lock className="w-3 h-3 flex-shrink-0" />
                    Local: {lockedLocalUrl}
                  </span>
                )}
              </div>
            </div>

            {/* Local URL field — hidden when locked via Docker */}
            {!localUrlLocked && (
              <div className="p-3 border-t border-zinc-800">
                <label className="text-white font-medium block mb-1">LAN Address</label>
                <p className="text-xs text-gray-400 mb-2">
                  For faster access on your local network (e.g. http://192.168.1.10:8096)
                </p>
                <input
                  type="url"
                  value={localServerUrl}
                  onChange={(e) => setLocalServerUrl(e.target.value)}
                  placeholder="Local URL (optional)"
                  className="w-full bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-[var(--accent-color)] placeholder:text-zinc-500"
                />
              </div>
            )}

            <div className="p-3">
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSyncOptions(true)}
                  disabled={syncState === 'syncing'}
                  className="flex-1 px-4 py-3 bg-transparent border border-[var(--accent-color)] text-white hover:bg-[var(--accent-color)]/10 disabled:opacity-50 disabled:cursor-not-allowed font-semibold rounded-full transition-colors flex items-center justify-center gap-2"
                >
                  {syncState === 'syncing' ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Syncing...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-5 h-5" />
                      <span>Sync</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleLogout}
                  className="flex-1 px-4 py-3 bg-transparent border border-red-500 text-red-500 hover:bg-red-500/10 font-semibold rounded-full transition-colors flex items-center justify-center gap-2"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Sync Options Modal */}
        <ResponsiveModal isOpen={showSyncOptions} onClose={handleCloseSyncOptions} zIndex={10001}>
          <div className="pb-6">
            <div className="mb-6 pl-4 pr-4">
              <div className="text-lg font-semibold text-white">
                Sync
              </div>
              <div className="text-sm text-gray-400 mt-1">
                Cache song metadata to speed up search and loading times
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowSyncOptions(false)
                  handleSyncLibrary({ scope: 'incremental' })
                }}
                disabled={syncState === 'syncing'}
                className="w-full flex items-center gap-3 py-4 pr-4 pl-4 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white text-left rounded-lg transition-colors"
              >
                <Rabbit className="w-5 h-5 text-white flex-shrink-0" />
                <span className="font-medium">New and updated files</span>
              </button>

              <button
                onClick={() => {
                  setShowSyncOptions(false)
                  handleSyncLibrary({ scope: 'full' })
                }}
                disabled={syncState === 'syncing'}
                className="w-full flex items-center gap-3 py-4 pr-4 pl-4 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white text-left rounded-lg transition-colors"
              >
                <Turtle className="w-5 h-5 text-white flex-shrink-0" />
                <span className="font-medium">All files (slower)</span>
              </button>
            </div>
          </div>
        </ResponsiveModal>

        {/* Clear Stats Confirmation Modal */}
        <ResponsiveModal isOpen={showClearStatsConfirm} onClose={() => setShowClearStatsConfirm(false)} zIndex={10001}>
          <div className="pb-6">
            <div className="mb-6 pl-4 pr-4 flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-lg font-semibold text-white">
                  Clear All Stats?
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  This will permanently delete all your listening history, both locally and from the server. This action cannot be undone.
                </div>
              </div>
            </div>

            <div className="space-y-3 px-4">
              <button
                onClick={handleClearAllStats}
                disabled={isClearing}
                className="w-full flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-full transition-colors"
              >
                {isClearing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Clearing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-5 h-5" />
                    <span>Clear All Stats</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setShowClearStatsConfirm(false)}
                disabled={isClearing}
                className="w-full py-3 text-white font-medium rounded-full transition-colors hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </ResponsiveModal>

        {/* Library Mismatch Modal */}
        <ResponsiveModal isOpen={showMismatchModal} onClose={() => setShowMismatchModal(false)} zIndex={10001}>
          <div className="pb-6">
            <div className="mb-6 pl-4 pr-4 flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-lg font-semibold text-white">
                  Library Mismatch Detected
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  {mismatchCount} of {mismatchTotal} events reference songs not in your current library.
                </div>
              </div>
              <button
                onClick={() => setShowMismatchModal(false)}
                className="text-gray-400 hover:text-white p-1 flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Auto-matchable section */}
            {autoMatchable.length > 0 && (
              <div className="mx-4 mb-3">
                <button
                  onClick={() => setShowAutoMatchList(!showAutoMatchList)}
                  className="flex items-center gap-2 text-sm text-green-400 mb-1"
                >
                  {showAutoMatchList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <span>{autoMatchable.reduce((sum, s) => sum + s.eventCount, 0)} event{autoMatchable.reduce((sum, s) => sum + s.eventCount, 0) !== 1 ? 's' : ''} can be auto-remapped ({autoMatchable.length} song{autoMatchable.length !== 1 ? 's' : ''})</span>
                </button>
                {showAutoMatchList && (
                  <div className="p-3 bg-white/5 rounded-xl max-h-[20vh] overflow-y-auto">
                    {autoMatchable.map((song, i) => (
                      <div key={i} className="text-sm text-gray-300 py-0.5">
                        {song.songName} - {song.artistName} <span className="text-gray-500">({song.eventCount})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Unmatched section with manual mapping */}
            {unmatchedSongs.length > 0 && (
              <div className="mx-4 mb-4">
                <button
                  onClick={() => setShowUnmatchedList(!showUnmatchedList)}
                  className="flex items-center gap-2 text-sm text-amber-400 mb-1"
                >
                  {showUnmatchedList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <span>{unmatchedSongs.reduce((sum, s) => sum + s.eventCount, 0)} event{unmatchedSongs.reduce((sum, s) => sum + s.eventCount, 0) !== 1 ? 's' : ''} have no match ({unmatchedSongs.length} song{unmatchedSongs.length !== 1 ? 's' : ''})</span>
                </button>
                {showUnmatchedList && (
                  <div className="p-3 bg-white/5 rounded-xl max-h-[40vh] overflow-y-auto space-y-2">
                    {unmatchedSongs.map((song) => {
                      const songKey = `${song.songName}::${song.artistName}`
                      const mappedSongId = manualMappings.get(songKey)
                      const mappedSong = mappedSongId ? songs.find(s => s.Id === mappedSongId) : null
                      const isSearching = searchingFor === songKey

                      return (
                        <div key={songKey} className="text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-gray-300 min-w-0 flex-1">
                              <span className="truncate block">{song.songName} - {song.artistName}</span>
                              <span className="text-gray-500 text-xs">({song.eventCount} event{song.eventCount !== 1 ? 's' : ''})</span>
                            </div>
                            {mappedSong ? (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="text-green-400 text-xs truncate max-w-[120px]">{mappedSong.Name}</span>
                                <button
                                  onClick={() => {
                                    const next = new Map(manualMappings)
                                    next.delete(songKey)
                                    setManualMappings(next)
                                  }}
                                  className="text-gray-400 hover:text-white p-0.5"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setSearchingFor(isSearching ? null : songKey)
                                  setSearchQuery(isSearching ? '' : song.songName)
                                }}
                                className="text-[var(--accent-color)] hover:text-white p-1 flex-shrink-0"
                              >
                                <Search className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Inline search picker */}
                          {isSearching && (
                            <div className="mt-2 mb-1">
                              <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search your library..."
                                autoFocus
                                className="w-full bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-[var(--accent-color)] placeholder:text-zinc-500"
                              />
                              {searchQuery.length >= 2 && (
                                <div className="mt-1 max-h-[150px] overflow-y-auto bg-zinc-800 rounded-lg border border-zinc-700">
                                  {(() => {
                                    const terms = searchQuery.toLowerCase().split(/\s+/).filter(Boolean)
                                    const results = songs.filter(s => {
                                      const haystack = [s.Name, s.AlbumArtist || '', ...(s.ArtistItems || []).map(a => a.Name || '')].join(' ').toLowerCase()
                                      return terms.every(t => haystack.includes(t))
                                    }).sort((a, b) => a.Name.localeCompare(b.Name)).slice(0, 20)
                                    if (results.length === 0) {
                                      return <div className="text-sm text-gray-500 p-2">No results</div>
                                    }
                                    return results.map(s => (
                                      <button
                                        key={s.Id}
                                        onClick={() => {
                                          const next = new Map(manualMappings)
                                          next.set(songKey, s.Id)
                                          setManualMappings(next)
                                          setSearchingFor(null)
                                          setSearchQuery('')
                                        }}
                                        className="w-full text-left px-3 py-2 hover:bg-white/10 text-sm transition-colors"
                                      >
                                        <div className="text-white truncate">{s.Name}</div>
                                        <div className="text-gray-400 text-xs truncate">{s.AlbumArtist || s.ArtistItems?.[0]?.Name || 'Unknown'} - {s.Album || 'Unknown'}</div>
                                      </button>
                                    ))
                                  })()}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3 px-4">
              {/* Remap button — handles both auto-matches and manual mappings */}
              {(autoMatchable.length > 0 || manualMappings.size > 0) && (
                <button
                  onClick={handleRemapEvents}
                  disabled={isRemapping || isRemoving}
                  className="w-full flex flex-col items-center gap-1 py-3 bg-[var(--accent-color)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-full transition-colors"
                >
                  {isRemapping ? (
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Remapping...</span>
                    </div>
                  ) : (
                    <>
                      <span>Remap{autoMatchable.length > 0 && manualMappings.size > 0 ? ` (${autoMatchable.length} auto + ${manualMappings.size} manual)` : autoMatchable.length > 0 ? ` ${autoMatchable.length} Song${autoMatchable.length !== 1 ? 's' : ''}` : ` ${manualMappings.size} Manual Mapping${manualMappings.size !== 1 ? 's' : ''}`}</span>
                      <span className="text-xs font-normal opacity-70">{unmatchedSongs.length - manualMappings.size > 0 ? `${unmatchedSongs.length - manualMappings.size} unmapped event${unmatchedSongs.length - manualMappings.size !== 1 ? 's' : ''} will be kept as-is` : 'All events will be remapped'}</span>
                    </>
                  )}
                </button>
              )}

              <button
                onClick={handleRemoveMismatchedEvents}
                disabled={isRemapping || isRemoving}
                className="w-full flex flex-col items-center gap-1 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-full transition-colors"
              >
                {isRemoving ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Removing...</span>
                  </div>
                ) : (
                  <>
                    <span>Remove All Mismatched Events</span>
                    <span className="text-xs font-normal opacity-70">Permanently delete {mismatchCount} event{mismatchCount !== 1 ? 's' : ''} that don't match</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </ResponsiveModal>
      </div>
    </div>
  )
}

