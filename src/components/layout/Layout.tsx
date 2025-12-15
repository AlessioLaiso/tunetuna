import { ReactNode, useEffect } from 'react'
import TabBar from './TabBar'
import PlayerBar from '../player/PlayerBar'
import { useRecommendations } from '../../hooks/useRecommendations'
import { useSettingsStore } from '../../stores/settingsStore'
import { useMusicStore } from '../../stores/musicStore'
import { jellyfinClient } from '../../api/jellyfin'

const colorMap: Record<string, string> = {
  slate: '#64748b',
  gray: '#6b7280',
  zinc: '#71717a',
  neutral: '#737373',
  stone: '#78716c',
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  lime: '#84cc16',
  green: '#22c55e',
  emerald: '#10b981',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  fuchsia: '#d946ef',
  pink: '#ec4899',
  rose: '#f43f5e',
}

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  useRecommendations()
  const { accentColor } = useSettingsStore()
  const { genres } = useMusicStore()

  useEffect(() => {
    const colorHex = colorMap[accentColor] || colorMap.blue
    document.documentElement.style.setProperty('--accent-color', colorHex)
  }, [accentColor])

  // Preload genres in background if not already loaded
  useEffect(() => {
    if (genres.length === 0) {
      // Preload genres in background - non-blocking
      jellyfinClient.getGenres().catch(err => {
        console.warn('Background genre preload failed:', err)
      })
    }
  }, [genres.length])

  return (
    <>
      {/* Fixed overlay to hide content behind status bar */}
      <div 
        className="fixed top-0 left-0 right-0 bg-black z-50 pointer-events-none"
        style={{ height: `env(safe-area-inset-top)` }}
      />
      {/* Fixed overlay to hide content behind TabBar */}
      <div 
        className="fixed bottom-0 left-0 right-0 bg-zinc-900 z-40 pointer-events-none"
        style={{ height: `calc(4rem + env(safe-area-inset-bottom) - 8px)` }}
      />
      <div className="min-h-screen bg-black text-white" style={{ paddingBottom: `calc(4rem + env(safe-area-inset-bottom) - 8px)`, overflowX: 'hidden', maxWidth: '100vw', width: '100%' }}>
        <div className="max-w-[768px] mx-auto w-full">
          {children}
        </div>
        <PlayerBar />
        <TabBar />
      </div>
    </>
  )
}

