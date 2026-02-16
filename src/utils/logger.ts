// Production-safe logging utility
// Only logs in development mode to avoid console spam in production

const isDev = import.meta.env.DEV

const sendRemoteLog = (type: string, args: unknown[]) => {
  if (!isDev) return

  // Prevent infinite loops if fetch fails
  const safeArgs = args.map(arg => {
    try {
      if (typeof arg === 'object' && arg !== null) {
        return JSON.stringify(arg, (key, value) => {
          if (key === 'audioElement' || key === 'nextAudioElement') return '[HTMLAudioElement]'
          return value
        })
      }
      return String(arg)
    } catch (e) {
      return '[Unserializable]'
    }
  })

  fetch('/__debug', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, args: safeArgs }),
    keepalive: true
  }).catch(() => { })
}

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) {
      console.log(...args)
      sendRemoteLog('log', args)
    }
  },
  warn: (...args: unknown[]) => {
    if (isDev) {
      console.warn(...args)
      sendRemoteLog('warn', args)
    }
  },
  error: (...args: unknown[]) => {
    // Always log errors, even in production
    console.error(...args)
    if (isDev) sendRemoteLog('error', args)
  },
  // Debug logs that are more verbose - only in dev
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.log('[DEBUG]', ...args)
      sendRemoteLog('debug', args)
    }
  },
}
