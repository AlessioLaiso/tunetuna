import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Github, HeartHandshake, LogOut, Rabbit, Turtle, Lock, Download, Upload, Trash2, AlertTriangle } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAuthStore } from '../../stores/authStore'
import { useSyncStore } from '../../stores/syncStore'
import { useToastStore } from '../../stores/toastStore'
import { jellyfinClient } from '../../api/jellyfin'
import { useMusicStore } from '../../stores/musicStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useStatsStore } from '../../stores/statsStore'
import BottomSheet from '../shared/BottomSheet'
import { isServerUrlLocked } from '../../utils/config'

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
  const { pageVisibility, setPageVisibility, accentColor, setAccentColor, statsTrackingEnabled, setStatsTrackingEnabled, feedCountry, setFeedCountry, showTop10, setShowTop10, showNewReleases, setShowNewReleases, showRecentlyPlayed, setShowRecentlyPlayed, muspyRssUrl, setMuspyRssUrl } = useSettingsStore()
  const { setFeedTopSongs, setFeedNewReleases, setFeedLastUpdated } = useMusicStore()
  const { logout, serverUrl } = useAuthStore()
  const { setGenres, lastSyncCompleted, setLastSyncCompleted } = useMusicStore()
  const { state: syncState, startSync, completeSync } = useSyncStore()
  const { addToast } = useToastStore()
  const { exportStats, importStats, clearAllStats, hasStats, pendingEvents, lastSyncedAt, syncToServer } = useStatsStore()
  const isQueueSidebarOpen = usePlayerStore(state => state.isQueueSidebarOpen)
  const [showSyncOptions, setShowSyncOptions] = useState(false)
  const [showClearStatsConfirm, setShowClearStatsConfirm] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [statsExist, setStatsExist] = useState(false)
  const [isTop10Spinning, setIsTop10Spinning] = useState(false)
  const [isNewReleasesSpinning, setIsNewReleasesSpinning] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Check if stats exist on mount and when pendingEvents changes
  useEffect(() => {
    const checkStats = async () => {
      const exists = await hasStats()
      setStatsExist(exists)
    }
    checkStats()
  }, [hasStats, pendingEvents.length, lastSyncedAt])

  // Check if server URL is locked by administrator
  const serverLocked = isServerUrlLocked()

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

    startSync('settings', 'Syncing...')
    try {
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

  const handleImportStats = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    try {
      const result = await importStats(file)
      if (result.imported > 0) {
        addToast(`Imported ${result.imported} events${result.skipped > 0 ? `, ${result.skipped} duplicates skipped` : ''}`, 'success')
        setStatsExist(true)
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
        <div className="max-w-[768px] mx-auto">
          <div className="flex items-center gap-4 py-4 pl-3 pr-4">
            <button
              onClick={() => navigate('/')}
              className="text-white hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold flex-1">Settings</h1>
          </div>
        </div>
      </div>

      {/* Gradient overlay below top bar */}
      <div
        className={`fixed left-0 right-0 z-[60] lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{
          top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 5.5rem - 28px)`,
          height: '24px',
          background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.8), transparent)'
        }}
      />

      <div className="p-4 space-y-8" style={{ paddingTop: `calc(env(safe-area-inset-top) + 5.5rem + 24px)` }}>
        {/* Page Visibility Section */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Page Visibility</h2>
          <div className="space-y-3">
            {(['artists', 'albums', 'songs', 'genres', 'playlists', 'stats'] as const).map((page) => (
              <div
                key={page}
                className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg"
              >
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
            ))}
          </div>
        </section>

        {/* Home Section */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Home</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg">
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

            <div className="p-3 bg-zinc-900 rounded-lg">
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
                  <p className="text-xs text-gray-400 mt-2">
                    Country for Apple Music Top 10 chart
                  </p>
                </div>
              )}
            </div>

            <div className="p-3 bg-zinc-900 rounded-lg">
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
                  <p className="text-xs text-gray-400 mt-2">
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
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Accent Color Section */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Accent Color</h2>
          <div className="grid grid-cols-6 md:grid-cols-9 gap-3 mb-6">
            {tailwindColors.map((color) => (
              <button
                key={color.name}
                onClick={() => setAccentColor(color.name)}
                className={`aspect-square rounded-lg transition-all ${accentColor === color.name
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-110'
                  : 'hover:scale-105'
                  }`}
                style={{ backgroundColor: color.hex }}
                aria-label={`Select ${color.name} color`}
              />
            ))}
          </div>
          {/* About Tunetuna Section */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">About Tunetuna</h2>
            <div className="flex gap-3">
              <a
                href="https://github.com/AlessioLaiso/tunetuna"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-4 py-3 bg-transparent border border-[var(--accent-color)] text-white hover:bg-[var(--accent-color)]/10 font-semibold rounded-full transition-colors text-center flex items-center justify-center gap-2"
              >
                <Github className="w-5 h-5" />
                <span>GitHub</span>
              </a>
              <a
                href="https://www.paypal.com/donate/?hosted_button_id=XBVKHU3JV9W8N"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-4 py-3 bg-transparent border border-[var(--accent-color)] text-white hover:bg-[var(--accent-color)]/10 font-semibold rounded-full transition-colors text-center flex items-center justify-center gap-2"
              >
                <HeartHandshake className="w-5 h-5" />
                <span>Donate</span>
              </a>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-1">Stats</h2>

          {/* Stats Info */}
          <div className="text-xs text-gray-400 mb-4">
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

          {/* Tracking Toggle */}
          <div className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg mb-4">
            <label className="text-white font-medium">Record Listening Stats</label>
            <button
              onClick={() => setStatsTrackingEnabled(!statsTrackingEnabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${statsTrackingEnabled ? 'bg-[var(--accent-color)]' : 'bg-zinc-600'}`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${statsTrackingEnabled ? 'translate-x-6' : 'translate-x-0'}`}
              />
            </button>
          </div>

          {/* Stats Actions */}
          <div className="flex gap-3">
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

          {/* Hidden file input for import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportStats}
            className="hidden"
          />
        </section>

        {/* Jellyfin Library Section */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-1">Jellyfin Library</h2>
          <div className="mb-2">
            <button
              type="button"
              onClick={handleCopyServerUrl}
              disabled={!serverUrl}
              className={`text-left text-xs break-all transition-colors flex items-center gap-1 ${serverUrl
                ? 'text-gray-400 hover:text-gray-200 cursor-pointer'
                : 'text-gray-600 cursor-not-allowed'
                }`}
            >
              {serverLocked && <Lock className="w-3 h-3 flex-shrink-0" />}
              {serverUrl ? `Server: ${serverUrl}` : 'Server: Not configured'}
            </button>
          </div>
          {syncState === 'idle' && lastSyncCompleted && (
            <div className="text-xs text-gray-400 mb-4">
              Last synced: {new Date(lastSyncCompleted).getFullYear()} {new Date(lastSyncCompleted).toLocaleString('default', { month: 'short' })} {new Date(lastSyncCompleted).getDate().toString().padStart(2, '0')} at {new Date(lastSyncCompleted).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
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
        </section>

        {/* Sync Options Modal */}
        <BottomSheet isOpen={showSyncOptions} onClose={handleCloseSyncOptions} zIndex={10001}>
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
        </BottomSheet>

        {/* Clear Stats Confirmation Modal */}
        <BottomSheet isOpen={showClearStatsConfirm} onClose={() => setShowClearStatsConfirm(false)} zIndex={10001}>
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
        </BottomSheet>
      </div>
    </div>
  )
}

