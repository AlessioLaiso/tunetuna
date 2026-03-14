import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useCurrentTrack } from '../../hooks/useCurrentTrack'
import { useLastPlayedTrack } from '../../hooks/useLastPlayedTrack'
import { usePlayerStore } from '../../stores/playerStore'
import { jellyfinClient } from '../../api/jellyfin'
import type { LyricsResult } from '../../api/jellyfin'
import { logger } from '../../utils/logger'

function getActiveLineIndex(lines: LyricsResult['lines'], currentTime: number): number {
  // Find the last line whose start time is <= current playback time
  let active = -1
  for (let i = 0; i < lines.length; i++) {
    const start = lines[i].startSeconds
    if (start !== undefined && start <= currentTime) {
      active = i
    } else if (start !== undefined && start > currentTime) {
      break
    }
  }
  return active
}

export default function LyricsModal() {
  const currentTrack = useCurrentTrack()
  const lastPlayedTrack = useLastPlayedTrack()
  const { isQueueSidebarOpen, currentTime } = usePlayerStore()

  // Use lastPlayedTrack as fallback for display, matching PlayerModal behavior
  const displayTrack = currentTrack || lastPlayedTrack

  const [lyrics, setLyrics] = useState<LyricsResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const userScrollingRef = useRef(false)
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const fetchLyrics = async () => {
      if (!displayTrack) {
        setLyrics(null)
        return
      }

      setIsLoading(true)
      try {
        const result = await jellyfinClient.getLyrics(displayTrack.Id)
        setLyrics(result)
      } catch (error) {
        logger.error('Failed to fetch lyrics:', error)
        setLyrics(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchLyrics()
  }, [displayTrack?.Id])

  const activeLineIndex = useMemo(() => {
    if (!lyrics?.isSynced) return -1
    return getActiveLineIndex(lyrics.lines, currentTime)
  }, [lyrics, currentTime])

  // Pause auto-scroll when user manually scrolls
  const handleUserScroll = useCallback(() => {
    userScrollingRef.current = true
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current)
    }
    // Resume auto-scroll after 4 seconds of no manual scrolling
    userScrollTimeoutRef.current = setTimeout(() => {
      userScrollingRef.current = false
    }, 4000)
  }, [])

  // Attach wheel/touch listeners to detect manual scrolling
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const onWheel = () => handleUserScroll()
    const onTouchMove = () => handleUserScroll()

    container.addEventListener('wheel', onWheel, { passive: true })
    container.addEventListener('touchmove', onTouchMove, { passive: true })

    return () => {
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('touchmove', onTouchMove)
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current)
      }
    }
  }, [handleUserScroll])

  // Auto-scroll to active line
  useEffect(() => {
    if (!lyrics?.isSynced || activeLineIndex < 0 || userScrollingRef.current) return

    const lineEl = lineRefs.current.get(activeLineIndex)
    const container = scrollContainerRef.current
    if (!lineEl || !container) return

    const containerRect = container.getBoundingClientRect()
    const lineRect = lineEl.getBoundingClientRect()

    // Scroll so the active line is slightly above center
    const targetScrollTop =
      lineEl.offsetTop - container.offsetTop - containerRect.height * 0.45 + lineEl.offsetHeight / 2

    container.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth',
    })
  }, [activeLineIndex, lyrics?.isSynced])

  const setLineRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) {
      lineRefs.current.set(index, el)
    } else {
      lineRefs.current.delete(index)
    }
  }, [])

  // Click a synced line to seek to it
  const handleLineClick = useCallback((startSeconds: number | undefined) => {
    if (startSeconds === undefined) return
    const { audioElement } = usePlayerStore.getState()
    if (audioElement) {
      audioElement.currentTime = startSeconds
      usePlayerStore.getState().setCurrentTime(startSeconds)
    }
  }, [])

  if (!displayTrack) {
    return null
  }

  return (
    <div
      className={`fixed left-0 right-0 z-[55] flex flex-col transition-[right] duration-300 ease-out ${isQueueSidebarOpen ? 'lyrics-with-sidebar' : ''}`}
      style={{
        top: `calc(var(--header-offset, 0px) + env(safe-area-inset-top) + 4rem)`,
        bottom: `calc(11rem + env(safe-area-inset-bottom))`
      }}
    >
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 py-4 relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full px-6">
            <div className="text-white/50">Loading lyrics...</div>
          </div>
        ) : lyrics && lyrics.lines.length > 0 ? (
          <div className="max-w-[768px] lg:max-w-[864px] mx-auto pb-8 pl-8 pr-4">
            {lyrics.isSynced ? (
              <div className="text-center text-xl lg:text-3xl">
                {lyrics.lines.map((line, index) => {
                  const isActive = index === activeLineIndex
                  const isPast = activeLineIndex >= 0 && index < activeLineIndex
                  return (
                    <div
                      key={index}
                      ref={(el) => setLineRef(index, el)}
                      onClick={() => handleLineClick(line.startSeconds)}
                      className={`mb-6 leading-relaxed transition-colors duration-300 cursor-pointer ${
                        isActive
                          ? 'text-white'
                          : isPast
                            ? 'text-white/40'
                            : 'text-white/50'
                      }`}
                    >
                      {line.text || '\u00A0'}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-white text-center whitespace-pre-line text-xl lg:text-3xl">
                {lyrics.lines.map((line, index) => (
                  <div key={index} className="mb-1 leading-relaxed">
                    {line.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full px-6">
            <div className="text-white/50 text-center">This song has no lyrics</div>
          </div>
        )}
      </div>

      {/* Bottom divider */}
      <div className="h-px bg-white/20 flex-shrink-0" />
    </div>
  )
}
