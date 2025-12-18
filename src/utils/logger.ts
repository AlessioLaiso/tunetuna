// Production-safe logging utility
// Only logs in development mode to avoid console spam in production

const isDev = import.meta.env.DEV

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args)
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args)
  },
  error: (...args: unknown[]) => {
    // Always log errors, even in production
    console.error(...args)
  },
  // Debug logs that are more verbose - only in dev
  debug: (...args: unknown[]) => {
    if (isDev) console.log('[DEBUG]', ...args)
  },
}
