import { useRef, useState } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { jellyfinClient } from '../../api/jellyfin'
import Image from '../shared/Image'
import Spinner from '../shared/Spinner'
import { Shuffle, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1, GripHorizontal } from 'lucide-react'
import ContextMenu from '../shared/ContextMenu'
import { useLongPress } from '../../hooks/useLongPress'
import type { BaseItemDto } from '../../api/types'

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
      key={`${track.Id}-${index}`}
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
  const { 
    queue, 
    previousSongs,
    playedSongIds,
    currentIndex,
    currentTrack,
    playTrack, 
    removeFromQueue, 
    reorderQueue, 
    setQueue,
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
    isFetchingRecommendations,
  } = usePlayerStore()

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
    const fromTrack = queue[fromIdx]
    const toTrack = queue[dropIndex]
    const fromIsRec = fromTrack ? !!(fromTrack as any)._isRecommended : false
    const toIsRec = toTrack ? !!(toTrack as any)._isRecommended : false
    if (fromTrack && toTrack && fromIsRec !== toIsRec) {
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

  // Organize queue into sections
  // Always use currentTrack from store - it persists even when queue is cleared
  const nowPlayingTrack = currentTrack || (currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null)

  // Derive an effective index based on the actual nowPlayingTrack in the queue,
  // so controls work correctly after restore or other flows where currentIndex
  // might be out of sync with the playing track.
  const effectiveIndex =
    currentIndex >= 0 && currentIndex < queue.length
      ? currentIndex
      : nowPlayingTrack
        ? queue.findIndex(t => t.Id === nowPlayingTrack.Id)
        : -1

  // Track which songs have been played (from playedSongIds array)
  const playedSongIdsSet = new Set(playedSongIds)
  const currentTrackId = nowPlayingTrack?.Id
  
  // Filter out played songs from "Added By You" section
  // When shuffle is on, we track played songs in playedSongIds
  // When shuffle is off, songs are removed from queue as they play, but we still check playedSongIds
  // in case shuffle was just disabled (playedSongIds will be cleared after first next() in non-shuffle mode)
  const addedByYou = queue.filter((track, index) => {
    const isRecommended = (track as any)._isRecommended
    const isNotRecommended = !isRecommended
    // Exclude current track by both index and ID (more robust)
    const isNotCurrent = index !== currentIndex && track.Id !== currentTrackId
    // Exclude played songs (either from playedSongIds or if shuffle was just disabled)
    const isNotPlayed = !playedSongIdsSet.has(track.Id) || track.Id === currentTrackId
    const shouldInclude = isNotRecommended && isNotCurrent && isNotPlayed
    return shouldInclude
  })
  // Respect the actual queue order for "Added By You" tracks.
  // The store already maintains the correct shuffled/unshuffled order in `queue`,
  // so we avoid any further sorting here to ensure manual reordering is visible.
  const sortedAddedByYou = addedByYou
  
  // Recommendations: derive from the queue itself, not the separate `recommendations` array,
  // so that manual reordering is reflected visually.
  // Only show recommendations that are after the effective index and not yet played.
  const sortedRecommendations = queue.filter((track, index) => {
    const isRecommended = (track as any)._isRecommended
    if (!isRecommended) {
      if (track.Id === currentTrackId) return false // Skip current track regardless
      return false
    }
    if (track.Id === currentTrackId) return false
    const isAfterCurrent = effectiveIndex === -1 ? true : index > effectiveIndex
    const isNotPlayed = !playedSongIdsSet.has(track.Id)
    return isAfterCurrent && isNotPlayed
  })
  const hasRecommendations = sortedRecommendations.length > 0
  

  const handleClear = () => {
    // Clear everything including now playing song
    const { clearQueue } = usePlayerStore.getState()
    clearQueue()
  }

  // Check if there are songs after/before current
  const hasNext = effectiveIndex >= 0 && effectiveIndex < queue.length - 1

  // Previous should be active if:
  // 1. There are songs before the effective index in the queue, OR
  // 2. There are previousSongs in history (for going back to previously played songs)
  const hasPrevious =
    (effectiveIndex > 0 && effectiveIndex < queue.length) ||
    previousSongs.length > 0

  // Check if queue is effectively empty (completely empty or only now playing remains)
  // After clear, queue is empty but currentTrack might still be playing
  const isQueueEmpty = queue.length === 0 || (addedByYou.length === 0 && !hasRecommendations)
  const handleItemContextMenu = (track: BaseItemDto) => {
    setContextMenuItem(track)
    setContextMenuOpen(true)
  }

  const handleDragEnterRow = (index: number) => {
    // Only show drop indicator when dragging within the same section
    if (draggingIndex == null) return
    const fromTrack = queue[draggingIndex]
    const toTrack = queue[index]
    if (!fromTrack || !toTrack) return
    const fromIsRec = !!(fromTrack as any)._isRecommended
    const toIsRec = !!(toTrack as any)._isRecommended
    if (fromIsRec !== toIsRec) {
      setDragOverIndex(null)
      return
    }
    setDragOverIndex(index)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 max-w-[768px] mx-auto w-full" style={{ paddingBottom: `env(safe-area-inset-bottom)` }}>
      <div className="flex-1 overflow-y-auto min-h-0" style={{ paddingBottom: '8rem' }}>
        {queue.length === 0 && !nowPlayingTrack ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p>Queue is empty</p>
          </div>
        ) : (
          <div>
            {/* Now Playing Section - Always show if currentTrack exists */}
            {nowPlayingTrack && (
              <div>
                <div className="px-4 pb-0 pt-3 text-lg font-semibold text-white tracking-wider">
                  Now Playing
                </div>
                <QueueTrackItem
                  track={nowPlayingTrack}
                  index={currentIndex >= 0 ? currentIndex : -1}
                  isCurrent={true}
                  isPlaying={isPlaying}
                  showRemoveButton={false}
                  onClick={() => {
                    // Toggle play/pause via the icon button for the current track
                    togglePlayPause()
                  }}
                  onReorderDragStart={handleDragStart}
                  onReorderDrop={handleDrop}
                  onContextMenu={handleItemContextMenu}
                  isDragOver={false}
                  onDragEnterRow={handleDragEnterRow}
                />
              </div>
            )}

            {/* Queue Section with Clear Queue Button */}
            {(sortedAddedByYou.length > 0 || hasRecommendations) && (
              <div>
                <div className="px-4 pb-0 pt-3 flex items-center justify-between">
                  <div className="text-lg font-semibold text-white tracking-wider">
                    Queue
                  </div>
                  <button
                    onClick={handleClear}
                    className="text-xs font-semibold text-gray-300 hover:opacity-80 transition-opacity tracking-wider"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Added by you Section */}
            {sortedAddedByYou.length > 0 && (
              <div>
                <div className="px-4 pb-0 pt-4 text-xs font-semibold text-gray-400 tracking-wider">
                  Added By You
                </div>
                {sortedAddedByYou.map((track) => {
                  const index = queue.findIndex((t) => t.Id === track.Id)
                  return (
                    <QueueTrackItem
                      key={`${track.Id}-${index}`}
                      track={track}
                      index={index}
                      isCurrent={false}
                      isPlaying={isPlaying}
                      showRemoveButton={true}
                      onClick={() => {
                        skipToTrack(index)
                      }}
                      onRemove={() => {
                        removeFromQueue(index)
                      }}
                      onReorderDragStart={handleDragStart}
                      onReorderDrop={handleDrop}
                      onContextMenu={handleItemContextMenu}
                      isDragOver={dragOverIndex === index}
                      onDragEnterRow={handleDragEnterRow}
                    />
                  )
                })}
              </div>
            )}

            {/* Recommendations Section */}
            {hasRecommendations && (
              <div>
                <div className="px-4 pb-0 pt-4 text-xs font-semibold text-gray-400 tracking-wider">
                  Recommendations
                </div>
                {sortedRecommendations.map((track) => {
                  // Find the actual index in the queue
                  const index = queue.findIndex(t => t.Id === track.Id)
                  const safeIndex = index >= 0 ? index : -1
                  return (
                    <QueueTrackItem
                      key={`${track.Id}-${safeIndex}`}
                      track={track}
                      index={safeIndex}
                      isCurrent={false}
                      isPlaying={isPlaying}
                      showRemoveButton={true}
                      onClick={() => {
                        if (safeIndex >= 0) {
                          skipToTrack(safeIndex)
                        }
                      }}
                      onRemove={() => {
                        if (safeIndex >= 0) {
                          removeFromQueue(safeIndex)
                        }
                      }}
                      onReorderDragStart={handleDragStart}
                      onReorderDrop={handleDrop}
                      onContextMenu={handleItemContextMenu}
                      isDragOver={dragOverIndex === safeIndex}
                      onDragEnterRow={handleDragEnterRow}
                    />
                  )
                })}
              </div>
            )}

            {isFetchingRecommendations && (
              <div className="px-4 pt-4 pb-6 flex justify-center">
                <Spinner />
              </div>
            )}
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
      <div ref={controlsRef} className="px-6 pt-2 space-y-6 flex-shrink-0" style={{ paddingBottom: `1.5rem` }}>
        <div className="flex items-center justify-center gap-8">
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
        </div>
      </div>
    </div>
  )
}

