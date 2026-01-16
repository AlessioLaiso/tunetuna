import { useState, useEffect, useMemo } from 'react'
import { Eye, EyeOff, ShieldAlert } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { storage } from '../../utils/storage'
import { isServerUrlLocked, getLockedServerUrl } from '../../utils/config'

const LAST_SERVER_URL_KEY = 'last-server-url'

// URLs that are safe over HTTP (local network, localhost)
const SAFE_HTTP_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?/i

export default function LoginForm() {
  const [serverUrl, setServerUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((state) => state.login)

  // Check if URL is insecure (HTTP to non-local address)
  const isInsecureUrl = useMemo(() => {
    const url = serverUrl.trim().toLowerCase()
    if (!url.startsWith('http://')) return false
    // Allow HTTP for local network addresses
    return !SAFE_HTTP_PATTERN.test(serverUrl.trim())
  }, [serverUrl])

  // Check if server URL is locked by administrator
  const serverLocked = isServerUrlLocked()
  const lockedUrl = getLockedServerUrl()

  // Load saved server URL on mount (or use locked URL if configured)
  useEffect(() => {
    if (serverLocked && lockedUrl) {
      setServerUrl(lockedUrl)
    } else {
      const savedServerUrl = storage.get<string>(LAST_SERVER_URL_KEY)
      if (savedServerUrl) {
        setServerUrl(savedServerUrl)
      }
    }
  }, [serverLocked, lockedUrl])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Use locked URL if configured, otherwise use user-entered URL
    const effectiveServerUrl = serverLocked && lockedUrl ? lockedUrl : serverUrl

    // Only save server URL to localStorage if not locked
    if (!serverLocked && effectiveServerUrl.trim()) {
      storage.set(LAST_SERVER_URL_KEY, effectiveServerUrl.trim())
    }

    try {
      await login(effectiveServerUrl, username, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Tunetuna</h1>
          <p className="text-gray-400">Sign in to your Jellyfin server</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Server URL field - hidden when locked by administrator */}
          {!serverLocked && (
            <div>
              <label htmlFor="serverUrl" className="block text-sm font-medium text-gray-300 mb-2">
                Server URL
              </label>
              <input
                id="serverUrl"
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://your-server.com"
                required
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-transparent"
              />
              {isInsecureUrl && (
                <div className="mt-2 flex items-start gap-2 text-amber-400 text-sm">
                  <ShieldAlert size={16} className="mt-0.5 flex-shrink-0" />
                  <span>
                    Insecure connection. Your password will be sent unencrypted. Use HTTPS or a local network address.
                  </span>
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              required
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                className="w-full px-4 py-3 pr-12 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-200 px-4 py-3 rounded-lg text-sm whitespace-pre-wrap">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--accent-color)] hover:brightness-90 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

