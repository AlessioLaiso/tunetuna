import { ConnectionState } from '../../hooks/useConnectionStatus'
import StatusBar from './StatusBar'

interface ConnectionStatusBarProps {
  state: ConnectionState
  dismiss: () => void
  topOffset?: number
}

export default function ConnectionStatusBar({ state, dismiss, topOffset = 0 }: ConnectionStatusBarProps) {
  return (
    <StatusBar
      message={state === 'unreachable' ? "Can't reach Jellyfin server" : 'Connection restored'}
      backgroundColor={state === 'unreachable' ? 'bg-red-800' : 'bg-green-800'}
      action={state === 'unreachable' ? { label: 'Dismiss', onClick: dismiss } : undefined}
      topOffset={topOffset}
    />
  )
}
