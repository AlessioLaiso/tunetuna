import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { FileHeadphone, Globe } from 'lucide-react'
import { useLocalCurrentTrack } from '../../hooks/useCurrentTrack'
import { remoteControls, remotePosition, useRemoteStore } from '../../remote/remoteStore'
import { useLastPlayedTrack } from '../../hooks/useLastPlayedTrack'
import { usePlayerStore } from '../../stores/playerStore'
import { useShallow } from 'zustand/react/shallow'
import { useSettingsStore } from '../../stores/settingsStore'
import { jellyfinClient } from '../../api/jellyfin'
import { getLrclibLyrics } from '../../api/lrclib'
import type { LyricsLine, LyricsResult } from '../../api/jellyfin'
import { logger } from '../../utils/logger'
import { SkeletonTextLines } from '../shared/Skeleton'

// Highlight the next line slightly before its timestamp so it feels in sync with the vocals
const LINE_LEAD_SECONDS = 0.5
const SCROLL_DURATION_MS = 600
// Without an end time, the last word of a line fills over this long
const LAST_WORD_FALLBACK_SECONDS = 0.6
export const LYRICS_SOURCE_SLOT_ID = 'lyrics-source-slot'

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

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

/** Playback time of the device being controlled, estimated from its last update. */
function controlledDeviceTime(): number {
  const remote = useRemoteStore.getState().remote
  return remote ? remotePosition(remote) : 0
}

// Smooth playback time for word highlighting: the store's time only updates a few times per
// second, so read the audio element every frame while a word-synced line is playing. While
// controlling another device, its estimated position is used instead.
function useFrameTime(enabled: boolean, fallback: number, isRemote: boolean): number {
  const [time, setTime] = useState(fallback)
  useEffect(() => {
    if (!enabled) return
    let frame = requestAnimationFrame(function tick() {
      if (isRemote) {
        setTime(controlledDeviceTime())
      } else {
        const audio = usePlayerStore.getState().audioElement
        if (audio) setTime(audio.currentTime)
      }
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [enabled, isRemote])
  return enabled ? time : fallback
}

// The controlled device's position, refreshed often enough for line changes to land on time
// (its usual estimate only ticks every 500ms)
const REMOTE_LINE_TICK_MS = 100
function useControlledDeviceTime(enabled: boolean): number {
  const [time, setTime] = useState(controlledDeviceTime)
  useEffect(() => {
    if (!enabled) return
    setTime(controlledDeviceTime())
    const interval = setInterval(() => setTime(controlledDeviceTime()), REMOTE_LINE_TICK_MS)
    return () => clearInterval(interval)
  }, [enabled])
  // Paused or between updates: follow state changes (seeks, track changes) right away
  const remote = useRemoteStore(s => s.remote)
  return enabled ? time : remote ? remotePosition(remote) : 0
}

function WordSyncedLine({ line, time }: { line: LyricsLine; time: number }) {
  const words = line.words!
  return (
    <>
      {words.map((word, i) => {
        const end = words[i + 1]?.startSeconds
          ?? Math.max(line.endSeconds ?? 0, word.startSeconds + LAST_WORD_FALLBACK_SECONDS)
        const progress = Math.min(1, Math.max(0, (time - word.startSeconds) / Math.max(0.01, end - word.startSeconds)))
        const pct = progress * 100
        return (
          <span
            key={i}
            style={{
              backgroundImage: `linear-gradient(90deg, rgb(var(--c-fg)) ${pct}%, rgb(var(--c-fg) / 0.5) ${pct}%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {word.text}
          </span>
        )
      })}
    </>
  )
}

export default function LyricsModal() {
  const currentTrack = useLocalCurrentTrack()
  const lastPlayedTrack = useLastPlayedTrack()
  const { isQueueSidebarOpen, currentTime: localTime, isPlaying: localPlaying } = usePlayerStore(useShallow(s => ({ isQueueSidebarOpen: s.isQueueSidebarOpen, currentTime: s.currentTime, isPlaying: s.isPlaying })))

  // While controlling another device, follow what plays there
  const isRemote = useRemoteStore(s => s.targetSessionId !== null)
  const remoteTrack = useRemoteStore(s => {
    const remote = s.remote
    return remote && remote.currentIndex >= 0 ? remote.songs[remote.currentIndex] ?? null : null
  })
  const remotePlaying = useRemoteStore(s => s.remote?.isPlaying ?? false)
  const isPlaying = isRemote ? remotePlaying : localPlaying
  const remoteTime = useControlledDeviceTime(isRemote && remotePlaying)
  const currentTime = isRemote ? remoteTime : localTime

  // Use lastPlayedTrack as fallback for display, matching PlayerModal behavior
  const displayTrack = isRemote ? remoteTrack : currentTrack || lastPlayedTrack

  const [fileLyrics, setFileLyrics] = useState<LyricsResult | null>(null)
  const [webLyrics, setWebLyrics] = useState<LyricsResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const preferredSource = useSettingsStore(s => s.lyricsSource)
  const setPreferredSource = useSettingsStore(s => s.setLyricsSource)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const userScrollingRef = useRef(false)
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const scrollAnimationRef = useRef<number | null>(null)
  // Lyrics already placed at the active line; new lyrics jump there instead of animating from the top
  const positionedLyricsRef = useRef<LyricsResult | null>(null)

  const displayTrackId = displayTrack?.Id
  const displayTrackRef = useRef(displayTrack)
  displayTrackRef.current = displayTrack
  useEffect(() => {
    setFileLyrics(null)
    setWebLyrics(null)
    const track = displayTrackRef.current
    if (!displayTrackId || !track) {
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)
    const filePromise = jellyfinClient.getLyrics(displayTrackId).catch(error => {
      logger.error('Failed to fetch lyrics:', error)
      return null
    })
    const webPromise = getLrclibLyrics(track)

    filePromise.then(async result => {
      if (cancelled) return
      setFileLyrics(result)
      // Without lyrics in the file, keep loading until the web lookup settles
      if (!result || result.lines.length === 0) {
        await webPromise
        if (cancelled) return
      }
      setIsLoading(false)
    })
    webPromise.then(result => {
      if (!cancelled) setWebLyrics(result && result.lines.length > 0 ? result : null)
    })

    return () => {
      cancelled = true
    }
  }, [displayTrackId])

  const hasFileLyrics = !!fileLyrics && fileLyrics.lines.length > 0
  const showSourceToggle = hasFileLyrics && !!webLyrics
  // The remembered choice applies when both exist; otherwise show whichever there is
  const source = showSourceToggle ? preferredSource : hasFileLyrics ? 'file' : 'web'
  const lyrics = source === 'web' ? webLyrics : fileLyrics

  const activeLineIndex = useMemo(() => {
    if (!lyrics?.isSynced) return -1
    return getActiveLineIndex(lyrics.lines, currentTime + LINE_LEAD_SECONDS)
  }, [lyrics, currentTime])

  const activeLine = activeLineIndex >= 0 ? lyrics?.lines[activeLineIndex] : undefined
  const wordTime = useFrameTime(!!activeLine?.words && isPlaying, currentTime, isRemote)

  const cancelScrollAnimation = useCallback(() => {
    if (scrollAnimationRef.current !== null) {
      cancelAnimationFrame(scrollAnimationRef.current)
      scrollAnimationRef.current = null
    }
  }, [])

  const animateScrollTo = useCallback((container: HTMLDivElement, target: number) => {
    cancelScrollAnimation()
    const maxScroll = container.scrollHeight - container.clientHeight
    const end = Math.max(0, Math.min(target, maxScroll))
    const start = container.scrollTop
    const distance = end - start
    if (Math.abs(distance) < 1) return

    const startTime = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - startTime) / SCROLL_DURATION_MS)
      container.scrollTop = start + distance * easeInOutCubic(progress)
      if (progress < 1) {
        scrollAnimationRef.current = requestAnimationFrame(step)
      } else {
        scrollAnimationRef.current = null
      }
    }
    scrollAnimationRef.current = requestAnimationFrame(step)
  }, [cancelScrollAnimation])

  useEffect(() => cancelScrollAnimation, [cancelScrollAnimation])

  // Pause auto-scroll when user manually scrolls
  const handleUserScroll = useCallback(() => {
    cancelScrollAnimation()
    userScrollingRef.current = true
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current)
    }
    // Resume auto-scroll after 4 seconds of no manual scrolling
    userScrollTimeoutRef.current = setTimeout(() => {
      userScrollingRef.current = false
    }, 4000)
  }, [cancelScrollAnimation])

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

  // Auto-scroll to active line. Layout effect so freshly shown lyrics are positioned before paint.
  useLayoutEffect(() => {
    if (!lyrics?.isSynced || isLoading) return
    const container = scrollContainerRef.current
    if (!container) return

    const isInitial = positionedLyricsRef.current !== lyrics
    if (activeLineIndex < 0) {
      positionedLyricsRef.current = lyrics
      return
    }
    if (!isInitial && userScrollingRef.current) return

    const lineEl = lineRefs.current.get(activeLineIndex)
    if (!lineEl) return

    const containerRect = container.getBoundingClientRect()

    // Scroll so the active line is slightly above center
    const targetScrollTop =
      lineEl.offsetTop - container.offsetTop - containerRect.height * 0.45 + lineEl.offsetHeight / 2

    if (isInitial) {
      cancelScrollAnimation()
      container.scrollTop = targetScrollTop
      positionedLyricsRef.current = lyrics
    } else {
      animateScrollTo(container, targetScrollTop)
    }
  }, [activeLineIndex, lyrics, isLoading, animateScrollTo, cancelScrollAnimation])

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
    if (useRemoteStore.getState().targetSessionId) {
      remoteControls.seek(startSeconds)
      return
    }
    const { audioElement } = usePlayerStore.getState()
    if (audioElement) {
      audioElement.currentTime = startSeconds
      usePlayerStore.getState().setCurrentTime(startSeconds)
    }
  }, [])

  // PlayerModal renders this slot in its top bar, left of the lyrics/album art button
  const [controlsSlot, setControlsSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setControlsSlot(document.getElementById(LYRICS_SOURCE_SLOT_ID))
  }, [])

  if (!displayTrack) {
    return null
  }

  const sourceToggle = (
    <div className="flex rounded-full bg-white/10 p-0.5" role="radiogroup" aria-label="Lyrics source">
      {([
        { value: 'file', label: 'Lyrics from file', Icon: FileHeadphone },
        { value: 'web', label: 'Lyrics from LRCLIB', Icon: Globe },
      ] as const).map(({ value, label, Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={source === value}
          aria-label={label}
          title={label}
          onClick={() => setPreferredSource(value)}
          className={`p-1.5 rounded-full transition-colors ${
            source === value ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80'
          }`}
        >
          <Icon className="w-5 h-5" />
        </button>
      ))}
    </div>
  )

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
          <div className="max-w-[768px] lg:max-w-[864px] mx-auto px-6 pt-8">
            <SkeletonTextLines count={10} centered />
          </div>
        ) : lyrics && lyrics.lines.length > 0 ? (
          <div className="max-w-[768px] lg:max-w-[864px] mx-auto pl-8 pr-4 pb-8">
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
                      {isActive && line.words
                        ? <WordSyncedLine line={line} time={wordTime} />
                        : line.text || '\u00A0'}
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

      {showSourceToggle && controlsSlot && createPortal(sourceToggle, controlsSlot)}

      {/* Bottom divider */}
      <div className="h-px bg-white/20 flex-shrink-0" />
    </div>
  )
}
