import { useSleepTimerStore } from '../../stores/sleepTimerStore'
import { usePlayerStore } from '../../stores/playerStore'

function formatRemaining(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.ceil(seconds / 60)
    return `${mins} min`
  }
  return `${seconds}s`
}

interface SleepTimerBarProps {
  topOffset?: number
}

export default function SleepTimerBar({ topOffset = 0 }: SleepTimerBarProps) {
  const mode = useSleepTimerStore(s => s.mode)
  const remainingSeconds = useSleepTimerStore(s => s.remainingSeconds)
  const cancel = useSleepTimerStore(s => s.cancel)
  const isQueueSidebarOpen = usePlayerStore(s => s.isQueueSidebarOpen)

  if (mode === 'off') return null

  const message = mode === 'end-of-track'
    ? 'Pausing at end of track'
    : remainingSeconds !== null
      ? `Pausing in ${formatRemaining(remainingSeconds)}`
      : 'Pausing soon'

  return (
    <div
      className={`fixed left-0 right-0 z-[10001] bg-zinc-800 transition-colors duration-300 ${isQueueSidebarOpen ? 'sidebar-open-padding' : ''}`}
      style={{
        height: '28px',
        top: `${topOffset}px`,
        paddingLeft: '16px',
        paddingRight: '12px',
        scrollbarGutter: 'stable'
      }}
    >
      <div className="h-full flex items-center">
        <span className="text-white text-sm font-medium truncate tabular-nums">
          {message}
        </span>
        <button
          onClick={cancel}
          className="text-white text-sm font-medium hover:text-zinc-300 transition-colors ml-8"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
