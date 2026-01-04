import { useEffect, useState } from 'react'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import { useLastPlayedTrack } from '../../hooks/useLastPlayedTrack'
import { usePlayerStore } from '../../stores/playerStore'
import { jellyfinClient } from '../../api/jellyfin' // Used for getLyrics

export default function LyricsModal() {
  const currentTrack = useCurrentTrack()
  const lastPlayedTrack = useLastPlayedTrack()
  const { isQueueSidebarOpen } = usePlayerStore()

  // Use lastPlayedTrack as fallback for display, matching PlayerModal behavior
  const displayTrack = currentTrack || lastPlayedTrack

  const [lyrics, setLyrics] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const fetchLyrics = async () => {
      if (!displayTrack) {
        setLyrics(null)
        return
      }

      setIsLoading(true)
      try {
        const lyricsText = await jellyfinClient.getLyrics(displayTrack.Id)
        setLyrics(lyricsText)
      } catch (error) {
        console.error('Failed to fetch lyrics:', error)
        setLyrics(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchLyrics()
  }, [displayTrack?.Id])

  if (!displayTrack) {
    return null
  }

  return (
    <div
      className={`fixed left-0 right-0 z-[55] flex flex-col ${isQueueSidebarOpen ? 'lyrics-with-sidebar' : ''}`}
      style={{
        top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 4rem)`,
        bottom: `calc(11rem + env(safe-area-inset-bottom))`
      }}
    >
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-white/50">Loading lyrics...</div>
          </div>
        ) : lyrics ? (
          <div className="max-w-[768px] mx-auto pb-8">
            <div className="text-white text-left whitespace-pre-line leading-relaxed text-base lg:text-xl">
              {lyrics.split('\n').map((line, index) => (
                <div key={index} className="mb-2">
                  {line}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-white/50 text-center">This song has no lyrics</div>
          </div>
        )}
      </div>

      {/* Bottom divider */}
      <div className="h-px bg-white/20 flex-shrink-0" />
    </div>
  )
}

