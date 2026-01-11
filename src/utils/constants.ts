// API and network timeouts
export const AUTH_TIMEOUT_MS = 30000
export const PLAYBACK_REPORT_DELAY_MS = 5000
export const REFRESH_TIMEOUT_MS = 4000
export const RECOMMENDATION_TIMEOUT_MS = 30000
export const SCROLL_THROTTLE_MS = 100

// Cache and cooldown durations
export const CACHE_COOLDOWN_MS = 12 * 60 * 60 * 1000 // 12 hours

// UI durations
export const TOAST_DURATION_MS = 2000

// Pagination and limits
export const API_PAGE_LIMIT = 200
export const ARTIST_FETCH_LIMIT = 1000
export const QUEUE_MAX_SIZE = 1000
export const QUEUE_KEEP_PREVIOUS = 5
export const SAFETY_FETCH_LIMIT = 50000

// VPN detection pattern (Tailscale uses 100.x.x.x range)
export const VPN_IP_REGEX = /^https?:\/\/100\.\d+\.\d+\.\d+/

// App info for API headers
export const APP_CLIENT_NAME = 'Tunetuna'
export const APP_DEVICE_TYPE = 'Web'
export const APP_VERSION = '1.0.0'
