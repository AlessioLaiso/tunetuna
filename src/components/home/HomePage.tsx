import { useState, useEffect, useRef } from 'react'
import SearchBar from './SearchBar'
import RecentlyAdded from './RecentlyAdded'
import { Top10Section, NewReleasesSection, RecentlyPlayedSection } from './FeedSection'
import { useMusicStore } from '../../stores/musicStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useSettingsStore } from '../../stores/settingsStore'

export default function HomePage() {
  const [isSearchActive, setIsSearchActive] = useState(false)
  const { recentlyAdded, recentlyPlayed, loading } = useMusicStore()
  const { showTop10, showNewReleases, showRecentlyPlayed, muspyRssUrl } = useSettingsStore()
  const hasAttemptedLoad = useRef(false)

  const { isQueueSidebarOpen } = usePlayerStore()

  // Track if components have attempted to load
  useEffect(() => {
    if (loading.recentlyAdded || loading.recentlyPlayed) {
      hasAttemptedLoad.current = true
    }
  }, [loading.recentlyAdded, loading.recentlyPlayed])

  // Count active feed sections (new releases only counts if URL is configured)
  const newReleasesActive = showNewReleases && !!muspyRssUrl
  const activeFeedSections = [showTop10, newReleasesActive, showRecentlyPlayed].filter(Boolean).length

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
        <div className="max-w-[768px] min-[1680px]:max-w-[1080px] w-full mx-auto">
          <SearchBar onSearchStateChange={setIsSearchActive} />
        </div>
      </div>

      {/* Gradient overlay below top bar */}
      <div
        className={`fixed left-0 right-0 z-[60] lg:left-16 transition-[left,right] duration-300 ${isQueueSidebarOpen ? 'sidebar-open-right-offset' : 'xl:right-0'}`}
        style={{
          top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 4.5rem - 2px)`,
          height: '24px',
          background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.8), transparent)'
        }}
      />

      <div className={isSearchActive ? 'hidden [@media((hover:hover)_and_(pointer:fine)_and_(min-width:1024px))]:block' : ''} style={{ paddingTop: `calc(env(safe-area-inset-top) + 4.5rem + 24px)` }}>
        <div className="w-full">
          {/* Always render components so they can load data via useEffect */}
          <div className="pb-4">
            <RecentlyAdded />
          </div>

          {/* Feed sections in responsive grid layout:
              - <768: stack (single column)
              - 768-1680 with all 3: Recently Played 2-col full width, Top10 + NewReleases below
              - >1680: 3 columns side by side
          */}
          {activeFeedSections > 0 && (
            <div className={`
              mt-4
              ${activeFeedSections >= 2 ? 'md:grid md:gap-4' : ''}
              ${activeFeedSections === 2 ? 'md:grid-cols-2' : ''}
              ${activeFeedSections >= 3 ? 'md:grid-cols-2 min-[1680px]:grid-cols-3' : ''}
            `}>
              {showRecentlyPlayed && (
                <div className={activeFeedSections === 3 ? 'md:col-span-2 min-[1680px]:col-span-1' : ''}>
                  <RecentlyPlayedSection twoColumns={activeFeedSections === 3} />
                </div>
              )}
              {showTop10 && (
                <div>
                  <Top10Section />
                </div>
              )}
              {showNewReleases && (
                <div>
                  <NewReleasesSection />
                </div>
              )}
            </div>
          )}

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
