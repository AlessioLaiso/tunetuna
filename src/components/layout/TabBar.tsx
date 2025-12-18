import { Link, useLocation } from 'react-router-dom'
import { Home, User, Disc, Music, Guitar, ListMusic } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useSyncStore } from '../../stores/syncStore'
import VolumeControl from './VolumeControl'
import { useState } from 'react'

const allTabs = [
  { path: '/', label: 'Home', icon: Home, key: 'home' },
  { path: '/artists', label: 'Artists', icon: User, key: 'artists' },
  { path: '/albums', label: 'Albums', icon: Disc, key: 'albums' },
  { path: '/songs', label: 'Songs', icon: Music, key: 'songs' },
  { path: '/genres', label: 'Genres', icon: Guitar, key: 'genres' },
  { path: '/playlists', label: 'Playlists', icon: ListMusic, key: 'playlists' },
]

export default function TabBar() {
  const location = useLocation()
  const { pageVisibility } = useSettingsStore()
  const { state: syncState } = useSyncStore()
  const [showVolumePopover, setShowVolumePopover] = useState(false)

  const tabs = allTabs.filter((tab) => {
    if (tab.key === 'home') return true
    return pageVisibility[tab.key as keyof typeof pageVisibility]
  })

  const handleTabClick = (e: React.MouseEvent<HTMLAnchorElement>, tabPath: string) => {
    // Always close the modal when any tab is clicked
    window.dispatchEvent(new CustomEvent('closePlayerModal'))

    // If clicking the current tab, prevent navigation
    if (location.pathname === tabPath) {
      e.preventDefault()
    }
  }

  // Check if we're on artist detail page
  const isArtistDetailPage = location.pathname.startsWith('/artists/') && location.pathname !== '/artists'

  return (
    <>
      {/* Mobile horizontal layout */}
      <nav
        className="fixed left-0 right-0 bg-zinc-900 border-t border-zinc-800 z-40 lg:hidden"
        style={{ bottom: `calc(env(safe-area-inset-bottom) - 8px)` }}
      >
        <div className="relative h-16">
          <div className="max-w-[600px] mx-auto h-full">
            <div className="flex justify-around items-center h-full">
              {tabs.map((tab) => {
                const isActive = location.pathname === tab.path
                const Icon = tab.icon
                return (
                  <Link
                    key={tab.path}
                    to={tab.path}
                    onClick={(e) => handleTabClick(e, tab.path)}
                    className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                      isActive ? 'text-[var(--accent-color)]' : 'text-gray-400 hover:text-zinc-300'
                    }`}
                  >
                    <Icon className="w-5 h-5 mb-1" />
                    <span className="text-xs font-medium">{tab.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
          {/* Volume control on 1024px+ screens, aligned with tab icons */}
          <div className="absolute right-4 top-3.5 hidden lg:block">
            <VolumeControl variant="horizontal" />
          </div>
        </div>
        {showVolumePopover && (
          <VolumeControl variant="vertical" onClose={() => setShowVolumePopover(false)} />
        )}
      </nav>

      {/* Desktop vertical layout */}
      <nav
        className="fixed left-0 top-0 bottom-16 bg-black z-30 hidden lg:flex flex-col"
        style={{
          width: '4rem',
          top: syncState !== 'idle' ? '28px' : '0px'
        }}
      >
        <div className={`absolute inset-0 flex flex-col items-center justify-center ${isArtistDetailPage ? 'border-r border-zinc-800' : ''}`}>
          {tabs.map((tab, index) => {
            const isActive = location.pathname === tab.path
            const Icon = tab.icon
            return (
              <Link
                key={tab.path}
                to={tab.path}
                onClick={(e) => handleTabClick(e, tab.path)}
                className={`flex flex-col items-center justify-center py-6 transition-colors ${
                  isActive ? 'text-[var(--accent-color)]' : 'text-gray-400 hover:text-zinc-300'
                } ${index < tabs.length - 1 ? 'mb-0' : ''}`}
                style={{ marginBottom: index < tabs.length - 1 ? '0px' : '0' }}
              >
                <Icon className="w-6 h-6 mb-2" />
                <span className="text-xs font-medium text-center leading-tight">{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
