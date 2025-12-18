import { useRef, useState, useEffect } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { jellyfinClient } from '../../api/jellyfin'
import Image from '../shared/Image'
import Spinner from '../shared/Spinner'
import VolumeControl from '../layout/VolumeControl'
import { Shuffle, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1, GripHorizontal } from 'lucide-react'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'
import type { BaseItemDto } from '../../api/types'

const INITIAL_VISIBLE_SONGS = 45
const VISIBLE_SONGS_INCREMENT = 45

interface QueueTrackItemProps {
  track: BaseItemDto
  index: number
  isCurrent: boolean
  isPlaying: boolean
  showRemoveButton?: boolean
  onClick: () => void
  onRemove?: () => void
  onReorderDragStart: (e: React.DragEvent, index: number) => void
  onReorderDrop: (e: React.DragEvent, index: number) => void
  onContextMenu: (track: BaseItemDto) => void
  isDragOver?: boolean
  onDragEnterRow: (index: number) => void
}

function QueueTrackItem({
  track,
  index,
  isCurrent,
  isPlaying,
  showRemoveButton = true,
  onClick,
  onRemove,
  onReorderDragStart,
  onReorderDrop,
  onContextMenu,
  isDragOver,
  onDragEnterRow,
}: QueueTrackItemProps) {
  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault()
      onContextMenu(track)
    },
  })

  return (
    <div
      draggable={!isCurrent}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDragEnter={(e) => {
        e.preventDefault()
        if (!isCurrent) {
          onDragEnterRow(index)
        }
      }}
      onDrop={(e) => !isCurrent && onReorderDrop(e, index)}
      className={`queue-row flex items-center gap-3 p-3 ${
        !isCurrent ? 'hover:bg-zinc-900 cursor-pointer' : 'cursor-pointer'
      } ${isCurrent ? 'bg-zinc-900' : ''} relative`}
      onClick={isCurrent ? undefined : onClick}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(track)
      }}
    >
      {isDragOver && !isCurrent && (
        <div className="absolute left-3 right-3 top-0 h-0.5 bg-[var(--accent-color)] rounded-full pointer-events-none" />
      )}
      <div className="queue-drag-art w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 ml-1">
        <Image
          src={jellyfinClient.getAlbumArtUrl(track.AlbumId || track.Id, 96)}
          alt={track.Name}
          className="w-full h-full object-cover"
          showOutline={true}
          rounded="rounded-sm"
        />
      </div>
      <div className="flex-1 min-w-0" {...longPressHandlers}>
        <div
          className={`text-sm font-medium truncate ${
            isCurrent ? 'text-[var(--accent-color)]' : 'text-white'
          }`}
        >
          {track.Name}
        </div>
        <div className="text-xs text-gray-400 truncate">
          {track.AlbumArtist || track.ArtistItems?.[0]?.Name || 'Unknown Artist'}
        </div>
      </div>

      {isCurrent ? (
        // For the Now Playing row, show play/pause icon on the right
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
          className="text-gray-400 hover:text-zinc-300 transition-colors p-2"
        >
          {isPlaying ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5" />
          )}
        </button>
      ) : (
        <>
          {showRemoveButton && (
            <>
              <button
                draggable
                onDragStart={(e) => onReorderDragStart(e, index)}
                className="text-gray-500 hover:text-zinc-300 transition-colors p-2 cursor-grab active:cursor-grabbing"
              >
                <GripHorizontal className="w-4 h-4" />
              </button>
              {onRemove && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove()
                  }}
                  className="text-gray-400 hover:text-zinc-300 transition-colors p-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

interface QueueViewProps {
  onClose: () => void
  /**
   * Optional callback invoked when a navigation action is triggered
   * from the queue's context menu (e.g. go to album/artist/genre).
   *
   * Used by the player modal to close itself when navigating away.
   */
  onNavigateFromContextMenu?: () => void
}

export default function QueueView({ onClose, onNavigateFromContextMenu }: QueueViewProps) {
  const controlsRef = useRef<HTMLDivElement>(null)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [visibleSongsCount, setVisibleSongsCount] = useState(INITIAL_VISIBLE_SONGS)
  const [showPrevious, setShowPrevious] = useState(false)
  const [showVolumePopover, setShowVolumePopover] = useState(false)
  const [volumePopoverPosition, setVolumePopoverPosition] = useState<{ top: number; left: number } | null>(null)
  const [volumeButtonElement, setVolumeButtonElement] = useState<HTMLElement | null>(null)
  const {
    songs,
    currentIndex,
    clearQueue,
    isPlaying,
    shuffle,
    repeat,
    togglePlayPause,
    toggleShuffle,
    toggleRepeat,
    next,
    previous,
    skipToTrack,
    removeFromQueue,
    reorderQueue,
    isFetchingRecommendations,
    isLoadingMoreSongs,
    shuffleHasMoreSongs,
  } = usePlayerStore()


  const { showQueueRecommendations, setShowQueueRecommendations, recommendationsQuality } = useSettingsStore()

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
    setDraggingIndex(index)

    // Use the album art (or the whole row as fallback) as the drag preview so it
    // looks like you're dragging the song, not just the small drag icon.
    const gripEl = e.currentTarget as HTMLElement | null
    const rowEl = gripEl?.closest('.queue-row') as HTMLElement | null
    if (rowEl && e.dataTransfer.setDragImage) {
      const artEl = rowEl.querySelector<HTMLElement>('.queue-drag-art')
      const dragEl = artEl ?? rowEl
      const rect = dragEl.getBoundingClientRect()
      e.dataTransfer.setDragImage(dragEl, rect.width / 2, rect.height / 2)
    }
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    const data =
      e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/html')
    const dragIndex = parseInt(data, 10)
    if (Number.isNaN(dragIndex)) {
      return
    }
    // Prevent dropping across user-added / recommendation boundary
    const fromIdx = draggingIndex ?? dragIndex
    const fromTrack = songs[fromIdx]
    const toTrack = songs[dropIndex]
    if (fromTrack && toTrack && fromTrack.source !== toTrack.source) {
      setDragOverIndex(null)
      setDraggingIndex(null)
      return
    }

    if (dragIndex !== dropIndex) {
      reorderQueue(dragIndex, dropIndex)
    }
    setDragOverIndex(null)
    setDraggingIndex(null)
  }

  // Get current track
  const currentTrack = currentIndex >= 0 ? songs[currentIndex] : null

  // Split queue into 4 sections
  const previouslyPlayed = songs.filter((song, index) => index < currentIndex)
  const comingUp = songs.filter((song, index) => song.source === 'user' && index > currentIndex)
  const upcomingRecommendations = songs.filter((song, index) => song.source === 'recommendation' && index > currentIndex)

  // Apply lazy loading limits - calculate total visible songs needed
  let remainingVisible = visibleSongsCount
  const visiblePreviouslyPlayed = previouslyPlayed.slice(-Math.min(remainingVisible, previouslyPlayed.length))
  remainingVisible -= visiblePreviouslyPlayed.length
  remainingVisible -= currentTrack ? 1 : 0 // Account for current track

  const visibleComingUp = comingUp.slice(0, Math.max(0, remainingVisible))
  remainingVisible -= visibleComingUp.length

  const visibleUpcomingRecommendations = upcomingRecommendations.slice(0, Math.max(0, remainingVisible))
  

  const handleClear = () => {
    // Clear everything including now playing song
    const { clearQueue } = usePlayerStore.getState()
    clearQueue()
  }

  // Check if there are songs after/before current
  const hasNext = currentIndex >= 0 && currentIndex < songs.length - 1
  const hasPrevious = currentIndex > 0

  // Check if queue is effectively empty
  const isQueueEmpty = songs.length === 0 || (visibleComingUp.length === 0 && visibleUpcomingRecommendations.length === 0)
  const handleItemContextMenu = (track: BaseItemDto) => {
    setContextMenuItem(track)
    setContextMenuOpen(true)
  }

  const handleDragEnterRow = (index: number) => {
    // Only show drop indicator when dragging within the same section
    if (draggingIndex == null) return
    const fromTrack = songs[draggingIndex]
    const toTrack = songs[index]
    if (!fromTrack || !toTrack) return
    if (fromTrack.source !== toTrack.source) {
      setDragOverIndex(null)
      return
    }
    setDragOverIndex(index)
  }

  // Handle volume popover opening
  const handleOpenVolumePopover = () => {
    if (volumeButtonElement) {
      const rect = volumeButtonElement.getBoundingClientRect()
      setVolumePopoverPosition({
        top: rect.top,
        left: rect.left + rect.width / 2
      })
      setShowVolumePopover(true)
    }
  }

  // Incrementally reveal more songs as the user scrolls near the bottom
  useEffect(() => {
    const container = document.querySelector('.queue-container')
    if (!container) return

    const handleScroll = () => {
      const scrollTop = container.scrollTop
      const viewportHeight = container.clientHeight
      const fullHeight = container.scrollHeight

      // When the user is within ~2.5 viewports of the bottom, load more rows
      if (scrollTop + viewportHeight * 2.5 >= fullHeight) {
        setVisibleSongsCount((prev) =>
          Math.min(prev + VISIBLE_SONGS_INCREMENT, songs.length)
        )
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [songs.length])

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full" style={{ paddingBottom: `env(safe-area-inset-bottom)` }}>
      <div className="flex-1 overflow-y-auto min-h-0 queue-container w-full" style={{ paddingBottom: '8rem' }}>
        <div className="max-w-[864px] mx-auto w-full">
        {songs.length === 0 && !currentTrack ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p>Queue is empty</p>
          </div>
        ) : (
          <div>
            {/* Previously Played Section */}
            {visiblePreviouslyPlayed.length > 0 && showPrevious && (
              <div>
                <div className="px-4 pb-0 pt-7 flex items-center justify-between">
                  <div className="text-base font-bold text-white tracking-wider">
                    Previous
                  </div>
                  <button
                    onClick={() => setShowPrevious(false)}
                    className="text-xs font-semibold text-gray-300 hover:opacity-80 transition-opacity tracking-wider"
                  >
                    Hide
                  </button>
                </div>
                {visiblePreviouslyPlayed.map((track, mapIndex) => {
                  const index = songs.indexOf(track)
                  return (
                    <QueueTrackItem
                      key={`${track.Id}-${mapIndex}`}
                      track={track}
                      index={index}
                      isCurrent={false}
                      isPlaying={false}
                      showRemoveButton={false}
                      onClick={() => skipToTrack(index)}
                      onReorderDragStart={handleDragStart}
                      onReorderDrop={handleDrop}
                      onContextMenu={handleItemContextMenu}
                      isDragOver={false}
                      onDragEnterRow={handleDragEnterRow}
                    />
                  )
                })}
              </div>
            )}

            {/* Now Playing Section - Always show if currentTrack exists */}
            {currentTrack && (
              <div>
                <div className="px-4 pb-0 pt-7 flex items-center justify-between">
                  <div className="text-base font-bold text-white tracking-wider">
                    Now Playing
                  </div>
                  {visiblePreviouslyPlayed.length > 0 && !showPrevious && (
                    <button
                      onClick={() => setShowPrevious(true)}
                      className="text-xs font-semibold text-gray-300 hover:opacity-80 transition-opacity tracking-wider"
                    >
                      Show Previous
                    </button>
                  )}
                </div>
                <QueueTrackItem
                  track={currentTrack}
                  index={currentIndex}
                  isCurrent={true}
                  isPlaying={isPlaying}
                  showRemoveButton={false}
                  onClick={togglePlayPause}
                  onReorderDragStart={handleDragStart}
                  onReorderDrop={handleDrop}
                  onContextMenu={handleItemContextMenu}
                  isDragOver={false}
                  onDragEnterRow={handleDragEnterRow}
                />
              </div>
            )}

            {/* Coming Up Section */}
            {visibleComingUp.length > 0 && (
              <div>
                <div className="px-4 pb-0 pt-7 flex items-center justify-between">
                  <div className="text-base font-bold text-white tracking-wider">
                    Coming Up
                  </div>
                  <button
                    onClick={() => {
                      // Clear only coming up songs (user-added songs after current)
                      const songsToKeep = songs.filter((song, index) =>
                        index <= currentIndex || song.source === 'recommendation'
                      )
                      // Rebuild the queue
                      const newSongs = songsToKeep
                      const newCurrentIndex = Math.min(currentIndex, newSongs.length - 1)

                      // Update player store
                      usePlayerStore.setState({
                        songs: newSongs,
                        currentIndex: newCurrentIndex,
                        standardOrder: newSongs.filter(s => s.source === 'user').map(s => s.Id),
                        shuffleOrder: newSongs.filter(s => s.source === 'user').map(s => s.Id),
                      })
                    }}
                    className="text-xs font-semibold text-gray-300 hover:opacity-80 transition-opacity tracking-wider"
                  >
                    Clear
                  </button>
                </div>
                {visibleComingUp.map((track, mapIndex) => {
                  const index = songs.indexOf(track)
                  return (
                    <QueueTrackItem
                      key={`${track.Id}-${mapIndex}`}
                      track={track}
                      index={index}
                      isCurrent={false}
                      isPlaying={false}
                      showRemoveButton={true}
                      onClick={() => skipToTrack(index)}
                      onRemove={() => removeFromQueue(index)}
                      onReorderDragStart={handleDragStart}
                      onReorderDrop={handleDrop}
                      onContextMenu={handleItemContextMenu}
                      isDragOver={dragOverIndex === index}
                      onDragEnterRow={handleDragEnterRow}
                    />
                  )
                })}
                {isLoadingMoreSongs && (
                  <div className="flex items-center justify-center py-4">
                    <Spinner size="sm" />
                    <span className="ml-2 text-sm text-gray-400">Loading more songs...</span>
                  </div>
                )}
              </div>
            )}

            {/* Recommendations Section */}
            <div>
              <div className="px-4 pb-0 pt-7 flex items-center justify-between">
                <div className="text-base font-bold text-white tracking-wider flex items-baseline gap-2">
                  Recommendations
                  {isFetchingRecommendations && (
                    <span className="text-xs text-gray-400 font-normal">
                      Syncing genres...
                    </span>
                  )}
                  {!isFetchingRecommendations && recommendationsQuality === 'failed' && (
                    <span className="text-xs text-red-400 font-normal">
                      (Unable to generate)
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    const newValue = !showQueueRecommendations
                    setShowQueueRecommendations(newValue)
                    if (!newValue) {
                      // Clear all recommendations from queue when toggled off
                      const songsWithoutRecommendations = songs.filter(song => song.source !== 'recommendation')
                      const newCurrentIndex = Math.min(currentIndex, songsWithoutRecommendations.length - 1)
                      usePlayerStore.setState({
                        songs: songsWithoutRecommendations,
                        currentIndex: newCurrentIndex,
                        standardOrder: songsWithoutRecommendations.filter(s => s.source === 'user').map(s => s.Id),
                        shuffleOrder: songsWithoutRecommendations.filter(s => s.source === 'user').map(s => s.Id),
                      })
                    }
                  }}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    showQueueRecommendations ? 'bg-[var(--accent-color)]' : 'bg-zinc-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      showQueueRecommendations ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              {showQueueRecommendations && (
                <>
                  {visibleUpcomingRecommendations.map((track, mapIndex) => {
                    const index = songs.indexOf(track)
                    return (
                      <QueueTrackItem
                        key={`${track.Id}-${mapIndex}`}
                        track={track}
                        index={index}
                        isCurrent={false}
                        isPlaying={false}
                        showRemoveButton={true}
                        onClick={() => skipToTrack(index)}
                        onRemove={() => removeFromQueue(index)}
                        onReorderDragStart={handleDragStart}
                        onReorderDrop={handleDrop}
                        onContextMenu={handleItemContextMenu}
                        isDragOver={dragOverIndex === index}
                        onDragEnterRow={handleDragEnterRow}
                      />
                    )
                  })}
                  {isFetchingRecommendations && (
                    <div className="px-4 pt-4 pb-6 flex justify-center">
                      <Spinner />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <ContextMenu
        item={contextMenuItem}
        itemType={contextMenuItem ? 'song' : null}
        isOpen={contextMenuOpen}
        onClose={() => {
          setContextMenuOpen(false)
          setContextMenuItem(null)
        }}
        onNavigate={onNavigateFromContextMenu}
      />
      </div>
      <div ref={controlsRef} className="px-6 pt-2 space-y-6 flex-shrink-0 max-w-[864px] mx-auto w-full" style={{ paddingBottom: `1.5rem` }}>
        <div className="flex items-center justify-center gap-8 relative">
          <button
            onClick={toggleShuffle}
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
              shuffle ? 'text-[var(--accent-color)]' : 'text-gray-400 hover:text-zinc-300'
            }`}
          >
            <Shuffle className="w-6 h-6" />
          </button>

          <button
            onClick={previous}
            disabled={!hasPrevious}
            className={`w-12 h-12 flex-shrink-0 aspect-square flex items-center justify-center rounded-full transition-colors ${
              hasPrevious
                ? 'text-white hover:bg-zinc-800 active:bg-zinc-800'
                : 'text-zinc-600 cursor-not-allowed'
            }`}
          >
            <SkipBack className="w-8 h-8" />
          </button>

          <button
            onClick={togglePlayPause}
            className="w-16 h-16 flex items-center justify-center rounded-full transition-colors aspect-square bg-[var(--accent-color)] text-white hover:opacity-90"
          >
            {isPlaying ? (
              <Pause className="w-8 h-8" />
            ) : (
              <Play className="w-8 h-8" />
            )}
          </button>

          <button
            onClick={next}
            disabled={!hasNext}
            className={`w-12 h-12 flex-shrink-0 aspect-square flex items-center justify-center rounded-full transition-colors ${
              hasNext
                ? 'text-white hover:bg-zinc-800 active:bg-zinc-800'
                : 'text-zinc-600 cursor-not-allowed'
            }`}
          >
            <SkipForward className="w-8 h-8" />
          </button>

          <button
            onClick={toggleRepeat}
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
              repeat !== 'off' ? 'text-[var(--accent-color)]' : 'text-gray-400 hover:text-zinc-300'
            }`}
          >
            {repeat === 'one' ? (
              <Repeat1 className="w-6 h-6" />
            ) : (
              <Repeat className="w-6 h-6" />
            )}
          </button>

          {/* Volume control on 768px+, horizontal variant on the right */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 hidden md:flex md:-mr-6">
            <VolumeControl variant="horizontal" />
          </div>
        </div>
      </div>
      {showVolumePopover && volumePopoverPosition && (
        <VolumeControl
          variant="vertical"
          onClose={() => setShowVolumePopover(false)}
          popoverPosition={volumePopoverPosition}
        />
      )}
    </div>
  )
}

