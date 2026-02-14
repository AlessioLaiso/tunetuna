import { useSyncStore } from '../../stores/syncStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { jellyfinClient } from '../../api/jellyfin'
import { getLockedLocalServerUrl } from '../../utils/config'

export default function SyncStatusBar() {
  const { state, message, progress, cancelSync } = useSyncStore()
  const { isQueueSidebarOpen } = usePlayerStore()
  const localServerUrl = useSettingsStore((s) => s.localServerUrl)

  if (state === 'idle') return null

  const getBackgroundColor = () => {
    switch (state) {
      case 'syncing': return 'bg-zinc-800'
      case 'success': return 'bg-green-800'
      case 'error': return 'bg-red-800'
      default: return 'bg-zinc-800'
    }
  }

  // When a local URL is configured, show which server is being used during sync
  const localUrl = getLockedLocalServerUrl() || localServerUrl
  const displayMessage = state === 'syncing' && localUrl
    ? (jellyfinClient.serverBaseUrl === localUrl.replace(/\/$/, '') ? 'Syncing via LAN server...' : 'Syncing via remote server...')
    : message

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[10002] ${getBackgroundColor()} transition-colors duration-300`}
      style={{
        height: '28px',
        top: '0px',
        paddingLeft: '16px',
        paddingRight: isQueueSidebarOpen ? 'var(--sidebar-width)' : '12px',
        scrollbarGutter: 'stable'
      }}
    >
      <div className="h-full flex items-center">
        <span className="text-white text-sm font-medium truncate">
          {displayMessage}{state === 'syncing' && progress !== null && <span className="tabular-nums"> ({progress}%)</span>}
        </span>
        {state === 'syncing' && (
          <button
            onClick={cancelSync}
            className="text-white text-sm font-medium hover:text-zinc-300 transition-colors ml-8"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
