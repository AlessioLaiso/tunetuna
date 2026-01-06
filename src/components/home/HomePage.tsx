import { useState, useEffect, useRef } from 'react'
import SearchBar from './SearchBar'
import RecentlyAdded from './RecentlyAdded'
import RecentlyPlayed from './RecentlyPlayed'
import { useMusicStore } from '../../stores/musicStore'
import { usePlayerStore } from '../../stores/playerStore'

export default function HomePage() {
  const [isSearchActive, setIsSearchActive] = useState(false)
  const { recentlyAdded, recentlyPlayed, loading } = useMusicStore()
  const hasAttemptedLoad = useRef(false)

  const { isQueueSidebarOpen } = usePlayerStore()

  // Track if components have attempted to load
  useEffect(() => {
    if (loading.recentlyAdded || loading.recentlyPlayed) {
      hasAttemptedLoad.current = true
    }
  }, [loading.recentlyAdded, loading.recentlyPlayed])

  // Always render components so they can load data via useEffect
  // Only show empty state if both have finished loading AND both are empty AND we've attempted to load
  const showEmptyState =
    hasAttemptedLoad.current &&
    !loading.recentlyAdded &&
    !loading.recentlyPlayed &&
    recentlyAdded.length === 0 &&
    recentlyPlayed.length === 0

  return (
    <div className="pb-20">
      <div
        className={`fixed top-0 left-0 right-0 bg-black z-10 lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{ top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top))` }}
      >
        <div className="max-w-[768px] mx-auto">
          <SearchBar onSearchStateChange={setIsSearchActive} />
        </div>
      </div>

      {/* Gradient overlay below top bar */}
      <div
        className={`fixed left-0 right-0 z-[60] lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{
          top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 7.5rem - 2px)`,
          height: '24px',
            background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.8), transparent)'
        }}
      />

      <div className={isSearchActive ? 'hidden [@media((hover:hover)_and_(pointer:fine)_and_(min-width:1024px))]:block' : ''} style={{ paddingTop: `calc(env(safe-area-inset-top) + 7.5rem + 24px)` }}>
        <div className="max-w-[768px] mx-auto">
          {/* Always render components so they can load data via useEffect */}
          <RecentlyAdded />
          <RecentlyPlayed />
          {/* Show empty state overlay only if both have finished loading and both are empty */}
          {showEmptyState && (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <p>No music found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

