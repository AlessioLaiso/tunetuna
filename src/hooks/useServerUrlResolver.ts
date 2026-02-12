import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { jellyfinClient } from '../api/jellyfin'
import { resolveServerUrl } from '../utils/serverUrl'
import { getLockedLocalServerUrl } from '../utils/config'

/**
 * Re-probes the local server URL when the app returns to foreground.
 * Handles network changes (e.g. leaving/joining home Wi-Fi).
 */
export function useServerUrlResolver() {
  const { serverUrl, accessToken, userId, isAuthenticated } = useAuthStore()
  const localServerUrl = useSettingsStore((s) => s.localServerUrl)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !serverUrl || !accessToken || !userId) return

    const localUrl = getLockedLocalServerUrl() || localServerUrl
    if (!localUrl) return

    const probe = () => {
      resolveServerUrl(serverUrl, localUrl).then((resolved) => {
        if (resolved !== jellyfinClient.serverBaseUrl) {
          jellyfinClient.setCredentials(resolved, accessToken, userId)
        }
      })
    }

    // Debounce the initial probe so we don't fire on every keystroke in settings
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(probe, 1000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') probe()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isAuthenticated, serverUrl, accessToken, userId, localServerUrl])
}
