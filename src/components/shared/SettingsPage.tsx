import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Github, HeartHandshake, LogOut, Rabbit, Turtle } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAuthStore } from '../../stores/authStore'
import { useSyncStore } from '../../stores/syncStore'
import { jellyfinClient } from '../../api/jellyfin'
import { useMusicStore } from '../../stores/musicStore'
import BottomSheet from '../shared/BottomSheet'

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
  const { pageVisibility, setPageVisibility, accentColor, setAccentColor, enableQueueRecommendations, setEnableQueueRecommendations } = useSettingsStore()
  const { logout, serverUrl } = useAuthStore()
  const { setGenres, lastSyncCompleted, setLastSyncCompleted } = useMusicStore()
  const { state: syncState, startSync, completeSync } = useSyncStore()
  const [copied, setCopied] = useState(false)
  const [showSyncOptions, setShowSyncOptions] = useState(false)
  const [syncOptions, setSyncOptions] = useState({
    scope: 'incremental' as 'incremental' | 'full'
  })

  // Reset sync options when modal closes
  const handleCloseSyncOptions = () => {
    setShowSyncOptions(false)
    // Reset to defaults for next time
    setSyncOptions({
      scope: 'incremental'
    })
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const togglePage = (page: keyof typeof pageVisibility) => {
    setPageVisibility({ [page]: !pageVisibility[page] })
  }

  const handleSyncLibrary = async () => {
    const message = syncOptions.scope === 'full'
      ? 'Syncing...'
      : 'Syncing...'

    startSync('settings', message)
    try {
      await jellyfinClient.syncLibrary(syncOptions)
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
      await navigator.clipboard.writeText(serverUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // optional convenience; ignore errors
    }
  }

  return (
    <div className="pb-20">
      <div className="fixed top-0 left-0 right-0 bg-black z-10 border-b border-gray-800" style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}>
        <div className="max-w-[768px] mx-auto">
          <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => navigate('/')}
            className="text-white hover:text-gray-300 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold flex-1">Settings</h1>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-8" style={{ paddingTop: `calc(env(safe-area-inset-top) + 4.5rem + 1rem)` }}>
        {/* Page Visibility Section */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Page Visibility</h2>
          <div className="space-y-3">
            {(['artists', 'albums', 'songs', 'genres', 'playlists'] as const).map((page) => (
              <div
                key={page}
                className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg"
              >
                <label className="text-white capitalize font-medium">{page}</label>
                <button
                  onClick={() => togglePage(page)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    pageVisibility[page] ? 'bg-[var(--accent-color)]' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      pageVisibility[page] ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Recommendations Section */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Recommendations</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg">
              <label className="text-white font-medium">Recommendations in the queue</label>
              <button
                onClick={() => setEnableQueueRecommendations(!enableQueueRecommendations)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  enableQueueRecommendations ? 'bg-[var(--accent-color)]' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    enableQueueRecommendations ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
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
                className={`aspect-square rounded-lg transition-all ${
                  accentColor === color.name
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

        {/* Jellyfin Library Section */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-1">Jellyfin Library</h2>
          <div className="relative inline-block mb-2">
            <button
              type="button"
              onClick={handleCopyServerUrl}
              disabled={!serverUrl}
              className={`text-left text-xs break-all transition-colors ${
                serverUrl
                  ? 'text-gray-400 hover:text-gray-200 cursor-pointer'
                  : 'text-gray-600 cursor-not-allowed'
              }`}
            >
              {serverUrl ? `Server: ${serverUrl}` : 'Server: Not configured'}
            </button>
            {copied && (
              <div className="absolute left-0 mt-1 px-2 py-1 rounded bg-zinc-800 text-[10px] text-white shadow-lg">
                Copied to clipboard
              </div>
            )}
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
                  setSyncOptions({ scope: 'incremental' })
                  setShowSyncOptions(false)
                  handleSyncLibrary()
                }}
                disabled={syncState === 'syncing'}
                className="w-full flex items-center gap-3 py-4 pr-4 pl-4 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white text-left rounded-lg transition-colors"
              >
                <Rabbit className="w-5 h-5 text-white flex-shrink-0" />
                <span className="font-medium">New and updated files</span>
              </button>

              <button
                onClick={() => {
                  setSyncOptions({ scope: 'full' })
                  setShowSyncOptions(false)
                  handleSyncLibrary()
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
      </div>
    </div>
  )
}

