import { Link, useLocation } from 'react-router-dom'
import { Home, User, Disc, Music, Guitar, ListMusic } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'

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

  return (
    <nav 
      className="fixed left-0 right-0 bg-zinc-900 border-t border-zinc-800 z-40" 
      style={{ bottom: `calc(env(safe-area-inset-bottom) - 8px)` }}
    >
      <div className="max-w-[768px] mx-auto">
        <div className="flex justify-around items-center h-16">
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
    </nav>
  )
}
