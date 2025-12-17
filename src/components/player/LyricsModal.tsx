import { useEffect, useState } from 'react'
import { usePlayerStore, useCurrentTrack, useLastPlayedTrack } from '../../stores/playerStore'
import { jellyfinClient } from '../../api/jellyfin'

interface LyricsModalProps {
  onClose: () => void
}

export default function LyricsModal({ onClose }: LyricsModalProps) {
  const currentTrack = useCurrentTrack()
  const lastPlayedTrack = useLastPlayedTrack()

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
  }, [displayTrack])

  if (!displayTrack) {
    return null
  }

  return (
    <div 
      className="fixed left-0 right-0 bg-zinc-900 z-[55] flex flex-col"
      style={{ 
        top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 4rem)`,
        bottom: `calc(11rem + env(safe-area-inset-bottom))`
      }}
    >
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 relative">
        {/* Top gradient fade - fixed at top of scrollable viewport */}
        <div className="sticky left-0 right-0 h-16 bg-gradient-to-b from-zinc-900 via-zinc-900/50 to-transparent pointer-events-none z-10 -mx-6" style={{ top: '-24px' }} />
        
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">Loading lyrics...</div>
          </div>
        ) : lyrics ? (
          <div className="max-w-[768px] mx-auto pb-8">
            <div className="text-white text-left whitespace-pre-line leading-relaxed">
              {lyrics.split('\n').map((line, index) => (
                <div key={index} className="mb-2">
                  {line}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400 text-center">This song has no lyrics</div>
          </div>
        )}
        
        {/* Bottom gradient fade - fixed at bottom of scrollable viewport */}
        <div className="sticky left-0 right-0 h-16 bg-gradient-to-t from-zinc-900 via-zinc-900/50 to-transparent pointer-events-none z-10 -mx-6" style={{ bottom: '-16px' }} />
      </div>
    </div>
  )
}

