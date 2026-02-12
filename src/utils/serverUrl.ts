import { logger } from './logger'
import { getLockedLocalServerUrl } from './config'

const PROBE_TIMEOUT_MS = 2000

/**
 * Probe whether a Jellyfin server is reachable at the given URL.
 * Uses the unauthenticated /System/Info/Public endpoint with a short timeout.
 */
async function probeServer(url: string): Promise<boolean> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)

  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/System/Info/Public`, {
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response.ok
  } catch {
    clearTimeout(timeoutId)
    return false
  }
}

/**
 * Resolve the effective server URL.
 * If a local URL is configured, probe it first. Use it if reachable,
 * otherwise fall back to the remote URL.
 */
export async function resolveServerUrl(remoteUrl: string, localUrl?: string): Promise<string> {
  if (!localUrl) return remoteUrl

  const reachable = await probeServer(localUrl)
  if (reachable) {
    logger.log(`[serverUrl] Local URL reachable, using: ${localUrl}`)
    return localUrl
  }

  logger.log(`[serverUrl] Local URL unreachable, falling back to: ${remoteUrl}`)
  return remoteUrl
}

/**
 * Re-probe the LAN URL and update jellyfinClient credentials if the resolved
 * server changed. Call this before operations (like sync) that should use
 * the best available server.
 */
export async function probeAndUpdateServerUrl(): Promise<void> {
  // Lazy imports to avoid circular dependencies
  const { useAuthStore } = await import('../stores/authStore')
  const { useSettingsStore } = await import('../stores/settingsStore')
  const { jellyfinClient } = await import('../api/jellyfin')

  const { serverUrl, accessToken, userId } = useAuthStore.getState()
  if (!serverUrl || !accessToken || !userId) return

  const localUrl = getLockedLocalServerUrl() || useSettingsStore.getState().localServerUrl
  if (!localUrl) return

  const resolved = await resolveServerUrl(serverUrl, localUrl)
  if (resolved.replace(/\/$/, '') !== jellyfinClient.serverBaseUrl) {
    jellyfinClient.setCredentials(resolved, accessToken, userId)
  }
}
