import { useRef, useState, useEffect, useCallback, memo } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { jellyfinClient } from '../../api/jellyfin'
import Image from '../shared/Image'
import Spinner from '../shared/Spinner'
import { Play, Pause, GripHorizontal } from 'lucide-react'
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
    onReorderDragEnd: () => void
    onReorderDrop: (e: React.DragEvent, index: number) => void
    onContextMenu: (track: BaseItemDto, mode: 'mobile' | 'desktop', position?: { x: number, y: number }) => void
    isDragOver?: boolean
    onDragEnterRow: (index: number) => void
}

// Memoized queue track item to prevent unnecessary re-renders
const QueueTrackItem = memo(function QueueTrackItem({
    track,
    index,
    isCurrent,
    isPlaying,
    showRemoveButton = true,
    onClick,
    onRemove,
    onReorderDragStart,
    onReorderDragEnd,
    onReorderDrop,
    onContextMenu,
    isDragOver,
    onDragEnterRow,
}: QueueTrackItemProps) {
    const contextMenuJustOpenedRef = useRef(false)

    const longPressHandlers = useLongPress({
        onLongPress: (e) => {
            e.preventDefault()
            contextMenuJustOpenedRef.current = true
            onContextMenu(track, 'mobile')
            // Reset after delay
            setTimeout(() => {
                contextMenuJustOpenedRef.current = false
            }, 300)
        },
    })

    // Wrap external onClick to respect context menu state
    const handleRowClick = useCallback((e: React.MouseEvent) => {
        if (contextMenuJustOpenedRef.current) {
            e.preventDefault()
            e.stopPropagation()
            return
        }
        onClick()
    }, [onClick])

    const handleContextMenuClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        contextMenuJustOpenedRef.current = true
        onContextMenu(track, 'desktop', { x: e.clientX, y: e.clientY })
        setTimeout(() => {
            contextMenuJustOpenedRef.current = false
        }, 300)
    }, [onContextMenu, track])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }, [])

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        if (!isCurrent) {
            onDragEnterRow(index)
        }
    }, [isCurrent, onDragEnterRow, index])

    const handleDrop = useCallback((e: React.DragEvent) => {
        if (!isCurrent) {
            onReorderDrop(e, index)
        }
    }, [isCurrent, onReorderDrop, index])

    return (
        <div
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDrop={handleDrop}
            className={`queue-row flex items-center gap-3 p-3 ${!isCurrent ? 'hover:bg-zinc-900 cursor-pointer' : 'cursor-pointer'
                } ${isCurrent ? 'bg-zinc-900' : ''} relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-inset`}
            onClick={isCurrent ? undefined : handleRowClick}
            onContextMenu={handleContextMenuClick}
            tabIndex={0}
            role="button"
            aria-label={`${track.Name} by ${track.AlbumArtist || track.ArtistItems?.[0]?.Name || 'Unknown Artist'}`}
            {...longPressHandlers}
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
            <div className="flex-1 min-w-0">
                <div
                    className={`text-sm font-medium truncate ${isCurrent ? 'text-[var(--accent-color)]' : 'text-white'
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
                    className="text-gray-400 hover:text-zinc-300 transition-colors p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] rounded"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
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
                                onMouseDown={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                                onDragStart={(e) => {
                                    e.stopPropagation()
                                    onReorderDragStart(e, index)
                                }}
                                onDragEnd={(e) => {
                                    e.stopPropagation()
                                    onReorderDragEnd()
                                }}
                                className="text-gray-500 hover:text-zinc-300 transition-colors p-2 cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] rounded"
                                aria-label="Drag to reorder"
                            >
                                <GripHorizontal className="w-4 h-4" />
                            </button>
                            {onRemove && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onRemove()
                                    }}
                                    className="text-gray-400 hover:text-zinc-300 transition-colors p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] rounded"
                                    aria-label="Remove from queue"
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
})

interface QueueListProps {
    onNavigateFromContextMenu?: () => void
    header?: React.ReactNode
    contentPaddingBottom?: string
}

export default function QueueList({ onNavigateFromContextMenu, header, contentPaddingBottom = '8rem' }: QueueListProps) {
    const [contextMenuOpen, setContextMenuOpen] = useState(false)
    const [contextMenuItem, setContextMenuItem] = useState<BaseItemDto | null>(null)
    const [contextMenuMode, setContextMenuMode] = useState<'mobile' | 'desktop'>('mobile')
    const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null)
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
    const [visibleSongsCount, setVisibleSongsCount] = useState(INITIAL_VISIBLE_SONGS)
    const [showPrevious, setShowPrevious] = useState(false)
    const [showSyncingMessage, setShowSyncingMessage] = useState(false)
    const draggingIndexRef = useRef<number | null>(null)

    const {
        songs,
        currentIndex,
        isPlaying,
        togglePlayPause,
        skipToTrack,
        removeFromQueue,
        reorderQueue,
        isFetchingRecommendations,
        isLoadingMoreSongs,
    } = usePlayerStore()

    const { showQueueRecommendations, setShowQueueRecommendations, recommendationsQuality } = useSettingsStore()

    // Stable callbacks for memoized QueueTrackItem
    const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', index.toString())
        setDraggingIndex(index)
        draggingIndexRef.current = index

        // Use the album art (or the whole row as fallback) as the drag preview
        const gripEl = e.currentTarget as HTMLElement | null
        const rowEl = gripEl?.closest('.queue-row') as HTMLElement | null
        if (rowEl && e.dataTransfer.setDragImage) {
            const artEl = rowEl.querySelector<HTMLElement>('.queue-drag-art')
            const dragEl = artEl ?? rowEl
            const rect = dragEl.getBoundingClientRect()
            e.dataTransfer.setDragImage(dragEl, rect.width / 2, rect.height / 2)
        }
    }, [])

    const handleDragEnd = useCallback(() => {
        setDraggingIndex(null)
        setDragOverIndex(null)
        draggingIndexRef.current = null
    }, [])

    const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
        e.preventDefault()
        const data =
            e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/html')
        const dragIndex = parseInt(data, 10)
        if (Number.isNaN(dragIndex)) {
            return
        }
        // Prevent dropping across user-added / recommendation boundary
        const fromIdx = draggingIndexRef.current ?? dragIndex
        const currentSongs = usePlayerStore.getState().songs
        const fromTrack = currentSongs[fromIdx]
        const toTrack = currentSongs[dropIndex]
        if (fromTrack && toTrack && fromTrack.source !== toTrack.source) {
            setDragOverIndex(null)
            setDraggingIndex(null)
            draggingIndexRef.current = null
            return
        }

        if (dragIndex !== dropIndex) {
            reorderQueue(dragIndex, dropIndex)
        }
        setDragOverIndex(null)
        setDraggingIndex(null)
        draggingIndexRef.current = null
    }, [reorderQueue])

    const handleItemContextMenu = useCallback((track: BaseItemDto, mode: 'mobile' | 'desktop' = 'mobile', position?: { x: number, y: number }) => {
        setContextMenuItem(track)
        setContextMenuMode(mode)
        setContextMenuPosition(position || null)
        setContextMenuOpen(true)
    }, [])

    const handleDragEnterRow = useCallback((index: number) => {
        // Only show drop indicator when dragging within the same section
        if (draggingIndexRef.current == null) return
        const currentSongs = usePlayerStore.getState().songs
        const fromTrack = currentSongs[draggingIndexRef.current]
        const toTrack = currentSongs[index]
        if (!fromTrack || !toTrack) return
        if (fromTrack.source !== toTrack.source) {
            setDragOverIndex(null)
            return
        }
        setDragOverIndex(index)
    }, [])

    // Get current track
    const currentTrack = currentIndex >= 0 ? songs[currentIndex] : null

    // Split queue into 4 sections
    // Show songs in chronological playback order to match what actually plays
    const previouslyPlayed = songs.filter((_, index) => index < currentIndex)

    // Find the last user track in upcoming songs (if any)
    let lastUserTrackIndex = -1
    for (let i = songs.length - 1; i > currentIndex; i--) {
      if (songs[i].source === 'user') {
        lastUserTrackIndex = i
        break
      }
    }

    // "Coming Up" shows everything up to and including the last user track
    // This ensures visual order matches playback order when user tracks are mixed with recommendations
    const comingUp = songs.filter((_, index) => {
      if (index <= currentIndex) return false
      // If there are user tracks ahead, show everything up to the last one
      if (lastUserTrackIndex !== -1) {
        return index <= lastUserTrackIndex
      }
      // No user tracks ahead, don't show anything in "Coming Up"
      return false
    })

    // "Recommendations" only shows recommendations AFTER the last user track
    const upcomingRecommendations = songs.filter((song, index) => {
      if (song.source !== 'recommendation' || index <= currentIndex) return false
      // If there are user tracks, only show recos after the last user track
      if (lastUserTrackIndex !== -1) {
        return index > lastUserTrackIndex
      }
      // No user tracks, show all upcoming recommendations here
      return true
    })

    // Apply lazy loading limits - calculate total visible songs needed
    let remainingVisible = visibleSongsCount
    const visiblePreviouslyPlayed = previouslyPlayed.slice(-Math.min(remainingVisible, previouslyPlayed.length))
    remainingVisible -= visiblePreviouslyPlayed.length
    remainingVisible -= currentTrack ? 1 : 0 // Account for current track

    const visibleComingUp = comingUp.slice(0, Math.max(0, remainingVisible))
    remainingVisible -= visibleComingUp.length

    const visibleUpcomingRecommendations = upcomingRecommendations.slice(0, Math.max(0, remainingVisible))

    // Incrementally reveal more songs as the user scrolls near the bottom
    useEffect(() => {
        const container = document.querySelector('.queue-list-container')
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
        // Also trigger immediately to check if we need to load more (if content is short)
        handleScroll()
        return () => container.removeEventListener('scroll', handleScroll)
    }, [songs.length])

    // Add a 2-second delay before showing the "Syncing genres..." message
    useEffect(() => {
        if (isFetchingRecommendations) {
            const timer = setTimeout(() => {
                setShowSyncingMessage(true)
            }, 2000)
            return () => clearTimeout(timer)
        } else {
            setShowSyncingMessage(false)
        }
    }, [isFetchingRecommendations])

    return (
        <div className="flex-1 flex flex-col min-h-0 w-full relative">
            {/* Helper for scroll listener targeting */}
            <div className="flex-1 overflow-y-auto min-h-0 queue-list-container w-full" style={{ paddingBottom: '8rem' }}>
                <div className="max-w-[864px] mx-auto w-full">
                    {header}
                    {songs.length === 0 && !currentTrack ? (
                        <div className="flex items-center justify-center h-full text-gray-400 py-10">
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
                                                onReorderDragEnd={handleDragEnd}
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
                                        onReorderDragEnd={handleDragEnd}
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
                                                onReorderDragEnd={handleDragEnd}
                                                onReorderDrop={handleDrop}
                                                onContextMenu={handleItemContextMenu}
                                                isDragOver={dragOverIndex === index}
                                                onDragEnterRow={handleDragEnterRow}
                                            />
                                        )
                                    })}
                                    {isLoadingMoreSongs && (
                                        <div className="flex items-center justify-center py-4">
                                            <Spinner />
                                            <span className="ml-2 text-sm text-gray-400">Loading more songs...</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Recommendations Section */}
                            <div>
                                <div className="px-4 pb-0 pt-7 flex items-center justify-between">
                                    <div className="text-base font-bold text-white tracking-wider">
                                        Recommendations
                                    </div>
                                    <button
                                        onClick={() => {
                                            const newValue = !showQueueRecommendations
                                            setShowQueueRecommendations(newValue)
                                            if (!newValue) {
                                                // Only remove FUTURE recommendations (after current index)
                                                // Keep the currently playing song and all previous songs (including played recommendations)
                                                const songsToKeep = songs.filter((song, index) => {
                                                    // Keep all songs up to and including current
                                                    if (index <= currentIndex) return true
                                                    // Keep future user-added songs
                                                    return song.source === 'user'
                                                })
                                                // Current index stays the same since we only removed songs after it
                                                usePlayerStore.setState({
                                                    songs: songsToKeep,
                                                    currentIndex: currentIndex,
                                                    standardOrder: songsToKeep.filter(s => s.source === 'user').map(s => s.Id),
                                                    shuffleOrder: songsToKeep.filter(s => s.source === 'user').map(s => s.Id),
                                                })
                                            }
                                        }}
                                        className={`relative w-12 h-6 rounded-full transition-colors ${showQueueRecommendations ? 'bg-[var(--accent-color)]' : 'bg-zinc-600'
                                            }`}
                                    >
                                        <span
                                            className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${showQueueRecommendations ? 'translate-x-6' : 'translate-x-0'
                                                }`}
                                        />
                                    </button>
                                </div>
                                {/* Status messages below header */}
                                {(showSyncingMessage || recommendationsQuality === 'failed') && (
                                    <div className="px-4 pb-2">
                                        {showSyncingMessage && (
                                            <span className="text-xs text-gray-400 font-normal">
                                                Syncing genres...
                                            </span>
                                        )}
                                        {!isFetchingRecommendations && recommendationsQuality === 'failed' && (
                                            <span className="text-xs text-gray-400 font-normal">
                                                Sync library in settings
                                            </span>
                                        )}
                                    </div>
                                )}
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
                                                    onReorderDragEnd={handleDragEnd}
                                                    onReorderDrop={handleDrop}
                                                    onContextMenu={handleItemContextMenu}
                                                    isDragOver={dragOverIndex === index}
                                                    onDragEnterRow={handleDragEnterRow}
                                                />
                                            )
                                        })}
                                        {showSyncingMessage && (
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
                    mode={contextMenuMode}
                    position={contextMenuPosition || undefined}
                />
            </div>
        </div>
    )
}
