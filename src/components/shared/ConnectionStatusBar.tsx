import { ConnectionState } from '../../hooks/useConnectionStatus'
import StatusBar from './StatusBar'

interface ConnectionStatusBarProps {
  state: ConnectionState
  dismiss: () => void
  topOffset?: number
  visible?: boolean
}

export default function ConnectionStatusBar({ state, dismiss, topOffset = 0, visible = true }: ConnectionStatusBarProps) {
  return (
    <StatusBar
      message={state === 'unreachable' ? "Can't reach Jellyfin server" : 'Connection restored'}
      backgroundColor={state === 'unreachable' ? 'bg-status-error' : 'bg-status-success'}
      action={state === 'unreachable' ? { label: 'Dismiss', onClick: dismiss } : undefined}
      topOffset={topOffset}
      visible={visible}
    />
  )
}
