import { usePlayerStore } from '../../stores/playerStore'
import { Shuffle, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1 } from 'lucide-react'
import QueueList from './QueueList'

interface QueueViewProps {
  onClose: () => void
  onNavigateFromContextMenu?: () => void
}

export default function QueueView({ onClose, onNavigateFromContextMenu }: QueueViewProps) {
  const {
    songs,
    currentIndex,
    isPlaying,
    shuffle,
    repeat,
    togglePlayPause,
    toggleShuffle,
    toggleRepeat,
    next,
    previous,
  } = usePlayerStore()

  // Check if there are songs after/before current
  const hasNext = currentIndex >= 0 && currentIndex < songs.length - 1
  const hasPrevious = currentIndex > 0

  return (
    <div className="absolute inset-0 flex flex-col">
      <QueueList onNavigateFromContextMenu={onNavigateFromContextMenu} contentPaddingBottom="8rem" />

      <div className="absolute bottom-0 left-0 right-0">
        <div className="px-6 pt-2 max-w-[768px] lg:max-w-[864px] mx-auto w-full" style={{ paddingBottom: `calc(1.5rem + env(safe-area-inset-bottom))` }}>
          <div className="flex items-center justify-center gap-8">
            <button
              onClick={toggleShuffle}
              aria-label={shuffle ? 'Disable shuffle' : 'Enable shuffle'}
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${shuffle ? 'text-[var(--accent-color)]' : 'text-gray-400 hover:text-zinc-300'
                }`}
            >
              <Shuffle className="w-6 h-6" />
            </button>

            <button
              onClick={previous}
              disabled={!hasPrevious}
              aria-label="Previous track"
              className={`w-12 h-12 flex-shrink-0 aspect-square flex items-center justify-center rounded-full transition-colors ${hasPrevious
                ? 'text-white hover:bg-zinc-800 active:bg-zinc-800'
                : 'text-zinc-600 cursor-not-allowed'
                }`}
            >
              <SkipBack className="w-8 h-8" />
            </button>

            <button
              onClick={togglePlayPause}
              aria-label={isPlaying ? 'Pause' : 'Play'}
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
              aria-label="Next track"
              className={`w-12 h-12 flex-shrink-0 aspect-square flex items-center justify-center rounded-full transition-colors ${hasNext
                ? 'text-white hover:bg-zinc-800 active:bg-zinc-800'
                : 'text-zinc-600 cursor-not-allowed'
                }`}
            >
              <SkipForward className="w-8 h-8" />
            </button>

            <button
              onClick={toggleRepeat}
              aria-label={repeat === 'off' ? 'Enable repeat' : repeat === 'all' ? 'Repeat one' : 'Disable repeat'}
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${repeat !== 'off' ? 'text-[var(--accent-color)]' : 'text-gray-400 hover:text-zinc-300'
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
    </div>
  )
}
