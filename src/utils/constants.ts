// API and network timeouts
export const AUTH_TIMEOUT_MS = 30000
export const REQUEST_TIMEOUT_MS = 15000
export const MAX_RETRIES = 2
export const RETRY_DELAY_MS = 1000
// Cache and cooldown durations
export const CACHE_COOLDOWN_MS = 12 * 60 * 60 * 1000 // 12 hours
export const FEED_COOLDOWN_MS = 6 * 60 * 60 * 1000 // 6 hours

// Pagination and limits
export const API_PAGE_LIMIT = 200
export const ARTIST_FETCH_LIMIT = 1000
export const SAFETY_FETCH_LIMIT = 50000

// VPN detection pattern (Tailscale uses 100.x.x.x range)
export const VPN_IP_REGEX = /^https?:\/\/100\.\d+\.\d+\.\d+/

// App info for API headers
export const APP_CLIENT_NAME = 'Tunetuna'
export const APP_DEVICE_TYPE = 'Web'
export const APP_VERSION = '1.0.0'
