// Runtime configuration interface
interface TunetunaConfig {
  lockedServerUrl: string
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    __TUNETUNA_CONFIG__?: TunetunaConfig
  }
}

/**
 * Get runtime configuration
 * Returns the config object from window.__TUNETUNA_CONFIG__ if available
 */
function getConfig(): TunetunaConfig {
  return window.__TUNETUNA_CONFIG__ || { lockedServerUrl: '' }
}

/**
 * Check if server URL is locked by administrator
 * Returns true if JELLYFIN_SERVER_URL environment variable was set in Docker
 */
export function isServerUrlLocked(): boolean {
  const config = getConfig()
  // The placeholder is replaced with actual value at container startup
  // If empty or still contains placeholder, server is not locked
  return Boolean(
    config.lockedServerUrl &&
    config.lockedServerUrl !== '__JELLYFIN_SERVER_URL__' &&
    config.lockedServerUrl.trim() !== ''
  )
}

/**
 * Get the locked server URL if configured
 * Returns the locked URL or null if not configured
 */
export function getLockedServerUrl(): string | null {
  if (isServerUrlLocked()) {
    return getConfig().lockedServerUrl
  }
  return null
}
