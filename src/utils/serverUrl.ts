import { logger } from './logger'
import { getLockedLocalServerUrl } from './config'

const PROBE_TIMEOUT_MS = 2000

/**
 * Whether `url` would be blocked as Mixed Content from the current page.
 * Browsers refuse http:// subresources from an https:// origin, and won't
 * upgrade http://<ip-address> URLs. If the page is http (dev, local) anything
 * is allowed.
 */
function isMixedContentBlocked(url: string): boolean {
  if (typeof window === 'undefined') return false
  if (window.location.protocol !== 'https:') return false
  try {
    return new URL(url).protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Probe whether a Jellyfin server is reachable at the given URL.
 * Uses mode: 'no-cors' to avoid being blocked by Chrome's Private Network
 * Access policy, which sends a CORS preflight when fetching local IPs from
 * a public origin. With no-cors we get an opaque response (can't read status),
 * but the fetch succeeding means the server is reachable.
 */
async function probeServer(url: string): Promise<boolean> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)

  try {
    await fetch(`${url.replace(/\/$/, '')}/System/Info/Public`, {
      signal: controller.signal,
      mode: 'no-cors',
    })
    clearTimeout(timeoutId)
    return true
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

  if (isMixedContentBlocked(localUrl)) {
    logger.log(`[serverUrl] Local URL ${localUrl} would be blocked as Mixed Content from HTTPS origin, skipping`)
    return remoteUrl
  }

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
