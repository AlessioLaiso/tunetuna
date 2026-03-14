import { useSyncStore } from '../../stores/syncStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { jellyfinClient } from '../../api/jellyfin'
import { getLockedLocalServerUrl } from '../../utils/config'
import StatusBar from './StatusBar'

interface SyncStatusBarProps {
  topOffset?: number
}

export default function SyncStatusBar({ topOffset = 0 }: SyncStatusBarProps) {
  const state = useSyncStore(s => s.state)
  const message = useSyncStore(s => s.message)
  const progress = useSyncStore(s => s.progress)
  const cancelSync = useSyncStore(s => s.cancelSync)
  const localServerUrl = useSettingsStore((s) => s.localServerUrl)

  if (state === 'idle') return null

  const backgroundColor = state === 'success' ? 'bg-green-800' : state === 'error' ? 'bg-red-800' : 'bg-zinc-800'

  // When a local URL is configured, show which server is being used during sync
  const localUrl = getLockedLocalServerUrl() || localServerUrl
  const displayMessage = state === 'syncing' && localUrl
    ? (jellyfinClient.serverBaseUrl === localUrl.replace(/\/$/, '') ? 'Syncing via LAN server...' : 'Syncing via remote server...')
    : message

  const fullMessage = displayMessage + (state === 'syncing' && progress !== null ? ` (${progress}%)` : '')

  return (
    <StatusBar
      message={fullMessage}
      backgroundColor={backgroundColor}
      action={state === 'syncing' ? { label: 'Cancel', onClick: cancelSync } : undefined}
      topOffset={topOffset}
    />
  )
}
