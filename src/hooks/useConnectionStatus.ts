import { useState, useEffect, useRef, useCallback } from 'react'
import { jellyfinClient } from '../api/jellyfin'
import { useAuthStore } from '../stores/authStore'

const POLL_INTERVAL = 15_000
const PING_TIMEOUT = 8_000

export type ConnectionState = 'connected' | 'unreachable' | 'restored'

export function useConnectionStatus() {
  const [state, setState] = useState<ConnectionState>('connected')
  const [dismissed, setDismissed] = useState(false)
  const isLoggedIn = useAuthStore(s => !!s.accessToken)
  const previousState = useRef<ConnectionState>('connected')

  const checkConnection = useCallback(async () => {
    const serverUrl = jellyfinClient.serverBaseUrl
    if (!serverUrl) return

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT)
      await fetch(`${serverUrl}/System/Ping`, { signal: controller.signal })
      clearTimeout(timeout)

      if (previousState.current === 'unreachable') {
        setState('restored')
        setDismissed(false)
        previousState.current = 'restored'
        setTimeout(() => {
          setState('connected')
          previousState.current = 'connected'
        }, 3000)
      }
    } catch {
      if (previousState.current !== 'unreachable') {
        setState('unreachable')
        setDismissed(false)
        previousState.current = 'unreachable'
      }
    }
  }, [])

  useEffect(() => {
    if (!isLoggedIn) return

    checkConnection()
    const interval = setInterval(checkConnection, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [isLoggedIn, checkConnection])

  const isVisible = isLoggedIn && state !== 'connected' && !(state === 'unreachable' && dismissed)

  return { state, dismissed, dismiss: () => setDismissed(true), isVisible }
}
